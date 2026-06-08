#!/usr/bin/env node

let cachedAdminAccessToken = null;

function requireEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required.`);
  }
  return value;
}

function normalizeShopDomain(value) {
  return value.replace(/^https?:\/\//, "").replace(/\/$/, "");
}

function getApiVersion() {
  return process.env.SHOPIFY_API_VERSION?.trim() || "2025-10";
}

function getCallbackUrl() {
  return (
    process.env.SHOPIFY_WEBHOOK_CALLBACK_URL?.trim() ||
    "https://bi.teamfwj.org/api/shopify/order-notify"
  );
}

function hasTargetProductConfig() {
  return [
    "SHOPIFY_NOTIFY_SKUS",
    "SHOPIFY_NOTIFY_PRODUCT_IDS",
    "SHOPIFY_NOTIFY_VARIANT_IDS"
  ].some((name) => process.env[name]?.split(",").some((value) => value.trim()));
}

async function getAdminAccessToken() {
  if (cachedAdminAccessToken) {
    return cachedAdminAccessToken;
  }

  if (process.env.SHOPIFY_ADMIN_ACCESS_TOKEN?.trim()) {
    cachedAdminAccessToken = process.env.SHOPIFY_ADMIN_ACCESS_TOKEN.trim();
    return cachedAdminAccessToken;
  }

  const clientId = process.env.SHOPIFY_API_CLIENT_ID?.trim();
  const clientSecret = process.env.SHOPIFY_API_CLIENT_SECRET?.trim();

  if (!clientId || !clientSecret) {
    throw new Error(
      "SHOPIFY_ADMIN_ACCESS_TOKEN or SHOPIFY_API_CLIENT_ID / SHOPIFY_API_CLIENT_SECRET is required."
    );
  }

  const shopDomain = normalizeShopDomain(requireEnv("SHOPIFY_STORE_DOMAIN"));
  const response = await fetch(`https://${shopDomain}/admin/oauth/access_token`, {
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
    throw new Error(`Shopify token request failed: ${response.status} ${await response.text()}`);
  }

  const body = await response.json();
  if (!body.access_token) {
    throw new Error("Shopify token response did not include access_token.");
  }

  cachedAdminAccessToken = body.access_token;
  return cachedAdminAccessToken;
}

async function shopifyRequest(path, options = {}) {
  const shopDomain = normalizeShopDomain(requireEnv("SHOPIFY_STORE_DOMAIN"));
  const token = await getAdminAccessToken();
  const url = `https://${shopDomain}/admin/api/${getApiVersion()}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Shopify-Access-Token": token,
      ...options.headers
    }
  });

  const text = await response.text();
  const body = text ? JSON.parse(text) : {};

  if (!response.ok) {
    throw new Error(`Shopify API failed: ${response.status} ${JSON.stringify(body)}`);
  }

  return body;
}

async function findExistingWebhook(callbackUrl) {
  const body = await shopifyRequest("/webhooks.json?topic=orders/create");
  return body.webhooks?.find((webhook) => webhook.address === callbackUrl);
}

async function createWebhook(callbackUrl) {
  return shopifyRequest("/webhooks.json", {
    method: "POST",
    body: JSON.stringify({
      webhook: {
        topic: "orders/create",
        address: callbackUrl,
        format: "json"
      }
    })
  });
}

async function main() {
  requireEnv("SHOPIFY_STORE_DOMAIN");
  requireEnv("GOOGLE_CHAT_WEBHOOK_URL");

  if (!hasTargetProductConfig()) {
    throw new Error(
      "At least one target product env is required: SHOPIFY_NOTIFY_SKUS, SHOPIFY_NOTIFY_PRODUCT_IDS, or SHOPIFY_NOTIFY_VARIANT_IDS."
    );
  }

  const callbackUrl = getCallbackUrl();
  const existing = await findExistingWebhook(callbackUrl);

  if (existing) {
    console.log("Webhook is already registered.");
    console.log(`id=${existing.id}`);
    console.log(`topic=${existing.topic}`);
    console.log(`address=${existing.address}`);
    return;
  }

  const body = await createWebhook(callbackUrl);
  const webhook = body.webhook;

  console.log("Webhook registered.");
  console.log(`id=${webhook.id}`);
  console.log(`topic=${webhook.topic}`);
  console.log(`address=${webhook.address}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
