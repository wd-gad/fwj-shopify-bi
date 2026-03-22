const { prisma } = require("./prisma.js");
const { normalizePrefecture, inferRegionFromPrefecture } = require("./member-analytics.js");

const DEFAULT_DISPLAY_FROM = new Date("2026-01-01T00:00:00.000Z");

function dateGte(date) {
  return date ? { gte: date } : {};
}

function maxDate(left, right) {
  if (!left) return right;
  if (!right) return left;
  return left > right ? left : right;
}

function buildDefaultDisplayWindow(filters = {}) {
  const joinedFrom = filters.joinedFrom ? new Date(filters.joinedFrom) : null;
  return {
    joinedFrom: maxDate(joinedFrom, DEFAULT_DISPLAY_FROM),
    joinedTo: filters.joinedTo ? new Date(filters.joinedTo) : null
  };
}

function buildMemberWhere(filters = {}) {
  const where = {};
  const displayWindow = buildDefaultDisplayWindow(filters);

  if (filters.region) {
    where.region = {
      contains: filters.region,
      mode: "insensitive"
    };
  }

  if (filters.prefecture) {
    const normalizedPrefecture = normalizePrefecture(filters.prefecture);
    where.OR = [
      {
        prefecture: {
          contains: filters.prefecture,
          mode: "insensitive"
        }
      }
    ];

    if (normalizedPrefecture && normalizedPrefecture !== filters.prefecture) {
      where.OR.push({
        prefecture: {
          contains: normalizedPrefecture,
          mode: "insensitive"
        }
      });
    }
  }

  if (filters.ageBand) {
    where.ageBand = filters.ageBand;
  }

  if (filters.gender) {
    where.gender = filters.gender;
  }

  if (filters.membershipStatus) {
    where.currentMembershipStatus = filters.membershipStatus;
  }

  where.joinedAt = {};
  if (displayWindow.joinedFrom) {
    where.joinedAt.gte = displayWindow.joinedFrom;
  }
  if (displayWindow.joinedTo) {
    where.joinedAt.lte = displayWindow.joinedTo;
  }

  return where;
}

function toNumber(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeGranularity(value) {
  return value === "week" ? "week" : "month";
}

function normalizeAgeBandLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const ageMap = new Map([
    ["10s", "10代"],
    ["20s", "20代"],
    ["30s", "30代"],
    ["40s", "40代"],
    ["50s", "50代"],
    ["60s", "60代"],
    ["70s", "70代以上"],
    ["80s", "70代以上"],
    ["90s", "70代以上"]
  ]);
  return ageMap.get(normalized) || "不明";
}

function calculateAge(birthDate) {
  if (!birthDate) {
    return null;
  }

  const date = new Date(birthDate);
  if (Number.isNaN(date.getTime())) {
    return null;
  }

  const today = new Date();
  let age = today.getFullYear() - date.getFullYear();
  const monthDiff = today.getMonth() - date.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < date.getDate())) {
    age -= 1;
  }
  return age >= 0 ? age : null;
}

function stripDiacritics(value) {
  if (!value) {
    return value;
  }
  return String(value).normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
}

function isOrderCancelled(rawJson = {}) {
  return Boolean(rawJson?.cancelledAt || rawJson?.cancelled_at || rawJson?.cancelReason || rawJson?.cancel_reason);
}

function isOrderRevenueValid(order) {
  const financialStatus = String(order?.financialStatus || "").trim().toLowerCase();
  if (isOrderCancelled(order?.rawJson)) {
    return false;
  }
  return !["refunded", "voided", "cancelled", "canceled"].includes(financialStatus);
}

function isSpectatorTicketTitle(title) {
  const value = String(title || "");
  return value.includes("観戦チケット") || value.includes("アップグレードチケット");
}

function isUpgradeTicketTitle(title) {
  return String(title || "").includes("アップグレードチケット");
}

function parseSpectatorSeatCategory({ title, variantTitle }) {
  const text = `${title || ""} ${variantTitle || ""}`;
  const match = text.match(/(SS席|S席|A席|B席|自由席|VIP席|VIP|立ち見|立見)/);
  if (match) {
    const label = match[1];
    if (label === "VIP") return "VIP席";
    if (label === "立ち見") return "立見";
    return label;
  }
  return "観戦チケット";
}

function resolveCustomerProfile(customer) {
  const member = customer?.memberProfiles?.[0] || null;
  const address = customer?.defaultAddressJson || customer?.rawJson?.default_address || customer?.rawJson?.defaultAddress || {};
  const prefecture = normalizePrefecture(
    member?.prefecture ||
      address?.province ||
      address?.province_code ||
      address?.provinceCode ||
      address?.region
  ) || "不明";
  const region = member?.region || inferRegionFromPrefecture(prefecture) || "不明";
  return {
    member,
    gender: member?.gender || "unknown",
    ageBand: normalizeAgeBandLabel(member?.ageBand),
    prefecture,
    region
  };
}

function mapCustomerRecordFromSources({ shopifyCustomer, memberProfile = null }) {
  const profile = memberProfile?.profileAttributesJson || {};
  const address =
    shopifyCustomer?.defaultAddressJson ||
    shopifyCustomer?.rawJson?.default_address ||
    shopifyCustomer?.rawJson?.defaultAddress ||
    {};
  const birthDate = profile.birthDate || memberProfile?.birthDate || null;
  const nationality = profile.nationality || address.country || null;
  const normalizedProvince =
    normalizePrefecture(address?.province) ||
    normalizePrefecture(memberProfile?.prefecture) ||
    stripDiacritics(address?.province) ||
    "-";
  const normalizedCity = stripDiacritics(address?.city) || "-";
  const normalizedAddress1 = stripDiacritics(address?.address1) || "-";
  const normalizedAddress2 = stripDiacritics(address?.address2) || "-";
  const addressLine = [
    normalizedProvince,
    normalizedCity !== "-" ? normalizedCity : null,
    normalizedAddress1 !== "-" ? normalizedAddress1 : null,
    normalizedAddress2 !== "-" ? normalizedAddress2 : null
  ]
    .filter(Boolean)
    .join(" ");

  return {
    memberId: memberProfile?.id || "-",
    shopifyCustomerId: shopifyCustomer?.id || memberProfile?.shopifyCustomerId || "-",
    fullName:
      memberProfile?.fullName ||
      [shopifyCustomer?.lastName, shopifyCustomer?.firstName].filter(Boolean).join(" ") ||
      "-",
    firstName: profile.firstName || shopifyCustomer?.firstName || "-",
    lastName: profile.lastName || shopifyCustomer?.lastName || "-",
    kanaFirstName: profile.kanaFirstName || "-",
    kanaLastName: profile.kanaLastName || "-",
    email: memberProfile?.email || shopifyCustomer?.email || "-",
    phone: shopifyCustomer?.phone || address.phone || "-",
    prefecture: normalizePrefecture(memberProfile?.prefecture) || normalizedProvince || "-",
    region:
      memberProfile?.region ||
      inferRegionFromPrefecture(normalizePrefecture(memberProfile?.prefecture) || normalizedProvince) ||
      "不明",
    gender: memberProfile?.gender || "不明",
    ageBand: normalizeAgeBandLabel(memberProfile?.ageBand),
    age: calculateAge(birthDate),
    birthDate,
    cardNumber: profile.cardNumber || profile.raw?.fwj_card_no || "-",
    cardExpiry: profile.cardExpiry || "-",
    nationality: nationality || "-",
    heightCm: profile.heightCm ?? null,
    weightKg: profile.weightKg ?? null,
    achievements: profile.achievements || "-",
    membershipStatus: memberProfile?.currentMembershipStatus || "-",
    joinedAt: memberProfile?.joinedAt || shopifyCustomer?.createdAt || null,
    address: addressLine || "-",
    postalCode: address.zip || "-",
    city: normalizedCity,
    address1: normalizedAddress1,
    address2: normalizedAddress2,
    tags: shopifyCustomer?.tags || "-",
    accountState: shopifyCustomer?.state || "-",
    isMember: Boolean(memberProfile)
  };
}

function buildSpectatorItemFilter(filters = {}) {
  const itemOr = [
    {
      title: {
        contains: "観戦チケット"
      }
    },
    {
      title: {
        contains: "アップグレードチケット"
      }
    },
    {
      product: {
        tags: {
          contains: "観戦チケット"
        }
      }
    }
  ];

  if (!filters.contestName) {
    return { OR: itemOr };
  }

  return {
    AND: [
      {
        OR: [
          {
            title: {
              contains: filters.contestName
            }
          },
          {
            product: {
              tags: {
                contains: filters.contestName
              }
            }
          }
        ]
      },
      {
        OR: itemOr
      }
    ]
  };
}

async function getDashboardSummary(filters = {}) {
  const memberWhere = buildMemberWhere(filters);
  const [
    totalMembers,
    activeMembers,
    totalEventEntries,
    totalMembershipPurchases,
    membershipRevenueRows,
    eventEntryRevenueRows,
    spectatorTicketRows,
    backstagePassRows,
    recentEvents,
    joinedAtRows
  ] = await Promise.all([
    prisma.memberProfile.count({
      where: memberWhere
    }),
    prisma.memberProfile.count({
      where: {
        ...memberWhere,
        currentMembershipStatus: "active",
      }
    }),
    prisma.eventEntry.count({
      where: {
        status: "applied",
        member: memberWhere
      }
    }),
    prisma.membershipPurchase.count({
      where: {
        status: "active",
        member: memberWhere
      }
    }),
    prisma.membershipPurchase.findMany({
      where: {
        status: "active",
        member: memberWhere
      },
      select: {
        orderItem: {
          select: {
            price: true,
            quantity: true
          }
        }
      }
    }),
    prisma.eventEntry.findMany({
      where: {
        status: "applied",
        member: memberWhere
      },
      select: {
        order: {
          select: {
            financialStatus: true,
            rawJson: true
          }
        },
        orderItem: {
          select: {
            price: true,
            quantity: true
          }
        },
        quantity: true
      }
    }),
    prisma.shopifyOrderItem.findMany({
      where: {
        OR: [
          {
            title: {
              contains: "観戦チケット"
            }
          },
          {
            title: {
              contains: "アップグレードチケット"
            }
          }
        ],
        order: {
          customer: {
            memberProfiles: {
              some: memberWhere
            }
          }
        }
      },
      select: {
        quantity: true,
        price: true,
        order: {
          select: {
            financialStatus: true,
            rawJson: true
          }
        }
      }
    }),
    prisma.shopifyOrderItem.findMany({
      where: {
        title: {
          contains: "バックステージパス"
        },
        order: {
          customer: {
            memberProfiles: {
              some: memberWhere
            }
          }
        }
      },
      select: {
        quantity: true,
        price: true,
        order: {
          select: {
            financialStatus: true,
            rawJson: true
          }
        }
      }
    }),
    prisma.eventEntry.groupBy({
      by: ["eventName", "eventDate"],
      where: {
        status: "applied",
        member: memberWhere
      },
      _count: { _all: true },
      orderBy: [{ eventDate: "desc" }, { eventName: "asc" }],
      take: 5
    }),
    prisma.memberProfile.findMany({
      where: memberWhere,
      select: {
        joinedAt: true
      },
      orderBy: {
        joinedAt: "desc"
      }
    })
  ]);

  const membershipRevenue = membershipRevenueRows.reduce((sum, row) => {
    const amount = Number(row.orderItem?.price || 0);
    const quantity = Number(row.orderItem?.quantity || 1);
    return sum + amount * quantity;
  }, 0);

  const eventEntryRevenue = eventEntryRevenueRows
    .filter((row) => isOrderRevenueValid(row.order))
    .reduce((sum, row) => {
      const amount = Number(row.orderItem?.price || 0);
      const quantity = Number(row.orderItem?.quantity || row.quantity || 1);
      return sum + amount * quantity;
    }, 0);

  const validSpectatorRows = spectatorTicketRows.filter((row) => isOrderRevenueValid(row.order));
  const spectatorCount = validSpectatorRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const spectatorRevenue = validSpectatorRows.reduce((sum, row) => {
    const amount = Number(row.price || 0);
    const quantity = Number(row.quantity || 1);
    return sum + amount * quantity;
  }, 0);

  const validBackstageRows = backstagePassRows.filter((row) => isOrderRevenueValid(row.order));
  const backstagePassCount = validBackstageRows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
  const backstagePassRevenue = validBackstageRows.reduce((sum, row) => {
    const amount = Number(row.price || 0);
    const quantity = Number(row.quantity || 1);
    return sum + amount * quantity;
  }, 0);

  const joinedByMonth = Array.from(
    joinedAtRows.reduce((buckets, row) => {
      if (!row.joinedAt) {
        return buckets;
      }
      const bucket = row.joinedAt.toISOString().slice(0, 7);
      buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
      return buckets;
    }, new Map()).entries()
  )
    .map(([bucket, count]) => ({ bucket, count }))
    .sort((left, right) => right.bucket.localeCompare(left.bucket))
    .slice(0, 12);

  return {
    totals: {
      totalMembers,
      activeMembers,
      totalEventEntries,
      totalMembershipPurchases,
      membershipRevenue,
      eventEntryRevenue,
      spectatorCount,
      spectatorRevenue,
      backstagePassCount,
      backstagePassRevenue
    },
    recentEvents: recentEvents.map((event) => ({
      eventName: event.eventName,
      eventDate: event.eventDate,
      entries: event._count._all
    })),
    joinedByMonth,
    eventEntriesByMonth: []
  };
}

async function getEventBreakdown({ limit = 20 } = {}) {
  const take = Math.min(toNumber(limit, 20), 100);
  const events = await prisma.eventEntry.groupBy({
    by: ["eventName", "eventDate"],
    where: {
      status: "applied",
      appliedAt: dateGte(DEFAULT_DISPLAY_FROM)
    },
    _count: { _all: true },
    orderBy: [{ eventDate: "desc" }, { eventName: "asc" }],
    take
  });

  return events.map((event) => ({
    eventName: event.eventName,
    eventDate: event.eventDate,
    entries: event._count._all
  }));
}

async function getEventOptions() {
  // Use ContestSchedule (non-nullable eventDate) to find 2026+ events,
  // then count matching EventEntry records by contestName.
  // EventEntry.eventDate is nullable so filtering on it misses many records.
  const schedules = await prisma.contestSchedule.findMany({
    where: { eventDate: { gte: DEFAULT_DISPLAY_FROM } },
    orderBy: [{ eventDate: "asc" }, { contestName: "asc" }]
  });

  const results = await Promise.all(
    schedules.map(async (schedule) => {
      const count = await prisma.eventEntry.count({
        where: { status: "applied", eventName: schedule.contestName }
      });
      return {
        eventName: schedule.contestName,
        eventDate: schedule.eventDate,
        eventVenueName: schedule.venueName ?? null,
        entries: count
      };
    })
  );

  return results.filter((r) => r.entries > 0);
}

async function getEventInsights(eventName) {
  if (!eventName) {
    return {
      totals: {
        totalEntries: 0,
        uniqueParticipants: 0,
        entryRevenue: 0,
        spectatorRevenue: 0,
        backstageRevenue: 0,
        totalRevenue: 0
      },
      weeklyEntries: [],
      genderCounts: [],
      ageBandCounts: [],
      regionCounts: [],
      prefectureCounts: [],
      categoryCounts: []
    };
  }

  const entries = await prisma.eventEntry.findMany({
    where: {
      status: "applied",
      eventName
    },
    include: {
      member: {
        select: {
          gender: true,
          ageBand: true,
          region: true,
          prefecture: true
        }
      },
      order: {
        select: {
          financialStatus: true,
          rawJson: true
        }
      },
      orderItem: {
        select: {
          price: true,
          quantity: true,
          title: true
        }
      }
    },
    orderBy: {
      appliedAt: "asc"
    }
  });

  const weeklyBuckets = new Map();
  const categoryBuckets = new Map();
  const genderBuckets = new Map([
    ["男性", 0],
    ["女性", 0],
    ["不明", 0]
  ]);
  const uniqueParticipantIds = new Set();
  const participantMap = new Map();
  const ageBandBuckets = new Map([
    ["10代", 0],
    ["20代", 0],
    ["30代", 0],
    ["40代", 0],
    ["50代", 0],
    ["60代", 0],
    ["70代以上", 0],
    ["不明", 0]
  ]);
  const regionBuckets = new Map();
  const prefectureBuckets = new Map();
  const validEntryRevenue = entries
    .filter((entry) => entry.status === "applied" && isOrderRevenueValid(entry.order))
    .reduce((sum, entry) => {
      const amount = Number(entry.orderItem?.price || 0);
      const quantity = Number(entry.orderItem?.quantity || entry.quantity || 1);
      return sum + amount * quantity;
    }, 0);

  const [spectatorRows, backstageRows] = await Promise.all([
    prisma.shopifyOrderItem.findMany({
      where: {
        title: {
          contains: eventName
        },
        order: {
          orderedAt: dateGte(DEFAULT_DISPLAY_FROM)
        }
      },
      select: {
        title: true,
        price: true,
        quantity: true,
        order: {
          select: {
            financialStatus: true,
            rawJson: true
          }
        }
      }
    }),
    prisma.shopifyOrderItem.findMany({
      where: {
        title: {
          contains: eventName
        },
        order: {
          orderedAt: dateGte(DEFAULT_DISPLAY_FROM)
        }
      },
      select: {
        title: true,
        price: true,
        quantity: true,
        order: {
          select: {
            financialStatus: true,
            rawJson: true
          }
        }
      }
    })
  ]);

  const spectatorRevenue = spectatorRows
    .filter((row) => isSpectatorTicketTitle(row.title) && isOrderRevenueValid(row.order))
    .reduce((sum, row) => sum + Number(row.price || 0) * Number(row.quantity || 1), 0);

  const backstageRevenue = backstageRows
    .filter((row) => row.title.includes("バックステージパス") && isOrderRevenueValid(row.order))
    .reduce((sum, row) => sum + Number(row.price || 0) * Number(row.quantity || 1), 0);

  for (const entry of entries) {
    const appliedAt = new Date(entry.appliedAt);
    const weekKey = `${appliedAt.getUTCFullYear()}-W${String(getIsoWeek(appliedAt)).padStart(2, "0")}`;
    weeklyBuckets.set(weekKey, (weeklyBuckets.get(weekKey) || 0) + 1);

    const categoryKey = entry.eventCategory || "不明";
    categoryBuckets.set(categoryKey, (categoryBuckets.get(categoryKey) || 0) + 1);

    if (!entry.memberId || uniqueParticipantIds.has(entry.memberId)) {
      continue;
    }

    uniqueParticipantIds.add(entry.memberId);
    participantMap.set(entry.memberId, entry.member);
  }

  for (const member of participantMap.values()) {
    const genderKey = member?.gender || "unknown";
    const ageBandKey = normalizeAgeBandLabel(member?.ageBand);
    const regionKey = member?.region || "不明";
    const prefectureKey = normalizePrefecture(member?.prefecture) || "不明";

    const genderLabelMap = {
      male: "男性",
      female: "女性",
      unknown: "不明"
    };

    const genderLabel = genderLabelMap[genderKey] || genderKey;
    const currentGender = genderBuckets.get(genderLabel) || 0;
    genderBuckets.set(genderLabel, currentGender + 1);

    ageBandBuckets.set(ageBandKey, (ageBandBuckets.get(ageBandKey) || 0) + 1);
    regionBuckets.set(regionKey, (regionBuckets.get(regionKey) || 0) + 1);
    prefectureBuckets.set(prefectureKey, (prefectureBuckets.get(prefectureKey) || 0) + 1);
  }

  return {
    totals: {
      totalEntries: entries.length,
      uniqueParticipants: uniqueParticipantIds.size,
      entryRevenue: validEntryRevenue,
      spectatorRevenue,
      backstageRevenue,
      totalRevenue: validEntryRevenue + spectatorRevenue + backstageRevenue
    },
    weeklyEntries: [...weeklyBuckets.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([bucket, count]) => ({ bucket, count })),
    genderCounts: [...genderBuckets.entries()]
      .filter(([, count]) => count > 0)
      .map(([label, count]) => ({ label, count })),
    ageBandCounts: [...ageBandBuckets.entries()]
      .filter(([, count]) => count > 0)
      .map(([label, count]) => ({ label, count })),
    regionCounts: [...regionBuckets.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"))
      .map(([label, count]) => ({ label, count })),
    prefectureCounts: [...prefectureBuckets.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"))
      .map(([label, count]) => ({ label, count })),
    categoryCounts: [...categoryBuckets.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"))
      .map(([label, count]) => ({ label, count }))
  };
}

async function getSpectatorInsights(eventName) {
  if (!eventName) {
    return {
      totals: {
        totalTickets: 0,
        uniqueSpectators: 0,
        ticketRevenue: 0,
        totalOrders: 0,
        averageTicketsPerOrder: 0,
        averageRevenuePerOrder: 0
      },
      weeklyEntries: [],
      genderCounts: [],
      ageBandCounts: [],
      regionCounts: [],
      prefectureCounts: [],
      categoryCounts: []
    };
  }

  const rows = await prisma.shopifyOrderItem.findMany({
    where: {
      title: {
        contains: eventName
      }
    },
    select: {
      title: true,
      variantTitle: true,
      price: true,
      quantity: true,
      order: {
        select: {
          id: true,
          customerId: true,
          email: true,
          orderedAt: true,
          financialStatus: true,
          rawJson: true,
          customer: {
            select: {
              email: true,
              defaultAddressJson: true,
              rawJson: true,
              memberProfiles: {
                orderBy: [{ joinedAt: "desc" }, { createdAt: "desc" }],
                take: 1,
                select: {
                  id: true,
                  gender: true,
                  ageBand: true,
                  prefecture: true,
                  region: true
                }
              }
            }
          }
        }
      }
    },
    orderBy: {
      order: {
        orderedAt: "asc"
      }
    }
  });

  const spectatorRows = rows.filter(
    (row) => isSpectatorTicketTitle(row.title) && isOrderRevenueValid(row.order)
  );

  const weeklyBuckets = new Map();
  const baseCategoryBuckets = new Map();
  const upgradeBuckets = new Map();
  const sourceReductionBuckets = new Map();
  const genderBuckets = new Map([
    ["男性", 0],
    ["女性", 0],
    ["不明", 0]
  ]);
  const ageBandBuckets = new Map([
    ["10代", 0],
    ["20代", 0],
    ["30代", 0],
    ["40代", 0],
    ["50代", 0],
    ["60代", 0],
    ["70代以上", 0],
    ["不明", 0]
  ]);
  const regionBuckets = new Map();
  const prefectureBuckets = new Map();
  const uniqueSpectators = new Map();

  for (const row of spectatorRows) {
    const orderedAt = row.order?.orderedAt ? new Date(row.order.orderedAt) : null;
    if (orderedAt && !Number.isNaN(orderedAt.getTime())) {
      const weekKey = `${orderedAt.getUTCFullYear()}-W${String(getIsoWeek(orderedAt)).padStart(2, "0")}`;
      weeklyBuckets.set(weekKey, (weeklyBuckets.get(weekKey) || 0) + Number(row.quantity || 1));
    }

    const quantity = Number(row.quantity || 1);
    const categoryLabel = parseSpectatorSeatCategory(row);

    if (isUpgradeTicketTitle(row.title)) {
      upgradeBuckets.set(categoryLabel, (upgradeBuckets.get(categoryLabel) || 0) + quantity);
      sourceReductionBuckets.set("A席", (sourceReductionBuckets.get("A席") || 0) + quantity);
    } else {
      baseCategoryBuckets.set(categoryLabel, (baseCategoryBuckets.get(categoryLabel) || 0) + quantity);
    }

    const uniqueKey = row.order.customerId || row.order.customer?.email || row.order.email || row.order.id;
    if (uniqueSpectators.has(uniqueKey)) {
      continue;
    }

    uniqueSpectators.set(uniqueKey, resolveCustomerProfile(row.order.customer));
  }

  for (const customer of uniqueSpectators.values()) {
    const genderLabelMap = {
      male: "男性",
      female: "女性",
      unknown: "不明"
    };
    const genderLabel = genderLabelMap[customer.gender] || customer.gender || "不明";
    genderBuckets.set(genderLabel, (genderBuckets.get(genderLabel) || 0) + 1);
    ageBandBuckets.set(customer.ageBand, (ageBandBuckets.get(customer.ageBand) || 0) + 1);
    regionBuckets.set(customer.region, (regionBuckets.get(customer.region) || 0) + 1);
    prefectureBuckets.set(customer.prefecture, (prefectureBuckets.get(customer.prefecture) || 0) + 1);
  }

  const totalTickets = spectatorRows.reduce((sum, row) => sum + Number(row.quantity || 1), 0);
  const ticketRevenue = spectatorRows.reduce(
    (sum, row) => sum + Number(row.price || 0) * Number(row.quantity || 1),
    0
  );
  const totalOrders = new Set(spectatorRows.map((row) => row.order.id)).size;
  const categoryKeys = new Set([
    ...baseCategoryBuckets.keys(),
    ...upgradeBuckets.keys(),
    ...sourceReductionBuckets.keys()
  ]);
  const categoryCounts = [...categoryKeys]
    .map((label) => {
      const baseCount = baseCategoryBuckets.get(label) || 0;
      const upgradeCount = upgradeBuckets.get(label) || 0;
      const sourceReduction = sourceReductionBuckets.get(label) || 0;
      return {
        label,
        count: Math.max(baseCount + upgradeCount - sourceReduction, 0),
        upgradeCount,
        sourceReduction
      };
    })
    .sort((left, right) => right.count - left.count || left.label.localeCompare(right.label, "ja"));

  return {
    totals: {
      totalTickets,
      uniqueSpectators: uniqueSpectators.size,
      ticketRevenue,
      totalOrders,
      averageTicketsPerOrder: totalOrders ? totalTickets / totalOrders : 0,
      averageRevenuePerOrder: totalOrders ? ticketRevenue / totalOrders : 0
    },
    weeklyEntries: [...weeklyBuckets.entries()]
      .sort((left, right) => left[0].localeCompare(right[0]))
      .map(([bucket, count]) => ({ bucket, count })),
    genderCounts: [...genderBuckets.entries()]
      .filter(([, count]) => count > 0)
      .map(([label, count]) => ({ label, count })),
    ageBandCounts: [...ageBandBuckets.entries()]
      .filter(([, count]) => count > 0)
      .map(([label, count]) => ({ label, count })),
    regionCounts: [...regionBuckets.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"))
      .map(([label, count]) => ({ label, count })),
    prefectureCounts: [...prefectureBuckets.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"))
      .map(([label, count]) => ({ label, count })),
    categoryCounts
  };
}

async function getMembers(filters = {}) {
  const take = Math.min(toNumber(filters.take, 24), 100);
  const members = await prisma.memberProfile.findMany({
    where: buildMemberWhere(filters),
    orderBy: [{ joinedAt: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      _count: {
        select: {
          eventEntries: {
            where: {
              status: "applied",
              appliedAt: dateGte(DEFAULT_DISPLAY_FROM)
            }
          },
          membershipPurchases: {
            where: {
              purchasedAt: dateGte(DEFAULT_DISPLAY_FROM)
            }
          }
        }
      },
      eventEntries: {
        where: {
          status: "applied",
          appliedAt: dateGte(DEFAULT_DISPLAY_FROM)
        },
        orderBy: { appliedAt: "desc" },
        take: 1
      }
    }
  });

  return members.map((member) => ({
    memberId: member.id,
    fullName: member.fullName,
    email: member.email,
    gender: member.gender,
    ageBand: member.ageBand,
    prefecture: member.prefecture,
    region: member.region,
    joinedAt: member.joinedAt,
    currentMembershipStatus: member.currentMembershipStatus,
    eventEntryCount: member._count.eventEntries,
    membershipPurchaseCount: member._count.membershipPurchases,
    lastEventAppliedAt: member.eventEntries[0]?.appliedAt ?? null,
    lastEventName: member.eventEntries[0]?.eventName ?? null
  }));
}

async function getCustomers(filters = {}) {
  const take = Math.min(toNumber(filters.take, 100), 300);
  if (filters.audienceType === "spectator") {
    const displayWindow = buildDefaultDisplayWindow(filters);
    const customers = await prisma.shopifyCustomer.findMany({
      where: {
        orders: {
          some: {
            ...(displayWindow.joinedFrom || displayWindow.joinedTo
              ? {
                  orderedAt: {
                    ...(displayWindow.joinedFrom ? { gte: displayWindow.joinedFrom } : {}),
                    ...(displayWindow.joinedTo ? { lte: displayWindow.joinedTo } : {})
                  }
                }
              : {}),
            items: {
              some: buildSpectatorItemFilter(filters)
            }
          }
        }
      },
      orderBy: [{ createdAt: "desc" }],
      take,
      include: {
        memberProfiles: {
          orderBy: [{ joinedAt: "desc" }, { createdAt: "desc" }],
          take: 1
        }
      }
    });

    return customers
      .map((customer) => mapCustomerRecordFromSources({ shopifyCustomer: customer, memberProfile: customer.memberProfiles?.[0] || null }))
      .filter((customer) => {
        if (filters.prefecture) {
          const normalizedFilter = normalizePrefecture(filters.prefecture);
          if (
            !String(customer.prefecture || "").includes(filters.prefecture) &&
            !String(customer.prefecture || "").includes(normalizedFilter || "")
          ) {
            return false;
          }
        }
        if (filters.region && !String(customer.region || "").includes(filters.region)) {
          return false;
        }
        if (filters.ageBand && customer.ageBand !== normalizeAgeBandLabel(filters.ageBand)) {
          return false;
        }
        if (filters.gender) {
          const expected = filters.gender === "male" ? "男性" : filters.gender === "female" ? "女性" : filters.gender;
          if (customer.gender !== expected) {
            return false;
          }
        }
        if (filters.audienceType !== "spectator" && filters.membershipStatus && customer.membershipStatus !== filters.membershipStatus) {
          return false;
        }
        return true;
      });
  }

  const where = buildMemberWhere(filters);

  if (filters.audienceType === "attendee") {
    where.eventEntries = {
      some: {
        status: "applied",
        ...(filters.contestName ? { eventName: filters.contestName } : {}),
        appliedAt: dateGte(DEFAULT_DISPLAY_FROM)
      }
    };
  }

  if (filters.audienceType === "spectator") {
    where.shopifyCustomer = {
      orders: {
        some: {
          items: {
            some: {
              AND: [
                filters.contestName
                  ? {
                      title: {
                        contains: filters.contestName
                      }
                    }
                  : {},
                {
                  OR: [
                    {
                      title: {
                        contains: "観戦チケット"
                      }
                    },
                    {
                      title: {
                        contains: "アップグレードチケット"
                      }
                    }
                  ]
                }
              ]
            }
          },
          orderedAt: dateGte(DEFAULT_DISPLAY_FROM)
        }
      }
    };
  } else if (filters.contestName) {
    where.OR = [
      {
        eventEntries: {
          some: {
            status: "applied",
            eventName: filters.contestName,
            appliedAt: dateGte(DEFAULT_DISPLAY_FROM)
          }
        }
      },
      {
        shopifyCustomer: {
          orders: {
            some: {
              items: {
                some: {
                  AND: [
                    {
                      title: {
                        contains: filters.contestName
                      }
                    },
                    {
                      OR: [
                        {
                          title: {
                            contains: "観戦チケット"
                          }
                        },
                        {
                          title: {
                            contains: "アップグレードチケット"
                          }
                        }
                      ]
                    }
                  ]
                }
              },
              orderedAt: dateGte(DEFAULT_DISPLAY_FROM)
            }
          }
        }
      }
    ];
  }

  const customers = await prisma.memberProfile.findMany({
    where,
    orderBy: [{ joinedAt: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      shopifyCustomer: true
    }
  });

  return customers.map((customer) =>
    mapCustomerRecordFromSources({ shopifyCustomer: customer.shopifyCustomer, memberProfile: customer })
  );
}

async function getMemberJoinTrend(filters = {}) {
  const granularity = normalizeGranularity(filters.granularity);
  const members = await prisma.memberProfile.findMany({
    where: buildMemberWhere(filters),
    select: {
      joinedAt: true,
      region: true,
      prefecture: true
    },
    orderBy: {
      joinedAt: "asc"
    }
  });

  const buckets = new Map();
  const regionBuckets = new Map();
  const prefectureBuckets = new Map();
  for (const member of members) {
    const regionKey = member.region || "不明";
    const prefectureKey = normalizePrefecture(member.prefecture) || "不明";

    regionBuckets.set(regionKey, (regionBuckets.get(regionKey) || 0) + 1);
    prefectureBuckets.set(prefectureKey, (prefectureBuckets.get(prefectureKey) || 0) + 1);

    if (!member.joinedAt) {
      continue;
    }

    const date = new Date(member.joinedAt);
    const bucket =
      granularity === "week"
        ? `${date.getUTCFullYear()}-W${String(getIsoWeek(date)).padStart(2, "0")}`
        : date.toISOString().slice(0, 7);
    buckets.set(bucket, (buckets.get(bucket) || 0) + 1);
  }

  return {
    trend: [...buckets.entries()].map(([bucket, count]) => ({
      bucket,
      count
    })),
    regionCounts: [...regionBuckets.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"))
      .map(([label, count]) => ({ label, count })),
    prefectureCounts: [...prefectureBuckets.entries()]
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"))
      .map(([label, count]) => ({ label, count }))
  };
}

function getIsoWeek(date) {
  const value = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = value.getUTCDay() || 7;
  value.setUTCDate(value.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(value.getUTCFullYear(), 0, 1));
  return Math.ceil((((value - yearStart) / 86400000) + 1) / 7);
}

async function getMemberDetail(memberId) {
  const member = await prisma.memberProfile.findUnique({
    where: { id: memberId },
    include: {
      shopifyCustomer: true,
      membershipPurchases: {
        where: {
          purchasedAt: dateGte(DEFAULT_DISPLAY_FROM)
        },
        orderBy: { purchasedAt: "desc" }
      },
      eventEntries: {
        where: {
          appliedAt: dateGte(DEFAULT_DISPLAY_FROM)
        },
        orderBy: { appliedAt: "desc" }
      }
    }
  });

  if (!member) {
    return null;
  }

  return {
    memberId: member.id,
    fullName: member.fullName,
    email: member.email,
    gender: member.gender,
    ageBand: member.ageBand,
    prefecture: member.prefecture,
    region: member.region,
    joinedAt: member.joinedAt,
    currentMembershipStatus: member.currentMembershipStatus,
    lastMembershipExpiresAt: member.lastMembershipExpiresAt,
    shopifyCustomerId: member.shopifyCustomerId,
    phone: member.shopifyCustomer?.phone ?? null,
    tags: member.shopifyCustomer?.tags ?? null,
    profileAttributes: member.profileAttributesJson ?? null,
    membershipPurchases: member.membershipPurchases.map((purchase) => ({
      membershipPlanName: purchase.membershipPlanName,
      purchasedAt: purchase.purchasedAt,
      startsAt: purchase.startsAt,
      expiresAt: purchase.expiresAt,
      status: purchase.status,
      orderId: purchase.orderId
    })),
    eventEntries: member.eventEntries.map((entry) => ({
      eventName: entry.eventName,
      eventDate: entry.eventDate,
      eventCategory: entry.eventCategory,
      eventVenueName: entry.eventVenueName,
      eventAddress: entry.eventAddress,
      appliedAt: entry.appliedAt,
      quantity: entry.quantity,
      status: entry.status,
      orderId: entry.orderId
    }))
  };
}

module.exports = {
  getDashboardSummary,
  getEventBreakdown,
  getEventInsights,
  getSpectatorInsights,
  getEventOptions,
  getCustomers,
  getMemberJoinTrend,
  getMembers,
  getMemberDetail
};
