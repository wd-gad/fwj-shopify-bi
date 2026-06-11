/**
 * setup-shiny-day-split.js
 *
 * Nutrimuscle presents FWJ SHINY GYM Classic 2026 は 8/21・8/22 の2日開催だが、
 * ContestSchedule には 8/22 の1行しか無く、全エントリーが1コンテストに統合されてしまう。
 * このスクリプトは日別スケジュール（D1=8/21 / D2=8/22）を整備する:
 *
 *   - "Nutrimuscle presents FWJ SHINY GYM Classic 2026 D1" @ 2026-08-21 (confirmed)
 *   - "Nutrimuscle presents FWJ SHINY GYM Classic 2026 D2" @ 2026-08-22 (confirmed)
 *   - 旧・素の "Nutrimuscle presents FWJ SHINY GYM Classic 2026"（日サフィックス無し）行は削除
 *
 * 実行後は分類→集計を再構築すること:
 *   node scripts/reclassify-products.js   # ProductClassificationRule.eventName を D1/D2 化
 *   node scripts/rebuild-analytics.js     # EventEntry へ伝播
 *
 * どの商品が D1/D2 になるかは Shopify 商品タグ "... Day-1" / "... Day-2" から動的に決まるため、
 * 当日割り（カテゴリーの配置）が変わっても再同期 + 再分類で自動的に追従する。
 *
 * DB のみを更新（Shopify API は呼ばない）。DATABASE_URL は .env から読み込む。
 */

const { prisma } = require("../src/lib/prisma.js");

const BASE_NAME = "Nutrimuscle presents FWJ SHINY GYM Classic 2026";
const DAYS = [
  { suffix: "D1", eventDate: new Date("2026-08-21T00:00:00.000Z") },
  { suffix: "D2", eventDate: new Date("2026-08-22T00:00:00.000Z") }
];

async function main() {
  // 既存の SHINY スケジュール（会場/住所を引き継ぐため）。
  const existing = await prisma.contestSchedule.findMany({
    where: { contestName: { contains: "SHINY GYM Classic 2026" } },
    orderBy: { eventDate: "asc" }
  });

  console.log("[setup] 既存スケジュール:");
  existing.forEach((s) =>
    console.log(
      `  - ${new Date(s.eventDate).toISOString().slice(0, 10)} | ${JSON.stringify(
        s.contestName
      )} | status=${s.status} | venue=${s.venueName ?? "null"}`
    )
  );

  // 会場・住所のフォールバック（旧行に値があれば引き継ぐ）。
  const withVenue = existing.find((s) => s.venueName || s.address) || existing[0] || null;
  const venueName = withVenue?.venueName ?? null;
  const address = withVenue?.address ?? null;
  const nearestStation = withVenue?.nearestStation ?? null;

  for (const day of DAYS) {
    const contestName = `${BASE_NAME} ${day.suffix}`;
    await prisma.contestSchedule.upsert({
      where: {
        contestName_eventDate: { contestName, eventDate: day.eventDate }
      },
      update: {
        status: "confirmed",
        venueName,
        address,
        nearestStation,
        source: "setup-shiny-day-split"
      },
      create: {
        contestName,
        eventDate: day.eventDate,
        status: "confirmed",
        venueName,
        address,
        nearestStation,
        source: "setup-shiny-day-split"
      }
    });
    console.log(
      `[setup] upsert: ${contestName} @ ${day.eventDate.toISOString().slice(0, 10)} (confirmed)`
    );
  }

  // 旧・素の行（日サフィックス無し）を削除。EventEntry は eventName 文字列参照のみで FK は無いので安全。
  const deleted = await prisma.contestSchedule.deleteMany({
    where: { contestName: BASE_NAME }
  });
  console.log(`[setup] 旧・素の行を削除: ${deleted.count} 件 (${JSON.stringify(BASE_NAME)})`);

  const after = await prisma.contestSchedule.findMany({
    where: { contestName: { contains: "SHINY GYM Classic 2026" } },
    orderBy: { eventDate: "asc" }
  });
  console.log("[setup] 整備後スケジュール:");
  after.forEach((s) =>
    console.log(
      `  - ${new Date(s.eventDate).toISOString().slice(0, 10)} | ${JSON.stringify(
        s.contestName
      )} | status=${s.status}`
    )
  );
}

main()
  .catch((err) => {
    console.error("[setup] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
