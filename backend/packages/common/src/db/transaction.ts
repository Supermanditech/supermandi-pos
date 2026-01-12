// Transaction wrapper with automatic rollback - V3.0.9 compliant
import { PoolClient } from 'pg';
import { getClient } from './pool';
import { TransactionContext, ExtendedTransactionContext } from './types';

/**
 * Execute a function within a database transaction
 * Automatically commits on success, rolls back on error
 */
export async function withTransaction<T>(
  fn: (ctx: TransactionContext) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const ctx: TransactionContext = {
      query: async <R>(sql: string, params?: unknown[]): Promise<R[]> => {
        const result = await client.query(sql, params);
        return result.rows as R[];
      },
      queryOne: async <R>(sql: string, params?: unknown[]): Promise<R | null> => {
        const result = await client.query(sql, params);
        return (result.rows[0] as R) ?? null;
      },
    };

    const result = await fn(ctx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Execute a function with a savepoint for nested transaction-like behavior
 */
export async function withSavepoint<T>(
  client: PoolClient,
  name: string,
  fn: () => Promise<T>
): Promise<T> {
  await client.query(`SAVEPOINT ${name}`);
  try {
    const result = await fn();
    await client.query(`RELEASE SAVEPOINT ${name}`);
    return result;
  } catch (error) {
    await client.query(`ROLLBACK TO SAVEPOINT ${name}`);
    throw error;
  }
}

/**
 * Execute a function within a transaction with extended context
 */
export async function withExtendedTransaction<T>(
  fn: (ctx: ExtendedTransactionContext) => Promise<T>
): Promise<T> {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const ctx: ExtendedTransactionContext = {
      client,
      query: async <R>(sql: string, params?: unknown[]): Promise<R[]> => {
        const result = await client.query(sql, params);
        return result.rows as R[];
      },
      queryOne: async <R>(sql: string, params?: unknown[]): Promise<R | null> => {
        const result = await client.query(sql, params);
        return (result.rows[0] as R) ?? null;
      },
      savepoint: <R>(name: string, fn: () => Promise<R>) =>
        withSavepoint(client, name, fn),
    };

    const result = await fn(ctx);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
