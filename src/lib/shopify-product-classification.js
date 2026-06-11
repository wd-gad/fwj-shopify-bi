const MEMBERSHIP_KEYWORDS = ["membership", "member", "members", "メンバー", "会員"];
const EVENT_TAGS = ["event", "entry", "competition"];
const MEMBERSHIP_TAGS = ["membership", "member"];
const CONTEST_ENTRY_MARKER = "コンテストエントリー";
const EVENT_PREFIX_PATTERN = /^(?<month>\d{2})(?<day>\d{2})\s*(?<name>.+)$/;

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeTagList(tags) {
  return normalizeText(tags)
    .split(",")
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean);
}

function hasAnyKeyword(value, keywords) {
  const haystack = normalizeText(value).toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword.toLowerCase()));
}

function normalizeContestKey(value) {
  return normalizeText(value)
    .replace(/2026/gi, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .toLowerCase();
}

// 複数日開催の「日」を表すトークン群。
//   - 商品タグ / タイトル: "Day-1" / "Day1" / "Day 2"（先頭に語境界を要求し holiday 等の誤検出を防ぐ）
//   - 正規化キー末尾:       "... classic d1"（normalizeContestKey 通過後の " d1"）
//   - スケジュール名末尾:   "... 2026 D2"
const DAY_TOKEN_RE = /(?:^|[\s\-/、,])day[\s\-]*?(\d+)/i;
const DAY_KEY_SUFFIX_RE = /\sd\s*\d+\s*$/i;
const DAY_NAME_SUFFIX_RE = /\bD\s*(\d+)\s*$/;

// 商品タグ文字列・タイトルから開催日インデックス（1, 2, ...）を取り出す。無ければ null。
function parseDayIndex(value) {
  const match = normalizeText(value).match(DAY_TOKEN_RE);
  return match ? Number(match[1]) : null;
}

// スケジュール名（例: "... 2026 D2"）末尾の日サフィックスから日インデックスを取り出す。無ければ null。
function dayIndexFromName(contestName) {
  const match = normalizeText(contestName).match(DAY_NAME_SUFFIX_RE);
  return match ? Number(match[1]) : null;
}

// 正規化キー末尾の日サフィックス（" d1" 等）を取り除き、コンテスト本体キーを得る。
function stripDayKeySuffix(contestKey) {
  return normalizeText(contestKey).replace(DAY_KEY_SUFFIX_RE, "").trim();
}

function parseEventTitle(title, fallbackYear = new Date().getFullYear()) {
  const normalized = normalizeText(title);
  const match = normalized.match(EVENT_PREFIX_PATTERN);

  if (!match?.groups) {
    return null;
  }

  const month = Number(match.groups.month);
  const day = Number(match.groups.day);
  const eventName = match.groups.name.trim();

  if (month < 1 || month > 12 || day < 1 || day > 31 || !eventName) {
    return null;
  }

  const eventDate = new Date(Date.UTC(fallbackYear, month - 1, day));
  if (Number.isNaN(eventDate.getTime())) {
    return null;
  }

  return {
    eventDate,
    eventName
  };
}

function buildContestScheduleIndex(contestSchedules = []) {
  return [...contestSchedules]
    .map((schedule) => {
      const contestKey = normalizeContestKey(schedule.contestName);
      return {
        ...schedule,
        contestKey,
        // 複数日開催のスケジュール（"... D1" / "... D2"）を、日サフィックスを除いた
        // 本体キーで束ね、商品タイトル（日サフィックスを含まない）と突き合わせられるようにする。
        baseKey: stripDayKeySuffix(contestKey),
        scheduleDayIndex: dayIndexFromName(schedule.contestName)
      };
    })
    .filter((schedule) => schedule.baseKey)
    // 本体キーが長い（=より具体的な）コンテストを優先。
    .sort((left, right) => right.baseKey.length - left.baseKey.length);
}

// タイトル（＋商品タグ）を ContestSchedule に解決する。
// 同一本体名のスケジュールが複数日ぶら下がる場合（複数日開催）は、商品タグ/タイトルの
// "Day-N" から開催日を判定して該当日のスケジュールを採用する。単日開催は従来どおり一意に一致。
function matchContestSchedule(title, tags, contestSchedules = []) {
  const titleKey = normalizeContestKey(title);
  if (!titleKey) return null;

  const matches = contestSchedules.filter((schedule) => titleKey.includes(schedule.baseKey));
  if (matches.length === 0) return null;

  // 最も具体的な本体キー（=最長）のコンテストに属する候補だけを残す。
  const topLength = matches[0].baseKey.length;
  const candidates = matches.filter((schedule) => schedule.baseKey.length === topLength);
  if (candidates.length === 1) return candidates[0];

  // 複数日開催: 商品タグ優先（タイトルにも無ければ）で開催日を判定。
  const dayIndex = parseDayIndex(tags) ?? parseDayIndex(title);
  if (dayIndex != null) {
    const hit = candidates.find((schedule) => schedule.scheduleDayIndex === dayIndex);
    if (hit) return hit;
  }

  // 日を特定できない場合は最も早い日（最小の日インデックス）へフォールバック。
  return [...candidates].sort(
    (left, right) =>
      (left.scheduleDayIndex ?? Number.MAX_SAFE_INTEGER) -
      (right.scheduleDayIndex ?? Number.MAX_SAFE_INTEGER)
  )[0];
}

// ContestSchedule を正とした event_entry を組み立てる。日付・名称・会場はスケジュールから採用し、
// タイトル先頭の日付プレフィックス（例: "0313"）由来の分裂を防ぐ。
function eventEntryFromSchedule(schedule, eventCategory = null) {
  return {
    classification: "event_entry",
    membershipPlanName: null,
    eventName: schedule.contestName,
    eventDate: schedule.eventDate,
    eventCategory,
    eventVenueName: schedule.venueName ?? null,
    eventAddress: schedule.address ?? null
  };
}

// タグ/タイトル日付プレフィックス経由の event_entry を、可能なら ContestSchedule に解決する。
// スケジュールが一致した場合はスケジュールの日付・名称・会場を正とし、タイトル日付への
// フォールバック（同一コンテストが日付ごとに割れる現象）を最小化する。
function buildEventEntry(title, parsed, contestSchedules = [], tags = "") {
  const eventName = (parsed?.eventName || normalizeText(title)) || null;
  const schedule =
    matchContestSchedule(eventName || "", tags, contestSchedules) ||
    matchContestSchedule(title, tags, contestSchedules);

  if (schedule) {
    return eventEntryFromSchedule(schedule);
  }

  return {
    classification: "event_entry",
    membershipPlanName: null,
    eventName,
    eventDate: parsed?.eventDate ?? null,
    eventCategory: null,
    eventVenueName: null,
    eventAddress: null
  };
}

function parseContestEntry(title, contestSchedules = [], tags = "") {
  if (!normalizeText(title).includes(CONTEST_ENTRY_MARKER)) {
    return null;
  }

  const [contestPart, categoryPart] = normalizeText(title).split(CONTEST_ENTRY_MARKER);
  const schedule = matchContestSchedule(contestPart, tags, contestSchedules);
  const eventCategory = normalizeText(categoryPart) || null;

  if (!schedule) {
    return {
      classification: "event_entry",
      membershipPlanName: null,
      eventName: normalizeText(contestPart) || normalizeText(title) || null,
      eventDate: null,
      eventCategory,
      eventVenueName: null,
      eventAddress: null
    };
  }

  return eventEntryFromSchedule(schedule, eventCategory);
}

function classifyShopifyProduct(product, options = {}) {
  const title = normalizeText(product?.title);
  const tags = normalizeTagList(product?.tags);
  // 複数日開催の開催日判定は生のタグ文字列（例: "... Day-2"）から行う。
  const rawTags = normalizeText(product?.tags);
  const fallbackYear = options.fallbackYear ?? new Date().getFullYear();
  const contestSchedules = buildContestScheduleIndex(options.contestSchedules || []);

  if (tags.some((tag) => MEMBERSHIP_TAGS.includes(tag))) {
    return {
      classification: "membership",
      membershipPlanName: title || null,
      eventName: null,
      eventDate: null,
      eventCategory: null,
      eventVenueName: null,
      eventAddress: null
    };
  }

  const contestEntry = parseContestEntry(title, contestSchedules, rawTags);
  if (contestEntry) {
    return contestEntry;
  }

  if (tags.some((tag) => EVENT_TAGS.includes(tag))) {
    return buildEventEntry(title, parseEventTitle(title, fallbackYear), contestSchedules, rawTags);
  }

  if (hasAnyKeyword(title, MEMBERSHIP_KEYWORDS)) {
    return {
      classification: "membership",
      membershipPlanName: title || null,
      eventName: null,
      eventDate: null,
      eventCategory: null,
      eventVenueName: null,
      eventAddress: null
    };
  }

  const parsed = parseEventTitle(title, fallbackYear);
  if (parsed) {
    return buildEventEntry(title, parsed, contestSchedules, rawTags);
  }

  return {
    classification: "normal_product",
    membershipPlanName: null,
    eventName: null,
    eventDate: null,
    eventCategory: null,
    eventVenueName: null,
    eventAddress: null
  };
}

function parseEventTitleFromProduct(product, fallbackYear) {
  return parseEventTitle(product?.title, fallbackYear);
}

function extractContestName(title) {
  const normalized = normalizeText(title);
  if (!normalized.includes(CONTEST_ENTRY_MARKER)) {
    return null;
  }
  const [contestPart] = normalized.split(CONTEST_ENTRY_MARKER);
  const name = normalizeText(contestPart);
  return name || null;
}

// 表示名 "... 2026 D2" から日サフィックスを取り除いた本体名を返す（読み取り層の突き合わせ用）。
function stripDayNameSuffix(contestName) {
  return normalizeText(contestName).replace(DAY_NAME_SUFFIX_RE, "").trim();
}

module.exports = {
  classifyShopifyProduct,
  extractContestName,
  normalizeContestKey,
  parseEventTitleFromProduct,
  parseDayIndex,
  dayIndexFromName,
  stripDayNameSuffix
};
