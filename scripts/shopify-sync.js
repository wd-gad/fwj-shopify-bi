const { Prisma } = require("@prisma/client");
const { prisma } = require("../src/lib/prisma.js");
const { fetchCustomers, fetchOrders, fetchProducts } = require("../src/lib/shopify-admin.js");
const { classifyShopifyProduct } = require("../src/lib/shopify-product-classification.js");

function parseArgs(argv) {
  const options = {
    target: "all",
    updatedAfter: null
  };

  for (const arg of argv) {
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg.startsWith("--target=")) {
      options.target = arg.slice("--target=".length);
      continue;
    }

    if (arg.startsWith("--updated-after=")) {
      options.updatedAfter = arg.slice("--updated-after=".length);
      continue;
    }
  }

  return options;
}

function printHelp() {
  console.log("Usage: npm run shopify:sync -- [--target=all|customers|products|orders] [--updated-after=ISO8601]");
  console.log("Example: npm run shopify:sync -- --target=orders --updated-after=2026-01-01T00:00:00Z");
}

function decimalOrNull(value) {
  if (value == null || value === "") {
    return null;
  }
  return new Prisma.Decimal(value);
}

function safeDate(value) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function joinTags(tags) {
  if (Array.isArray(tags)) {
    return tags.join(",");
  }
  return tags || null;
}

async function upsertCustomer(customer) {
  await prisma.shopifyCustomer.upsert({
    where: { id: customer.id },
    create: {
      id: customer.id,
      email: customer.email ?? null,
      firstName: customer.firstName ?? null,
      lastName: customer.lastName ?? null,
      phone: customer.phone ?? null,
      tags: joinTags(customer.tags),
      state: customer.state ?? null,
      defaultAddressJson: customer.defaultAddress ?? Prisma.JsonNull,
      rawJson: customer,
      createdAt: safeDate(customer.createdAt),
      updatedAt: safeDate(customer.updatedAt),
      syncedAt: new Date()
    },
    update: {
      email: customer.email ?? null,
      firstName: customer.firstName ?? null,
      lastName: customer.lastName ?? null,
      phone: customer.phone ?? null,
      tags: joinTags(customer.tags),
      state: customer.state ?? null,
      defaultAddressJson: customer.defaultAddress ?? Prisma.JsonNull,
      rawJson: customer,
      createdAt: safeDate(customer.createdAt),
      updatedAt: safeDate(customer.updatedAt),
      syncedAt: new Date()
    }
  });
}

async function upsertProduct(product, contestSchedules = []) {
  await prisma.shopifyProduct.upsert({
    where: { id: product.id },
    create: {
      id: product.id,
      title: product.title,
      handle: product.handle ?? null,
      productType: product.productType ?? null,
      tags: joinTags(product.tags),
      status: product.status ?? null,
      rawJson: product,
      updatedAt: safeDate(product.updatedAt),
      syncedAt: new Date()
    },
    update: {
      title: product.title,
      handle: product.handle ?? null,
      productType: product.productType ?? null,
      tags: joinTags(product.tags),
      status: product.status ?? null,
      rawJson: product,
      updatedAt: safeDate(product.updatedAt),
      syncedAt: new Date()
    }
  });

  const classification = classifyShopifyProduct({
    title: product.title,
    tags: joinTags(product.tags)
  }, {
    contestSchedules
  });

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
}

function mapOrderItem(item, orderId) {
  return {
    id: item.id,
    orderId,
    productId: item.variant?.product?.id ?? null,
    variantId: item.variant?.id ?? null,
    sku: item.sku ?? null,
    title: item.title,
    variantTitle: item.variantTitle ?? item.variant?.title ?? null,
    quantity: item.quantity ?? 1,
    price: decimalOrNull(item.originalUnitPriceSet?.shopMoney?.amount),
    vendor: item.vendor ?? null,
    productType: item.variant?.product?.productType ?? null,
    rawJson: item
  };
}

async function upsertOrder(order) {
  const items = (order.lineItems?.edges ?? []).map((edge) => mapOrderItem(edge.node, order.id));

  await prisma.$transaction(async (tx) => {
    await tx.shopifyOrder.upsert({
      where: { id: order.id },
      create: {
        id: order.id,
        customerId: order.customer?.id ?? null,
        orderNumber: order.name ?? null,
        email: order.email ?? null,
        financialStatus: order.displayFinancialStatus ?? null,
        fulfillmentStatus: order.displayFulfillmentStatus ?? null,
        currency: order.currencyCode ?? null,
        subtotalPrice: decimalOrNull(order.currentSubtotalPriceSet?.shopMoney?.amount),
        totalPrice: decimalOrNull(order.currentTotalPriceSet?.shopMoney?.amount),
        orderedAt: safeDate(order.processedAt ?? order.createdAt),
        rawJson: order,
        syncedAt: new Date()
      },
      update: {
        customerId: order.customer?.id ?? null,
        orderNumber: order.name ?? null,
        email: order.email ?? null,
        financialStatus: order.displayFinancialStatus ?? null,
        fulfillmentStatus: order.displayFulfillmentStatus ?? null,
        currency: order.currencyCode ?? null,
        subtotalPrice: decimalOrNull(order.currentSubtotalPriceSet?.shopMoney?.amount),
        totalPrice: decimalOrNull(order.currentTotalPriceSet?.shopMoney?.amount),
        orderedAt: safeDate(order.processedAt ?? order.createdAt),
        rawJson: order,
        syncedAt: new Date()
      }
    });

    await tx.shopifyOrderItem.deleteMany({
      where: { orderId: order.id }
    });

    if (items.length > 0) {
      await tx.shopifyOrderItem.createMany({
        data: items
      });
    }
  });
}

async function runTarget(target, updatedAfter) {
  if (target === "customers") {
    const customers = await fetchCustomers({ updatedAfter });
    for (const customer of customers) {
      await upsertCustomer(customer);
    }
    return { target, count: customers.length };
  }

  if (target === "products") {
    const contestSchedules = await prisma.contestSchedule.findMany();
    const products = await fetchProducts({ updatedAfter });
    for (const product of products) {
      await upsertProduct(product, contestSchedules);
    }
    return { target, count: products.length };
  }

  if (target === "orders") {
    const orders = await fetchOrders({ updatedAfter });
    for (const order of orders) {
      await upsertOrder(order);
    }
    return { target, count: orders.length };
  }

  if (target === "all") {
    const results = [];
    results.push(await runTarget("customers", updatedAfter));
    results.push(await runTarget("products", updatedAfter));
    results.push(await runTarget("orders", updatedAfter));
    return { target, count: results.reduce((sum, entry) => sum + entry.count, 0), children: results };
  }

  throw new Error(`Unsupported target: ${target}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  const syncRun = await prisma.syncRun.create({
    data: {
      target: options.target,
      status: "running"
    }
  });

  try {
    const result = await runTarget(options.target, options.updatedAfter);
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "succeeded",
        finishedAt: new Date(),
        recordsFetched: result.count
      }
    });

    console.log("Shopify sync completed.");
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    await prisma.syncRun.update({
      where: { id: syncRun.id },
      data: {
        status: "failed",
        finishedAt: new Date(),
        errorMessage: error instanceof Error ? error.message : String(error)
      }
    });
    throw error;
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
