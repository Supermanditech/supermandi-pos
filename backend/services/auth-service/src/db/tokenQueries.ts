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
  last_activity_at: Date; // AUTH-IDLE-001
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
  lastActivityAt: Date; // AUTH-IDLE-001
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
    lastActivityAt: row.last_activity_at,
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

// =============================================================================
// AUTH-IDLE-001: SERVER-SIDE IDLE TIMEOUT TRACKING
// =============================================================================

/**
 * AUTH-IDLE-001: Update last_activity_at for all active tokens of a user.
 * Called from authenticate middleware (fire-and-forget, throttled).
 */
export async function updateUserLastActivity(userId: UUID): Promise<void> {
  const sql = `
    UPDATE auth.refresh_tokens
    SET last_activity_at = NOW()
    WHERE user_id = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
  `;
  await query(sql, [userId]);
}

/**
 * AUTH-IDLE-001: Check if a refresh token has been idle too long.
 * Returns true if the token is still active (within idle timeout).
 */
export async function isRefreshTokenActive(
  tokenHash: string,
  idleTimeoutMinutes: number
): Promise<boolean> {
  const sql = `
    SELECT 1 FROM auth.refresh_tokens
    WHERE token_hash = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
      AND last_activity_at > NOW() - ($2 || ' minutes')::INTERVAL
  `;
  const row = await queryOne<{ '?column?': number }>(sql, [tokenHash, String(idleTimeoutMinutes)]);
  return !!row;
}

// =============================================================================
// AUTH-CONCURRENT-001: DEVICE SESSION TRACKING
// =============================================================================

export interface SessionInfo {
  id: string;
  userAgent?: string;
  ipAddress?: string;
  createdAt: Date;
  lastActivityAt: Date;
}

/**
 * AUTH-CONCURRENT-001: List active sessions for a user.
 */
export async function listUserActiveSessions(userId: UUID): Promise<SessionInfo[]> {
  const sql = `
    SELECT id, user_agent, ip_address, created_at, last_activity_at
    FROM auth.refresh_tokens
    WHERE user_id = $1
      AND revoked_at IS NULL
      AND expires_at > NOW()
    ORDER BY last_activity_at DESC
  `;
  interface SessionRow {
    id: string;
    user_agent: string | null;
    ip_address: string | null;
    created_at: Date;
    last_activity_at: Date;
  }
  const rows = await query<SessionRow>(sql, [userId]);
  return rows.map((row) => ({
    id: row.id,
    userAgent: row.user_agent ?? undefined,
    ipAddress: row.ip_address ?? undefined,
    createdAt: row.created_at,
    lastActivityAt: row.last_activity_at,
  }));
}

/**
 * AUTH-CONCURRENT-001: Revoke a specific session by its ID.
 * Only revokes if it belongs to the given user (security check).
 */
export async function revokeSessionById(sessionId: string, userId: UUID): Promise<boolean> {
  const sql = `
    UPDATE auth.refresh_tokens
    SET revoked_at = NOW()
    WHERE id = $1
      AND user_id = $2
      AND revoked_at IS NULL
    RETURNING id
  `;
  const rows = await query<{ id: string }>(sql, [sessionId, userId]);
  return rows.length > 0;
}

/**
 * AUTH-CONCURRENT-001: Enforce session limit by revoking oldest sessions.
 * Called on login when a new session is created.
 */
export async function enforceSessionLimit(userId: UUID, maxSessions: number): Promise<number> {
  if (maxSessions <= 0) return 0;

  // Revoke oldest sessions beyond the limit
  const sql = `
    UPDATE auth.refresh_tokens
    SET revoked_at = NOW()
    WHERE id IN (
      SELECT id FROM auth.refresh_tokens
      WHERE user_id = $1
        AND revoked_at IS NULL
        AND expires_at > NOW()
      ORDER BY created_at DESC
      OFFSET $2
    )
    RETURNING id
  `;
  const rows = await query<{ id: string }>(sql, [userId, maxSessions]);
  return rows.length;
}
