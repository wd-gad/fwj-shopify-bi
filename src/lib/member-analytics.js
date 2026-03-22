function startOfDay(value) {
  const date = new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function normalizeText(value) {
  return String(value || "").trim();
}

function buildFullName(customer) {
  const name = [customer?.lastName, customer?.firstName]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(" ");

  return name || null;
}

function buildFullNameFromProfile(profile, customer) {
  const name = [profile?.lastName, profile?.firstName]
    .map((part) => normalizeText(part))
    .filter(Boolean)
    .join(" ");

  return name || buildFullName(customer);
}

function safeDate(value) {
  if (!value) {
    return null;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const year = date.getUTCFullYear();
  const currentYear = new Date().getUTCFullYear();
  if (year < 1900 || year > currentYear) {
    return null;
  }

  return date;
}

function normalizeGender(value) {
  const normalized = normalizeText(value).toLowerCase();
  if (!normalized) {
    return null;
  }
  if (["male", "m", "man", "男性"].includes(normalized)) {
    return "male";
  }
  if (["female", "f", "woman", "女性"].includes(normalized)) {
    return "female";
  }
  return value;
}

function normalizePrefecture(prefecture) {
  const value = normalizeText(prefecture);
  if (!value) {
    return null;
  }

  const aliasMap = new Map([
    ["Hokkaido", "北海道"],
    ["Hokkaidō", "北海道"],
    ["Aomori", "青森県"],
    ["Iwate", "岩手県"],
    ["Miyagi", "宮城県"],
    ["Akita", "秋田県"],
    ["Yamagata", "山形県"],
    ["Fukushima", "福島県"],
    ["Ibaraki", "茨城県"],
    ["Tochigi", "栃木県"],
    ["Gunma", "群馬県"],
    ["Saitama", "埼玉県"],
    ["Chiba", "千葉県"],
    ["Tokyo", "東京都"],
    ["Tōkyō", "東京都"],
    ["Kanagawa", "神奈川県"],
    ["Kanagawa Prefecture", "神奈川県"],
    ["Niigata", "新潟県"],
    ["Toyama", "富山県"],
    ["Ishikawa", "石川県"],
    ["Fukui", "福井県"],
    ["Yamanashi", "山梨県"],
    ["Nagano", "長野県"],
    ["Gifu", "岐阜県"],
    ["Shizuoka", "静岡県"],
    ["Aichi", "愛知県"],
    ["Mie", "三重県"],
    ["Shiga", "滋賀県"],
    ["Kyoto", "京都府"],
    ["Kyōto", "京都府"],
    ["Osaka", "大阪府"],
    ["Ōsaka", "大阪府"],
    ["Hyogo", "兵庫県"],
    ["Hyōgo", "兵庫県"],
    ["Nara", "奈良県"],
    ["Wakayama", "和歌山県"],
    ["Tottori", "鳥取県"],
    ["Shimane", "島根県"],
    ["Okayama", "岡山県"],
    ["Hiroshima", "広島県"],
    ["Yamaguchi", "山口県"],
    ["Tokushima", "徳島県"],
    ["Kagawa", "香川県"],
    ["Ehime", "愛媛県"],
    ["Kochi", "高知県"],
    ["Kōchi", "高知県"],
    ["Fukuoka", "福岡県"],
    ["Saga", "佐賀県"],
    ["Nagasaki", "長崎県"],
    ["Kumamoto", "熊本県"],
    ["Oita", "大分県"],
    ["Ōita", "大分県"],
    ["Miyazaki", "宮崎県"],
    ["Kagoshima", "鹿児島県"],
    ["Okinawa", "沖縄県"]
  ]);

  return aliasMap.get(value) || value;
}

function deriveAgeBand(birthDate, now = new Date()) {
  if (!birthDate) {
    return null;
  }

  const birth = new Date(birthDate);
  if (Number.isNaN(birth.getTime())) {
    return null;
  }

  let age = now.getFullYear() - birth.getFullYear();
  const hasHadBirthday =
    now.getMonth() > birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() >= birth.getDate());

  if (!hasHadBirthday) {
    age -= 1;
  }

  if (age < 0) {
    return null;
  }

  const decade = Math.floor(age / 10) * 10;
  return `${decade}s`;
}

function inferRegionFromPrefecture(prefecture) {
  const value = normalizePrefecture(prefecture);
  if (!value) {
    return null;
  }

  const regionMap = new Map([
    ["北海道", "北海道"],
    ["青森県", "東北"], ["岩手県", "東北"], ["宮城県", "東北"], ["秋田県", "東北"], ["山形県", "東北"], ["福島県", "東北"],
    ["茨城県", "関東"], ["栃木県", "関東"], ["群馬県", "関東"], ["埼玉県", "関東"], ["千葉県", "関東"], ["東京都", "関東"], ["神奈川県", "関東"],
    ["新潟県", "中部"], ["富山県", "中部"], ["石川県", "中部"], ["福井県", "中部"], ["山梨県", "中部"], ["長野県", "中部"], ["岐阜県", "中部"], ["静岡県", "中部"], ["愛知県", "中部"],
    ["三重県", "近畿"], ["滋賀県", "近畿"], ["京都府", "近畿"], ["大阪府", "近畿"], ["兵庫県", "近畿"], ["奈良県", "近畿"], ["和歌山県", "近畿"],
    ["鳥取県", "中国"], ["島根県", "中国"], ["岡山県", "中国"], ["広島県", "中国"], ["山口県", "中国"],
    ["徳島県", "四国"], ["香川県", "四国"], ["愛媛県", "四国"], ["高知県", "四国"],
    ["福岡県", "九州・沖縄"], ["佐賀県", "九州・沖縄"], ["長崎県", "九州・沖縄"], ["熊本県", "九州・沖縄"], ["大分県", "九州・沖縄"], ["宮崎県", "九州・沖縄"], ["鹿児島県", "九州・沖縄"], ["沖縄県", "九州・沖縄"]
  ]);

  return regionMap.get(value) || null;
}

function normalizeFinancialStatus(value) {
  return normalizeText(value).toLowerCase();
}

function isInvalidOrder(order) {
  const raw = order?.rawJson ?? {};
  const statuses = [
    order?.financialStatus,
    raw?.financialStatus,
    raw?.displayFinancialStatus
  ]
    .map((value) => normalizeFinancialStatus(value))
    .filter(Boolean);

  if (raw?.cancelledAt || raw?.cancelled_at || raw?.cancelReason || raw?.cancel_reason) {
    return true;
  }

  return statuses.some((status) => ["refunded", "voided", "cancelled", "canceled"].includes(status));
}

function customAttributesToMap(customAttributes = []) {
  return customAttributes.reduce((accumulator, entry) => {
    const key = normalizeText(entry?.key);
    if (!key) {
      return accumulator;
    }
    accumulator[key] = entry?.value ?? "";
    return accumulator;
  }, {});
}

function extractMembershipProfileAttributes(classifiedItems = [], orders = []) {
  const orderedAtByOrderId = new Map(
    orders.map((order) => [order.id, order.orderedAt ? new Date(order.orderedAt).getTime() : 0])
  );

  const latestMembershipItem = [...classifiedItems]
    .filter((item) => item.classification === "membership")
    .sort((left, right) => (orderedAtByOrderId.get(right.orderId) || 0) - (orderedAtByOrderId.get(left.orderId) || 0))[0];

  if (!latestMembershipItem?.customAttributes?.length) {
    return null;
  }

  const raw = customAttributesToMap(latestMembershipItem.customAttributes);
  return {
    firstName: raw.fwj_firstname || null,
    lastName: raw.fwj_lastname || null,
    kanaFirstName: raw.fwj_kanafirstname || null,
    kanaLastName: raw.fwj_kanalastname || null,
    gender: normalizeGender(raw.fwj_sex),
    nationality: raw.fwj_nationality || null,
    heightCm: raw.fwj_height ? Number(raw.fwj_height) : null,
    weightKg: raw.fwj_weight ? Number(raw.fwj_weight) : null,
    birthDate: safeDate(raw.fwj_birthday),
    cardNumber: raw.fwj_card_no || null,
    cardExpiry: raw.fwj_card_expiration || raw.fwj_card_expiry || null,
    achievements: raw.fwj_achievements || raw.fwj_career || raw.fwj_record || null,
    raw
  };
}

function buildMemberProfile(customer, membershipPurchases = [], overrides = {}, membershipProfile = null) {
  const sortedMemberships = [...membershipPurchases].sort(
    (left, right) => new Date(left.purchasedAt) - new Date(right.purchasedAt)
  );

  const firstMembership = sortedMemberships[0] ?? null;
  const lastMembership = sortedMemberships.at(-1) ?? null;
  const prefecture = normalizePrefecture(overrides.prefectureOverride ?? customer?.prefecture ?? null);
  const birthDate = overrides.birthDateOverride ?? membershipProfile?.birthDate ?? customer?.birthDate ?? null;

  return {
    shopifyCustomerId: customer?.id ?? null,
    email: customer?.email ?? null,
    fullName: buildFullNameFromProfile(membershipProfile, customer),
    gender: overrides.genderOverride ?? membershipProfile?.gender ?? customer?.gender ?? null,
    birthDate,
    ageBand: deriveAgeBand(birthDate),
    prefecture,
    region: inferRegionFromPrefecture(prefecture),
    profileAttributesJson: membershipProfile ?? null,
    joinedAt: firstMembership?.purchasedAt ?? null,
    firstMembershipOrderId: firstMembership?.orderId ?? null,
    currentMembershipStatus: lastMembership?.status ?? null,
    lastMembershipExpiresAt: lastMembership?.expiresAt ?? null
  };
}

function buildMembershipPurchases({ memberId, orders, classifiedItems, membershipDurationDays = 365 }) {
  return classifiedItems
    .filter((item) => item.classification === "membership")
    .map((item) => {
      const order = orders.find((candidate) => candidate.id === item.orderId);
      const purchasedAt = order?.orderedAt ? startOfDay(order.orderedAt) : null;
      if (!purchasedAt) {
        return null;
      }

      return {
        memberId,
        orderId: item.orderId,
        orderItemId: item.id,
        membershipPlanName: item.membershipPlanName ?? item.title,
        purchasedAt,
        startsAt: purchasedAt,
        expiresAt: addDays(purchasedAt, membershipDurationDays),
        status: isInvalidOrder(order) ? "refunded" : "active"
      };
    })
    .filter(Boolean);
}

function buildEventEntries({ memberId, orders, classifiedItems }) {
  return classifiedItems
    .filter((item) => item.classification === "event_entry")
    .map((item) => {
      const order = orders.find((candidate) => candidate.id === item.orderId);
      const appliedAt = order?.orderedAt ? startOfDay(order.orderedAt) : null;
      if (!appliedAt) {
        return null;
      }

      return {
        memberId,
        orderId: item.orderId,
        orderItemId: item.id,
        eventName: item.eventName ?? item.title,
        eventDate: item.eventDate ?? null,
        eventCategory: item.eventCategory ?? null,
        eventVenueName: item.eventVenueName ?? null,
        eventAddress: item.eventAddress ?? null,
        appliedAt,
        quantity: item.quantity ?? 1,
        status: isInvalidOrder(order) ? "refunded" : "applied"
      };
    })
    .filter(Boolean);
}

module.exports = {
  deriveAgeBand,
  normalizePrefecture,
  inferRegionFromPrefecture,
  extractMembershipProfileAttributes,
  buildMemberProfile,
  buildMembershipPurchases,
  buildEventEntries
};
