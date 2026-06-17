#!/usr/bin/env node
/**
 * notify-weekend-rentals.js
 *
 * 毎週木曜 17:00 JST に Railway Cron から実行する想定のスクリプト。
 *
 * 動作:
 *   1. 今週末(土・日, JST)に confirmed のコンテストがあるか ContestSchedule を確認
 *   2. ある場合、その大会名を含む「【レンタル】ステージ用サーフパンツ」の注文を
 *      ShopifyOrderItem から取得し、キャンセル/返金注文を除外してサイズ別に集計
 *   3. 集計結果を Google Chat Webhook へ通知
 *
 * 通知ポリシー:
 *   - 週末に対象イベントが無い場合は通知しない（静かに終了）
 *   - イベントはあるが対象レンタル注文が 0 件の場合は「0件」と通知する
 *
 * 必須環境変数:
 *   DATABASE_URL            - 分析DB(Postgres)。Railway 本体サービスと同じものを設定
 *   GOOGLE_CHAT_WEBHOOK_URL - 通知先 Google Chat スペースの Incoming Webhook URL
 *
 * 任意環境変数:
 *   DRY_RUN=true            - HTTP送信せず、生成メッセージを標準出力に表示（動作確認用）
 *   RENTAL_TITLE_KEYWORD    - レンタル商品名キーワード（既定: 【レンタル】ステージ用サーフパンツ）
 *   WEEKEND_BASE_DATE       - 基準日(ISO)。テスト用に「今」を上書きできる
 */

const { prisma } = require("../src/lib/prisma.js");
const {
  normalizeContestKey,
  stripDayNameSuffix,
} = require("../src/lib/shopify-product-classification.js");

const RENTAL_TITLE_KEYWORD =
  process.env.RENTAL_TITLE_KEYWORD || "【レンタル】ステージ用サーフパンツ";
const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const isDryRun = process.env.DRY_RUN === "true";

// サイズ表示順。リストにないサイズは後ろにアルファベット順で並べる。
const SIZE_ORDER = [
  "XXS",
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "XXL",
  "3XL",
  "XXXL",
  "4XL",
  "F",
  "FREE",
  "フリー",
];

// ---- 日付ヘルパー (JST) -------------------------------------------------

function getBaseDate() {
  if (process.env.WEEKEND_BASE_DATE) {
    const parsed = new Date(process.env.WEEKEND_BASE_DATE);
    if (!Number.isNaN(parsed.getTime())) {
      return parsed;
    }
  }
  return new Date();
}

// JST の壁時計成分（年・月・日・曜日）を取得する。
function toJstParts(date) {
  const shifted = new Date(date.getTime() + JST_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth(), // 0-based
    day: shifted.getUTCDate(),
    dow: shifted.getUTCDay(), // 0=Sun .. 6=Sat
  };
}

function pad2(value) {
  return String(value).padStart(2, "0");
}

// Date を UTC 暦日の "YYYY-MM-DD" に整形する。
function toUtcYmd(date) {
  return `${date.getUTCFullYear()}-${pad2(date.getUTCMonth() + 1)}-${pad2(
    date.getUTCDate()
  )}`;
}

// 今週末(土・日)の JST 暦日を "YYYY-MM-DD" の Set で返す。
function weekendYmdSet(base) {
  const { year, month, day, dow } = toJstParts(base);
  const daysUntilSat = (6 - dow + 7) % 7; // 木曜(4)なら 2
  const sat = new Date(Date.UTC(year, month, day + daysUntilSat));
  const sun = new Date(Date.UTC(year, month, day + daysUntilSat + 1));
  return {
    set: new Set([toUtcYmd(sat), toUtcYmd(sun)]),
    saturday: toUtcYmd(sat),
    sunday: toUtcYmd(sun),
  };
}

// ---- 注文有効性 --------------------------------------------------------

function isOrderCancelled(rawJson) {
  const raw = rawJson || {};
  return Boolean(
    raw.cancelledAt || raw.cancelled_at || raw.cancelReason || raw.cancel_reason
  );
}

function isOrderRevenueValid(order) {
  const status = String(order?.financialStatus || "").trim().toLowerCase();
  if (isOrderCancelled(order?.rawJson)) {
    return false;
  }
  return !["refunded", "voided", "cancelled", "canceled"].includes(status);
}

// ---- サイズ抽出 --------------------------------------------------------

function normalizeSizeLabel(raw) {
  const value = String(raw || "").trim();
  if (!value) return null;
  return value.toUpperCase();
}

function extractSize(item) {
  const variant = String(item.variantTitle || "").trim();
  if (variant && variant.toLowerCase() !== "default title") {
    return normalizeSizeLabel(variant);
  }

  const match = String(item.title || "").match(/\/\s*([^/]+?)\s*$/);
  if (match) {
    return normalizeSizeLabel(match[1]);
  }

  return "不明";
}

function sizeSortKey(label) {
  const idx = SIZE_ORDER.indexOf(String(label).toUpperCase());
  return idx === -1 ? SIZE_ORDER.length : idx;
}

// ---- イベント別レンタル集計 --------------------------------------------

function dedupeWeekendEvents(schedules) {
  const byKey = new Map();
  for (const schedule of schedules) {
    const baseName =
      stripDayNameSuffix(schedule.contestName) || schedule.contestName;
    const key = normalizeContestKey(baseName || "");
    if (!key) continue;
    if (!byKey.has(key)) {
      byKey.set(key, {
        key,
        displayName: baseName,
        contestName: schedule.contestName,
        eventDate: schedule.eventDate,
      });
    }
  }
  return [...byKey.values()];
}

function aggregateRentalsForEvent(eventKey, rentalItems) {
  const sizeTotals = new Map();
  let matchedLines = 0;

  for (const item of rentalItems) {
    if (!isOrderRevenueValid(item.order)) continue;

    const titleKey = normalizeContestKey(item.title || "");
    if (!titleKey || !titleKey.includes(eventKey)) continue;

    const size = extractSize(item);
    const qty = Number(item.quantity || 0) || 0;
    if (qty <= 0) continue;

    sizeTotals.set(size, (sizeTotals.get(size) || 0) + qty);
    matchedLines += 1;
  }

  const sizes = [...sizeTotals.entries()]
    .sort(
      (a, b) =>
        sizeSortKey(a[0]) - sizeSortKey(b[0]) ||
        String(a[0]).localeCompare(String(b[0]), "ja")
    )
    .map(([size, count]) => ({ size, count }));

  const totalQty = sizes.reduce((sum, s) => sum + s.count, 0);
  return { sizes, totalQty, matchedLines };
}

// ---- メッセージ整形 ----------------------------------------------------

function buildMessage(displayName, aggregate) {
  if (aggregate.totalQty <= 0) {
    return `今週末の${displayName}の対象レンタル（${RENTAL_TITLE_KEYWORD}）オーダーは現在0件です。`;
  }

  const lines = aggregate.sizes.map((s) => `${s.size} x ${s.count}`);
  return [
    `今週末の${displayName}では、以下のレンタルオーダーが入っています。ご準備願います。`,
    ...lines,
  ].join("\n");
}

// ---- Google Chat 送信 --------------------------------------------------

async function sendGoogleChatNotification(text) {
  const webhookUrl = process.env.GOOGLE_CHAT_WEBHOOK_URL;
  if (!webhookUrl) {
    throw new Error("GOOGLE_CHAT_WEBHOOK_URL is not configured.");
  }

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=UTF-8" },
    body: JSON.stringify({ text }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    throw new Error(
      `Google Chat notification failed: ${response.status} ${body}`
    );
  }
}

// ---- メイン ------------------------------------------------------------

async function run() {
  const base = getBaseDate();
  const weekend = weekendYmdSet(base);
  console.log(
    `[weekend-rentals] 週末判定(JST): ${weekend.saturday} (土) / ${weekend.sunday} (日)`
  );

  const confirmed = await prisma.contestSchedule.findMany({
    where: { status: "confirmed" },
    orderBy: { eventDate: "asc" },
  });

  const weekendSchedules = confirmed.filter(
    (s) => s.eventDate && weekend.set.has(toUtcYmd(new Date(s.eventDate)))
  );

  if (weekendSchedules.length === 0) {
    console.log("[weekend-rentals] 今週末の confirmed イベントなし。通知せず終了。");
    return;
  }

  const events = dedupeWeekendEvents(weekendSchedules);
  console.log(
    `[weekend-rentals] 対象イベント: ${events.map((e) => e.displayName).join(", ")}`
  );

  const rentalItems = await prisma.shopifyOrderItem.findMany({
    where: { title: { contains: RENTAL_TITLE_KEYWORD } },
    select: {
      title: true,
      variantTitle: true,
      quantity: true,
      order: {
        select: { financialStatus: true, rawJson: true },
      },
    },
  });
  console.log(
    `[weekend-rentals] レンタル明細取得: ${rentalItems.length} 件（全期間）`
  );

  for (const event of events) {
    const aggregate = aggregateRentalsForEvent(event.key, rentalItems);
    const message = buildMessage(event.displayName, aggregate);

    console.log(
      `[weekend-rentals] ${event.displayName}: 合計 ${aggregate.totalQty} 点 / ${aggregate.matchedLines} 明細`
    );
    console.log("---- message ----\n" + message + "\n-----------------");

    if (isDryRun) {
      console.log("[weekend-rentals] DRY_RUN=true — 送信スキップ");
      continue;
    }

    await sendGoogleChatNotification(message);
    console.log(`[weekend-rentals] 送信完了: ${event.displayName}`);
  }
}

if (require.main === module) {
  run()
    .then(async () => {
      await prisma.$disconnect().catch(() => {});
      console.log("[weekend-rentals] done");
    })
    .catch(async (error) => {
      await prisma.$disconnect().catch(() => {});
      console.error("[weekend-rentals] UNHANDLED:", error);
      process.exit(1);
    });
}

module.exports = {
  weekendYmdSet,
  extractSize,
  aggregateRentalsForEvent,
  dedupeWeekendEvents,
  buildMessage,
  isOrderRevenueValid,
};
