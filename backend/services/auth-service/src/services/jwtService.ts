// JWT Service - V3.0.9 compliant
// JWT generation and verification for authentication

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { createLogger } from '@supermandi/common';
import type { JwtPayload, ActorType, UUID } from '@supermandi/common';
import { config } from '../config';

const logger = createLogger({ service: 'auth-service', level: process.env.LOG_LEVEL || 'info' });

// =============================================================================
// TOKEN PAYLOAD TYPES
// =============================================================================

export interface AccessTokenPayload {
  sub: string; // userId
  actorType: ActorType;
  actorId?: string;
  permissions: string[];
}

export interface RefreshTokenPayload {
  sub: string; // userId
  tokenId: string; // unique ID for revocation tracking
  type: 'refresh';
}

// GL-CRIT-0007: Service-to-service authentication
export interface ServiceTokenPayload {
  serviceName: string; // e.g., 'order-service'
  type: 'service';
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number; // seconds until access token expires
  refreshTokenId: string; // for storing in database
}

// =============================================================================
// TOKEN GENERATION
// =============================================================================

/**
 * Parse expiry string to seconds (e.g., '15m' -> 900)
 */
function parseExpiresIn(expiresIn: string): number {
  const match = expiresIn.match(/^(\d+)([smhd])$/);
  if (!match?.[1] || !match[2]) {
    return 900; // Default 15 minutes
  }

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 's':
      return value;
    case 'm':
      return value * 60;
    case 'h':
      return value * 3600;
    case 'd':
      return value * 86400;
    default:
      return 900;
  }
}

/**
 * Generate an access token with user claims
 */
export function generateAccessToken(payload: AccessTokenPayload): string {
  // Convert expiresIn string to seconds for type safety
  const expiresInSeconds = parseExpiresIn(config.jwt.accessTokenExpiresIn);

  return jwt.sign(
    {
      sub: payload.sub,
      actorType: payload.actorType,
      actorId: payload.actorId,
      permissions: payload.permissions,
    },
    config.jwt.secret,
    {
      expiresIn: expiresInSeconds,
      issuer: config.jwt.issuer,
    }
  );
}

/**
 * Generate a refresh token
 */
export function generateRefreshToken(userId: string, actorType?: string): { token: string; tokenId: string } {
  const tokenId = crypto.randomUUID();

  // Convert days to seconds
  const expiresInSeconds = config.jwt.refreshTokenExpiresInDays * 86400;

  const token = jwt.sign(
    {
      sub: userId,
      tokenId,
      type: 'refresh',
      // PRA-079: Include actorType to prevent cross-platform refresh token reuse
      ...(actorType ? { actorType } : {}),
    },
    config.jwt.secret,
    {
      expiresIn: expiresInSeconds,
      issuer: config.jwt.issuer,
    }
  );

  return { token, tokenId };
}

/**
 * Generate a token pair (access + refresh)
 */
export function generateTokenPair(
  userId: string,
  actorType: ActorType,
  actorId: UUID | undefined,
  permissions: string[]
): TokenPair {
  const accessToken = generateAccessToken({
    sub: userId,
    actorType,
    actorId,
    permissions,
  });

  const { token: refreshToken, tokenId: refreshTokenId } = generateRefreshToken(userId, actorType);

  // Parse expiresIn to seconds
  const expiresIn = parseExpiresIn(config.jwt.accessTokenExpiresIn);

  return {
    accessToken,
    refreshToken,
    expiresIn,
    refreshTokenId,
  };
}

// =============================================================================
// TOKEN VERIFICATION
// =============================================================================

// GO-LIVE-174: JWT error types for better error handling
export type JwtVerifyError = 'EXPIRED' | 'INVALID' | 'MALFORMED' | 'NOT_YET_ACTIVE' | 'INVALID_SIGNATURE';

export interface JwtVerifyResult {
  payload: JwtPayload | null;
  error?: JwtVerifyError;
  message?: string;
}

/**
 * Verify and decode an access token
 * GO-LIVE-174: Enhanced to return specific error types
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  const result = verifyAccessTokenWithError(token);
  return result.payload;
}

/**
 * GO-LIVE-174: Verify access token with detailed error information
 * Returns error type to help with more specific error messages
 */
export function verifyAccessTokenWithError(token: string): JwtVerifyResult {
  try {
    // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      algorithms: ['HS256'],
      clockTolerance: 30, // ISSUE-187: 30s tolerance for Cloud Run NTP drift
    }) as jwt.JwtPayload;

    // Validate required fields
    if (!decoded.sub || !decoded.actorType || !Array.isArray(decoded.permissions)) {
      return { payload: null, error: 'MALFORMED', message: 'Token missing required fields' };
    }

    return {
      payload: {
        userId: decoded.sub,
        actorType: decoded.actorType as ActorType,
        actorId: decoded.actorId,
        role: '', // Role name not stored in token, derived from permissions
        permissions: decoded.permissions,
        iat: decoded.iat ?? 0,
        exp: decoded.exp ?? 0,
      }
    };
  } catch (error) {
    // GO-LIVE-174: Handle specific JWT error types
    if (error instanceof jwt.TokenExpiredError) {
      return { payload: null, error: 'EXPIRED', message: 'Token has expired' };
    }
    if (error instanceof jwt.NotBeforeError) {
      return { payload: null, error: 'NOT_YET_ACTIVE', message: 'Token not yet active' };
    }
    if (error instanceof jwt.JsonWebTokenError) {
      // Check for specific sub-types
      if (error.message.includes('signature')) {
        return { payload: null, error: 'INVALID_SIGNATURE', message: 'Invalid token signature' };
      }
      if (error.message.includes('malformed') || error.message.includes('invalid')) {
        return { payload: null, error: 'MALFORMED', message: 'Malformed token' };
      }
      return { payload: null, error: 'INVALID', message: error.message };
    }
    // Unknown error
    logger.error('[GO-LIVE-174] Unexpected JWT verification error', error instanceof Error ? error : undefined, { raw: error });
    return { payload: null, error: 'INVALID', message: 'Token verification failed' };
  }
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  const result = verifyRefreshTokenWithError(token);
  return result.payload;
}

export interface RefreshTokenVerifyResult {
  payload: RefreshTokenPayload | null;
  error?: JwtVerifyError;
  message?: string;
}

/**
 * GO-LIVE-174: Verify refresh token with detailed error information
 */
export function verifyRefreshTokenWithError(token: string): RefreshTokenVerifyResult {
  try {
    // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
      algorithms: ['HS256'],
      clockTolerance: 30, // ISSUE-187: 30s tolerance for Cloud Run NTP drift
    }) as jwt.JwtPayload;

    // Validate it's a refresh token
    if (!decoded.sub || !decoded.tokenId || decoded.type !== 'refresh') {
      return { payload: null, error: 'MALFORMED', message: 'Invalid refresh token structure' };
    }

    return {
      payload: {
        sub: decoded.sub,
        tokenId: decoded.tokenId,
        type: 'refresh',
      }
    };
  } catch (error) {
    // GO-LIVE-174: Handle specific JWT error types
    if (error instanceof jwt.TokenExpiredError) {
      return { payload: null, error: 'EXPIRED', message: 'Refresh token has expired' };
    }
    if (error instanceof jwt.JsonWebTokenError) {
      if (error.message.includes('signature')) {
        return { payload: null, error: 'INVALID_SIGNATURE', message: 'Invalid token signature' };
      }
      return { payload: null, error: 'INVALID', message: error.message };
    }
    logger.error('[GO-LIVE-174] Unexpected refresh token verification error', error instanceof Error ? error : undefined, { raw: error });
    return { payload: null, error: 'INVALID', message: 'Token verification failed' };
  }
}

/**
 * Decode token without verification (for debugging/logging)
 */
export function decodeToken(token: string): jwt.JwtPayload | null {
  try {
    const decoded = jwt.decode(token);
    if (typeof decoded === 'object' && decoded !== null) {
      return decoded as jwt.JwtPayload;
    }
    return null;
  } catch {
    return null;
  }
}

// =============================================================================
// HASH UTILITIES FOR REFRESH TOKENS
// =============================================================================

/**
 * Hash a refresh token for storage
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Calculate refresh token expiry date
 */
export function getRefreshTokenExpiry(): Date {
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + config.jwt.refreshTokenExpiresInDays);
  return expiry;
}

// =============================================================================
// GL-CRIT-0007: SERVICE-TO-SERVICE AUTHENTICATION
// =============================================================================

const ALLOWED_INTERNAL_SERVICES = [
  'api-gateway',
  'order-service',
  'inventory-service',
  'reorder-service',
  'platform-service',
  'catalog-service',
  'supplier-service',
  'auth-service',
];

/**
 * Generate a service-to-service JWT token
 * Used by services when calling internal endpoints on other services
 *
 * @param serviceName - The name of the calling service
 * @returns A signed JWT token with 5-minute expiry
 */
export function generateServiceToken(serviceName: string): string {
  if (!ALLOWED_INTERNAL_SERVICES.includes(serviceName)) {
    throw new Error(`Unknown service: ${serviceName}`);
  }

  return jwt.sign(
    {
      serviceName,
      type: 'service',
    },
    config.jwt.serviceTokenSecret,
    {
      expiresIn: 300, // 5 minutes - short-lived for security
      issuer: config.jwt.issuer,
    }
  );
}

/**
 * Verify a service-to-service JWT token
 * Used by services to validate internal requests
 *
 * @param token - The JWT token from the request
 * @returns The service token payload if valid, null otherwise
 */
export function verifyServiceToken(token: string): ServiceTokenPayload | null {
  const result = verifyServiceTokenWithError(token);
  return result.payload;
}

export interface ServiceTokenVerifyResult {
  payload: ServiceTokenPayload | null;
  error?: JwtVerifyError | 'UNKNOWN_SERVICE';
  message?: string;
}

/**
 * GO-LIVE-174: Verify service token with detailed error information
 */
export function verifyServiceTokenWithError(token: string): ServiceTokenVerifyResult {
  try {
    // LIVE.BE.JWT_ALGORITHM_PINNING.001: Pin HS256 algorithm
    const decoded = jwt.verify(token, config.jwt.serviceTokenSecret, {
      issuer: config.jwt.issuer,
      algorithms: ['HS256'],
      clockTolerance: 30, // ISSUE-187: 30s tolerance for Cloud Run NTP drift
    }) as jwt.JwtPayload;

    // Validate it's a service token
    if (decoded.type !== 'service' || !decoded.serviceName) {
      return { payload: null, error: 'MALFORMED', message: 'Not a service token' };
    }

    // Validate service name is in allowed list
    if (!ALLOWED_INTERNAL_SERVICES.includes(decoded.serviceName)) {
      return { payload: null, error: 'UNKNOWN_SERVICE', message: `Unknown service: ${decoded.serviceName}` };
    }

    return {
      payload: {
        serviceName: decoded.serviceName,
        type: 'service',
      }
    };
  } catch (error) {
    // GO-LIVE-174: Handle specific JWT error types
    if (error instanceof jwt.TokenExpiredError) {
      return { payload: null, error: 'EXPIRED', message: 'Service token has expired' };
    }
    if (error instanceof jwt.JsonWebTokenError) {
      if (error.message.includes('signature')) {
        return { payload: null, error: 'INVALID_SIGNATURE', message: 'Invalid token signature' };
      }
      return { payload: null, error: 'INVALID', message: error.message };
    }
    logger.error('[GO-LIVE-174] Unexpected service token verification error', error instanceof Error ? error : undefined, { raw: error });
    return { payload: null, error: 'INVALID', message: 'Token verification failed' };
  }
}
