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
    .map((schedule) => ({
      ...schedule,
      contestKey: normalizeContestKey(schedule.contestName)
    }))
    .filter((schedule) => schedule.contestKey)
    .sort((left, right) => right.contestKey.length - left.contestKey.length);
}

function matchContestSchedule(title, contestSchedules = []) {
  const titleKey = normalizeContestKey(title);
  return contestSchedules.find((schedule) => titleKey.includes(schedule.contestKey)) || null;
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
function buildEventEntry(title, parsed, contestSchedules = []) {
  const eventName = (parsed?.eventName || normalizeText(title)) || null;
  const schedule =
    matchContestSchedule(eventName || "", contestSchedules) ||
    matchContestSchedule(title, contestSchedules);

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

function parseContestEntry(title, contestSchedules = []) {
  if (!normalizeText(title).includes(CONTEST_ENTRY_MARKER)) {
    return null;
  }

  const [contestPart, categoryPart] = normalizeText(title).split(CONTEST_ENTRY_MARKER);
  const schedule = matchContestSchedule(contestPart, contestSchedules);
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

  const contestEntry = parseContestEntry(title, contestSchedules);
  if (contestEntry) {
    return contestEntry;
  }

  if (tags.some((tag) => EVENT_TAGS.includes(tag))) {
    return buildEventEntry(title, parseEventTitle(title, fallbackYear), contestSchedules);
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
    return buildEventEntry(title, parsed, contestSchedules);
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

module.exports = {
  classifyShopifyProduct,
  extractContestName,
  normalizeContestKey,
  parseEventTitleFromProduct
};
