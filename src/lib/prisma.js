const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const envPath = path.resolve(__dirname, "../../.env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, quiet: true });
}

if (!process.env.DATABASE_URL) {
  console.warn("WARNING: DATABASE_URL is not set. Database queries will fail.");
}

const prisma = global.__documentPrintPrisma ?? new PrismaClient();

if (!global.__documentPrintPrisma) {
  global.__documentPrintPrisma = prisma;
}

module.exports = {
  prisma
};
