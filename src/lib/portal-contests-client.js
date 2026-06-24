/**
 * Portal (fwj-portal) の /api/internal/contests CRUD クライアント。
 * Shopify-BI の読み取り・書き込みを全て Portal Origin に向ける。
 *
 * 必須環境変数:
 *   PORTAL_URL          Portal のベース URL（デフォルト: https://www.teamfwj.org）
 *   PORTAL_INTERNAL_KEY Portal の SHOPIFY_BI_INTERNAL_KEY と同じ共有秘密
 */

const PORTAL_URL = (process.env.PORTAL_URL || "https://www.teamfwj.org").replace(/\/$/, "");
const KEY = process.env.PORTAL_INTERNAL_KEY || "";

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 分
let _cache = null;
let _cacheAt = 0;

function headers() {
  return { "Content-Type": "application/json", "x-internal-key": KEY };
}

function assertKey() {
  if (!KEY) throw new Error(
    "PORTAL_INTERNAL_KEY が未設定です。Portal の /api/internal/contests を呼ぶことができません。"
  );
}

/**
 * Portal の venue 形式 → Shopify-BI の contestSchedule 互換形式。
 * analytics-api, shopify-product-classification が期待するフィールドを保持。
 */
function toScheduleShape(venue) {
  return {
    id: venue.id,
    contestName: venue.officialName || venue.name,
    eventDate: venue.eventDate ? new Date(venue.eventDate) : null,
    venueName: venue.venueName || null,
    nearestStation: venue.nearestStation || null,
    address: venue.address || null,
    travelDescription: venue.notes || null,
    status: venue.status || "confirmed",
    source: "portal",
    _portalId: venue.id,
    _matchKeys: venue.matchKeys || [],
  };
}

function invalidateCache() {
  _cache = null;
  _cacheAt = 0;
}

/**
 * Portal からコンテスト一覧を取得する（5分メモリキャッシュ）。
 * @param {{ status?: string, year?: number, forceRefresh?: boolean }} [filters]
 * @returns {Promise<Array>} contestSchedule 互換オブジェクトの配列
 */
async function listPortalContests(filters = {}) {
  assertKey();

  const now = Date.now();
  if (!filters.forceRefresh && _cache && now - _cacheAt < CACHE_TTL_MS) {
    return applyFilters(_cache, filters);
  }

  const res = await fetch(`${PORTAL_URL}/api/internal/contests`, { headers: headers() });
  if (!res.ok) throw new Error(`Portal API GET エラー: ${res.status} ${res.statusText}`);
  const data = await res.json();
  _cache = (data.contests || []).map(toScheduleShape);
  _cacheAt = now;
  return applyFilters(_cache, filters);
}

function applyFilters(list, filters) {
  let result = list;
  if (filters.status) result = result.filter(c => c.status === filters.status);
  if (filters.year) {
    const y = Number(filters.year);
    result = result.filter(c => c.eventDate && new Date(c.eventDate).getUTCFullYear() === y);
  }
  return result;
}

/**
 * Portal にコンテストを新規作成する。
 * @param {object} data  contestSchedule 互換フィールド（contestName, eventDate が必須）
 * @returns {Promise<object>} 作成されたコンテスト（contestSchedule 互換）
 */
async function createPortalContest(data) {
  assertKey();
  const body = {
    officialName: (data.contestName || data.officialName || "").trim(),
    name: (data.contestName || data.officialName || "").trim(),
    eventDate: toDateString(data.eventDate),
    venueName: data.venueName || "",
    address: data.address || "",
    nearestStation: data.nearestStation || "",
    notes: data.travelDescription || data.notes || "",
    status: data.status || "draft",
    matchKeys: data.matchKeys || [],
  };
  const res = await fetch(`${PORTAL_URL}/api/internal/contests`, {
    method: "POST",
    headers: headers(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Portal API POST エラー: ${res.status} ${text}`);
  }
  const json = await res.json();
  invalidateCache();
  return toScheduleShape(json.contest);
}

/**
 * Portal のコンテストを更新する。
 * @param {string} id  Portal contest ID（_portalId）
 * @param {object} data 更新フィールド（Partial<contestSchedule>）
 * @returns {Promise<object>} 更新後のコンテスト（contestSchedule 互換）
 */
async function updatePortalContest(id, data) {
  assertKey();
  const patch = {};
  if (data.contestName !== undefined) patch.officialName = data.contestName;
  if (data.officialName !== undefined) patch.officialName = data.officialName;
  if (data.eventDate !== undefined) patch.eventDate = toDateString(data.eventDate);
  if (data.venueName !== undefined) patch.venueName = data.venueName;
  if (data.address !== undefined) patch.address = data.address;
  if (data.nearestStation !== undefined) patch.nearestStation = data.nearestStation;
  if (data.travelDescription !== undefined) patch.notes = data.travelDescription;
  if (data.notes !== undefined) patch.notes = data.notes;
  if (data.status !== undefined) patch.status = data.status;
  if (data.matchKeys !== undefined) patch.matchKeys = data.matchKeys;

  const res = await fetch(`${PORTAL_URL}/api/internal/contests?id=${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: headers(),
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Portal API PATCH エラー: ${res.status} ${text}`);
  }
  const json = await res.json();
  invalidateCache();
  return toScheduleShape(json.contest);
}

/**
 * Portal のコンテストを削除する。
 * @param {string} id  Portal contest ID（_portalId）
 */
async function deletePortalContest(id) {
  assertKey();
  const res = await fetch(`${PORTAL_URL}/api/internal/contests?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: headers(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Portal API DELETE エラー: ${res.status} ${text}`);
  }
  invalidateCache();
}

function toDateString(d) {
  if (!d) return "";
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  return String(d).slice(0, 10).replace(/\//g, "-");
}

module.exports = { listPortalContests, createPortalContest, updatePortalContest, deletePortalContest, invalidateCache };
