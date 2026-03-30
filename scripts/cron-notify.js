#!/usr/bin/env node
/**
 * cron-notify.js
 *
 * Railway Cron から定期実行し、Itinerary の通知エンドポイントを叩くスクリプト。
 * 環境変数:
 *   CRON_SECRET    - Itinerary 側の CRON_SECRET と同じ値（必須）
 *   ITINERARY_URL  - Itinerary のベース URL（必須）例: https://travel.teamfwj.org
 *   DRY_RUN        - "true" にすると実際の HTTP リクエストをスキップ（動作確認用）
 */

const cronSecret = process.env.CRON_SECRET?.trim();
const itineraryUrl = process.env.ITINERARY_URL?.trim();
const isDryRun = process.env.DRY_RUN === "true";

if (!cronSecret) {
  console.error("[cron-notify] ERROR: CRON_SECRET is not set. Aborting.");
  process.exit(1);
}

if (!itineraryUrl) {
  console.error("[cron-notify] ERROR: ITINERARY_URL is not set. Aborting.");
  process.exit(1);
}

const endpoint = `${itineraryUrl}/api/cron/notify-changes`;

async function run() {
  console.log(`[cron-notify] target: ${endpoint}`);

  if (isDryRun) {
    console.log("[cron-notify] DRY_RUN=true — skipping HTTP request.");
    console.log("[cron-notify] done (dry-run)");
    return;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);

  let res;
  try {
    res = await fetch(endpoint, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${cronSecret}`,
        "User-Agent": "fwj-shopify-bi-cron/1.0",
      },
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[cron-notify] FETCH ERROR: ${msg}`);
    process.exit(1);
  } finally {
    clearTimeout(timeout);
  }

  let body = "";
  try {
    body = await res.text();
  } catch {
    // ignore body read errors
  }

  if (!res.ok) {
    console.error(`[cron-notify] ERROR: ${res.status} ${res.statusText} — ${body}`);
    process.exit(1);
  }

  console.log(`[cron-notify] OK: ${res.status} — ${body}`);
}

run().catch((err) => {
  console.error("[cron-notify] UNHANDLED:", err);
  process.exit(1);
});
