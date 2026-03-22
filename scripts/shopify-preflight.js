const { prisma } = require("../src/lib/prisma.js");
const { getAdminAccessToken, fetchShopInfo } = require("../src/lib/shopify-admin.js");

function mask(value, visible = 6) {
  if (!value) return "";
  if (value.length <= visible) return "*".repeat(value.length);
  return `${value.slice(0, visible)}${"*".repeat(Math.max(4, value.length - visible))}`;
}

function getConfigSummary() {
  return {
    databaseUrlConfigured: Boolean(process.env.DATABASE_URL),
    storeDomain: process.env.SHOPIFY_STORE_DOMAIN || "",
    hasAdminAccessToken: Boolean(process.env.SHOPIFY_ADMIN_ACCESS_TOKEN),
    hasClientId: Boolean(process.env.SHOPIFY_API_CLIENT_ID),
    hasClientSecret: Boolean(process.env.SHOPIFY_API_CLIENT_SECRET),
    apiVersion: process.env.SHOPIFY_API_VERSION || "2025-10"
  };
}

async function checkDatabase() {
  await prisma.$queryRaw`SELECT 1`;
  return { ok: true };
}

async function main() {
  const summary = getConfigSummary();

  console.log("Shopify preflight starting...");
  console.log(JSON.stringify(summary, null, 2));

  if (!summary.databaseUrlConfigured) {
    throw new Error("DATABASE_URL が設定されていません。");
  }

  if (!summary.storeDomain) {
    throw new Error("SHOPIFY_STORE_DOMAIN が設定されていません。");
  }

  if (!summary.hasAdminAccessToken && !(summary.hasClientId && summary.hasClientSecret)) {
    throw new Error(
      "Shopify 認証情報が不足しています。SHOPIFY_ADMIN_ACCESS_TOKEN または SHOPIFY_API_CLIENT_ID / SHOPIFY_API_CLIENT_SECRET を設定してください。"
    );
  }

  await checkDatabase();
  console.log("Database connection: OK");

  const accessToken = await getAdminAccessToken();
  console.log(`Token acquisition: OK (${mask(accessToken)})`);

  const shop = await fetchShopInfo();
  if (!shop) {
    throw new Error("shop クエリからストア情報を取得できませんでした。");
  }

  console.log("Shop connection: OK");
  console.log(
    JSON.stringify(
      {
        id: shop.id,
        name: shop.name,
        myshopifyDomain: shop.myshopifyDomain,
        plan: shop.plan?.displayName ?? null
      },
      null,
      2
    )
  );
}

main()
  .catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
