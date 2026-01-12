// UUID utilities - V3.0.9 compliant
// Uses pgcrypto for database-generated UUIDs
import { query, queryOne } from '../db/pool';

/**
 * Generate a UUID using PostgreSQL's pgcrypto extension
 * This ensures UUIDs are generated server-side for consistency
 */
export async function generateUUID(): Promise<string> {
  const result = await queryOne<{ uuid: string }>(
    'SELECT gen_random_uuid()::text as uuid'
  );
  if (!result) {
    throw new Error('Failed to generate UUID');
  }
  return result.uuid;
}

/**
 * Generate multiple UUIDs at once
 */
export async function generateUUIDs(count: number): Promise<string[]> {
  const rows = await query<{ uuid: string }>(
    `SELECT gen_random_uuid()::text as uuid FROM generate_series(1, $1)`,
    [count]
  );
  return rows.map(r => r.uuid);
}

/**
 * Validate UUID format (v4)
 */
export function isValidUUID(value: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidRegex.test(value);
}

/**
 * SQL fragment for UUID primary key column
 * Use in migrations: id ${UUID_PK}
 */
export const UUID_PK = 'UUID PRIMARY KEY DEFAULT gen_random_uuid()';

/**
 * SQL fragment for UUID foreign key column (not null)
 */
export const UUID_FK = 'UUID NOT NULL';

/**
 * SQL fragment for optional UUID foreign key column
 */
export const UUID_FK_NULLABLE = 'UUID';
