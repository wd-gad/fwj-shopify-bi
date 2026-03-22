const fs = require("fs");
const path = require("path");
const dotenv = require("dotenv");
const { PrismaClient } = require("@prisma/client");

const envPath = path.resolve(__dirname, "../../.env");

if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath, quiet: true });
}

function validateDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      `DATABASE_URL is not configured. Set it in ${envPath} or export it before starting the app.`
    );
  }

  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) {
    throw new Error(
      "DATABASE_URL must start with postgresql:// or postgres:// so Prisma can connect to PostgreSQL."
    );
  }
}

validateDatabaseUrl();

const prisma = global.__documentPrintPrisma ?? new PrismaClient();

if (!global.__documentPrintPrisma) {
  global.__documentPrintPrisma = prisma;
}

module.exports = {
  prisma
};
