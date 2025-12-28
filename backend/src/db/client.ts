import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let pool: Pool | undefined;
let db: NodePgDatabase | undefined;

// Lazy DB init; never throws at import time.
export function getDb(): NodePgDatabase | undefined {
  if (db) return db;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn("DATABASE_URL missing; DB features disabled");
    return undefined;
  }

  pool = new Pool({ connectionString: url });
  db = drizzle(pool);
  return db;
}

export function getPool(): Pool | undefined {
  void getDb();
  return pool;
}
