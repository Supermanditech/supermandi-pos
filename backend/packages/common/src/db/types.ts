// Database types - V3.0.9 compliant
import type { PoolClient } from 'pg';

export interface DbConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  poolMin?: number;
  poolMax?: number;
}

export interface TransactionContext {
  query: <T>(sql: string, params?: unknown[]) => Promise<T[]>;
  queryOne: <T>(sql: string, params?: unknown[]) => Promise<T | null>;
}

export interface ExtendedTransactionContext extends TransactionContext {
  client: PoolClient;
  savepoint: <T>(name: string, fn: () => Promise<T>) => Promise<T>;
}

export interface QueryOptions {
  timeout?: number;
}
