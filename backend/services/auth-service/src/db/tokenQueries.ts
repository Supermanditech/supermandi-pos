// Token Database Queries - V3.0.9 compliant
// Queries for refresh_tokens table

import { query, queryOne } from '@supermandi/common';
import type { UUID } from '@supermandi/common';

// =============================================================================
// TYPES
// =============================================================================

interface RefreshTokenRow {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  user_agent: string | null;
  ip_address: string | null;
  created_at: Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  expiresAt: Date;
  revokedAt?: Date;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
}

function rowToRecord(row: RefreshTokenRow): RefreshTokenRecord {
  return {
    id: row.id,
    userId: row.user_id,
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at ?? undefined,
    userAgent: row.user_agent ?? undefined,
    ipAddress: row.ip_address ?? undefined,
    createdAt: row.created_at,
  };
}

// =============================================================================
// REFRESH TOKEN CRUD
// =============================================================================

export interface CreateRefreshTokenParams {
  userId: UUID;
  tokenHash: string;
  expiresAt: Date;
  userAgent?: string;
  ipAddress?: string;
}

/**
 * Store a new refresh token
 */
export async function createRefreshToken(params: CreateRefreshTokenParams): Promise<RefreshTokenRecord> {
  const sql = `
    INSERT INTO auth.refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;
  const values = [
    params.userId,
    params.tokenHash,
    params.expiresAt,
    params.userAgent ?? null,
    params.ipAddress ?? null,
  ];
  const rows = await query<RefreshTokenRow>(sql, values);
  const row = rows[0];
  if (!row) {
    throw new Error('Failed to create refresh token');
  }
  return rowToRecord(row);
}

/**
 * Find a refresh token by its hash
 */
export async function findRefreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
  const sql = `
    SELECT * FROM auth.refresh_tokens
    WHERE token_hash = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  const row = await queryOne<RefreshTokenRow>(sql, [tokenHash]);
  return row ? rowToRecord(row) : null;
}

/**
 * Revoke a refresh token
 */
export async function revokeRefreshToken(tokenHash: string): Promise<boolean> {
  const sql = `
    UPDATE auth.refresh_tokens
    SET revoked_at = NOW()
    WHERE token_hash = $1
      AND revoked_at IS NULL
  `;
  await query(sql, [tokenHash]);
  return true;
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllUserRefreshTokens(userId: UUID): Promise<number> {
  const sql = `
    UPDATE auth.refresh_tokens
    SET revoked_at = NOW()
    WHERE user_id = $1
      AND revoked_at IS NULL
    RETURNING id
  `;
  const rows = await query<{ id: string }>(sql, [userId]);
  return rows.length;
}

/**
 * Clean up expired tokens (for maintenance)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const sql = `
    DELETE FROM auth.refresh_tokens
    WHERE expires_at < NOW() - INTERVAL '30 days'
    RETURNING id
  `;
  const rows = await query<{ id: string }>(sql);
  return rows.length;
}

/**
 * Count active refresh tokens for a user
 */
export async function countActiveRefreshTokens(userId: UUID): Promise<number> {
  const sql = `
    SELECT COUNT(*) as count
    FROM auth.refresh_tokens
    WHERE user_id = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  interface CountRow { count: string }
  const row = await queryOne<CountRow>(sql, [userId]);
  return row ? parseInt(row.count, 10) : 0;
}
