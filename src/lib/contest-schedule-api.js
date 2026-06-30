/**
 * コンテストスケジュール API レイヤー。
 * Origin は fwj-portal の Contest-Hub（venues テーブル）。
 * 全 CRUD を /api/internal/contests 経由で Portal に委譲する。
 */
const {
  listPortalContests,
  createPortalContest,
  updatePortalContest,
  deletePortalContest,
} = require("./portal-contests-client.js");

async function listContestSchedules(filters = {}) {
  return listPortalContests(filters);
}

async function getContestSchedule(id) {
  // 一覧から id で引く（ポイントルックアップは Portal 内部 API に未実装）
  const all = await listPortalContests({ forceRefresh: false });
  return all.find(c => c.id === id) ?? null;
}

async function createContestSchedule(data) {
  return createPortalContest({
    contestName: data.contestName,
    eventDate: data.eventDate,
    venueName: data.venueName,
    nearestStation: data.nearestStation,
    address: data.address,
    travelDescription: data.travelDescription,
    status: data.status || "confirmed",
    // Portal に無いロジ詳細フィールドは無視（travelMode, oneWayFare 等は Itinerary 管理）
  });
}

async function updateContestSchedule(id, data) {
  const existing = await getContestSchedule(id);
  if (!existing) return null;

  // auto-confirm: 日付がプレースホルダ(1/1)から変わる場合は confirmed に昇格
  const update = { ...data };
  if (update.eventDate && existing.status === "draft") {
    const prev = existing.eventDate;
    if (prev && new Date(prev).getUTCMonth() === 0 && new Date(prev).getUTCDate() === 1) {
      update.status = "confirmed";
    }
  }

  return updatePortalContest(id, update);
}

async function deleteContestSchedule(id) {
  const existing = await getContestSchedule(id);
  if (!existing) return null;
  await deletePortalContest(id);
  return existing;
}

module.exports = {
  listContestSchedules,
  getContestSchedule,
  createContestSchedule,
  updateContestSchedule,
  deleteContestSchedule,
};
