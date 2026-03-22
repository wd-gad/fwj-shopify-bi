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
    const parsed = parseEventTitle(title, fallbackYear);
    return {
      classification: "event_entry",
      membershipPlanName: null,
      eventName: parsed?.eventName ?? title ?? null,
      eventDate: parsed?.eventDate ?? null,
      eventCategory: null,
      eventVenueName: null,
      eventAddress: null
    };
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
    return {
      classification: "event_entry",
      membershipPlanName: null,
      eventName: parsed.eventName,
      eventDate: parsed.eventDate,
      eventCategory: null,
      eventVenueName: null,
      eventAddress: null
    };
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

module.exports = {
  classifyShopifyProduct,
  parseEventTitleFromProduct
};
