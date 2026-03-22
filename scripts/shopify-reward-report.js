const fs = require("fs");
const path = require("path");
const { prisma } = require("../src/lib/prisma.js");

function parseArgs(argv) {
  const options = {
    start: "2026-03-01T00:00:00Z",
    end: null,
    output: path.resolve(process.cwd(), "docs/shopify-reward-report.json")
  };

  for (const arg of argv) {
    if (arg.startsWith("--start=")) {
      options.start = arg.slice("--start=".length);
    } else if (arg.startsWith("--end=")) {
      options.end = arg.slice("--end=".length);
    } else if (arg.startsWith("--output=")) {
      options.output = path.resolve(process.cwd(), arg.slice("--output=".length));
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
  const loyaltyEntry = metafields.find((edge) => {
    const node = edge?.node;
    return node?.namespace === "loyalty" && node?.key === "easy_points_attributes";
  });

  if (!loyaltyEntry?.node?.value) {
    return null;
  }

  try {
    return JSON.parse(loyaltyEntry.node.value);
  } catch {
    return null;
  }
}

function unwrapEdges(connection) {
  return connection?.edges?.map((edge) => edge.node) ?? [];
}

function countBy(items, selector) {
  const counts = new Map();
  for (const item of items) {
    const key = selector(item);
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || String(a[0]).localeCompare(String(b[0]), "ja"))
    .map(([key, count]) => ({ key, count }));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const start = asDate(options.start);
  const end = options.end ? asDate(options.end) : null;

  if (!start) {
    throw new Error(`Invalid --start value: ${options.start}`);
  }

  if (options.end && !end) {
    throw new Error(`Invalid --end value: ${options.end}`);
  }

  const orders = await prisma.shopifyOrder.findMany({
    where: {
      orderedAt: {
        gte: start,
        ...(end ? { lt: end } : {})
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

  const orderRows = orders.map((order) => {
    const rawOrder = order.rawJson || {};
    const discountCodes = rawOrder.discountCodes || [];
    const discountApplications = unwrapEdges(rawOrder.discountApplications).map((entry) => ({
      allocationMethod: entry.allocationMethod || null,
      targetSelection: entry.targetSelection || null,
      targetType: entry.targetType || null,
      code: entry.code || null,
      title: entry.title || null,
      description: entry.description || null,
      applicable: null
    }));
    const discountAmount = getMoney(rawOrder.currentTotalDiscountsSet?.shopMoney?.amount);
    const subtotalAmount = getMoney(order.subtotalPrice);
    const totalAmount = getMoney(order.totalPrice);
    const loyalty = parseLoyaltyAttributes(order.customer?.rawJson);
    const customerTags = normalizeTags(order.customer?.tags);

    const items = order.items.map((item) => {
      const productTags = normalizeTags(item.product?.tags);
      return {
        orderItemId: item.id,
        title: item.title,
        variantTitle: item.variantTitle,
        quantity: item.quantity,
        price: getMoney(item.price),
        productId: item.productId,
        productTitle: item.product?.title || null,
        productTags,
        classification: item.product?.classification?.classification || null,
        eventName: item.product?.classification?.eventName || null,
        eventDate: item.product?.classification?.eventDate || null,
        isContestEntryByTag: productTags.includes("コンテストエントリー"),
        isRewardTargetByTag: productTags.includes("還元対象"),
        isNoEasyDiscount: productTags.includes("no-easy-discount"),
        isNoEasyPoints: productTags.includes("no-easy-points"),
        customAttributes: item.rawJson?.customAttributes || []
      };
    });

    return {
      orderId: order.id,
      orderNumber: order.orderNumber,
      orderedAt: order.orderedAt,
      customerId: order.customerId,
      customerEmail: order.customer?.email || order.email || null,
      customerTags,
      loyaltyBalance: loyalty?.balance ?? null,
      loyaltyTier: loyalty?.tier_name ?? loyalty?.tier ?? null,
      loyaltyPercentage: loyalty?.percentage ?? null,
      subtotalAmount,
      totalAmount,
      discountAmount,
      hasDiscount: discountAmount > 0,
      discountCodes,
      discountApplications,
      items
    };
  });

  const contestOrders = orderRows.filter((order) =>
    order.items.some((item) => item.isContestEntryByTag || item.classification === "event_entry")
  );

  const rewardTargetOrders = contestOrders.filter((order) =>
    order.items.some((item) => item.isRewardTargetByTag)
  );

  const noEasyPointsOrders = contestOrders.filter((order) =>
    order.items.some((item) => item.isNoEasyPoints)
  );

  const discountedContestOrders = contestOrders.filter((order) => order.hasDiscount);
  const undiscountedRewardTargetOrders = rewardTargetOrders.filter((order) => !order.hasDiscount);

  const report = {
    generatedAt: new Date().toISOString(),
    period: {
      start: start.toISOString(),
      end: end ? end.toISOString() : null
    },
    totals: {
      allOrders: orderRows.length,
      contestOrders: contestOrders.length,
      rewardTargetOrders: rewardTargetOrders.length,
      noEasyPointsOrders: noEasyPointsOrders.length,
      discountedContestOrders: discountedContestOrders.length,
      undiscountedRewardTargetOrders: undiscountedRewardTargetOrders.length
    },
    topDiscountCodes: countBy(
      orderRows.flatMap((order) => order.discountCodes.map((code) => ({ code }))),
      (entry) => entry.code
    ),
    topContestTags: countBy(
      contestOrders.flatMap((order) =>
        order.items.flatMap((item) => item.productTags.map((tag) => ({ tag })))
      ),
      (entry) => entry.tag
    ).slice(0, 30),
    loyaltyPercentages: countBy(
      contestOrders
        .filter((order) => order.loyaltyPercentage != null)
        .map((order) => ({ value: order.loyaltyPercentage })),
      (entry) => entry.value
    ),
    sampleDiscountedContestOrders: discountedContestOrders.slice(0, 20),
    sampleUndiscountedRewardTargetOrders: undiscountedRewardTargetOrders.slice(0, 20),
    sampleNoEasyPointsOrders: noEasyPointsOrders.slice(0, 20)
  };

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${JSON.stringify(report, null, 2)}\n`, "utf8");

  console.log(`Reward report saved to ${options.output}`);
  console.log(
    JSON.stringify(
      {
        totals: report.totals,
        topDiscountCodes: report.topDiscountCodes.slice(0, 10),
        loyaltyPercentages: report.loyaltyPercentages.slice(0, 10),
        sampleDiscountedContestOrders: report.sampleDiscountedContestOrders.slice(0, 5).map((order) => ({
          orderNumber: order.orderNumber,
          customerEmail: order.customerEmail,
          discountAmount: order.discountAmount,
          discountCodes: order.discountCodes,
          discountApplications: order.discountApplications,
          loyaltyPercentage: order.loyaltyPercentage,
          items: order.items.map((item) => ({
            title: item.title,
            tags: item.productTags
          }))
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
