/**
 * reclassify-products.js
 *
 * Re-classifies all ShopifyProduct records using the current ContestSchedule data in the DB.
 * Does NOT call the Shopify API — only reads/writes to the local DB.
 *
 * Run this after seeding ContestSchedule to backfill eventName on ProductClassificationRule,
 * then run rebuild-analytics.js to propagate updated eventNames into EventEntry.
 */

const { prisma } = require("../src/lib/prisma.js");
const { classifyShopifyProduct } = require("../src/lib/shopify-product-classification.js");

async function main() {
  const contestSchedules = await prisma.contestSchedule.findMany({
    orderBy: { eventDate: "asc" }
  });

  console.log(`[reclassify] loaded ${contestSchedules.length} contest schedules`);

  const products = await prisma.shopifyProduct.findMany({
    select: { id: true, title: true, tags: true }
  });

  console.log(`[reclassify] reclassifying ${products.length} products...`);

  let updated = 0;
  for (const product of products) {
    const classification = classifyShopifyProduct(
      { title: product.title, tags: product.tags },
      { contestSchedules }
    );

    await prisma.productClassificationRule.upsert({
      where: { productId: product.id },
      create: {
        productId: product.id,
        classification: classification.classification,
        eventName: classification.eventName,
        eventDate: classification.eventDate,
        eventCategory: classification.eventCategory,
        eventVenueName: classification.eventVenueName,
        eventAddress: classification.eventAddress,
        membershipPlanName: classification.membershipPlanName
      },
      update: {
        classification: classification.classification,
        eventName: classification.eventName,
        eventDate: classification.eventDate,
        eventCategory: classification.eventCategory,
        eventVenueName: classification.eventVenueName,
        eventAddress: classification.eventAddress,
        membershipPlanName: classification.membershipPlanName
      }
    });
    updated++;
  }

  console.log(`[reclassify] updated ${updated} product classification rules`);
}

main()
  .catch((err) => {
    console.error("[reclassify] failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
