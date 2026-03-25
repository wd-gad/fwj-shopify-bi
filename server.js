const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("node:crypto");
const { spawn } = require("child_process");
const { URL } = require("url");
const { prisma } = require("./src/lib/prisma.js");
const {
  getDashboardSummary,
  getEventBreakdown,
  getEventInsights,
  getSpectatorInsights,
  getEventOptions,
  getCustomers,
  getMemberJoinTrend,
  getMembers,
  getMemberDetail
} = require("./src/lib/analytics-api.js");

const PORT = Number(process.env.PORT || 3007);
const HOST = process.env.HOST || "0.0.0.0";

// --- Auth config ---
const PORTAL_URL = process.env.PORTAL_URL || "https://www.teamfwj.org";
const SSO_SECRET = process.env.SSO_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET || process.env.SSO_SECRET;
const INTERNAL_API_KEY = process.env.INTERNAL_API_KEY;
const SESSION_COOKIE = "bi_session";

// Endpoints callable server-to-server (e.g. from Itinerary) with INTERNAL_API_KEY
const INTERNAL_PATHS = ["/api/event-options", "/api/event-insights", "/api/spectator-insights"];

// Revenue fields hidden from "USER" (それ以外) role
const REVENUE_KEYS = new Set(["entryRevenue", "totalRevenue", "memberRevenue", "revenue", "price", "amount", "sales", "totalSales"]);

function jwtSign(payload, secret, maxAgeSecs) {
  const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = Buffer.from(JSON.stringify({ ...payload, iat: now, exp: now + maxAgeSecs })).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
  return `${header}.${body}.${sig}`;
}

function jwtVerify(token, secret) {
  if (!token || !secret) return null;
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [header, body, sig] = parts;
  try {
    const expected = crypto.createHmac("sha256", secret).update(`${header}.${body}`).digest("base64url");
    const a = Buffer.from(sig, "base64url");
    const b = Buffer.from(expected, "base64url");
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString());
    if (payload.exp < Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

function parseCookies(req) {
  const header = req.headers.cookie || "";
  return Object.fromEntries(
    header.split(";").map(c => c.trim()).filter(Boolean).map(c => {
      const eq = c.indexOf("=");
      return eq < 0 ? [c, ""] : [c.slice(0, eq).trim(), decodeURIComponent(c.slice(eq + 1))];
    })
  );
}

function getSession(req) {
  const token = parseCookies(req)[SESSION_COOKIE];
  return jwtVerify(token, SESSION_SECRET);
}

// Recursively remove revenue fields for USER role
function stripRevenue(value) {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) return value.map(stripRevenue);
  return Object.fromEntries(
    Object.entries(value)
      .filter(([k]) => !REVENUE_KEYS.has(k))
      .map(([k, v]) => [k, stripRevenue(v)])
  );
}

function sendRedirect(res, location) {
  res.writeHead(302, { Location: location });
  res.end();
}

async function handleSsoPortal(req, res, url) {
  const token = url.searchParams.get("token");
  if (!token || !SSO_SECRET) return sendRedirect(res, PORTAL_URL);

  const payload = jwtVerify(token, SSO_SECRET);
  if (!payload?.email) return sendRedirect(res, `${PORTAL_URL}/api/cross-app/shopify-bi`);

  const sessionToken = jwtSign(
    { email: payload.email, name: payload.name || null, role: payload.role || "USER", sub: payload.sub },
    SESSION_SECRET,
    30 * 24 * 3600
  );

  const secure = req.headers["x-forwarded-proto"] === "https" || url.origin.startsWith("https://");
  const baseOrigin = secure ? `https://${req.headers.host}` : url.origin;
  const cookieParts = [
    `${SESSION_COOKIE}=${sessionToken}`,
    "HttpOnly", "SameSite=Lax", "Path=/",
    `Max-Age=${30 * 24 * 3600}`,
    ...(secure ? ["Secure"] : []),
  ];

  res.writeHead(302, { Location: new URL("/", baseOrigin).toString(), "Set-Cookie": cookieParts.join("; ") });
  res.end();
}
const PUBLIC_DIR = path.join(__dirname, "public");
const LOCAL_ALIAS = `shopify-bi.localhost:${PORT}`;
const INCREMENTAL_SYNC_LOOKBACK_MS = 30 * 60 * 1000;
const STALE_SYNC_RUN_MS = 30 * 60 * 1000;
const FULL_SYNC_HOUR = 0;
const FULL_SYNC_MINUTE = 30;
const INCREMENTAL_SYNC_HOURS = [3, 6, 9, 12, 15, 18, 21];
const INCREMENTAL_SYNC_MINUTE = 15;

let scheduledSyncTimeout = null;

const syncState = {
  running: false,
  startedAt: null,
  finishedAt: null,
  lastUpdatedAt: null,
  status: "idle",
  trigger: null,
  message: null
};

const MIME_TYPES = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml; charset=utf-8"
};

function sendJson(res, statusCode, payload) {
  res.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store"
  });
  res.end(JSON.stringify(payload));
}

function sendFile(res, filePath) {
  fs.stat(filePath, (statError, stats) => {
    if (statError || !stats.isFile()) {
      sendJson(res, 404, { error: "Not found" });
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME_TYPES[ext] || "application/octet-stream",
      "Cache-Control": "no-store"
    });

    const stream = fs.createReadStream(filePath);
    stream.on("error", () => {
      if (!res.headersSent) {
        sendJson(res, 500, { error: "Failed to read file" });
        return;
      }
      res.destroy();
    });
    stream.pipe(res);
  });
}

function sendCsv(res, statusCode, filename, csvContent) {
  res.writeHead(statusCode, {
    "Content-Type": "text/csv; charset=utf-8",
    "Content-Disposition": `attachment; filename="${filename}"`,
    "Cache-Control": "no-store"
  });
  res.end(csvContent, "utf-8");
}

function normalizeFilters(searchParams) {
  const filters = {};

  for (const key of [
    "region",
    "prefecture",
    "ageBand",
    "gender",
    "membershipStatus",
    "audienceType",
    "contestName",
    "granularity",
    "joinedFrom",
    "joinedTo",
    "take"
  ]) {
    const value = searchParams.get(key);
    if (value) {
      filters[key] = value;
    }
  }

  return filters;
}

async function readSyncStatus() {
  const [latestMemberUpdate, latestCustomerSync, latestOrderSync, latestProductSync] = await Promise.all([
    prisma.memberProfile.aggregate({
      _max: { updatedAt: true }
    }),
    prisma.shopifyCustomer.aggregate({
      _max: { syncedAt: true }
    }),
    prisma.shopifyOrder.aggregate({
      _max: { syncedAt: true }
    }),
    prisma.shopifyProduct.aggregate({
      _max: { syncedAt: true }
    })
  ]);

  let latestRun = await prisma.syncRun.findFirst({
    orderBy: [{ startedAt: "desc" }]
  });

  if (!syncState.running && latestRun?.status === "running") {
    const startedAt = new Date(latestRun.startedAt);
    if (Date.now() - startedAt.getTime() > STALE_SYNC_RUN_MS) {
      latestRun = await prisma.syncRun.update({
        where: { id: latestRun.id },
        data: {
          status: "failed",
          finishedAt: new Date(),
          errorMessage:
            latestRun.errorMessage ||
            "Sync run was left in a running state and was marked failed automatically."
        }
      });
    }
  }

  const candidates = [
    latestRun?.finishedAt,
    latestMemberUpdate._max.updatedAt,
    latestCustomerSync._max.syncedAt,
    latestOrderSync._max.syncedAt,
    latestProductSync._max.syncedAt
  ].filter(Boolean);

  const latestUpdatedAt = candidates.length
    ? new Date(Math.max(...candidates.map((value) => new Date(value).getTime())))
    : null;

  return {
    running: syncState.running || latestRun?.status === "running",
    status: syncState.running ? "running" : latestRun?.status || syncState.status,
    trigger: syncState.trigger,
    startedAt: syncState.startedAt || latestRun?.startedAt || null,
    finishedAt: syncState.finishedAt || latestRun?.finishedAt || null,
    lastUpdatedAt: latestUpdatedAt,
    message: syncState.message || latestRun?.errorMessage || null
  };
}

function runScript(scriptPath, scriptArgs = []) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [scriptPath, ...scriptArgs], {
      cwd: __dirname,
      env: process.env,
      stdio: ["ignore", "pipe", "pipe"]
    });

    let stderr = "";
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.stdout.on("data", (chunk) => {
      process.stdout.write(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(stderr.trim() || `${path.basename(scriptPath)} exited with code ${code}`));
    });
  });
}

async function getIncrementalSyncStart() {
  const latestSuccessfulAllRun = await prisma.syncRun.findFirst({
    where: {
      target: "all",
      status: "succeeded",
      finishedAt: {
        not: null
      }
    },
    orderBy: [{ finishedAt: "desc" }]
  });

  if (!latestSuccessfulAllRun?.finishedAt) {
    return null;
  }

  return new Date(new Date(latestSuccessfulAllRun.finishedAt).getTime() - INCREMENTAL_SYNC_LOOKBACK_MS);
}

async function runSyncPipeline(trigger = "manual", mode = "incremental") {
  if (syncState.running) {
    return false;
  }

  syncState.running = true;
  syncState.status = "running";
  syncState.trigger = trigger;
  syncState.startedAt = new Date();
  syncState.message = trigger === "manual" ? "Manual sync started" : "Scheduled sync started";

  try {
    const incrementalSyncStart = mode === "incremental" ? await getIncrementalSyncStart() : null;
    const syncArgs = incrementalSyncStart ? [`--updated-after=${incrementalSyncStart.toISOString()}`] : [];
    const modeLabel = mode === "full" ? "full" : "incremental";

    syncState.message = incrementalSyncStart
      ? `${trigger === "manual" ? "Manual" : "Scheduled"} ${modeLabel} sync started from ${incrementalSyncStart.toISOString()}`
      : `${trigger === "manual" ? "Manual" : "Scheduled"} ${modeLabel} sync started`;

    await runScript(path.join(__dirname, "scripts/shopify-sync.js"), syncArgs);
    await runScript(path.join(__dirname, "scripts/rebuild-analytics.js"));
    syncState.status = "succeeded";
    syncState.finishedAt = new Date();
    syncState.lastUpdatedAt = syncState.finishedAt;
    syncState.message = incrementalSyncStart
      ? `${trigger === "manual" ? "Manual" : "Scheduled"} ${modeLabel} sync completed`
      : `${trigger === "manual" ? "Manual" : "Scheduled"} ${modeLabel} sync completed`;
  } catch (error) {
    syncState.status = "failed";
    syncState.finishedAt = new Date();
    syncState.message = error instanceof Error ? error.message : "Sync failed";
    console.error(error);
  } finally {
    syncState.running = false;
    syncState.startedAt = null;
  }

  return true;
}

function getScheduledCandidates(baseDate) {
  const candidates = [];
  const start = new Date(baseDate);

  for (let dayOffset = 0; dayOffset <= 2; dayOffset += 1) {
    const year = start.getFullYear();
    const month = start.getMonth();
    const day = start.getDate() + dayOffset;

    candidates.push({
      mode: "full",
      runAt: new Date(year, month, day, FULL_SYNC_HOUR, FULL_SYNC_MINUTE, 0, 0)
    });

    for (const hour of INCREMENTAL_SYNC_HOURS) {
      candidates.push({
        mode: "incremental",
        runAt: new Date(year, month, day, hour, INCREMENTAL_SYNC_MINUTE, 0, 0)
      });
    }
  }

  return candidates.sort((left, right) => left.runAt.getTime() - right.runAt.getTime());
}

function getNextScheduledSync(fromDate = new Date()) {
  const now = new Date(fromDate);
  return getScheduledCandidates(now).find((candidate) => candidate.runAt.getTime() > now.getTime()) || null;
}

function scheduleNextAutoSync() {
  if (scheduledSyncTimeout) {
    clearTimeout(scheduledSyncTimeout);
  }

  const nextSync = getNextScheduledSync(new Date());
  if (!nextSync) {
    return;
  }

  const delay = Math.max(nextSync.runAt.getTime() - Date.now(), 1000);
  scheduledSyncTimeout = setTimeout(async () => {
    try {
      if (!syncState.running) {
        await runSyncPipeline("auto", nextSync.mode);
      }
    } finally {
      scheduleNextAutoSync();
    }
  }, delay);
}

async function handleApi(req, res, pathname, searchParams, session) {
  const role = session?.role || "USER";
  const isAdmin = role === "ADMIN";
  const isInhouse = role === "INHOUSE";
  const canSeeRevenue = isAdmin || isInhouse;

  // Helper: send JSON, stripping revenue fields if needed
  function reply(statusCode, payload) {
    const data = canSeeRevenue ? payload : stripRevenue(payload);
    return sendJson(res, statusCode, data);
  }

  if (pathname === "/api/me") {
    return sendJson(res, 200, { email: session?.email, name: session?.name, role });
  }

  if (pathname === "/api/sync-status") {
    const status = await readSyncStatus();
    return reply(200, status);
  }

  if (pathname === "/api/sync") {
    if (!isAdmin) return sendJson(res, 403, { error: "Admin only" });
    if (req.method !== "POST") return sendJson(res, 405, { error: "Method not allowed" });
    if (syncState.running) return sendJson(res, 409, { error: "Sync already running" });
    void runSyncPipeline("manual");
    const status = await readSyncStatus();
    return sendJson(res, 202, status);
  }

  if (pathname === "/api/dashboard") {
    const summary = await getDashboardSummary(normalizeFilters(searchParams));
    return reply(200, summary);
  }

  if (pathname === "/api/events") {
    const limit = searchParams.get("limit");
    const events = await getEventBreakdown({ limit });
    return reply(200, { events });
  }

  if (pathname === "/api/event-options") {
    const events = await getEventOptions();
    return sendJson(res, 200, { events });
  }

  if (pathname === "/api/event-insights") {
    const eventName = searchParams.get("eventName");
    const insights = await getEventInsights(eventName);
    return sendJson(res, 200, insights);
  }

  if (pathname === "/api/spectator-insights") {
    const eventName = searchParams.get("eventName");
    const insights = await getSpectatorInsights(eventName);
    return sendJson(res, 200, insights);
  }

  if (pathname === "/api/members") {
    const members = await getMembers(normalizeFilters(searchParams));
    return reply(200, { members });
  }

  if (pathname === "/api/customers") {
    const customers = await getCustomers(normalizeFilters(searchParams));
    return reply(200, { customers });
  }

  if (pathname === "/api/member-joins") {
    const payload = await getMemberJoinTrend(normalizeFilters(searchParams));
    return reply(200, payload);
  }

  if (pathname.startsWith("/api/members/")) {
    const memberId = decodeURIComponent(pathname.replace("/api/members/", ""));
    const member = await getMemberDetail(memberId);
    if (!member) return sendJson(res, 404, { error: "Member not found" });
    return reply(200, { member });
  }

  if (pathname === "/api/export/event-entries") {
    try {
      const eventEntries = await prisma.eventEntry.findMany({
        include: {
          member: {
            select: {
              id: true,
              fullName: true,
              email: true,
              gender: true,
              birthDate: true,
              prefecture: true,
              region: true,
              ageBand: true
            }
          },
          order: {
            select: {
              id: true,
              orderNumber: true,
              totalPrice: true,
              orderedAt: true
            }
          },
          orderItem: {
            select: {
              id: true,
              title: true,
              sku: true
            }
          }
        },
        orderBy: {
          eventDate: "desc"
        }
      });

      if (eventEntries.length === 0) {
        return sendJson(res, 200, { message: "No event entries found" });
      }

      const headers = [
        "エントリーID",
        "メンバーID",
        "メンバー名",
        "メールアドレス",
        "性別",
        "生年月日",
        "都道府県",
        "地域",
        "年代",
        "大会名",
        "大会日",
        "申込日",
        "参加人数",
        "ステータス",
        "注文ID",
        "注文番号",
        "注文日",
        "注文金額",
        "商品名",
        "SKU"
      ];

      const rows = eventEntries.map(entry => [
        entry.id,
        entry.memberId,
        entry.member?.fullName || "",
        entry.member?.email || "",
        entry.member?.gender || "",
        entry.member?.birthDate ? entry.member.birthDate.toISOString().split("T")[0] : "",
        entry.member?.prefecture || "",
        entry.member?.region || "",
        entry.member?.ageBand || "",
        entry.eventName,
        entry.eventDate ? entry.eventDate.toISOString().split("T")[0] : "",
        entry.appliedAt.toISOString().split("T")[0],
        entry.quantity,
        entry.status,
        entry.orderId,
        entry.order?.orderNumber || "",
        entry.order?.orderedAt ? entry.order.orderedAt.toISOString().split("T")[0] : "",
        entry.order?.totalPrice || "",
        entry.orderItem?.title || "",
        entry.orderItem?.sku || ""
      ]);

      const csvContent = [
        headers.join(","),
        ...rows.map(row =>
          row.map(cell => {
            if (cell === null || cell === undefined) return "";
            const str = String(cell);
            if (str.includes(",") || str.includes("\n") || str.includes('"')) {
              return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
          }).join(",")
        )
      ].join("\n");

      const timestamp = new Date().toISOString().replace(/[:-]/g, "").slice(0, 15);
      const filename = `event_entries_${timestamp}.csv`;

      return sendCsv(res, 200, filename, csvContent);
    } catch (error) {
      console.error("EventEntry export error:", error);
      return sendJson(res, 500, { error: error instanceof Error ? error.message : "Export failed" });
    }
  }

  return sendJson(res, 404, { error: "Not found" });
}

const server = http.createServer(async (req, res) => {
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host || `${HOST}:${PORT}`}`);
    const { pathname, searchParams } = requestUrl;

    // SSO callback — no auth required
    if (pathname === "/api/sso/portal") {
      return await handleSsoPortal(req, res, requestUrl);
    }

    // Health check — no auth required
    if (pathname === "/api/health") {
      return sendJson(res, 200, { ok: true });
    }

    // Public read-only aggregation endpoints (aggregate stats only, no PII)
    if (INTERNAL_PATHS.includes(pathname)) {
      return await handleApi(req, res, pathname, searchParams, null);
    }

    // Internal server-to-server calls (e.g. from Itinerary)
    const isInternalCall = INTERNAL_API_KEY && req.headers["x-internal-key"] === INTERNAL_API_KEY;
    const isInternalPath = INTERNAL_PATHS.includes(pathname);

    // Resolve session
    const session = getSession(req);

    // Auth gate
    if (!session && !(isInternalCall && isInternalPath)) {
      if (pathname.startsWith("/api/")) {
        return sendJson(res, 401, { error: "Unauthorized" });
      }
      return sendRedirect(res, `${PORTAL_URL}/api/cross-app/shopify-bi`);
    }

    if (pathname.startsWith("/api/")) {
      return await handleApi(req, res, pathname, searchParams, session);
    }

    const filePath =
      pathname === "/"
        ? path.join(PUBLIC_DIR, "index.html")
        : path.join(PUBLIC_DIR, pathname.replace(/^\/+/, ""));

    if (!filePath.startsWith(PUBLIC_DIR)) {
      return sendJson(res, 403, { error: "Forbidden" });
    }

    return sendFile(res, filePath);
  } catch (error) {
    console.error(error);
    return sendJson(res, 500, {
      error: error instanceof Error ? error.message : "Unexpected server error"
    });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Shopify analytics dashboard running at http://${HOST}:${PORT}`);
  console.log(`Alias: http://${LOCAL_ALIAS}`);
  scheduleNextAutoSync();

  // Run schema sync in background after server is up
  if (process.env.DATABASE_URL) {
    const { exec } = require("child_process");
    exec("npx prisma db push --accept-data-loss", (err, stdout, stderr) => {
      if (err) console.error("prisma db push failed:", err.message);
      else console.log("prisma db push: schema synced");
    });

    // Seed contest schedules, then reclassify products, then rebuild analytics
    const { seedContestSchedules } = require("./scripts/seed-contest-schedules.js");
    seedContestSchedules()
      .then(() => {
        const { execFile } = require("child_process");
        const node = process.execPath;
        const reclassify = require("path").join(__dirname, "scripts/reclassify-products.js");
        const rebuild = require("path").join(__dirname, "scripts/rebuild-analytics.js");
        return new Promise((resolve, reject) => {
          execFile(node, [reclassify], (err, stdout, stderr) => {
            if (stdout) process.stdout.write(stdout);
            if (stderr) process.stderr.write(stderr);
            if (err) { console.error("reclassify-products failed:", err.message); return reject(err); }
            execFile(node, [rebuild], (err2, stdout2, stderr2) => {
              if (stdout2) process.stdout.write(stdout2);
              if (stderr2) process.stderr.write(stderr2);
              if (err2) { console.error("rebuild-analytics failed:", err2.message); return reject(err2); }
              resolve();
            });
          });
        });
      })
      .catch((err) => console.error("startup analytics init failed:", err));
  }
});
