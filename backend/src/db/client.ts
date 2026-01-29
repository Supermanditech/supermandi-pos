import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let pool: Pool | undefined;
let db: NodePgDatabase | undefined;

// ITER4-P1-006: Connection pool configuration
const POOL_CONFIG = {
  // Minimum number of connections to keep open
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  // Maximum number of connections
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  // Close idle connections after this many milliseconds
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  // Connection timeout in milliseconds
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '5000', 10),
  // How long a client is allowed to remain idle before being removed (30 seconds)
  allowExitOnIdle: false,
};

// Lazy DB init; never throws at import time.
export function getDb(): NodePgDatabase | undefined {
  if (db) return db;

  const url = process.env.DATABASE_URL?.trim();
  if (!url) {
    console.warn("DATABASE_URL missing; DB features disabled");
    return undefined;
  }

  // ITER4-P1-006: Configure connection pool with bounded limits
  pool = new Pool({
    connectionString: url,
    min: POOL_CONFIG.min,
    max: POOL_CONFIG.max,
    idleTimeoutMillis: POOL_CONFIG.idleTimeoutMillis,
    connectionTimeoutMillis: POOL_CONFIG.connectionTimeoutMillis,
    allowExitOnIdle: POOL_CONFIG.allowExitOnIdle,
  });

  // Log pool errors
  pool.on('error', (err) => {
    console.error('[DB Pool] Unexpected error on idle client:', err);
  });

  console.log(`[DB Pool] Initialized with min=${POOL_CONFIG.min}, max=${POOL_CONFIG.max}, idleTimeout=${POOL_CONFIG.idleTimeoutMillis}ms`);

  db = drizzle(pool);
  return db;
}

export function getPool(): Pool | undefined {
  void getDb();
  return pool;
}
