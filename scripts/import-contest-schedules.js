const fs = require("fs");
const path = require("path");
const { prisma } = require("../src/lib/prisma.js");

const DEFAULT_CSV_PATH = "/Users/takashiwada/Downloads/2026年FWJスケジュール移動情報 - 2026年FWJスケジュール移動情報.csv";

function parseCsvLine(line) {
  const columns = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      columns.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  columns.push(current);
  return columns;
}

function parseCsv(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => line.trim().length > 0)
    .map(parseCsvLine);
}

function parseBoolean(value) {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return null;
  return normalized === "true";
}

function parseDate(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return null;

  const date = normalized.includes("/")
    ? new Date(`${normalized.replace(/\//g, "-")}T00:00:00+09:00`)
    : new Date(`${normalized}T00:00:00+09:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}

async function main() {
  const csvPath = process.argv[2] ? path.resolve(process.argv[2]) : DEFAULT_CSV_PATH;
  const content = fs.readFileSync(csvPath, "utf8").replace(/^\uFEFF/, "");
  const [header, ...rows] = parseCsv(content);

  const records = rows.map((row) => {
    const entry = Object.fromEntries(header.map((key, index) => [key, row[index] ?? ""]));
    return {
      eventDate: parseDate(entry["YYYY/MM/DD"]),
      contestName: entry["大会名"] || null,
      venueName: entry["会場名"] || null,
      nearestStation: entry["最寄り駅"] || null,
      oneWayFare: entry["片道交通費"] || null,
      travelMode: entry["移動手段"] || null,
      travelTime: entry["移動時間"] || null,
      requiresHotel: parseBoolean(entry["宿泊"]),
      preTravelDate: parseDate(entry["前日移動日"]),
      travelDescription: entry["移動内容"] || null,
      address: entry["住所"] || null,
      phoneNumber: entry["電話番号"] || null
    };
  }).filter((record) => record.eventDate && record.contestName);

  await prisma.$transaction(async (tx) => {
    await tx.contestSchedule.deleteMany();
    await tx.contestSchedule.createMany({
      data: records
    });
  });

  console.log(`Imported ${records.length} contest schedules from ${csvPath}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
