const fs = require("fs");
const path = require("path");
const { executeAdminQuery, fetchShopInfo } = require("../src/lib/shopify-admin.js");

function parseArgs(argv) {
  const options = {
    limit: 10,
    output: path.resolve(process.cwd(), "docs/shopify-store-audit.json")
  };

  for (const arg of argv) {
    if (arg.startsWith("--limit=")) {
      options.limit = Math.max(1, Number.parseInt(arg.slice("--limit=".length), 10) || 10);
    } else if (arg.startsWith("--output=")) {
      options.output = path.resolve(process.cwd(), arg.slice("--output=".length));
    }
  }

  return options;
}

function unwrapConnection(connection) {
  return connection?.edges?.map((edge) => edge.node) ?? [];
}

function safeJson(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function summarizeTagFrequency(items = []) {
  const counts = new Map();

  for (const item of items) {
    for (const tag of item.tags || []) {
      counts.set(tag, (counts.get(tag) || 0) + 1);
    }
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "ja"))
    .slice(0, 30)
    .map(([tag, count]) => ({ tag, count }));
}

async function fetchProducts(limit) {
  const query = `#graphql
    query AuditProducts($limit: Int!) {
      products(first: $limit, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            title
            handle
            productType
            status
            tags
            updatedAt
            metafields(first: 6) {
              edges {
                node {
                  namespace
                  key
                  type
                  value
                }
              }
            }
            variants(first: 5) {
              edges {
                node {
                  id
                  title
                  sku
                  metafields(first: 4) {
                    edges {
                      node {
                        namespace
                        key
                        type
                        value
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await executeAdminQuery(query, { limit });
  return unwrapConnection(data.products).map((product) => ({
    ...product,
    metafields: unwrapConnection(product.metafields),
    variants: unwrapConnection(product.variants).map((variant) => ({
      ...variant,
      metafields: unwrapConnection(variant.metafields)
    }))
  }));
}

async function fetchCustomers(limit) {
  const query = `#graphql
    query AuditCustomers($limit: Int!) {
      customers(first: $limit, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            email
            firstName
            lastName
            state
            tags
            updatedAt
            metafields(first: 6) {
              edges {
                node {
                  namespace
                  key
                  type
                  value
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await executeAdminQuery(query, { limit });
  return unwrapConnection(data.customers).map((customer) => ({
    ...customer,
    metafields: unwrapConnection(customer.metafields)
  }));
}

async function fetchOrders(limit) {
  const query = `#graphql
    query AuditOrders($limit: Int!) {
      orders(first: $limit, sortKey: UPDATED_AT, reverse: true) {
        edges {
          node {
            id
            name
            createdAt
            updatedAt
            processedAt
            cancelledAt
            cancelReason
            displayFinancialStatus
            displayFulfillmentStatus
            currencyCode
            discountCodes
            currentSubtotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            currentTotalDiscountsSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            currentTotalPriceSet {
              shopMoney {
                amount
                currencyCode
              }
            }
            customer {
              id
              email
              displayName
            }
            lineItems(first: 10) {
              edges {
                node {
                  id
                  title
                  quantity
                  sku
                  customAttributes {
                    key
                    value
                  }
                  originalUnitPriceSet {
                    shopMoney {
                      amount
                      currencyCode
                    }
                  }
                  variant {
                    id
                    title
                    product {
                      id
                      title
                      tags
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  `;

  const data = await executeAdminQuery(query, { limit });
  return unwrapConnection(data.orders).map((order) => ({
    ...order,
    lineItems: unwrapConnection(order.lineItems)
  }));
}

async function fetchAuditData(limit) {
  const products = await fetchProducts(limit);
  const customers = await fetchCustomers(limit);
  const orders = await fetchOrders(limit);
  return { products, customers, orders };
}

function buildSummary(shop, auditData) {
  const { products, customers, orders } = auditData;

  return {
    generatedAt: new Date().toISOString(),
    shop: {
      id: shop?.id ?? null,
      name: shop?.name ?? null,
      myshopifyDomain: shop?.myshopifyDomain ?? null,
      plan: shop?.plan?.displayName ?? null
    },
    counts: {
      sampledProducts: products.length,
      sampledCustomers: customers.length,
      sampledOrders: orders.length
    },
    topProductTags: summarizeTagFrequency(products),
    topCustomerTags: summarizeTagFrequency(customers),
    rewardSignals: {
      productMetafields: products
        .flatMap((product) =>
          product.metafields.map((metafield) => ({
            owner: product.title,
            namespace: metafield.namespace,
            key: metafield.key,
            type: metafield.type,
            value: metafield.value
          }))
        )
        .slice(0, 100),
      customerMetafields: customers
        .flatMap((customer) =>
          customer.metafields.map((metafield) => ({
            owner: customer.email || customer.id,
            namespace: metafield.namespace,
            key: metafield.key,
            type: metafield.type,
            value: metafield.value
          }))
        )
        .slice(0, 100),
      discountedOrders: orders
        .filter((order) => Number(order.currentTotalDiscountsSet?.shopMoney?.amount || 0) > 0)
        .map((order) => ({
          name: order.name,
          createdAt: order.createdAt,
          customer: order.customer?.email ?? null,
          subtotal: order.currentSubtotalPriceSet?.shopMoney?.amount ?? null,
          discounts: order.currentTotalDiscountsSet?.shopMoney?.amount ?? null,
          total: order.currentTotalPriceSet?.shopMoney?.amount ?? null,
          discountCodes: order.discountCodes ?? [],
          lineItems: order.lineItems.map((line) => ({
            title: line.title,
            quantity: line.quantity,
            unitPrice: line.originalUnitPriceSet?.shopMoney?.amount ?? null,
            productTitle: line.variant?.product?.title ?? null,
            productTags: line.variant?.product?.tags ?? []
          }))
        }))
    },
    samples: {
      products,
      customers,
      orders
    }
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const shop = await fetchShopInfo();
  const auditData = await fetchAuditData(options.limit);
  const report = buildSummary(shop, auditData);

  fs.mkdirSync(path.dirname(options.output), { recursive: true });
  fs.writeFileSync(options.output, `${safeJson(report)}\n`, "utf8");

  console.log(`Shop audit saved to ${options.output}`);
  console.log(
    safeJson({
      shop: report.shop,
      counts: report.counts,
      topProductTags: report.topProductTags.slice(0, 10),
      topCustomerTags: report.topCustomerTags.slice(0, 10),
      discountedOrders: report.rewardSignals.discountedOrders.slice(0, 5).map((order) => ({
        name: order.name,
        discounts: order.discounts,
        discountCodes: order.discountCodes,
        customer: order.customer
      }))
    })
  );
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  if (error.cause) {
    console.error("Cause:", error.cause);
  }
  process.exitCode = 1;
});
