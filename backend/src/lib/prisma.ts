import { PrismaClient } from "@prisma/client";
import path from "path";

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Prisma runtime stability:
// If DATABASE_URL is missing in the server environment, Prisma throws at query time.
// To avoid breaking the mobile app session bootstrap, fall back to the bundled SQLite DB.
// This does NOT change the schema datasource (still uses env("DATABASE_URL") in schema.prisma).
const databaseUrl =
  process.env.DATABASE_URL?.trim() ||
  `file:${path.resolve(__dirname, "..", "..", "prisma", "dev.db")}`;

export const prisma: PrismaClient =
  global.__prisma ?? new PrismaClient({ datasources: { db: { url: databaseUrl } } });

if (process.env.NODE_ENV !== "production") {
  global.__prisma = prisma;
}

