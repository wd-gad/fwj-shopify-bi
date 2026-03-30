/**
 * prisma/seed.js — Development seed (development environment only)
 *
 * Purpose: Populate the development DB with minimal dummy data for BI dashboard testing.
 * Run via: npm run db:seed:dev
 *
 * What this seeds:
 *   - ShopifyProduct (1 membership, 2 event entries)
 *   - ShopifyCustomer (3 dummy members)
 *   - ShopifyOrder + ShopifyOrderItem
 *   (ContestSchedule and ProductClassificationRule are handled by server.js startup)
 *   (MemberProfile/EventEntry/MembershipPurchase are derived by rebuild-analytics.js)
 *
 * Safety: Aborts if DATABASE_URL points to production host.
 */

const { prisma } = require("../src/lib/prisma.js");

// ── Safety guard ──────────────────────────────────────────────────────────────

const dbUrl = process.env.DATABASE_URL || "";
const PRODUCTION_HOSTS = ["gondola.proxy.rlwy.net"];

for (const host of PRODUCTION_HOSTS) {
  if (dbUrl.includes(host)) {
    console.error("[seed] ERROR: DATABASE_URL points to production DB. Aborting.");
    console.error("[seed] This script must only run against the development database.");
    process.exit(1);
  }
}

if (!dbUrl) {
  console.error("[seed] ERROR: DATABASE_URL is not set.");
  process.exit(1);
}

console.log("[seed] target db host:", new URL(dbUrl).hostname);

// ── Seed data ─────────────────────────────────────────────────────────────────

const PRODUCTS = [
  // Membership product
  {
    id: "seed-product-membership-001",
    title: "FWJ Annual Membership 2026",
    handle: "fwj-annual-membership-2026",
    productType: "membership",
    tags: "membership,member",
    status: "active",
  },
  // Event entry products (title format: MMDD EventName — matched by classifyShopifyProduct)
  {
    id: "seed-product-event-001",
    title: "0313 Discovery Championships",
    handle: "0313-discovery-championships",
    productType: "event",
    tags: "event,entry,competition",
    status: "active",
  },
  {
    id: "seed-product-event-002",
    title: "0404 West Tokyo Championships",
    handle: "0404-west-tokyo-championships",
    productType: "event",
    tags: "event,entry,competition",
    status: "active",
  },
];

const CUSTOMERS = [
  {
    id: "seed-customer-001",
    email: "seed-alice@example.com",
    firstName: "Alice",
    lastName: "Tanaka",
    tags: "member",
    state: "enabled",
    defaultAddressJson: { province: "Tokyo" },
  },
  {
    id: "seed-customer-002",
    email: "seed-bob@example.com",
    firstName: "Bob",
    lastName: "Suzuki",
    tags: "member",
    state: "enabled",
    defaultAddressJson: { province: "Osaka" },
  },
  {
    id: "seed-customer-003",
    email: "seed-carol@example.com",
    firstName: "Carol",
    lastName: "Yamamoto",
    tags: "",
    state: "enabled",
    defaultAddressJson: { province: "Kanagawa" },
  },
];

// Orders: Alice → membership + event001, Bob → event001 + event002, Carol → event002
const ORDERS = [
  {
    id: "seed-order-001",
    customerId: "seed-customer-001",
    orderNumber: "S0001",
    email: "seed-alice@example.com",
    financialStatus: "paid",
    fulfillmentStatus: null,
    currency: "JPY",
    subtotalPrice: 8800,
    totalPrice: 8800,
    orderedAt: new Date("2026-01-15T10:00:00Z"),
    items: [
      {
        id: "seed-item-001-1",
        productId: "seed-product-membership-001",
        sku: "MEMBER-2026",
        title: "FWJ Annual Membership 2026",
        quantity: 1,
        price: 5500,
      },
      {
        id: "seed-item-001-2",
        productId: "seed-product-event-001",
        sku: "EVT-0313",
        title: "0313 Discovery Championships",
        quantity: 1,
        price: 3300,
      },
    ],
  },
  {
    id: "seed-order-002",
    customerId: "seed-customer-002",
    orderNumber: "S0002",
    email: "seed-bob@example.com",
    financialStatus: "paid",
    fulfillmentStatus: null,
    currency: "JPY",
    subtotalPrice: 6600,
    totalPrice: 6600,
    orderedAt: new Date("2026-02-01T10:00:00Z"),
    items: [
      {
        id: "seed-item-002-1",
        productId: "seed-product-event-001",
        sku: "EVT-0313",
        title: "0313 Discovery Championships",
        quantity: 1,
        price: 3300,
      },
      {
        id: "seed-item-002-2",
        productId: "seed-product-event-002",
        sku: "EVT-0404",
        title: "0404 West Tokyo Championships",
        quantity: 1,
        price: 3300,
      },
    ],
  },
  {
    id: "seed-order-003",
    customerId: "seed-customer-003",
    orderNumber: "S0003",
    email: "seed-carol@example.com",
    financialStatus: "paid",
    fulfillmentStatus: null,
    currency: "JPY",
    subtotalPrice: 3300,
    totalPrice: 3300,
    orderedAt: new Date("2026-02-10T10:00:00Z"),
    items: [
      {
        id: "seed-item-003-1",
        productId: "seed-product-event-002",
        sku: "EVT-0404",
        title: "0404 West Tokyo Championships",
        quantity: 1,
        price: 3300,
      },
    ],
  },
];

// ── Seed functions ─────────────────────────────────────────────────────────────

async function seedProducts() {
  let count = 0;
  for (const p of PRODUCTS) {
    await prisma.shopifyProduct.upsert({
      where: { id: p.id },
      update: { title: p.title, tags: p.tags, status: p.status },
      create: {
        id: p.id,
        title: p.title,
        handle: p.handle,
        productType: p.productType,
        tags: p.tags,
        status: p.status,
        rawJson: { seed: true },
        updatedAt: new Date(),
      },
    });
    count++;
  }
  console.log(`[seed] products: ${count} upserted`);
}

async function seedCustomers() {
  let count = 0;
  for (const c of CUSTOMERS) {
    await prisma.shopifyCustomer.upsert({
      where: { id: c.id },
      update: { email: c.email, firstName: c.firstName, lastName: c.lastName },
      create: {
        id: c.id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        tags: c.tags,
        state: c.state,
        defaultAddressJson: c.defaultAddressJson,
        rawJson: { seed: true },
        createdAt: new Date("2026-01-01T00:00:00Z"),
        updatedAt: new Date(),
      },
    });
    count++;
  }
  console.log(`[seed] customers: ${count} upserted`);
}

async function seedOrders() {
  let orderCount = 0;
  let itemCount = 0;
  for (const o of ORDERS) {
    await prisma.shopifyOrder.upsert({
      where: { id: o.id },
      update: { financialStatus: o.financialStatus, totalPrice: o.totalPrice },
      create: {
        id: o.id,
        customerId: o.customerId,
        orderNumber: o.orderNumber,
        email: o.email,
        financialStatus: o.financialStatus,
        fulfillmentStatus: o.fulfillmentStatus,
        currency: o.currency,
        subtotalPrice: o.subtotalPrice,
        totalPrice: o.totalPrice,
        orderedAt: o.orderedAt,
        rawJson: { seed: true },
      },
    });
    orderCount++;

    for (const item of o.items) {
      await prisma.shopifyOrderItem.upsert({
        where: { id: item.id },
        update: { price: item.price },
        create: {
          id: item.id,
          orderId: o.id,
          productId: item.productId,
          sku: item.sku,
          title: item.title,
          quantity: item.quantity,
          price: item.price,
          rawJson: { seed: true },
        },
      });
      itemCount++;
    }
  }
  console.log(`[seed] orders: ${orderCount} upserted, items: ${itemCount} upserted`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log("[seed] starting development seed...");

  await seedProducts();
  await seedCustomers();
  await seedOrders();

  console.log("[seed] done.");
  console.log("[seed] next: run 'npm run shopify:rebuild' to build MemberProfile/EventEntry from this data.");
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
