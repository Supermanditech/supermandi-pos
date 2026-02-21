// Database connection pool - V3.0.9 compliant
// GO-LIVE-183: Added circuit breaker integration
import { Pool, PoolClient, PoolConfig } from 'pg';
import { DbConfig } from './types';
import { getDbCircuitBreaker, CircuitBreakerError } from './circuitBreaker';

let pool: Pool | null = null;

// GO-LIVE-183: Track connection errors for circuit breaker
function isConnectionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const err = error as { code?: string; message?: string };
  // Connection-related PostgreSQL error codes
  const connectionErrorCodes = [
    '08000', // connection_exception
    '08003', // connection_does_not_exist
    '08006', // connection_failure
    '57P01', // admin_shutdown
    '57P02', // crash_shutdown
    '57P03', // cannot_connect_now
  ];
  if (err.code && connectionErrorCodes.includes(err.code)) return true;
  // Also check for common connection error messages
  const msg = err.message?.toLowerCase() || '';
  return (
    msg.includes('connection refused') ||
    msg.includes('connection timed out') ||
    msg.includes('timeout exceeded') ||
    msg.includes('econnrefused') ||
    msg.includes('enotfound')
  );
}

/**
 * Parse DATABASE_URL into PoolConfig
 */
function parseConnectionString(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  return {
    host: url.hostname,
    port: parseInt(url.port || '5432', 10),
    database: url.pathname.slice(1), // Remove leading /
    user: url.username,
    password: decodeURIComponent(url.password),
    ssl: url.searchParams.get('sslmode') === 'require' ? { rejectUnauthorized: false } : false,
  };
}

/**
 * Get or create the database connection pool
 */
export function getPool(config?: DbConfig): Pool {
  if (pool) {
    return pool;
  }

  if (!config) {
    // Use DATABASE_URL if available, otherwise fall back to individual env vars
    const databaseUrl = process.env['DATABASE_URL'];

    let envConfig: PoolConfig;
    if (databaseUrl) {
      envConfig = {
        ...parseConnectionString(databaseUrl),
        min: parseInt(process.env['DB_POOL_MIN'] || '2', 10),
        max: parseInt(process.env['DB_POOL_MAX'] || '10', 10),
        idleTimeoutMillis: 30000,
        // Cloud SQL Unix socket cold start can take 15-20s; 5s was causing unhandled rejections
        connectionTimeoutMillis: 30000,
      };
    } else {
      envConfig = {
        host: process.env['DB_HOST'] || 'localhost',
        port: parseInt(process.env['DB_PORT'] || '5432', 10),
        database: process.env['DB_NAME'] || 'supermandi',
        user: process.env['DB_USER'] || 'postgres',
        password: process.env['DB_PASSWORD'] || '',
        ssl: process.env['DB_SSL'] === 'true' ? { rejectUnauthorized: false } : false,
        min: parseInt(process.env['DB_POOL_MIN'] || '2', 10),
        max: parseInt(process.env['DB_POOL_MAX'] || '10', 10),
        idleTimeoutMillis: 30000,
        // Cloud SQL Unix socket cold start can take 15-20s; 5s was causing unhandled rejections
        connectionTimeoutMillis: 30000,
      };
    }
    pool = new Pool(envConfig);
  } else {
    const poolConfig: PoolConfig = {
      host: config.host,
      port: config.port,
      database: config.database,
      user: config.user,
      password: config.password,
      ssl: config.ssl ? { rejectUnauthorized: false } : false,
      min: config.poolMin ?? 2,
      max: config.poolMax ?? 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 30000,
    };
    pool = new Pool(poolConfig);
  }

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err.message);
  });

  return pool;
}

/**
 * Execute a query using the pool
 */
export async function query<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const p = getPool();
  const result = await p.query(sql, params);
  return result.rows as T[];
}

/**
 * Execute a query and return a single row
 */
export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await query<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Get a client from the pool (for transactions)
 */
export async function getClient(): Promise<PoolClient> {
  const p = getPool();
  return p.connect();
}

/**
 * Close the connection pool
 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

/**
 * Check database connectivity
 */
export async function healthCheck(): Promise<boolean> {
  try {
    const result = await queryOne<{ ok: number }>('SELECT 1 as ok');
    return result?.ok === 1;
  } catch {
    return false;
  }
}

// =============================================================================
// GO-LIVE-183: CIRCUIT BREAKER PROTECTED QUERIES
// =============================================================================

/**
 * Execute a query with circuit breaker protection
 * Fails fast if database is experiencing connection issues
 */
export async function queryProtected<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T[]> {
  const breaker = getDbCircuitBreaker();

  return breaker.execute(async () => {
    try {
      const p = getPool();
      const result = await p.query(sql, params);
      return result.rows as T[];
    } catch (error) {
      // Only count connection errors towards circuit breaker
      // Query errors (like invalid SQL) should not trip the circuit
      if (!isConnectionError(error)) {
        // Re-throw but mark as non-circuit-breaking
        throw error;
      }
      console.error('[GO-LIVE-183] Database connection error:', error);
      throw error;
    }
  });
}

/**
 * Execute a single-row query with circuit breaker protection
 */
export async function queryOneProtected<T = Record<string, unknown>>(
  sql: string,
  params?: unknown[]
): Promise<T | null> {
  const rows = await queryProtected<T>(sql, params);
  return rows[0] ?? null;
}

/**
 * Get a client from the pool with circuit breaker check
 * Note: Circuit breaker only checks availability; client operations
 * should handle their own errors
 */
export async function getClientProtected(): Promise<PoolClient> {
  const breaker = getDbCircuitBreaker();

  if (!breaker.isAllowingRequests()) {
    throw new CircuitBreakerError(
      'Database circuit breaker is open',
      'database',
      breaker.getState()
    );
  }

  try {
    const p = getPool();
    return await p.connect();
  } catch (error) {
    if (isConnectionError(error)) {
      // Trigger circuit breaker on connection failure
      await breaker.execute(() => Promise.reject(error));
    }
    throw error;
  }
}

/**
 * Health check with circuit breaker status
 */
export interface DbHealthStatus {
  healthy: boolean;
  circuitBreaker: {
    state: string;
    isAllowingRequests: boolean;
    tripCount: number;
    failedRequests: number;
  };
  latencyMs?: number;
  error?: string;
}

export async function healthCheckDetailed(): Promise<DbHealthStatus> {
  const breaker = getDbCircuitBreaker();
  const stats = breaker.getStats();

  const baseStatus: DbHealthStatus = {
    healthy: false,
    circuitBreaker: {
      state: stats.state,
      isAllowingRequests: breaker.isAllowingRequests(),
      tripCount: stats.tripCount,
      failedRequests: stats.failedRequests,
    },
  };

  // If circuit is open, fail fast
  if (!breaker.isAllowingRequests()) {
    return {
      ...baseStatus,
      error: 'Circuit breaker is open',
    };
  }

  const start = Date.now();
  try {
    const result = await queryOne<{ ok: number }>('SELECT 1 as ok');
    const latencyMs = Date.now() - start;

    return {
      ...baseStatus,
      healthy: result?.ok === 1,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - start;
    return {
      ...baseStatus,
      latencyMs,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
