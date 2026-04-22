const state = {
  activeFilters: {},
  customerFilters: {
    audienceType: "",
    contestName: ""
  },
  chartModes: {
    overviewRevenueChart: "pie",
    overviewVolumeChart: "pie",
    memberRegionChart: "pie",
    memberPrefectureChart: "pie",
    filterChart: "line",
    spectatorCategoryChart: "pie",
    spectatorGenderChart: "pie",
    spectatorAgeChart: "pie",
    spectatorPrefectureChart: "pie",
    spectatorRegionChart: "pie",
    spectatorEventsList: "line"
  },
  eventOptions: [],
  selectedEventName: "",
  selectedSpectatorEventName: "",
  dashboardPayload: null,
  memberJoinPayload: null,
  customersPayload: null,
  eventInsightsPayload: null,
  spectatorInsightsPayload: null,
  syncStatus: null
};

const CUSTOMER_COLUMNS_STORAGE_KEY = "fwj-customer-columns";
const AUTO_SYNC_SCHEDULE_LABEL = "自動更新: フル 24:30 / 増分 03:15, 06:15, 09:15, 12:15, 15:15, 18:15, 21:15";

const CUSTOMER_COLUMNS = [
  { key: "memberId", label: "Member ID", render: (customer) => customer.memberId, className: "muted-cell" },
  { key: "cardNumber", label: "FWJ Card No", render: (customer) => customer.cardNumber },
  { key: "fullName", label: "Name", render: (customer) => customer.fullName },
  { key: "nameKana", label: "Name Kana", render: (customer) => `${customer.kanaLastName} ${customer.kanaFirstName}`.trim() },
  { key: "firstName", label: "First Name", render: (customer) => customer.firstName },
  { key: "lastName", label: "Last Name", render: (customer) => customer.lastName },
  { key: "email", label: "Email", render: (customer) => customer.email, className: "muted-cell" },
  { key: "phone", label: "Phone", render: (customer) => customer.phone, className: "muted-cell" },
  { key: "nationality", label: "Nationality", render: (customer) => customer.nationality },
  { key: "prefecture", label: "Prefecture", render: (customer) => customer.prefecture },
  { key: "region", label: "Region", render: (customer) => customer.region },
  { key: "gender", label: "Gender", render: (customer) => customer.gender },
  { key: "birthDate", label: "Birth Date", render: (customer) => formatDate(customer.birthDate), className: "muted-cell" },
  { key: "age", label: "Age", render: (customer) => (customer.age == null ? "-" : String(customer.age)) },
  { key: "ageBand", label: "Age Band", render: (customer) => customer.ageBand },
  { key: "heightCm", label: "Height", render: (customer) => (customer.heightCm == null ? "-" : `${customer.heightCm} cm`) },
  { key: "weightKg", label: "Weight", render: (customer) => (customer.weightKg == null ? "-" : `${customer.weightKg} kg`) },
  { key: "membershipStatus", label: "Status", render: (customer) => formatStatusLabel(customer.membershipStatus), isStatus: true },
  { key: "accountState", label: "Account", render: (customer) => customer.accountState },
  { key: "joinedAt", label: "Joined", render: (customer) => formatDate(customer.joinedAt), className: "muted-cell" },
  { key: "postalCode", label: "Postal Code", render: (customer) => customer.postalCode, className: "muted-cell" },
  { key: "city", label: "City", render: (customer) => customer.city, className: "muted-cell" },
  { key: "address1", label: "Address 1", render: (customer) => customer.address1, className: "muted-cell" },
  { key: "address2", label: "Address 2", render: (customer) => customer.address2, className: "muted-cell" },
  { key: "address", label: "Address", render: (customer) => customer.address, className: "muted-cell" },
  { key: "achievements", label: "Achievements", render: (customer) => customer.achievements, className: "muted-cell" },
  { key: "tags", label: "Tags", render: (customer) => customer.tags, className: "muted-cell" }
];

state.visibleCustomerColumns = new Set(CUSTOMER_COLUMNS.map((column) => column.key));

const summaryCards = document.querySelector("#summaryCards");
const eventsList = document.querySelector("#eventsList");
const eventSelect = document.querySelector("#eventSelect");
const selectedEventTitle = document.querySelector("#selectedEventTitle");
const eventTotals = document.querySelector("#eventTotals");
const categorySummary = document.querySelector("#categorySummary");
const genderSummary = document.querySelector("#genderSummary");
const ageSummary = document.querySelector("#ageSummary");
const prefectureSummary = document.querySelector("#prefectureSummary");
const regionSummary = document.querySelector("#regionSummary");
const categoryChart = document.querySelector("#categoryChart");
const genderChart = document.querySelector("#genderChart");
const ageChart = document.querySelector("#ageChart");
const prefectureChart = document.querySelector("#prefectureChart");
const regionChart = document.querySelector("#regionChart");
const spectatorEventSelect = document.querySelector("#spectatorEventSelect");
const selectedSpectatorEventTitle = document.querySelector("#selectedSpectatorEventTitle");
const spectatorTotals = document.querySelector("#spectatorTotals");
const spectatorCategorySummary = document.querySelector("#spectatorCategorySummary");
const spectatorGenderSummary = document.querySelector("#spectatorGenderSummary");
const spectatorAgeSummary = document.querySelector("#spectatorAgeSummary");
const spectatorPrefectureSummary = document.querySelector("#spectatorPrefectureSummary");
const spectatorRegionSummary = document.querySelector("#spectatorRegionSummary");
const spectatorEventsList = document.querySelector("#spectatorEventsList");
const spectatorCategoryChart = document.querySelector("#spectatorCategoryChart");
const spectatorGenderChart = document.querySelector("#spectatorGenderChart");
const spectatorAgeChart = document.querySelector("#spectatorAgeChart");
const spectatorPrefectureChart = document.querySelector("#spectatorPrefectureChart");
const spectatorRegionChart = document.querySelector("#spectatorRegionChart");
const filterChart = document.querySelector("#filterChart");
const filterSummary = document.querySelector("#filterSummary");
const memberRegionChart = document.querySelector("#memberRegionChart");
const memberPrefectureChart = document.querySelector("#memberPrefectureChart");
const overviewRevenueChart = document.querySelector("#overviewRevenueChart");
const overviewVolumeChart = document.querySelector("#overviewVolumeChart");
const overviewSummary = document.querySelector("#overviewSummary");
const memberFilters = document.querySelector("#memberFilters");
const chartToggleButtons = Array.from(document.querySelectorAll(".chart-toggle-button"));
const tabButtons = Array.from(document.querySelectorAll(".tab-button"));
const tabPanels = Array.from(document.querySelectorAll(".tab-panel"));
const customerContestFilter = document.querySelector("#customerContestFilter");
const customerAudienceFilter = document.querySelector("#customerAudienceFilter");
const customerColumnOptions = document.querySelector("#customerColumnOptions");
const customerTableHead = document.querySelector("#customerTableHead");
const customerTableBody = document.querySelector("#customerTableBody");
const customerTableSummary = document.querySelector("#customerTableSummary");
const customerCsvExportButton = document.querySelector("#customerCsvExportButton");
const customerColumnPicker = document.querySelector(".column-picker");
const lastUpdatedAt = document.querySelector("#lastUpdatedAt");
const syncStatusLabel = document.querySelector("#syncStatusLabel");
const syncNowButton = document.querySelector("#syncNowButton");
const exportPdfButton = document.querySelector("#exportPdfButton");
const exportScopeSelect = document.querySelector("#exportScopeSelect");
const syncLoading = document.querySelector("#syncLoading");
let memberFilterDebounce = null;
let chartTooltip = null;

function ensureChartTooltip() {
  if (chartTooltip) {
    return chartTooltip;
  }

  chartTooltip = document.createElement("div");
  chartTooltip.className = "chart-tooltip";
  chartTooltip.setAttribute("aria-hidden", "true");
  document.body.append(chartTooltip);
  return chartTooltip;
}

function showChartTooltip(text, event) {
  const tooltip = ensureChartTooltip();
  tooltip.textContent = text;
  tooltip.classList.add("is-visible");
  tooltip.style.left = `${event.clientX + 14}px`;
  tooltip.style.top = `${event.clientY + 14}px`;
}

function hideChartTooltip() {
  if (!chartTooltip) {
    return;
  }
  chartTooltip.classList.remove("is-visible");
}

function readMemberFilters() {
  return Object.fromEntries(new FormData(memberFilters).entries());
}

function setChartMode(target, value) {
  state.chartModes[target] = value;
  chartToggleButtons.forEach((button) => {
    if (button.dataset.chartTarget !== target) {
      return;
    }
    const isActive = button.dataset.chartType === value;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function setActiveTab(targetId) {
  tabButtons.forEach((button) => {
    const isActive = button.dataset.tabTarget === targetId;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-selected", isActive ? "true" : "false");
  });

  tabPanels.forEach((panel) => {
    const isActive = panel.id === targetId;
    panel.classList.toggle("is-active", isActive);
    panel.hidden = !isActive;
  });
}

function getVisibleCustomerColumns() {
  return CUSTOMER_COLUMNS.filter((column) => state.visibleCustomerColumns.has(column.key));
}

function saveVisibleCustomerColumns() {
  try {
    localStorage.setItem(CUSTOMER_COLUMNS_STORAGE_KEY, JSON.stringify(Array.from(state.visibleCustomerColumns)));
  } catch {
    // ignore storage failures
  }
}

function loadVisibleCustomerColumns() {
  try {
    const raw = localStorage.getItem(CUSTOMER_COLUMNS_STORAGE_KEY);
    if (!raw) {
      return;
    }
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || !parsed.length) {
      return;
    }
    const validKeys = new Set(CUSTOMER_COLUMNS.map((column) => column.key));
    state.visibleCustomerColumns = new Set(parsed.filter((key) => validKeys.has(key)));
    if (!state.visibleCustomerColumns.size) {
      state.visibleCustomerColumns = new Set(CUSTOMER_COLUMNS.map((column) => column.key));
    }
  } catch {
    state.visibleCustomerColumns = new Set(CUSTOMER_COLUMNS.map((column) => column.key));
  }
}

function buildCustomerFilters(baseFilters = state.activeFilters) {
  const filters = { ...baseFilters };
  if (state.customerFilters.audienceType === "spectator") {
    delete filters.membershipStatus;
  }
  return {
    ...filters,
    ...(state.customerFilters.audienceType ? { audienceType: state.customerFilters.audienceType } : {}),
    ...(state.customerFilters.contestName ? { contestName: state.customerFilters.contestName } : {})
  };
}

function formatNumber(value) {
  return new Intl.NumberFormat("ja-JP").format(value ?? 0);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("ja-JP", {
    style: "currency",
    currency: "JPY",
    maximumFractionDigits: 0
  }).format(value ?? 0);
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatStatusLabel(value) {
  const normalized = String(value || "").trim().toLowerCase();
  const map = {
    active: "active",
    expired: "expired",
    refunded: "refunded",
    cancelled: "cancelled",
    canceled: "cancelled"
  };
  return map[normalized] || value || "-";
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function buildReportFilename() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0")
  ];
  return `FWJContestReport(${parts.join("")})`;
}

function buildCustomerExportFilename() {
  const now = new Date();
  const parts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0")
  ];
  return `FWJCustomerDB(${parts.join("")}).csv`;
}

function isoWeekStartDate(year, week) {
  const simple = new Date(Date.UTC(year, 0, 1 + (week - 1) * 7));
  const day = simple.getUTCDay() || 7;
  if (day <= 4) {
    simple.setUTCDate(simple.getUTCDate() - day + 1);
  } else {
    simple.setUTCDate(simple.getUTCDate() + 8 - day);
  }
  return simple;
}

function formatBucket(bucket) {
  const weeklyMatch = String(bucket || "").match(/^(\d{4})-W(\d{2})$/);
  if (!weeklyMatch) {
    return {
      display: bucket,
      detail: null
    };
  }

  const year = Number(weeklyMatch[1]);
  const isoWeek = Number(weeklyMatch[2]);
  const start = isoWeekStartDate(year, isoWeek);
  const monthKey = `${start.getUTCFullYear()}-${String(start.getUTCMonth() + 1).padStart(2, "0")}`;

  let monthWeek = 0;
  for (let week = 1; week <= isoWeek; week += 1) {
    const cursor = isoWeekStartDate(year, week);
    const cursorMonthKey = `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, "0")}`;
    if (cursorMonthKey === monthKey) {
      monthWeek += 1;
    }
  }

  const monthLabel = start.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC"
  });

  return {
    display: `${start.getUTCFullYear()}-${monthLabel}W${String(monthWeek).padStart(2, "0")}`,
    detail: `${weeklyMatch[1]}-W${weeklyMatch[2]}`
  };
}

function debounceMemberFilterUpdate() {
  window.clearTimeout(memberFilterDebounce);
  memberFilterDebounce = window.setTimeout(async () => {
    state.activeFilters = readMemberFilters();
    await Promise.all([
      loadOverview(state.activeFilters),
      loadMemberJoinTrend(state.activeFilters),
      loadCustomers(state.activeFilters)
    ]);
  }, 180);
}

async function fetchJson(url) {
  const response = await fetch(url);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return response.json();
}

async function postJson(url) {
  const response = await fetch(url, { method: "POST" });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.error || `Request failed: ${response.status}`);
  }
  return payload;
}

function renderSyncStatus(status) {
  if (!status) {
    return;
  }

  state.syncStatus = status;
  syncStatusLabel.classList.remove("sync-error-note", "sync-success-note");
  syncStatusLabel.innerHTML = "";

  if (status.running) {
    syncLoading.classList.add("is-running");
    lastUpdatedAt.textContent = status.startedAt
      ? `Syncing since ${formatDateTime(status.startedAt)}`
      : "Syncing now";
    syncStatusLabel.textContent = status.trigger === "manual" ? "手動更新を実行中" : "定期同期を実行中";
    syncNowButton.disabled = true;
    return;
  }

  syncLoading.classList.remove("is-running");
  if (status.status === "failed") {
    lastUpdatedAt.textContent = status.finishedAt
      ? `同期に失敗しました: ${formatDateTime(status.finishedAt)}`
      : "同期に失敗しました";
    syncStatusLabel.innerHTML = `
      <details class="sync-error-details">
        <summary>error</summary>
        <pre>${escapeHtml(status.message || "同期処理でエラーが発生しました")}</pre>
      </details>
    `;
    syncStatusLabel.classList.add("sync-error-note");
    syncNowButton.disabled = false;
    return;
  }

  lastUpdatedAt.textContent = status.lastUpdatedAt
    ? `Last updated ${formatDateTime(status.lastUpdatedAt)}`
    : "No sync yet";
  if (status.status === "succeeded") {
    syncStatusLabel.textContent = "Completed";
    syncStatusLabel.classList.add("sync-success-note");
  } else {
    syncStatusLabel.textContent = status.message || AUTO_SYNC_SCHEDULE_LABEL;
  }
  syncNowButton.disabled = false;
}

async function loadSyncStatus() {
  try {
    const status = await fetchJson("/api/sync-status");
    renderSyncStatus(status);
  } catch (error) {
    syncStatusLabel.textContent = error.message;
  }
}

function renderSummary(summary) {
  const revenueRows = [
    { label: "Membership", count: summary.totals.membershipRevenue || 0 },
    { label: "Contest Entry", count: summary.totals.eventEntryRevenue || 0 },
    { label: "Backstage Pass", count: summary.totals.backstagePassRevenue || 0 },
    { label: "Spectator Ticket", count: summary.totals.spectatorRevenue || 0 }
  ];
  const volumeRows = [
    { label: "Membership", count: summary.totals.totalMembershipPurchases || 0 },
    { label: "Contest Entry", count: summary.totals.totalEventEntries || 0 },
    { label: "Backstage Pass", count: summary.totals.backstagePassCount || 0 },
    { label: "Spectator Ticket", count: summary.totals.spectatorCount || 0 }
  ];
  const cards = [
    ["Membership", "overview-membership-card", summary.totals.totalMembershipPurchases, "Purchases", summary.totals.membershipRevenue, "Membership sales"],
    ["Contest Entry", "overview-contest-card", summary.totals.totalEventEntries, "Entries", summary.totals.eventEntryRevenue || 0, "Contest entry sales"],
    ["Backstage Pass", "overview-backstage-card", summary.totals.backstagePassCount, "Passes", summary.totals.backstagePassRevenue, "Backstage sales"],
    ["Spectator Ticket", "overview-spectator-card", summary.totals.spectatorCount, "Tickets", summary.totals.spectatorRevenue, "Ticket sales"],
    [
      "Total Revenue",
      "overview-total-card",
      (summary.totals.totalMembershipPurchases || 0) +
        (summary.totals.totalEventEntries || 0) +
        (summary.totals.backstagePassCount || 0) +
        (summary.totals.spectatorCount || 0),
      "Items",
      (summary.totals.membershipRevenue || 0) +
        (summary.totals.eventEntryRevenue || 0) +
        (summary.totals.backstagePassRevenue || 0) +
        (summary.totals.spectatorRevenue || 0),
      "All category sales"
    ]
  ];

  summaryCards.innerHTML = cards
    .map(
      ([label, cardClass, quantity, quantityLabel, revenue, revenueLabel]) => `
        <article class="summary-card overview-summary-card ${cardClass}">
          <p class="section-label">${label}</p>
          <div class="overview-summary-metric">
            <span>${quantityLabel}</span>
            <strong>${formatNumber(quantity)}</strong>
          </div>
          <div class="overview-summary-metric revenue-field">
            <span>${revenueLabel}</span>
            <strong>${formatCurrency(revenue)}</strong>
          </div>
        </article>
      `
    )
    .join("");

  if (state.chartModes.overviewRevenueChart === "pie") {
    renderPieChart(overviewRevenueChart, revenueRows, "JPY");
  } else if (state.chartModes.overviewRevenueChart === "bar") {
    renderBarChart(overviewRevenueChart, revenueRows, "JPY");
  } else {
    renderLineTimeline(overviewRevenueChart, revenueRows, "Revenue by category");
  }

  if (state.chartModes.overviewVolumeChart === "pie") {
    renderPieChart(overviewVolumeChart, volumeRows, "orders");
  } else if (state.chartModes.overviewVolumeChart === "bar") {
    renderBarChart(overviewVolumeChart, volumeRows, "orders");
  } else {
    renderLineTimeline(overviewVolumeChart, volumeRows, "Volume by category");
  }

  const summaryParts = [
    state.activeFilters.prefecture ? `Prefecture contains "${state.activeFilters.prefecture}"` : null,
    state.activeFilters.joinedFrom ? `From ${state.activeFilters.joinedFrom}` : null,
    state.activeFilters.joinedTo ? `To ${state.activeFilters.joinedTo}` : null,
    state.activeFilters.ageBand ? `Age band = ${state.activeFilters.ageBand}` : null,
    state.activeFilters.membershipStatus ? `Status = ${state.activeFilters.membershipStatus}` : null
  ].filter(Boolean);

  const baseNote = "Entries, tickets, and passes are filtered by transaction date. Member counts are filtered by join date.";
  overviewSummary.textContent = summaryParts.length
    ? summaryParts.join(" / ") + " — " + baseNote
    : baseNote;
}

function renderMemberJoinTrendPayload(payload, filters = {}) {
  const trendRows = Array.isArray(payload?.trend) ? payload.trend : [];
  const regionCounts = Array.isArray(payload?.regionCounts) ? payload.regionCounts : [];
  const prefectureCounts = Array.isArray(payload?.prefectureCounts) ? payload.prefectureCounts : [];
  const granularity = filters.granularity === "week" ? "週次" : "月次";
  const filterParts = [
    filters.prefecture ? `Prefecture contains "${filters.prefecture}"` : null,
    filters.joinedFrom ? `From ${filters.joinedFrom}` : null,
    filters.joinedTo ? `To ${filters.joinedTo}` : null,
    filters.membershipStatus ? `Status = ${filters.membershipStatus}` : null
  ].filter(Boolean);

  filterSummary.textContent =
    filterParts.length > 0
      ? `${filterParts.join(" / ")} | 2026-01-01以降の${granularity}加入推移`
      : `2026-01-01以降の${granularity}加入推移`;

  if (state.chartModes.filterChart === "pie") {
    renderPieChart(
      filterChart,
      trendRows.map((row) => ({
        label: formatBucket(row.bucket).display,
        count: row.count
      })),
      "joins"
    );
  } else if (state.chartModes.filterChart === "bar") {
    renderBarChart(filterChart, trendRows, "joins");
  } else {
    renderLineTimeline(filterChart, trendRows, "Filtered membership purchases");
  }

  if (state.chartModes.memberRegionChart === "pie") {
    renderPieChart(memberRegionChart, regionCounts, "memberships");
  } else if (state.chartModes.memberRegionChart === "line") {
    renderLineTimeline(
      memberRegionChart,
      regionCounts.map((row, index) => ({ bucket: `${String(index + 1).padStart(2, "0")}-${row.label}`, count: row.count })),
      "Memberships by region"
    );
  } else {
    renderBarChart(memberRegionChart, regionCounts, "memberships");
  }

  if (state.chartModes.memberPrefectureChart === "pie") {
    renderPieChart(memberPrefectureChart, prefectureCounts.slice(0, 7), "memberships");
  } else if (state.chartModes.memberPrefectureChart === "line") {
    renderLineTimeline(
      memberPrefectureChart,
      prefectureCounts.slice(0, 7).map((row, index) => ({ bucket: `${String(index + 1).padStart(2, "0")}-${row.label}`, count: row.count })),
      "Memberships by prefecture"
    );
  } else {
    renderBarChart(memberPrefectureChart, prefectureCounts.slice(0, 7), "memberships");
  }
}

function renderTimeline(container, rows, unitLabel = "records") {
  const max = Math.max(...rows.map((row) => Number(row.count) || 0), 1);
  container.innerHTML = rows
    .map((row) => {
      const width = `${Math.max((Number(row.count) / max) * 100, 5)}%`;
      const bucket = formatBucket(row.bucket || row.label);
      return `
        <article class="timeline-item" ${bucket.detail ? `title="${bucket.detail}"` : ""}>
          <div class="chart-row-head">
            <strong>${bucket.display}</strong>
            <span class="muted">${formatNumber(row.count)} ${unitLabel}</span>
          </div>
          <div class="timeline-bar-track">
            <div class="timeline-bar-fill" style="width:${width}"></div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderLineTimeline(container, rows, label = "Trend") {
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state"><p>No data</p></div>';
    return;
  }

  const chartRows = [...rows].sort((left, right) => (left.bucket || "").localeCompare(right.bucket || ""));
  const width = 760;
  const height = 240;
  const padding = { top: 24, right: 24, bottom: 44, left: 44 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(...chartRows.map((row) => Number(row.count) || 0), 1);

  const points = chartRows.map((row, index) => {
    const bucket = formatBucket(row.bucket);
    const isWeekly = Boolean(bucket.detail);
    const x =
      chartRows.length === 1
        ? padding.left + innerWidth / 2
        : padding.left + (innerWidth / (chartRows.length - 1)) * index;
    const y = padding.top + innerHeight - ((Number(row.count) || 0) / max) * innerHeight;
    return {
      ...row,
      x,
      y,
      formattedBucket: bucket.display,
      bucketDetail: bucket.detail,
      isWeekly
    };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");
  const area = [
    `${points[0].x},${height - padding.bottom}`,
    ...points.map((point) => `${point.x},${point.y}`),
    `${points.at(-1).x},${height - padding.bottom}`
  ].join(" ");

  const yAxisTicks = Array.from({ length: 4 }, (_, index) => {
    const value = Math.round((max / 3) * (3 - index));
    const y = padding.top + (innerHeight / 3) * index;
    return { value, y };
  });

  container.innerHTML = `
    <div class="line-chart-card">
      <svg viewBox="0 0 ${width} ${height}" class="line-chart" role="img" aria-label="${label}">
        ${yAxisTicks
          .map(
            (tick) => `
              <line x1="${padding.left}" y1="${tick.y}" x2="${width - padding.right}" y2="${tick.y}" class="chart-grid-line"></line>
              <text x="${padding.left - 10}" y="${tick.y + 4}" text-anchor="end" class="chart-axis-label">${formatNumber(tick.value)}</text>
            `
          )
          .join("")}
        <polygon points="${area}" class="chart-area"></polygon>
        <polyline points="${polyline}" class="chart-line"></polyline>
        ${points
          .map(
            (point) => `
              <circle cx="${point.x}" cy="${point.y}" r="5" class="chart-point">
                <title>${point.bucketDetail || point.formattedBucket}</title>
              </circle>
              <text x="${point.x}" y="${point.y - 12}" text-anchor="middle" class="chart-point-label">${formatNumber(point.count)}</text>
              <text
                x="${point.x}"
                y="${height - padding.bottom + 22}"
                text-anchor="${point.isWeekly ? "start" : "middle"}"
                class="chart-axis-label ${point.isWeekly ? "chart-axis-label-angled" : ""}"
                transform="${point.isWeekly ? `rotate(45 ${point.x} ${height - padding.bottom + 22})` : ""}"
              >
                <title>${point.bucketDetail || point.formattedBucket}</title>
                ${point.formattedBucket}
              </text>
            `
          )
          .join("")}
      </svg>
    </div>
  `;
}

function renderBarChart(container, rows, unitLabel = "records") {
  if (!rows.length) {
    container.innerHTML = '<div class="empty-state"><p>No data</p></div>';
    return;
  }

  const chartRows = [...rows];
  const max = Math.max(...chartRows.map((row) => Number(row.count) || 0), 1);
  container.innerHTML = chartRows
    .map((row) => {
      const width = `${Math.max((Number(row.count) / max) * 100, 4)}%`;
      const bucket = formatBucket(row.bucket || row.label);
      return `
        <article class="timeline-item" ${bucket.detail ? `title="${bucket.detail}"` : ""}>
          <div class="chart-row-head">
            <strong>${bucket.display}</strong>
            <span class="muted">${formatNumber(row.count)} ${unitLabel}</span>
          </div>
          <div class="timeline-bar-track">
            <div class="timeline-bar-fill" style="width:${width}"></div>
          </div>
        </article>
      `;
    })
    .join("");
}

function renderPieChart(container, rows = [], unitLabel = "records") {
  if (!Array.isArray(rows) || !rows.length) {
    container.innerHTML = '<div class="empty-state"><p>No data</p></div>';
    return;
  }

  const total = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const radius = 72;
  const circumference = 2 * Math.PI * radius;
  const palette = ["#6fe6ff", "#ff8757", "#ffd17d", "#7cf29a", "#c49bff", "#ff6fb5", "#a7b7ff", "#7dd3fc"];

  let offset = 0;
  const segments = rows
    .map((row, index) => {
      const count = Number(row.count) || 0;
      const ratio = total > 0 ? count / total : 0;
      const dash = `${ratio * circumference} ${circumference}`;
      const color = palette[index % palette.length];
      const tooltip = `${row.label}: ${formatNumber(count)} ${unitLabel}`;
      const markup = `
        <circle
          cx="100"
          cy="100"
          r="${radius}"
          fill="none"
          stroke="${color}"
          stroke-width="24"
          stroke-dasharray="${dash}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 100 100)"
          class="pie-segment"
          data-tooltip="${tooltip}"
        ></circle>
      `;
      offset += ratio * circumference;
      return markup;
    })
    .join("");

  container.innerHTML = `
    <div class="pie-layout">
      <svg viewBox="0 0 200 200" class="pie-chart" role="img" aria-label="${unitLabel} breakdown">
        <circle cx="100" cy="100" r="${radius}" fill="none" stroke="rgba(255,255,255,0.08)" stroke-width="24"></circle>
        ${segments}
        <text x="100" y="90" text-anchor="middle" class="pie-center-label">Total</text>
        <text x="100" y="116" text-anchor="middle" class="pie-center-value">${formatNumber(total)}</text>
      </svg>
      <div class="pie-legend">
        ${rows
          .map((row, index) => {
            const count = Number(row.count) || 0;
            const ratio = total > 0 ? Math.round((count / total) * 100) : 0;
            const color = palette[index % palette.length];
            const tooltip = `${row.label}: ${formatNumber(count)} ${unitLabel}`;
            return `
              <div class="pie-legend-row" data-tooltip="${tooltip}">
                <span class="pie-swatch" style="background:${color}"></span>
                <span class="pie-legend-label">${row.label}</span>
                <strong>${formatNumber(count)}</strong>
                <span class="muted">${ratio}%</span>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function renderSummaryList(container, rows, emptyLabel = "No data") {
  if (!rows.length) {
    container.innerHTML = `<div class="muted">${emptyLabel}</div>`;
    return;
  }

  container.innerHTML = rows
    .map(
      (row) => `
        <div class="summary-list-row${row.special === "backstage" ? " summary-list-row--backstage" : ""}">
          <span>
            ${row.label}
            ${row.note ? `<small class="summary-subnote">${row.note}</small>` : ""}
          </span>
          <strong>${row.displayCount || formatNumber(row.count)}</strong>
        </div>
      `
    )
    .join("");
}

function renderInsightTotals(totals) {
  eventTotals.innerHTML = `
    <article class="summary-card event-total-card total-entries-card">
      <p class="section-label">Selected Event</p>
      <strong>${formatNumber(totals.totalEntries || 0)}</strong>
      <span>総エントリー数</span>
    </article>
    <article class="summary-card event-total-card unique-participants-card">
      <p class="section-label">Unique Participants</p>
      <strong>${formatNumber(totals.uniqueParticipants || 0)}</strong>
      <span>ユニーク参加人数</span>
    </article>
    <article class="summary-card event-total-card revenue-card">
      <p class="section-label">Entry Revenue</p>
      <strong>${formatCurrency(totals.entryRevenue || 0)}</strong>
      <span>コンテストエントリー売上</span>
    </article>
    <article class="summary-card event-total-card revenue-card">
      <p class="section-label">Spectator Revenue</p>
      <strong>${formatCurrency(totals.spectatorRevenue || 0)}</strong>
      <span>観戦チケット売上</span>
    </article>
    <article class="summary-card event-total-card revenue-card">
      <p class="section-label">Backstage Revenue</p>
      <strong>${formatCurrency(totals.backstageRevenue || 0)}</strong>
      <span>バックステージパス売上</span>
    </article>
    <article class="summary-card event-total-card total-revenue-card">
      <p class="section-label">Total Revenue</p>
      <strong>${formatCurrency(totals.totalRevenue || 0)}</strong>
      <span>イベント総売上</span>
    </article>
  `;
}

function renderSpectatorTotals(totals) {
  spectatorTotals.innerHTML = `
    <article class="summary-card event-total-card total-entries-card">
      <p class="section-label">Selected Event</p>
      <strong>${formatNumber(totals.totalTickets || 0)}</strong>
      <span>総観戦チケット数</span>
    </article>
    <article class="summary-card event-total-card unique-participants-card">
      <p class="section-label">Unique Spectators</p>
      <strong>${formatNumber(totals.uniqueSpectators || 0)}</strong>
      <span>ユニーク観戦者数</span>
    </article>
    <article class="summary-card event-total-card revenue-card">
      <p class="section-label">Ticket Revenue</p>
      <strong>${formatCurrency(totals.ticketRevenue || 0)}</strong>
      <span>観戦チケット売上</span>
    </article>
    <article class="summary-card event-total-card">
      <p class="section-label">Order Count</p>
      <strong>${formatNumber(totals.totalOrders || 0)}</strong>
      <span>観戦チケット注文数</span>
    </article>
    <article class="summary-card event-total-card">
      <p class="section-label">Avg Tickets / Order</p>
      <strong>${(Number(totals.averageTicketsPerOrder || 0)).toFixed(1)}</strong>
      <span>1注文あたりチケット枚数</span>
    </article>
    <article class="summary-card event-total-card total-revenue-card">
      <p class="section-label">Avg Revenue / Order</p>
      <strong>${formatCurrency(totals.averageRevenuePerOrder || 0)}</strong>
      <span>1注文あたり売上</span>
    </article>
  `;
}

function buildMemberQuery(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value && key !== "chartType") {
      params.set(key, value);
    }
  });
  return params.toString();
}

async function loadMemberJoinTrend(filters = {}) {
  const payload = await fetchJson(`/api/member-joins?${buildMemberQuery(filters)}`);
  state.memberJoinPayload = payload;
  renderMemberJoinTrendPayload(payload, filters);
}

async function loadOverview(filters = {}) {
  const payload = await fetchJson(`/api/dashboard?${buildMemberQuery(filters)}`);
  state.dashboardPayload = payload;
  renderSummary(payload);
}

function renderCustomers(customers = []) {
  state.customersPayload = customers;
  const visibleColumns = getVisibleCustomerColumns();

  const summaryParts = [
    `${formatNumber(customers.length)} records`,
    state.customerFilters.audienceType ? `Attendee = ${state.customerFilters.audienceType}` : null,
    state.activeFilters.prefecture ? `Prefecture contains "${state.activeFilters.prefecture}"` : null,
    state.activeFilters.region ? `Region = ${state.activeFilters.region}` : null,
    state.activeFilters.joinedFrom ? `From ${state.activeFilters.joinedFrom}` : null,
    state.activeFilters.joinedTo ? `To ${state.activeFilters.joinedTo}` : null,
    state.activeFilters.ageBand ? `Age band = ${state.activeFilters.ageBand}` : null,
    state.customerFilters.audienceType !== "spectator" && state.activeFilters.membershipStatus
      ? `Status = ${state.activeFilters.membershipStatus}`
      : null,
    state.customerFilters.contestName ? `Contest = ${state.customerFilters.contestName}` : null
  ].filter(Boolean);

  customerTableSummary.textContent = summaryParts.join(" / ");
  customerTableHead.innerHTML = `<tr>${visibleColumns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr>`;

  if (!customers.length) {
    customerTableBody.innerHTML = `<tr><td colspan="${visibleColumns.length}" class="table-empty">No customer records</td></tr>`;
    return;
  }

  customerTableBody.innerHTML = customers
    .map(
      (customer) => `
        <tr>
          ${visibleColumns
            .map((column) => {
              const value = column.render(customer);
              const cellClass = column.className ? ` class="${column.className}"` : "";
              if (column.isStatus) {
                return `<td${cellClass}><span class="status-pill">${escapeHtml(value)}</span></td>`;
              }
              return `<td${cellClass}>${escapeHtml(value)}</td>`;
            })
            .join("")}
        </tr>
      `
    )
    .join("");
}

async function loadCustomers(filters = {}) {
  const payload = await fetchJson(`/api/customers?${buildMemberQuery({ ...buildCustomerFilters(filters), take: 100 })}`);
  renderCustomers(payload.customers || []);
}

function renderCustomerColumnOptions() {
  const allChecked = state.visibleCustomerColumns.size === CUSTOMER_COLUMNS.length ? "checked" : "";
  customerColumnOptions.innerHTML = [
    `
      <label class="column-option column-option-all">
        <input type="checkbox" value="__all__" ${allChecked} />
        <span>All Check</span>
      </label>
    `,
    ...CUSTOMER_COLUMNS.map((column) => {
    const checked = state.visibleCustomerColumns.has(column.key) ? "checked" : "";
    return `
      <label class="column-option">
        <input type="checkbox" value="${column.key}" ${checked} />
        <span>${column.label}</span>
      </label>
    `;
  })
  ].join("");
}

function exportCustomersAsCsv(rows = state.customersPayload || []) {
  const visibleColumns = getVisibleCustomerColumns();
  const header = visibleColumns.map((column) => column.label);
  const dataRows = rows.map((customer) =>
    visibleColumns.map((column) => {
      const value = column.render(customer);
      return value == null ? "" : String(value);
    })
  );
  const csvLines = [header, ...dataRows].map((row) =>
    row
      .map((value) => `"${String(value).replaceAll('"', '""')}"`)
      .join(",")
  );
  const blob = new Blob([`\uFEFF${csvLines.join("\n")}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = buildCustomerExportFilename();
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function renderEventOptions(events) {
  state.eventOptions = events;

  // Default to the next upcoming event (first with eventDate >= today), falling back to first
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const defaultEvent =
    events.find((e) => e.eventDate && new Date(e.eventDate) >= today) ?? events[0];

  eventSelect.innerHTML = events
    .map((event) => {
      const selected = !state.selectedEventName && event === defaultEvent ? "selected" : "";
      return `<option value="${event.eventName}" ${selected}>${event.eventName}</option>`;
    })
    .join("");

  spectatorEventSelect.innerHTML = events
    .map((event) => {
      const selected = !state.selectedSpectatorEventName && event === defaultEvent ? "selected" : "";
      return `<option value="${event.eventName}" ${selected}>${event.eventName}</option>`;
    })
    .join("");

  if (!state.selectedEventName && defaultEvent) {
    state.selectedEventName = defaultEvent.eventName;
  }
  if (!state.selectedSpectatorEventName && defaultEvent) {
    state.selectedSpectatorEventName = defaultEvent.eventName;
  }
  if (state.selectedEventName) {
    eventSelect.value = state.selectedEventName;
  }
  if (state.selectedSpectatorEventName) {
    spectatorEventSelect.value = state.selectedSpectatorEventName;
  }

  customerContestFilter.innerHTML = [
    '<option value="">All contests</option>',
    ...events.map((event) => `<option value="${escapeHtml(event.eventName)}">${escapeHtml(event.eventName)}</option>`)
  ].join("");
  customerContestFilter.value = state.customerFilters.contestName || "";
  customerAudienceFilter.value = state.customerFilters.audienceType || "";
}

async function loadEventInsights(eventName) {
  if (!eventName) return;

  const payload = await fetchJson(`/api/event-insights?eventName=${encodeURIComponent(eventName)}`);
  state.eventInsightsPayload = payload;
  selectedEventTitle.textContent = eventName;
  renderInsightTotals(payload.totals);
  renderSummaryList(categorySummary, payload.categoryCounts, "No categories");
  renderSummaryList(genderSummary, payload.genderCounts);
  renderSummaryList(ageSummary, payload.ageBandCounts.filter((row) => row.count > 0));
  renderSummaryList(prefectureSummary, payload.prefectureCounts.slice(0, 8));
  renderSummaryList(regionSummary, payload.regionCounts);
  renderLineTimeline(eventsList, payload.weeklyEntries, `${eventName} weekly entries`);
  renderPieChart(
    categoryChart,
    payload.categoryCounts.map((row) => ({ label: row.label, count: row.count })),
    "entries"
  );
  renderPieChart(
    genderChart,
    payload.genderCounts.map((row) => ({ label: row.label, count: row.count })),
    "people"
  );
  renderPieChart(
    ageChart,
    payload.ageBandCounts.map((row) => ({ label: row.label, count: row.count })),
    "people"
  );
  renderPieChart(
    prefectureChart,
    payload.prefectureCounts.slice(0, 8).map((row) => ({ label: row.label, count: row.count })),
    "people"
  );
  renderPieChart(
    regionChart,
    payload.regionCounts.map((row) => ({ label: row.label, count: row.count })),
    "people"
  );
}

async function loadSpectatorInsights(eventName) {
  if (!eventName) return;

  const payload = await fetchJson(`/api/spectator-insights?eventName=${encodeURIComponent(eventName)}`);
  state.spectatorInsightsPayload = payload;
  selectedSpectatorEventTitle.textContent = eventName;
  renderSpectatorTotals(payload.totals);
  renderSummaryList(
    spectatorCategorySummary,
    payload.categoryCounts.map((row) => ({
      ...row,
      note: row.upgradeCount > 0
        ? `UPGRADE ${formatNumber(row.upgradeCount)}`
        : row.sourceReduction > 0
          ? `(-${formatNumber(row.sourceReduction)})`
          : "",
      displayCount: formatNumber(row.count)
    })),
    "No ticket categories"
  );
  renderSummaryList(spectatorGenderSummary, payload.genderCounts);
  renderSummaryList(spectatorAgeSummary, payload.ageBandCounts.filter((row) => row.count > 0));
  renderSummaryList(spectatorPrefectureSummary, payload.prefectureCounts.slice(0, 8));
  renderSummaryList(spectatorRegionSummary, payload.regionCounts);

  if (state.chartModes.spectatorEventsList === "pie") {
    renderPieChart(
      spectatorEventsList,
      payload.weeklyEntries.map((row) => ({
        label: formatBucket(row.bucket).display,
        count: row.count
      })),
      "tickets"
    );
  } else if (state.chartModes.spectatorEventsList === "bar") {
    renderBarChart(spectatorEventsList, payload.weeklyEntries, "tickets");
  } else {
    renderLineTimeline(spectatorEventsList, payload.weeklyEntries, `${eventName} weekly tickets`);
  }

  const spectatorCategoryRows = payload.categoryCounts.map((row) => ({ label: row.label, count: row.count }));
  const spectatorGenderRows = payload.genderCounts.map((row) => ({ label: row.label, count: row.count }));
  const spectatorAgeRows = payload.ageBandCounts.map((row) => ({ label: row.label, count: row.count }));
  const spectatorPrefectureRows = payload.prefectureCounts.slice(0, 8).map((row) => ({ label: row.label, count: row.count }));
  const spectatorRegionRows = payload.regionCounts.map((row) => ({ label: row.label, count: row.count }));

  if (state.chartModes.spectatorCategoryChart === "line") {
    renderLineTimeline(
      spectatorCategoryChart,
      spectatorCategoryRows.map((row, index) => ({ bucket: `${String(index + 1).padStart(2, "0")}-${row.label}`, count: row.count })),
      "Spectator tickets by category"
    );
  } else if (state.chartModes.spectatorCategoryChart === "bar") {
    renderBarChart(spectatorCategoryChart, spectatorCategoryRows, "tickets");
  } else {
    renderPieChart(spectatorCategoryChart, spectatorCategoryRows, "tickets");
  }

  if (state.chartModes.spectatorGenderChart === "line") {
    renderLineTimeline(
      spectatorGenderChart,
      spectatorGenderRows.map((row, index) => ({ bucket: `${String(index + 1).padStart(2, "0")}-${row.label}`, count: row.count })),
      "Spectators by gender"
    );
  } else if (state.chartModes.spectatorGenderChart === "bar") {
    renderBarChart(spectatorGenderChart, spectatorGenderRows, "people");
  } else {
    renderPieChart(spectatorGenderChart, spectatorGenderRows, "people");
  }

  if (state.chartModes.spectatorAgeChart === "line") {
    renderLineTimeline(
      spectatorAgeChart,
      spectatorAgeRows.map((row, index) => ({ bucket: `${String(index + 1).padStart(2, "0")}-${row.label}`, count: row.count })),
      "Spectators by age band"
    );
  } else if (state.chartModes.spectatorAgeChart === "bar") {
    renderBarChart(spectatorAgeChart, spectatorAgeRows, "people");
  } else {
    renderPieChart(spectatorAgeChart, spectatorAgeRows, "people");
  }

  if (state.chartModes.spectatorPrefectureChart === "line") {
    renderLineTimeline(
      spectatorPrefectureChart,
      spectatorPrefectureRows.map((row, index) => ({ bucket: `${String(index + 1).padStart(2, "0")}-${row.label}`, count: row.count })),
      "Spectators by prefecture"
    );
  } else if (state.chartModes.spectatorPrefectureChart === "bar") {
    renderBarChart(spectatorPrefectureChart, spectatorPrefectureRows, "people");
  } else {
    renderPieChart(spectatorPrefectureChart, spectatorPrefectureRows, "people");
  }

  if (state.chartModes.spectatorRegionChart === "line") {
    renderLineTimeline(
      spectatorRegionChart,
      spectatorRegionRows.map((row, index) => ({ bucket: `${String(index + 1).padStart(2, "0")}-${row.label}`, count: row.count })),
      "Spectators by region"
    );
  } else if (state.chartModes.spectatorRegionChart === "bar") {
    renderBarChart(spectatorRegionChart, spectatorRegionRows, "people");
  } else {
    renderPieChart(spectatorRegionChart, spectatorRegionRows, "people");
  }
}

async function loadDashboard() {
  try {
    const [dashboardPayload, eventOptionsPayload] = await Promise.all([
      fetchJson(`/api/dashboard?${buildMemberQuery(state.activeFilters)}`),
      fetchJson("/api/event-options"),
      loadSyncStatus()
    ]);

    renderSummary(dashboardPayload);
    state.dashboardPayload = dashboardPayload;
    renderEventOptions(eventOptionsPayload.events);
    await Promise.all([
      loadMemberJoinTrend(state.activeFilters),
      loadCustomers(state.activeFilters),
      loadEventInsights(state.selectedEventName),
      loadSpectatorInsights(state.selectedSpectatorEventName)
    ]);
  } catch (error) {
    summaryCards.innerHTML = `<div class="error-state"><p>${error.message}</p></div>`;
  }
}

function buildReportTable(rows, valueFormatter = formatNumber) {
  if (!Array.isArray(rows) || !rows.length) {
    return '<p class="report-empty">No data</p>';
  }

  return `
    <table class="report-table">
      <tbody>
        ${rows
          .map(
            (row) => `
              <tr>
                <th>${escapeHtml(row.label)}</th>
                <td>${escapeHtml(valueFormatter(row.count))}</td>
              </tr>
            `
          )
          .join("")}
      </tbody>
    </table>
  `;
}

function buildTrendTable(rows, label) {
  if (!Array.isArray(rows) || !rows.length) {
    return '<p class="report-empty">No data</p>';
  }

  return `
    <table class="report-table">
      <thead>
        <tr>
          <th>${escapeHtml(label)}</th>
          <th>Count</th>
        </tr>
      </thead>
      <tbody>
        ${rows
          .map((row) => {
            const bucket = formatBucket(row.bucket || row.label);
            return `
              <tr>
                <th title="${escapeHtml(bucket.detail || "")}">${escapeHtml(bucket.display)}</th>
                <td>${escapeHtml(formatNumber(row.count))}</td>
              </tr>
            `;
          })
          .join("")}
      </tbody>
    </table>
  `;
}

function buildSummaryCardsHtml(summary) {
  const cards = [
    ["Total Members", summary.totals.totalMembers, "All analyzed members", "number"],
    ["Active Members", summary.totals.activeMembers, "Active status only", "number"],
    ["Event Entries", summary.totals.totalEventEntries, "Applied entries", "number"],
    ["Membership Purchases", summary.totals.totalMembershipPurchases, "Active membership buys", "number"],
    ["Membership Revenue", summary.totals.membershipRevenue, "Membership sales", "currency"],
    ["Entry Revenue", summary.totals.eventEntryRevenue, "Contest entry sales", "currency"],
    ["Spectator Tickets", summary.totals.spectatorCount, "Ticket headcount", "number"],
    ["Spectator Revenue", summary.totals.spectatorRevenue, "Ticket sales", "currency"],
    ["Backstage Passes", summary.totals.backstagePassCount, "Pass headcount", "number"],
    ["Backstage Revenue", summary.totals.backstagePassRevenue, "Pass sales", "currency"]
  ];

  return cards
    .map(
      ([label, value, note, format]) => `
        <article class="report-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(format === "currency" ? formatCurrency(value) : formatNumber(value))}</strong>
          <small>${escapeHtml(note)}</small>
        </article>
      `
    )
    .join("");
}

function buildOverviewCardsHtml(summary) {
  const cards = [
    ["Membership", formatNumber(summary.totals.totalMembershipPurchases), "Quantity", "Membership sales", formatCurrency(summary.totals.membershipRevenue)],
    ["Contest Entry", formatNumber(summary.totals.totalEventEntries), "Quantity", "Contest entry sales", formatCurrency(summary.totals.eventEntryRevenue || 0)],
    ["Backstage Pass", formatNumber(summary.totals.backstagePassCount), "Quantity", "Pass sales", formatCurrency(summary.totals.backstagePassRevenue)],
    ["Spectator Ticket", formatNumber(summary.totals.spectatorCount), "Quantity", "Ticket sales", formatCurrency(summary.totals.spectatorRevenue)]
  ];

  return cards
    .map(
      ([label, quantity, quantityLabel, revenueLabel, revenue]) => `
        <article class="report-overview-card">
          <span>${escapeHtml(label)}</span>
          <div class="report-overview-metric">
            <small>${escapeHtml(quantityLabel)}</small>
            <strong>${escapeHtml(quantity)}</strong>
          </div>
          <div class="report-overview-metric">
            <small>${escapeHtml(revenueLabel)}</small>
            <strong>${escapeHtml(revenue)}</strong>
          </div>
        </article>
      `
    )
    .join("");
}

function buildEventTotalsHtml(totals) {
  const cards = [
    ["Total Entries", formatNumber(totals.totalEntries || 0), "All entry orders"],
    ["Unique Participants", formatNumber(totals.uniqueParticipants || 0), "Unique people"],
    ["Entry Revenue", formatCurrency(totals.entryRevenue || 0), "Contest entry sales"],
    ["Spectator Revenue", formatCurrency(totals.spectatorRevenue || 0), "Ticket sales"],
    ["Backstage Revenue", formatCurrency(totals.backstageRevenue || 0), "Pass sales"],
    ["Total Revenue", formatCurrency(totals.totalRevenue || 0), "All event sales"]
  ];

  return cards
    .map(
      ([label, value, note]) => `
        <article class="report-card">
          <span>${escapeHtml(label)}</span>
          <strong>${escapeHtml(value)}</strong>
          <small>${escapeHtml(note)}</small>
        </article>
      `
    )
    .join("");
}

function buildFiltersSummary(filters) {
  const labels = [];
  if (filters.prefecture) {
    labels.push(`Prefecture contains "${filters.prefecture}"`);
  }
  if (filters.joinedFrom) {
    labels.push(`From ${filters.joinedFrom}`);
  }
  if (filters.joinedTo) {
    labels.push(`To ${filters.joinedTo}`);
  }
  if (filters.ageBand) {
    labels.push(`Age band = ${filters.ageBand}`);
  }
  if (filters.membershipStatus) {
    labels.push(`Status = ${filters.membershipStatus}`);
  }
  labels.push(`Granularity = ${filters.granularity === "week" ? "Weekly" : "Monthly"}`);
  return labels.join(" / ");
}

function buildReportLineChart(rows, label) {
  if (!Array.isArray(rows) || !rows.length) {
    return '<p class="report-empty">No data</p>';
  }

  const chartRows = [...rows].sort((left, right) => String(left.bucket || left.label).localeCompare(String(right.bucket || right.label)));
  const width = 560;
  const height = 220;
  const padding = { top: 18, right: 18, bottom: 56, left: 38 };
  const innerWidth = width - padding.left - padding.right;
  const innerHeight = height - padding.top - padding.bottom;
  const max = Math.max(...chartRows.map((row) => Number(row.count) || 0), 1);

  const points = chartRows.map((row, index) => {
    const bucket = formatBucket(row.bucket || row.label);
    const x =
      chartRows.length === 1
        ? padding.left + innerWidth / 2
        : padding.left + (innerWidth / (chartRows.length - 1)) * index;
    const y = padding.top + innerHeight - ((Number(row.count) || 0) / max) * innerHeight;
    return {
      x,
      y,
      count: Number(row.count) || 0,
      label: bucket.display,
      detail: bucket.detail || bucket.display
    };
  });

  const polyline = points.map((point) => `${point.x},${point.y}`).join(" ");

  return `
    <svg viewBox="0 0 ${width} ${height}" class="report-line-chart" role="img" aria-label="${escapeHtml(label)}">
      <line x1="${padding.left}" y1="${height - padding.bottom}" x2="${width - padding.right}" y2="${height - padding.bottom}" stroke="#cbd5e1" stroke-width="1.2" />
      <line x1="${padding.left}" y1="${padding.top}" x2="${padding.left}" y2="${height - padding.bottom}" stroke="#cbd5e1" stroke-width="1.2" />
      <polyline fill="none" stroke="#2563eb" stroke-width="3" points="${polyline}" />
      ${points
        .map(
          (point) => `
            <circle cx="${point.x}" cy="${point.y}" r="4" fill="#2563eb">
              <title>${escapeHtml(`${point.detail}: ${formatNumber(point.count)}`)}</title>
            </circle>
            <text x="${point.x}" y="${point.y - 10}" text-anchor="middle" class="report-point-label">${escapeHtml(formatNumber(point.count))}</text>
            <text x="${point.x}" y="${height - 18}" text-anchor="end" transform="rotate(-35 ${point.x} ${height - 18})" class="report-axis-label">${escapeHtml(point.label)}</text>
          `
        )
        .join("")}
    </svg>
  `;
}

function buildReportBarList(rows, unitLabel = "") {
  if (!Array.isArray(rows) || !rows.length) {
    return '<p class="report-empty">No data</p>';
  }

  const max = Math.max(...rows.map((row) => Number(row.count) || 0), 1);
  return `
    <div class="report-bar-list">
      ${rows
        .map((row) => {
          const width = Math.max(((Number(row.count) || 0) / max) * 100, 4);
          return `
            <div class="report-bar-row">
              <div class="report-bar-head">
                <span>${escapeHtml(row.label)}</span>
                <strong>${escapeHtml(formatNumber(row.count))}${unitLabel ? ` ${escapeHtml(unitLabel)}` : ""}</strong>
              </div>
              <div class="report-bar-track">
                <div class="report-bar-fill" style="width:${width}%"></div>
              </div>
            </div>
          `;
        })
        .join("")}
    </div>
  `;
}

function buildReportPieChart(rows = [], unitLabel = "records") {
  if (!Array.isArray(rows) || !rows.length) {
    return '<p class="report-empty">No data</p>';
  }

  const total = rows.reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const radius = 54;
  const circumference = 2 * Math.PI * radius;
  const palette = ["#6fe6ff", "#ff8757", "#ffd17d", "#7cf29a", "#c49bff", "#ff6fb5", "#a7b7ff", "#7dd3fc"];

  let offset = 0;
  const segments = rows
    .map((row, index) => {
      const count = Number(row.count) || 0;
      const ratio = total > 0 ? count / total : 0;
      const dash = `${ratio * circumference} ${circumference}`;
      const color = palette[index % palette.length];
      const markup = `
        <circle
          cx="90"
          cy="90"
          r="${radius}"
          fill="none"
          stroke="${color}"
          stroke-width="20"
          stroke-dasharray="${dash}"
          stroke-dashoffset="${-offset}"
          transform="rotate(-90 90 90)"
        ></circle>
      `;
      offset += ratio * circumference;
      return markup;
    })
    .join("");

  return `
    <div class="report-pie-layout">
      <svg viewBox="0 0 180 180" class="report-pie-chart" role="img" aria-label="${escapeHtml(unitLabel)} breakdown">
        <circle cx="90" cy="90" r="${radius}" fill="none" stroke="#243244" stroke-width="20"></circle>
        ${segments}
        <text x="90" y="82" text-anchor="middle" class="report-pie-center-label">Total</text>
        <text x="90" y="104" text-anchor="middle" class="report-pie-center-value">${escapeHtml(formatNumber(total))}</text>
      </svg>
      <div class="report-pie-legend">
        ${rows
          .map((row, index) => {
            const count = Number(row.count) || 0;
            const ratio = total > 0 ? Math.round((count / total) * 100) : 0;
            const color = palette[index % palette.length];
            return `
              <div class="report-pie-legend-row">
                <span class="report-pie-swatch" style="background:${color}"></span>
                <span class="report-pie-label">${escapeHtml(row.label)}</span>
                <strong>${escapeHtml(formatNumber(count))}</strong>
                <span>${escapeHtml(`${ratio}%`)}</span>
              </div>
            `;
          })
          .join("")}
      </div>
    </div>
  `;
}

function buildContestReportSection(eventName, event) {
  return `
    <section class="report-page report-page-break">
      <div class="report-section">
        <h2>Contest Details</h2>
        <div class="report-block" style="margin-bottom:6px;">
          <p class="report-kicker">Selected Contest</p>
          <p>${escapeHtml(eventName || "No event selected")}</p>
        </div>
        <div class="report-grid-6">
          ${buildEventTotalsHtml(event.totals || {})}
        </div>
        <div class="report-grid-2" style="margin-top:6px;">
          <article class="report-block">
            <p class="report-kicker">Weekly Entry Timing</p>
            ${buildReportLineChart(event.weeklyEntries || [], "Weekly entry timing")}
          </article>
          <article class="report-block">
            <p class="report-kicker">Prefectures</p>
            ${buildReportPieChart((event.prefectureCounts || []).slice(0, 8), "people")}
          </article>
        </div>
        <div class="report-grid-4" style="margin-top:6px;">
          <article class="report-block">
            <p class="report-kicker">Entry Categories</p>
            ${buildReportPieChart(event.categoryCounts || [], "entries")}
          </article>
          <article class="report-block">
            <p class="report-kicker">Gender</p>
            ${buildReportPieChart(event.genderCounts || [], "people")}
          </article>
          <article class="report-block">
            <p class="report-kicker">Age Bands</p>
            ${buildReportPieChart((event.ageBandCounts || []).filter((row) => row.count > 0), "people")}
          </article>
          <article class="report-block">
            <p class="report-kicker">Regions</p>
            ${buildReportPieChart(event.regionCounts || [], "people")}
          </article>
        </div>
      </div>
    </section>
  `;
}

function buildReportHtml(eventReports = []) {
  const summary = state.dashboardPayload;
  const member = state.memberJoinPayload;
  const generatedAt = buildReportFilename();
  const lastUpdated = state.syncStatus?.lastUpdatedAt ? formatDateTime(state.syncStatus.lastUpdatedAt) : "No sync yet";

  if (!summary || !member || !eventReports.length) {
    return null;
  }

  const reportTitle =
    eventReports.length === 1
      ? eventReports[0].eventName || "FWJ Contest Report"
      : "FWJ Contest Report";

  return `
    <!DOCTYPE html>
    <html lang="ja">
      <head>
        <meta charset="utf-8" />
        <title>${escapeHtml(generatedAt)}</title>
        <style>
          @page { size: A4 portrait; margin: 0; }
          * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          html {
            background: transparent;
          }
          body {
            margin: 0;
            color: #edf3fa;
            background: transparent;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
            font-size: 9.6pt;
            line-height: 1.3;
            position: relative;
          }
          body::before {
            content: "";
            position: fixed;
            inset: 0;
            z-index: -1;
            background:
              radial-gradient(circle at top left, rgba(255, 135, 87, 0.22), transparent 30%),
              radial-gradient(circle at top right, rgba(255, 209, 125, 0.14), transparent 20%),
              linear-gradient(180deg, #0d1116 0%, #131922 100%);
          }
          .report-shell {
            display: grid;
            gap: 0;
            padding: 0;
          }
          .report-page {
            display: grid;
            align-content: start;
            gap: 10px;
            min-height: 297mm;
            padding: 10mm;
          }
          .report-header {
            display: grid;
            gap: 6px;
            padding-bottom: 8px;
            border-bottom: 2px solid rgba(111, 230, 255, 0.4);
          }
          .report-kicker {
            font-size: 7.5pt;
            font-weight: 700;
            letter-spacing: 0.08em;
            text-transform: uppercase;
            color: #6fe6ff;
          }
          h1, h2, h3, p { margin: 0; }
          h1 { font-size: 18pt; line-height: 1.1; }
          h2 {
            font-size: 12pt;
            line-height: 1.15;
            padding-bottom: 4px;
            border-bottom: 1px solid rgba(153, 169, 187, 0.2);
            margin-bottom: 6px;
          }
          .report-meta {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 6px;
          }
          .report-meta-card,
          .report-card,
          .report-block,
          .report-overview-card {
            border: 1px solid rgba(153, 169, 187, 0.16);
            border-radius: 8px;
            padding: 7px 8px;
            background: rgba(20, 26, 33, 0.92);
          }
          .report-meta-card span,
          .report-card span {
            display: block;
            font-size: 6.8pt;
            color: #99a9bb;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            margin-bottom: 2px;
          }
          .report-card strong,
          .report-meta-card strong {
            font-size: 11pt;
            line-height: 1.15;
          }
          .report-card small {
            display: block;
            margin-top: 3px;
            color: #99a9bb;
            font-size: 6.8pt;
            line-height: 1.15;
          }
          .report-overview-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
          }
          .report-overview-chart-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 8px;
            margin-top: 8px;
          }
          .report-overview-card > span {
            display: block;
            margin-bottom: 8px;
            color: #6fe6ff;
            font-size: 8pt;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
          }
          .report-overview-metric + .report-overview-metric {
            margin-top: 8px;
            padding-top: 8px;
            border-top: 1px solid rgba(153, 169, 187, 0.16);
          }
          .report-overview-metric small {
            display: block;
            color: #99a9bb;
            font-size: 6.8pt;
            margin-bottom: 2px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
          .report-overview-metric strong {
            display: block;
            font-size: 15pt;
            line-height: 1.1;
          }
          .report-grid-3,
          .report-grid-4,
          .report-grid-6 {
            display: grid;
            gap: 6px;
          }
          .report-grid-3 { grid-template-columns: repeat(3, minmax(0, 1fr)); }
          .report-grid-2 {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 6px;
          }
          .report-grid-4 { grid-template-columns: repeat(4, minmax(0, 1fr)); }
          .report-grid-6 { grid-template-columns: repeat(6, minmax(0, 1fr)); }
          .report-table {
            width: 100%;
            border-collapse: collapse;
            font-size: 8pt;
          }
          .report-table th,
          .report-table td {
            border-bottom: 1px solid #e5e7eb;
            padding: 3px 0;
            text-align: left;
            vertical-align: top;
          }
          .report-table td {
            text-align: right;
            white-space: nowrap;
          }
          .report-table th {
            font-weight: 500;
          }
          .report-line-chart {
            width: 100%;
            height: auto;
            display: block;
            max-height: 190px;
          }
          .report-axis-label {
            font-size: 7px;
            fill: #99a9bb;
          }
          .report-point-label {
            font-size: 7px;
            fill: #edf3fa;
            font-weight: 600;
          }
          .report-pie-layout {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
          }
          .report-pie-chart {
            width: 100%;
            max-width: 132px;
            height: auto;
            margin: 0 auto;
          }
          .report-pie-center-label {
            font-size: 8px;
            fill: #99a9bb;
          }
          .report-pie-center-value {
            font-size: 13px;
            font-weight: 700;
            fill: #edf3fa;
          }
          .report-pie-legend {
            display: grid;
            gap: 3px;
          }
          .report-pie-legend-row {
            display: grid;
            grid-template-columns: 10px minmax(0, 1fr) auto auto;
            gap: 5px;
            align-items: center;
            font-size: 7.2pt;
          }
          .report-pie-label {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
          }
          .report-pie-swatch {
            width: 10px;
            height: 10px;
            border-radius: 999px;
            display: inline-block;
          }
          .report-empty {
            color: #99a9bb;
            font-size: 8pt;
          }
          .report-section {
            break-inside: avoid;
            page-break-inside: avoid;
          }
          .report-page-break {
            break-before: page;
            page-break-before: always;
          }
          @media print {
            .report-shell { gap: 0; }
            html, body {
              background: #fff !important;
              color: #111 !important;
            }
            body::before {
              display: none !important;
            }
            .report-page {
              background: #fff !important;
            }
            .report-meta-card,
            .report-card,
            .report-block,
            .report-overview-card {
              background: #fff !important;
              border-color: #ccc !important;
              color: #111 !important;
            }
            .report-meta-card strong,
            .report-card strong,
            .report-overview-metric strong {
              color: #111 !important;
            }
            .report-meta-card span,
            .report-card span,
            .report-card small,
            .report-overview-metric small,
            .report-overview-card > span {
              color: #555 !important;
            }
            .report-kicker {
              color: #0066cc !important;
            }
            h1, h2, h3 {
              color: #111 !important;
            }
            h2 {
              border-bottom-color: #ccc !important;
            }
            .report-header {
              border-bottom-color: #0066cc !important;
            }
            .report-table th,
            .report-table td {
              border-bottom-color: #ddd !important;
              color: #111 !important;
            }
            .report-axis-label {
              fill: #666 !important;
            }
            .report-point-label {
              fill: #111 !important;
            }
            .report-pie-center-label {
              fill: #666 !important;
            }
            .report-pie-center-value {
              fill: #111 !important;
            }
            .report-empty {
              color: #999 !important;
            }
          }
        </style>
      </head>
      <body>
        <main class="report-shell">
          <section class="report-page">
            <header class="report-header report-section">
              <p class="report-kicker">FWJ Contest Report</p>
              <h1>${escapeHtml(reportTitle)}</h1>
              <div class="report-meta">
                <article class="report-meta-card">
                  <span>Generated</span>
                  <strong>${escapeHtml(formatDateTime(new Date().toISOString()))}</strong>
                </article>
                <article class="report-meta-card">
                  <span>Last Sync</span>
                  <strong>${escapeHtml(lastUpdated)}</strong>
                </article>
                <article class="report-meta-card">
                  <span>Display Window</span>
                  <strong>2026-01-01 and later</strong>
                </article>
              </div>
            </header>

            <section class="report-section">
              <h2>Overview Summary</h2>
              <div class="report-overview-grid">
                ${buildOverviewCardsHtml(summary)}
              </div>
              <div class="report-overview-chart-grid">
                <article class="report-block">
                  <p class="report-kicker">Sales By Category</p>
                  ${buildReportPieChart(
                    [
                      { label: "Membership", count: summary.totals.membershipRevenue || 0 },
                      { label: "Contest Entry", count: summary.totals.eventEntryRevenue || 0 },
                      { label: "Backstage Pass", count: summary.totals.backstagePassRevenue || 0 },
                      { label: "Spectator Ticket", count: summary.totals.spectatorRevenue || 0 }
                    ],
                    "JPY"
                  )}
                </article>
                <article class="report-block">
                  <p class="report-kicker">Orders By Category</p>
                  ${buildReportPieChart(
                    [
                      { label: "Membership", count: summary.totals.totalMembershipPurchases || 0 },
                      { label: "Contest Entry", count: summary.totals.totalEventEntries || 0 },
                      { label: "Backstage Pass", count: summary.totals.backstagePassCount || 0 },
                      { label: "Spectator Ticket", count: summary.totals.spectatorCount || 0 }
                    ],
                    "orders"
                  )}
                </article>
              </div>
            </section>
          </section>
          ${eventReports.map((report) => buildContestReportSection(report.eventName, report.payload)).join("")}
        </main>
      </body>
    </html>
  `;
}

syncNowButton.addEventListener("click", async () => {
  syncNowButton.disabled = true;
  syncStatusLabel.textContent = "手動更新を開始しています";

  try {
    await postJson("/api/sync");
    await loadSyncStatus();
    const intervalId = window.setInterval(async () => {
      await loadSyncStatus();
      if (!syncNowButton.disabled) {
        window.clearInterval(intervalId);
        await loadDashboard();
      }
    }, 8000);
  } catch (error) {
    syncStatusLabel.textContent = error.message;
    syncNowButton.disabled = false;
  }
});

exportPdfButton.addEventListener("click", async () => {
  const exportScope = exportScopeSelect?.value || "selected";
  let eventReports = [];

  try {
    if (exportScope === "all") {
      eventReports = await Promise.all(
        state.eventOptions.map(async (eventOption) => ({
          eventName: eventOption.eventName,
          payload: await fetchJson(`/api/event-insights?eventName=${encodeURIComponent(eventOption.eventName)}`)
        }))
      );
    } else if (state.selectedEventName && state.eventInsightsPayload) {
      eventReports = [{ eventName: state.selectedEventName, payload: state.eventInsightsPayload }];
    }
  } catch (error) {
    syncStatusLabel.textContent = error.message;
    return;
  }

  const reportHtml = buildReportHtml(eventReports);
  if (!reportHtml) {
    syncStatusLabel.textContent = "レポート用データの読み込み完了後に再実行してください";
    return;
  }

  const existingFrame = document.querySelector("#printFrame");
  if (existingFrame) {
    existingFrame.remove();
  }

  const printFrame = document.createElement("iframe");
  printFrame.id = "printFrame";
  printFrame.style.position = "fixed";
  printFrame.style.right = "0";
  printFrame.style.bottom = "0";
  printFrame.style.width = "0";
  printFrame.style.height = "0";
  printFrame.style.border = "0";
  printFrame.setAttribute("aria-hidden", "true");

  printFrame.addEventListener("load", () => {
    const previousTitle = document.title;
    document.title = buildReportFilename();
    const cleanup = () => {
      document.title = previousTitle;
      window.setTimeout(() => {
        printFrame.remove();
      }, 1000);
    };

    const frameWindow = printFrame.contentWindow;
    const frameDocument = printFrame.contentDocument;
    if (!frameWindow) {
      syncStatusLabel.textContent = "印刷フレームの初期化に失敗しました";
      cleanup();
      return;
    }

    if (frameDocument) {
      frameDocument.title = buildReportFilename();
    }

    frameWindow.addEventListener("afterprint", cleanup, { once: true });
    frameWindow.focus();
    window.setTimeout(() => {
      frameWindow.print();
    }, 250);
  }, { once: true });

  document.body.append(printFrame);
  printFrame.srcdoc = reportHtml;
});

memberFilters.addEventListener("submit", (event) => {
  event.preventDefault();
  debounceMemberFilterUpdate();
});

memberFilters.addEventListener("input", () => {
  debounceMemberFilterUpdate();
});

memberFilters.addEventListener("change", () => {
  debounceMemberFilterUpdate();
});

customerContestFilter.addEventListener("change", async (event) => {
  state.customerFilters.contestName = event.target.value;
  await loadCustomers(state.activeFilters);
});

customerAudienceFilter.addEventListener("change", async (event) => {
  state.customerFilters.audienceType = event.target.value;
  await loadCustomers(state.activeFilters);
});

customerColumnOptions.addEventListener("change", (event) => {
  if (!(event.target instanceof HTMLInputElement) || event.target.type !== "checkbox") {
    return;
  }

  if (event.target.value === "__all__") {
    if (event.target.checked) {
      state.visibleCustomerColumns = new Set(CUSTOMER_COLUMNS.map((column) => column.key));
    } else {
      event.target.checked = true;
      return;
    }
    saveVisibleCustomerColumns();
    renderCustomerColumnOptions();
    renderCustomers(state.customersPayload || []);
    return;
  }

  if (event.target.checked) {
    state.visibleCustomerColumns.add(event.target.value);
  } else if (state.visibleCustomerColumns.size > 1) {
    state.visibleCustomerColumns.delete(event.target.value);
  } else {
    event.target.checked = true;
    return;
  }

  saveVisibleCustomerColumns();
  renderCustomers(state.customersPayload || []);
  renderCustomerColumnOptions();
});

customerCsvExportButton.addEventListener("click", () => {
  exportCustomersAsCsv(state.customersPayload || []);
});

chartToggleButtons.forEach((button) => {
  button.addEventListener("click", async () => {
    const chartType = button.dataset.chartType || "line";
    const target = button.dataset.chartTarget;
    if (!target) {
      return;
    }
    setChartMode(target, chartType);
    state.activeFilters = readMemberFilters();
    if (state.dashboardPayload && (target === "overviewRevenueChart" || target === "overviewVolumeChart")) {
      renderSummary(state.dashboardPayload);
    }
    if (
      state.memberJoinPayload &&
      (target === "filterChart" || target === "memberRegionChart" || target === "memberPrefectureChart")
    ) {
      renderMemberJoinTrendPayload(state.memberJoinPayload, state.activeFilters);
    } else if (
      state.spectatorInsightsPayload &&
      [
        "spectatorCategoryChart",
        "spectatorGenderChart",
        "spectatorAgeChart",
        "spectatorPrefectureChart",
        "spectatorRegionChart",
        "spectatorEventsList"
      ].includes(target)
    ) {
      await loadSpectatorInsights(state.selectedSpectatorEventName);
    } else {
      await Promise.all([loadOverview(state.activeFilters), loadMemberJoinTrend(state.activeFilters)]);
    }
  });
});

tabButtons.forEach((button) => {
  button.addEventListener("click", () => {
    const targetId = button.dataset.tabTarget;
    if (!targetId) {
      return;
    }
    setActiveTab(targetId);
  });
});

document.addEventListener("mouseover", (event) => {
  const target = event.target.closest("[data-tooltip]");
  if (!target) {
    return;
  }
  showChartTooltip(target.getAttribute("data-tooltip") || "", event);
});

document.addEventListener("mousemove", (event) => {
  const target = event.target.closest("[data-tooltip]");
  if (!target || !chartTooltip?.classList.contains("is-visible")) {
    return;
  }
  chartTooltip.style.left = `${event.clientX + 14}px`;
  chartTooltip.style.top = `${event.clientY + 14}px`;
});

document.addEventListener("mouseout", (event) => {
  if (!event.target.closest("[data-tooltip]")) {
    return;
  }
  hideChartTooltip();
});

document.addEventListener("click", (event) => {
  if (!customerColumnPicker?.hasAttribute("open")) {
    return;
  }
  if (event.target.closest(".column-picker")) {
    return;
  }
  customerColumnPicker.removeAttribute("open");
});

eventSelect.addEventListener("change", async (event) => {
  state.selectedEventName = event.target.value;
  await loadEventInsights(state.selectedEventName);
});

spectatorEventSelect.addEventListener("change", async (event) => {
  state.selectedSpectatorEventName = event.target.value;
  await loadSpectatorInsights(state.selectedSpectatorEventName);
});

async function initAuth() {
  try {
    const res = await fetch("/api/me");
    if (res.ok) {
      const user = await res.json();
      document.body.dataset.role = user.role || "USER";
    }
  } catch {
    // ignore — role-based CSS will stay inactive (show everything)
  }
}

initAuth().then(() => {
  loadDashboard();
  state.activeFilters = readMemberFilters();
  setActiveTab("overviewTab");
  loadVisibleCustomerColumns();
  renderCustomerColumnOptions();
  Object.entries(state.chartModes).forEach(([target, value]) => {
    setChartMode(target, value);
  });
  window.setInterval(loadSyncStatus, 30000);
});
