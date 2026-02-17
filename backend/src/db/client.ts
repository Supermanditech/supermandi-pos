import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

let pool: Pool | undefined;
let db: NodePgDatabase | undefined;

// ITER4-P1-006: Connection pool configuration
// T1-004: Reduced default max from 50 to 20 — Cloud SQL basic tier = 100 connections,
// main-backend has Drizzle pool + common pool. 20 + 10 = 30 per instance is safe.
const POOL_CONFIG = {
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  // T1-004: 20 default (Cloud SQL basic=100, leave headroom for multiple instances)
  max: parseInt(process.env.DB_POOL_MAX || '20', 10),
  // Close idle connections after this many milliseconds
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  // Connection timeout in milliseconds
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '10000', 10),
  // How long a client is allowed to remain idle before being removed (30 seconds)
  allowExitOnIdle: false,
  // GO-LIVE-076: Statement timeout to prevent runaway queries (30 seconds)
  statement_timeout: parseInt(process.env.DB_STATEMENT_TIMEOUT || '30000', 10),
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
  // GO-LIVE-076: Enhanced pool configuration for production scale
  // T1-009: SSL configuration for Cloud SQL (required for non-Unix-socket connections)
  const sslConfig = process.env.DB_SSL === 'false' ? false
    : process.env.NODE_ENV === 'development' ? false
    : { rejectUnauthorized: false }; // Cloud SQL proxy handles cert verification

  pool = new Pool({
    connectionString: url,
    min: POOL_CONFIG.min,
    max: POOL_CONFIG.max,
    idleTimeoutMillis: POOL_CONFIG.idleTimeoutMillis,
    connectionTimeoutMillis: POOL_CONFIG.connectionTimeoutMillis,
    allowExitOnIdle: POOL_CONFIG.allowExitOnIdle,
    // GO-LIVE-076: Statement timeout to prevent runaway queries
    statement_timeout: POOL_CONFIG.statement_timeout,
    // T1-009: SSL for Cloud SQL (disabled in dev, auto for prod via Cloud SQL proxy)
    ...(sslConfig && { ssl: sslConfig }),
  });

  // Log pool errors
  pool.on('error', (err) => {
    console.error('[DB Pool] Unexpected error on idle client:', err);
  });

  // GO-LIVE-076: Pool monitoring - log connection stats periodically
  if (process.env.DB_POOL_MONITORING === 'true') {
    setInterval(() => {
      console.log(`[DB Pool Stats] total=${pool?.totalCount}, idle=${pool?.idleCount}, waiting=${pool?.waitingCount}`);
    }, 60000); // Log every minute
  }

  console.log(`[DB Pool] Initialized with min=${POOL_CONFIG.min}, max=${POOL_CONFIG.max}, idleTimeout=${POOL_CONFIG.idleTimeoutMillis}ms, statementTimeout=${POOL_CONFIG.statement_timeout}ms`);

  db = drizzle(pool);
  return db;
}

export function getPool(): Pool | undefined {
  void getDb();
  return pool;
}

// T-216: RLS store context helper
// Sets app.current_store_id for the duration of a transaction/callback
// Usage: await withStoreContext(storeId, async (client) => { ... })
export async function withStoreContext<T>(
  storeId: string,
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  const p = getPool();
  if (!p) throw new Error("Database pool not initialized");
  const client = await p.connect();
  try {
    await client.query("SET LOCAL app.current_store_id = $1", [storeId]);
    return await fn(client);
  } finally {
    // RESET clears session-level SET LOCAL automatically on release
    client.release();
  }
}
