const fs = require("fs");
const path = require("path");
const { prisma } = require("../src/lib/prisma.js");

function parseArgs(argv) {
  const options = {
    start: "2026-03-01T00:00:00Z",
    end: "2026-04-01T00:00:00Z",
    rankMap: path.resolve(process.cwd(), "docs/shopify-member-rank-map.json"),
    jsonOutput: path.resolve(process.cwd(), "docs/shopify-monthly-points.json"),
    csvOutput: path.resolve(process.cwd(), "docs/shopify-monthly-points.csv")
  };

  for (const arg of argv) {
    if (arg.startsWith("--start=")) {
      options.start = arg.slice("--start=".length);
    } else if (arg.startsWith("--end=")) {
      options.end = arg.slice("--end=".length);
    } else if (arg.startsWith("--rank-map=")) {
      options.rankMap = path.resolve(process.cwd(), arg.slice("--rank-map=".length));
    } else if (arg.startsWith("--json-output=")) {
      options.jsonOutput = path.resolve(process.cwd(), arg.slice("--json-output=".length));
    } else if (arg.startsWith("--csv-output=")) {
      options.csvOutput = path.resolve(process.cwd(), arg.slice("--csv-output=".length));
    }
  }

  return options;
}

function asDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function normalizeTags(value) {
  return String(value || "")
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function getMoney(value) {
  return value == null ? 0 : Number(value);
}

function parseLoyaltyAttributes(customerRawJson = {}) {
  const metafields = customerRawJson?.metafields?.edges ?? [];
  const entry = metafields.find((edge) => {
    const node = edge?.node;
    return node?.namespace === "loyalty" && node?.key === "easy_points_attributes";
  });

  if (!entry?.node?.value) {
    return null;
  }

  try {
    return JSON.parse(entry.node.value);
  } catch {
    return null;
  }
}

function monthBefore(date) {
  const value = new Date(date);
  value.setUTCMonth(value.getUTCMonth() - 1);
  return value;
}

function nFromEntryCount(count) {
  if (count >= 4) return 40;
  if (count === 3) return 30;
  if (count === 2) return 20;
  return 0;
}

function nFromMemberRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return 0;
  return rate;
}

function csvEscape(value) {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function toCsv(rows) {
  if (!rows.length) return "";
  const headers = Object.keys(rows[0]);
  const lines = [headers.map(csvEscape).join(",")];
  for (const row of rows) {
    lines.push(headers.map((header) => csvEscape(row[header])).join(","));
  }
  return `${lines.join("\n")}\n`;
}

function loadRankMap(filePath) {
  if (!fs.existsSync(filePath)) {
    return { byGroupTag: {}, byEmail: {} };
  }

  const payload = JSON.parse(fs.readFileSync(filePath, "utf8"));
  return {
    byGroupTag: payload.byGroupTag || {},
    byEmail: payload.byEmail || {}
  };
}

function resolveMemberRank(candidate, rankMap) {
  const emailKey = String(candidate.customerEmail || "").trim().toLowerCase();
  if (emailKey && rankMap.byEmail[emailKey]) {
    return rankMap.byEmail[emailKey];
  }

  for (const groupTag of candidate.groupTags) {
    if (rankMap.byGroupTag[groupTag]) {
      return rankMap.byGroupTag[groupTag];
    }
  }

  return null;
}

function buildOrderCandidate(order, rankMap) {
  const customerTags = normalizeTags(order.customer?.tags);
  const loyalty = parseLoyaltyAttributes(order.customer?.rawJson);
  const groupTags = customerTags.filter((tag) => /^G\d+$/i.test(tag));
  const rewardItems = order.items
    .map((item) => {
      const productTags = normalizeTags(item.product?.tags);
      return {
        orderItemId: item.id,
        title: item.title,
        quantity: item.quantity,
        price: getMoney(item.price),
        eventName: item.product?.classification?.eventName || null,
        eventDate: item.product?.classification?.eventDate || null,
        productTags,
        isRewardTarget: productTags.includes("還元対象"),
        isNoEasyPoints: productTags.includes("no-easy-points"),
        isContestEntry:
          productTags.includes("コンテストエントリー") ||
          item.product?.classification?.classification === "event_entry"
      };
    })
    .filter((item) => item.isContestEntry && item.isRewardTarget && item.isNoEasyPoints);

  if (!rewardItems.length) {
    return null;
  }

  const orderedAt = order.orderedAt ? new Date(order.orderedAt) : null;
  const eventDates = rewardItems
    .map((item) => (item.eventDate ? new Date(item.eventDate) : null))
    .filter(Boolean);
  const earlyEligibilityPerItem = rewardItems.map((item) => {
    if (!orderedAt || !item.eventDate) return null;
    return orderedAt <= monthBefore(new Date(item.eventDate));
  });
  const knownEarlyChecks = earlyEligibilityPerItem.filter((value) => value != null);

  const entryCount = rewardItems.reduce((sum, item) => sum + (item.quantity || 0), 0);
  const listPriceTotal = rewardItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
  const discountAmount = getMoney(order.rawJson?.currentTotalDiscountsSet?.shopMoney?.amount);
  const payableAfterDiscount = getMoney(order.totalPrice);
  const nCount = nFromEntryCount(entryCount);
  const nEarlyAll = knownEarlyChecks.length === rewardItems.length && knownEarlyChecks.every(Boolean) ? 30 : 0;
  const nEarlyAny = knownEarlyChecks.some(Boolean) ? 30 : 0;
  const baselineNWithoutRank = Math.max(nCount, nEarlyAll);
  const fixedRateWithoutRank = baselineNWithoutRank === 40 ? 12 : baselineNWithoutRank === 30 ? 8 : baselineNWithoutRank === 20 ? 5 : 0;
  const provisionalPointsWithoutRank = Math.floor(payableAfterDiscount * fixedRateWithoutRank / 100);
  const rankMatch = resolveMemberRank(
    {
      customerEmail: order.customer?.email || order.email || null,
      groupTags,
      customerTags
    },
    rankMap
  );
  const manualMemberRank = rankMatch?.rankName || null;
  const manualMemberRate = rankMatch?.rate ?? null;
  const memberN = nFromMemberRate(manualMemberRate);
  const finalN = Math.max(baselineNWithoutRank, memberN);
  const finalRate = finalN === 40 ? 12 : finalN === 30 ? 8 : finalN === 25 ? 7 : finalN === 20 ? 5 : 0;
  const finalPointAmount = Math.floor(payableAfterDiscount * finalRate / 100);
  const finalNBlockedReason = manualMemberRate == null ? "member_rank_not_available_in_store_data" : null;

  return {
    orderId: order.id,
    orderNumber: order.orderNumber,
    orderedAt: orderedAt ? orderedAt.toISOString() : null,
    customerId: order.customerId,
    customerEmail: order.customer?.email || order.email || null,
    customerTags,
    groupTags,
    hasMembershipTag: customerTags.includes("FWJカード会員"),
    loyaltyTier: loyalty?.tier_name ?? loyalty?.tier ?? null,
    loyaltyPercentage: loyalty?.percentage ?? null,
    loyaltyBalance: loyalty?.balance ?? null,
    entryCount,
    nCount,
    nEarlyAll,
    nEarlyAny,
    listPriceTotal,
    discountAmount,
    payableAfterDiscount,
    eventNames: [...new Set(rewardItems.map((item) => item.eventName).filter(Boolean))],
    eventDates: [...new Set(eventDates.map((date) => date.toISOString().slice(0, 10)))],
    rewardItems,
    manualMemberRank,
    manualMemberRate,
    memberN,
    finalN,
    finalRate,
    finalPointAmount,
    finalNBlockedReason,
    baselineNWithoutRank,
    fixedRateWithoutRank,
    provisionalPointsWithoutRank
  };
}

function buildCsvRows(candidates) {
  return candidates.map((candidate) => ({
    order_number: candidate.orderNumber,
    ordered_at: candidate.orderedAt,
    customer_email: candidate.customerEmail,
    customer_tags: candidate.customerTags.join("|"),
    group_tags: candidate.groupTags.join("|"),
    has_membership_tag: candidate.hasMembershipTag,
    loyalty_tier: candidate.loyaltyTier,
    loyalty_percentage: candidate.loyaltyPercentage,
    entry_count: candidate.entryCount,
    n_count: candidate.nCount,
    n_early_all: candidate.nEarlyAll,
    n_early_any: candidate.nEarlyAny,
    baseline_n_without_rank: candidate.baselineNWithoutRank,
    manual_member_rank: candidate.manualMemberRank || "",
    manual_member_rate: candidate.manualMemberRate ?? "",
    final_n: candidate.finalN ?? "",
    final_rate: candidate.finalRate ?? "",
    list_price_total: candidate.listPriceTotal,
    discount_amount: candidate.discountAmount,
    payable_after_discount: candidate.payableAfterDiscount,
    fixed_rate_without_rank: candidate.fixedRateWithoutRank,
    provisional_points_without_rank: candidate.provisionalPointsWithoutRank,
    final_point_amount: candidate.finalPointAmount ?? "",
    blocked_reason: candidate.finalNBlockedReason || "",
    event_names: candidate.eventNames.join("|"),
    event_dates: candidate.eventDates.join("|")
  }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const start = asDate(options.start);
  const end = asDate(options.end);

  if (!start || !end) {
    throw new Error("Invalid --start or --end value.");
  }

  const rankMap = loadRankMap(options.rankMap);

  const orders = await prisma.shopifyOrder.findMany({
    where: {
      orderedAt: {
        gte: start,
        lt: end
      }
    },
    orderBy: {
      orderedAt: "desc"
    },
    include: {
      customer: true,
      items: {
        include: {
          product: {
            include: {
              classification: true
            }
          }
        }
      }
    }
  });

  const candidates = orders.map((order) => buildOrderCandidate(order, rankMap)).filter(Boolean);
  const groupedByCustomer = new Map();

  for (const candidate of candidates) {
    const key = candidate.customerEmail || candidate.customerId || candidate.orderId;
    const current = groupedByCustomer.get(key) || {
      customerEmail: candidate.customerEmail,
      customerId: candidate.customerId,
      customerTags: candidate.customerTags,
      groupTags: candidate.groupTags,
      orderCount: 0,
      listPriceTotal: 0,
      discountAmount: 0,
      payableAfterDiscount: 0,
      provisionalPointsWithoutRank: 0,
      finalPointAmount: 0,
      unresolvedOrders: 0,
      orders: []
    };

    current.orderCount += 1;
    current.listPriceTotal += candidate.listPriceTotal;
    current.discountAmount += candidate.discountAmount;
    current.payableAfterDiscount += candidate.payableAfterDiscount;
    current.provisionalPointsWithoutRank += candidate.provisionalPointsWithoutRank;
    current.finalPointAmount += candidate.finalPointAmount || 0;
    current.unresolvedOrders += candidate.finalNBlockedReason ? 1 : 0;
    current.orders.push(candidate.orderNumber);
    groupedByCustomer.set(key, current);
  }

  const summaryByCustomer = [...groupedByCustomer.values()].sort(
    (left, right) => right.provisionalPointsWithoutRank - left.provisionalPointsWithoutRank
  );

  const report = {
    generatedAt: new Date().toISOString(),
    period: {
      start: start.toISOString(),
      end: end.toISOString()
    },
    assumptions: {
      rewardItemFilter: "product tags include 還元対象 + no-easy-points and item is contest entry",
      earlyRule: "orderedAt <= eventDate minus 1 month for all reward items in the order",
      memberRankAvailability: fs.existsSync(options.rankMap)
        ? `resolved from ${options.rankMap} when group tag or email matched`
        : "not derivable from current store data unless rank map file is provided",
      provisionalPointsMeaning: "points calculated from count/early only, excluding member-rank uplift"
    },
    totals: {
      candidateOrders: candidates.length,
      candidateCustomers: summaryByCustomer.length,
      provisionalPointsWithoutRank: summaryByCustomer.reduce(
        (sum, row) => sum + row.provisionalPointsWithoutRank,
        0
      ),
      finalPointsResolved: summaryByCustomer.reduce((sum, row) => sum + row.finalPointAmount, 0),
      unresolvedOrders: candidates.filter((candidate) => candidate.finalNBlockedReason).length
    },
    candidates,
    summaryByCustomer
  };

  fs.mkdirSync(path.dirname(options.jsonOutput), { recursive: true });
  fs.writeFileSync(options.jsonOutput, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  fs.writeFileSync(options.csvOutput, toCsv(buildCsvRows(candidates)), "utf8");

  console.log(`Monthly points JSON saved to ${options.jsonOutput}`);
  console.log(`Monthly points CSV saved to ${options.csvOutput}`);
  console.log(
    JSON.stringify(
      {
        totals: report.totals,
        topCustomers: summaryByCustomer.slice(0, 5).map((row) => ({
          customerEmail: row.customerEmail,
          orderCount: row.orderCount,
          payableAfterDiscount: row.payableAfterDiscount,
          provisionalPointsWithoutRank: row.provisionalPointsWithoutRank,
          finalPointAmount: row.finalPointAmount,
          unresolvedOrders: row.unresolvedOrders,
          orders: row.orders
        }))
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error.stack || error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
