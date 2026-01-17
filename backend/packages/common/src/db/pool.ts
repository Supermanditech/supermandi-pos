// Database connection pool - V3.0.9 compliant
import { Pool, PoolClient, PoolConfig } from 'pg';
import { DbConfig } from './types';

let pool: Pool | null = null;

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
        connectionTimeoutMillis: 5000,
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
        connectionTimeoutMillis: 5000,
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
      connectionTimeoutMillis: 5000,
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
