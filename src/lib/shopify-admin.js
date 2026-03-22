const DEFAULT_API_VERSION = process.env.SHOPIFY_API_VERSION || "2025-10";
const MAX_RETRY_ATTEMPTS = 4;
let cachedAdminAccessToken = null;

function getRequiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function buildEndpoint() {
  const storeDomain = getRequiredEnv("SHOPIFY_STORE_DOMAIN");
  return `https://${storeDomain}/admin/api/${DEFAULT_API_VERSION}/graphql.json`;
}

function buildTokenEndpoint() {
  const storeDomain = getRequiredEnv("SHOPIFY_STORE_DOMAIN");
  return `https://${storeDomain}/admin/oauth/access_token`;
}

async function getAdminAccessToken() {
  if (cachedAdminAccessToken) {
    return cachedAdminAccessToken;
  }

  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN) {
    cachedAdminAccessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN;
    return cachedAdminAccessToken;
  }

  const clientId = process.env.SHOPIFY_API_CLIENT_ID;
  const clientSecret = process.env.SHOPIFY_API_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      "SHOPIFY_ADMIN_ACCESS_TOKEN または SHOPIFY_API_CLIENT_ID / SHOPIFY_API_CLIENT_SECRET の設定が必要です。"
    );
  }

  const response = await fetchWithRetry(buildTokenEndpoint(), {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "client_credentials"
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shopify token request failed with ${response.status}: ${body}`);
  }

  const payload = await response.json();
  if (!payload.access_token) {
    throw new Error("Shopify token response に access_token がありません。");
  }

  cachedAdminAccessToken = payload.access_token;
  return cachedAdminAccessToken;
}

async function buildHeaders() {
  return {
    "Content-Type": "application/json",
    "X-Shopify-Access-Token": await getAdminAccessToken()
  };
}

function normalizeSearchQuery(updatedAfter) {
  if (!updatedAfter) {
    return null;
  }
  return `updated_at:>=${new Date(updatedAfter).toISOString()}`;
}

function unwrapConnection(connection) {
  return connection?.edges?.map((edge) => edge.node) ?? [];
}

function assertNoUserErrors(payload) {
  if (payload.errors?.length) {
    throw new Error(`Shopify GraphQL error: ${payload.errors.map((entry) => entry.message).join("; ")}`);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRetryableStatus(status) {
  return [429, 500, 502, 503, 504].includes(status);
}

function isRetryableNetworkError(error) {
  const message = String(error?.message || "").toLowerCase();
  const code = String(error?.cause?.code || error?.code || "");
  return (
    message.includes("terminated") ||
    message.includes("fetch failed") ||
    message.includes("socket") ||
    code === "UND_ERR_SOCKET" ||
    code === "ECONNRESET" ||
    code === "ETIMEDOUT"
  );
}

async function fetchWithRetry(url, options, maxAttempts = MAX_RETRY_ATTEMPTS) {
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const response = await fetch(url, options);
      if (!response.ok && isRetryableStatus(response.status) && attempt < maxAttempts) {
        await sleep(500 * attempt);
        continue;
      }
      return response;
    } catch (error) {
      lastError = error;
      if (!isRetryableNetworkError(error) || attempt >= maxAttempts) {
        throw error;
      }
      await sleep(500 * attempt);
    }
  }

  throw lastError || new Error("Shopify fetch failed");
}

async function executeAdminQuery(query, variables = {}) {
  const headers = await buildHeaders();
  const response = await fetchWithRetry(buildEndpoint(), {
    method: "POST",
    headers,
    body: JSON.stringify({ query, variables })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Shopify request failed with ${response.status}: ${body}`);
  }

  const payload = await response.json();
  assertNoUserErrors(payload);

  return payload.data;
}

async function paginateConnection({ query, rootField, variables = {}, pageSize = 100 }) {
  let hasNextPage = true;
  let after = null;
  const results = [];

  while (hasNextPage) {
    const data = await executeAdminQuery(query, {
      ...variables,
      first: pageSize,
      after
    });

    const connection = data?.[rootField];
    results.push(...unwrapConnection(connection));
    hasNextPage = Boolean(connection?.pageInfo?.hasNextPage);
    after = connection?.pageInfo?.endCursor ?? null;
  }

  return results;
}

const SHOP_INFO_QUERY = `#graphql
  query ShopInfo {
    shop {
      id
      name
      myshopifyDomain
      plan {
        displayName
      }
    }
  }
`;

const CUSTOMERS_QUERY = `#graphql
  query SyncCustomers($first: Int!, $after: String, $query: String) {
    customers(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          email
          firstName
          lastName
          phone
          state
          tags
          createdAt
          updatedAt
          metafields(first: 10) {
            edges {
              node {
                namespace
                key
                type
                value
              }
            }
          }
          defaultAddress {
            firstName
            lastName
            phone
            address1
            address2
            city
            province
            country
            zip
          }
        }
      }
    }
  }
`;

const PRODUCTS_QUERY = `#graphql
  query SyncProducts($first: Int!, $after: String, $query: String) {
    products(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          title
          handle
          productType
          tags
          status
          updatedAt
        }
      }
    }
  }
`;

const PRODUCT_BY_HANDLE_QUERY = `#graphql
  query ProductByHandle($query: String!) {
    products(first: 1, query: $query) {
      edges {
        node {
          id
          title
          handle
          productType
          status
          tags
          variants(first: 100) {
            edges {
              node {
                id
                sku
                title
                price
                compareAtPrice
              }
            }
          }
          metafields(first: 50) {
            edges {
              node {
                id
                namespace
                key
                type
                value
                compareDigest
              }
            }
          }
        }
      }
    }
  }
`;

const CUSTOMER_BY_EMAIL_QUERY = `#graphql
  query CustomerByEmail($query: String!) {
    customers(first: 1, query: $query) {
      edges {
        node {
          id
          email
          firstName
          lastName
          tags
          metafields(first: 50) {
            edges {
              node {
                id
                namespace
                key
                type
                value
                compareDigest
              }
            }
          }
        }
      }
    }
  }
`;

const PRODUCT_UPDATE_MUTATION = `#graphql
  mutation ProductUpdate($product: ProductUpdateInput!) {
    productUpdate(product: $product) {
      product {
        id
        title
        handle
        productType
        status
        tags
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const PRODUCT_VARIANTS_BULK_UPDATE_MUTATION = `#graphql
  mutation ProductVariantsBulkUpdate($productId: ID!, $variants: [ProductVariantsBulkInput!]!) {
    productVariantsBulkUpdate(productId: $productId, variants: $variants) {
      product {
        id
      }
      productVariants {
        id
        sku
        price
        compareAtPrice
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const METAFIELDS_SET_MUTATION = `#graphql
  mutation MetafieldsSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields {
        id
        ownerType
        namespace
        key
        type
        value
      }
      userErrors {
        field
        message
        code
      }
    }
  }
`;

const TAGS_ADD_MUTATION = `#graphql
  mutation TagsAdd($id: ID!, $tags: [String!]!) {
    tagsAdd(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const TAGS_REMOVE_MUTATION = `#graphql
  mutation TagsRemove($id: ID!, $tags: [String!]!) {
    tagsRemove(id: $id, tags: $tags) {
      node {
        id
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ORDERS_QUERY = `#graphql
  query SyncOrders($first: Int!, $after: String, $query: String) {
    orders(first: $first, after: $after, query: $query, sortKey: UPDATED_AT) {
      pageInfo {
        hasNextPage
        endCursor
      }
      edges {
        node {
          id
          name
          email
          createdAt
          updatedAt
          cancelledAt
          cancelReason
          processedAt
          currencyCode
          discountCodes
          discountApplications(first: 20) {
            edges {
              node {
                allocationMethod
                targetSelection
                targetType
                ... on DiscountCodeApplication {
                  code
                }
                ... on AutomaticDiscountApplication {
                  title
                }
                ... on ManualDiscountApplication {
                  title
                  description
                }
                ... on ScriptDiscountApplication {
                  title
                }
              }
            }
          }
          displayFinancialStatus
          displayFulfillmentStatus
          currentSubtotalPriceSet {
            shopMoney {
              amount
            }
          }
          currentTotalDiscountsSet {
            shopMoney {
              amount
            }
          }
          currentTotalPriceSet {
            shopMoney {
              amount
            }
          }
          customer {
            id
          }
          lineItems(first: 100) {
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
                  variantTitle
                  vendor
                originalUnitPriceSet {
                  shopMoney {
                    amount
                  }
                }
                variant {
                  id
                  title
                  product {
                    id
                    productType
                    title
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

async function fetchCustomers({ updatedAfter } = {}) {
  return paginateConnection({
    query: CUSTOMERS_QUERY,
    rootField: "customers",
    variables: {
      query: normalizeSearchQuery(updatedAfter)
    }
  });
}

async function fetchProducts({ updatedAfter } = {}) {
  return paginateConnection({
    query: PRODUCTS_QUERY,
    rootField: "products",
    variables: {
      query: normalizeSearchQuery(updatedAfter)
    }
  });
}

async function fetchOrders({ updatedAfter } = {}) {
  return paginateConnection({
    query: ORDERS_QUERY,
    rootField: "orders",
    variables: {
      query: normalizeSearchQuery(updatedAfter)
    }
  });
}

async function fetchShopInfo() {
  const data = await executeAdminQuery(SHOP_INFO_QUERY, {});
  return data?.shop ?? null;
}

function unwrapFirstNode(connection) {
  return connection?.edges?.[0]?.node ?? null;
}

function mapMetafields(resource) {
  return unwrapConnection(resource?.metafields).map((metafield) => ({
    id: metafield.id,
    namespace: metafield.namespace,
    key: metafield.key,
    type: metafield.type,
    value: metafield.value,
    compareDigest: metafield.compareDigest ?? null
  }));
}

function mapProduct(product) {
  if (!product) {
    return null;
  }

  return {
    id: product.id,
    title: product.title,
    handle: product.handle,
    productType: product.productType,
    status: product.status,
    tags: product.tags ?? [],
    variants: unwrapConnection(product.variants).map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      title: variant.title,
      price: variant.price,
      compareAtPrice: variant.compareAtPrice
    })),
    metafields: mapMetafields(product)
  };
}

function mapCustomer(customer) {
  if (!customer) {
    return null;
  }

  return {
    id: customer.id,
    email: customer.email,
    firstName: customer.firstName,
    lastName: customer.lastName,
    tags: customer.tags ?? [],
    metafields: mapMetafields(customer)
  };
}

async function fetchProductByHandle(handle) {
  const data = await executeAdminQuery(PRODUCT_BY_HANDLE_QUERY, {
    query: `handle:${handle}`
  });
  return mapProduct(unwrapFirstNode(data?.products));
}

async function fetchCustomerByEmail(email) {
  const data = await executeAdminQuery(CUSTOMER_BY_EMAIL_QUERY, {
    query: `email:${email}`
  });
  return mapCustomer(unwrapFirstNode(data?.customers));
}

async function updateProduct(product) {
  const data = await executeAdminQuery(PRODUCT_UPDATE_MUTATION, { product });
  const payload = data?.productUpdate;

  if (payload?.userErrors?.length) {
    throw new Error(`productUpdate failed: ${payload.userErrors.map((entry) => entry.message).join("; ")}`);
  }

  return payload?.product ?? null;
}

async function updateProductVariants(productId, variants) {
  const data = await executeAdminQuery(PRODUCT_VARIANTS_BULK_UPDATE_MUTATION, {
    productId,
    variants
  });
  const payload = data?.productVariantsBulkUpdate;

  if (payload?.userErrors?.length) {
    throw new Error(
      `productVariantsBulkUpdate failed: ${payload.userErrors.map((entry) => entry.message).join("; ")}`
    );
  }

  return payload?.productVariants ?? [];
}

async function setMetafields(metafields) {
  const data = await executeAdminQuery(METAFIELDS_SET_MUTATION, { metafields });
  const payload = data?.metafieldsSet;

  if (payload?.userErrors?.length) {
    throw new Error(`metafieldsSet failed: ${payload.userErrors.map((entry) => entry.message).join("; ")}`);
  }

  return payload?.metafields ?? [];
}

async function addTags(id, tags) {
  const data = await executeAdminQuery(TAGS_ADD_MUTATION, { id, tags });
  const payload = data?.tagsAdd;

  if (payload?.userErrors?.length) {
    throw new Error(`tagsAdd failed: ${payload.userErrors.map((entry) => entry.message).join("; ")}`);
  }

  return payload?.node ?? null;
}

async function removeTags(id, tags) {
  const data = await executeAdminQuery(TAGS_REMOVE_MUTATION, { id, tags });
  const payload = data?.tagsRemove;

  if (payload?.userErrors?.length) {
    throw new Error(`tagsRemove failed: ${payload.userErrors.map((entry) => entry.message).join("; ")}`);
  }

  return payload?.node ?? null;
}

module.exports = {
  addTags,
  executeAdminQuery,
  fetchCustomerByEmail,
  fetchCustomers,
  fetchProducts,
  fetchProductByHandle,
  fetchOrders,
  getAdminAccessToken,
  fetchShopInfo,
  removeTags,
  setMetafields,
  updateProduct,
  updateProductVariants
};
