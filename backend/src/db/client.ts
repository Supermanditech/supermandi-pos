import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { log } from "../lib/logger";

let pool: Pool | undefined;
let db: NodePgDatabase | undefined;

// ITER4-P1-006: Connection pool configuration
// T1-004: Reduced default max from 50 to 20 — Cloud SQL basic tier = 100 connections,
// main-backend has Drizzle pool + common pool. 20 + 10 = 30 per instance is safe.
// SCALE-D2: Tuned for 10K concurrent users — min raised to 5 to avoid cold-start latency,
// max raised to 25 to handle burst traffic while staying within Cloud SQL limits
// (25 + 10 common = 35 per instance, safe for 3 instances under 100-connection cap).
// GCP-STG-0365: Reduced default max from 25 to 10 for Cloud SQL connection limit safety.
// Math: 15 instances × (10 Drizzle + 10 common) = 300 connections, within Cloud SQL
// upgraded-tier limit (500). Previous 25 default × 15 = 375 Drizzle alone, exceeding limits.
// Min also reduced from 5 to 2 to lower idle connection footprint across 15 instances.
const POOL_CONFIG = {
  min: parseInt(process.env.DB_POOL_MIN || '2', 10),
  // GCP-STG-0365: 10 default (15 instances × 10 = 150, + common pool 150 = 300, within 500 cap)
  max: parseInt(process.env.DB_POOL_MAX || '10', 10),
  // Close idle connections after this many milliseconds
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000', 10),
  // Connection timeout in milliseconds
  // Cloud SQL Unix socket cold start can take 15-20s; 10s was causing unhandled rejections
  connectionTimeoutMillis: parseInt(process.env.DB_CONNECT_TIMEOUT || '30000', 10),
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
    log.warn("DATABASE_URL missing; DB features disabled");
    return undefined;
  }

  // ITER4-P1-006: Configure connection pool with bounded limits
  // GO-LIVE-076: Enhanced pool configuration for production scale
  // RET-B1-001: SSL must be opt-IN, not opt-OUT. Cloud SQL via VPC connector / Unix socket
  // does NOT support SSL — the proxy already handles encryption. Previous logic forced SSL
  // for all non-dev environments, breaking ALL 136 DB-dependent routes on Cloud Run.
  // Now consistent with common pool (pool.ts) which also defaults to no-SSL.
  const sslConfig = process.env.DB_SSL === 'true'
    ? { rejectUnauthorized: false }
    : false;

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
    log.error('[DB Pool] Unexpected error on idle client:', err);
  });

  // GO-LIVE-076: Pool monitoring - log connection stats periodically
  if (process.env.DB_POOL_MONITORING === 'true') {
    setInterval(() => {
      log.info(`[DB Pool Stats] total=${pool?.totalCount}, idle=${pool?.idleCount}, waiting=${pool?.waitingCount}`);
    }, 60000); // Log every minute
  }

  log.info(`[DB Pool] Initialized with min=${POOL_CONFIG.min}, max=${POOL_CONFIG.max}, idleTimeout=${POOL_CONFIG.idleTimeoutMillis}ms, statementTimeout=${POOL_CONFIG.statement_timeout}ms`);

  db = drizzle(pool);
  return db;
}

export function getPool(): Pool | undefined {
  void getDb();
  return pool;
}

// #343: UUID format validation for RLS store context
// rls_store_check() casts to ::uuid — passing non-UUID would throw at DB level.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// T-216: RLS store context helper
// Sets app.current_store_id for the duration of a transaction/callback
// SET LOCAL requires an active transaction — this wraps fn in BEGIN/COMMIT.
// Usage: await withStoreContext(storeId, async (client) => { ... })
export async function withStoreContext<T>(
  storeId: string,
  fn: (client: import("pg").PoolClient) => Promise<T>
): Promise<T> {
  if (!UUID_RE.test(storeId)) {
    throw new Error(`withStoreContext: invalid store_id format (expected UUID): ${storeId}`);
  }
  const p = getPool();
  if (!p) throw new Error("Database pool not initialized");
  const client = await p.connect();
  try {
    await client.query("BEGIN");
    // STG-429 FIX: SET LOCAL doesn't accept $n bind parameters via extended query protocol.
    // Use set_config() which is a regular SQL function that accepts bind parameters.
    await client.query("SELECT set_config('app.current_store_id', $1::text, true)", [storeId]);
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Execute a read query with RLS store context.
 * Wraps a single query in a transaction with SET LOCAL app.current_store_id.
 * Use this for store-scoped queries where RLS should enforce isolation.
 */
export async function queryInStore<T = Record<string, unknown>>(
  storeId: string,
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  return withStoreContext(storeId, async (client) => {
    const result = await client.query(sql, params);
    return result.rows as T[];
  });
}
