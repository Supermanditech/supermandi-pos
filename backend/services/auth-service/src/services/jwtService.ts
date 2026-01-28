// JWT Service - V3.0.9 compliant
// JWT generation and verification for authentication

import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import type { JwtPayload, ActorType, UUID } from '@supermandi/common';
import { config } from '../config';

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
export function generateRefreshToken(userId: string): { token: string; tokenId: string } {
  const tokenId = crypto.randomUUID();

  // Convert days to seconds
  const expiresInSeconds = config.jwt.refreshTokenExpiresInDays * 86400;

  const token = jwt.sign(
    {
      sub: userId,
      tokenId,
      type: 'refresh',
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

  const { token: refreshToken, tokenId: refreshTokenId } = generateRefreshToken(userId);

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

/**
 * Verify and decode an access token
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
    }) as jwt.JwtPayload;

    // Validate required fields
    if (!decoded.sub || !decoded.actorType || !Array.isArray(decoded.permissions)) {
      return null;
    }

    return {
      userId: decoded.sub,
      actorType: decoded.actorType as ActorType,
      actorId: decoded.actorId,
      role: '', // Role name not stored in token, derived from permissions
      permissions: decoded.permissions,
      iat: decoded.iat ?? 0,
      exp: decoded.exp ?? 0,
    };
  } catch {
    return null;
  }
}

/**
 * Verify and decode a refresh token
 */
export function verifyRefreshToken(token: string): RefreshTokenPayload | null {
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
    }) as jwt.JwtPayload;

    // Validate it's a refresh token
    if (!decoded.sub || !decoded.tokenId || decoded.type !== 'refresh') {
      return null;
    }

    return {
      sub: decoded.sub,
      tokenId: decoded.tokenId,
      type: 'refresh',
    };
  } catch {
    return null;
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
    config.jwt.secret,
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
  try {
    const decoded = jwt.verify(token, config.jwt.secret, {
      issuer: config.jwt.issuer,
    }) as jwt.JwtPayload;

    // Validate it's a service token
    if (decoded.type !== 'service' || !decoded.serviceName) {
      return null;
    }

    // Validate service name is in allowed list
    if (!ALLOWED_INTERNAL_SERVICES.includes(decoded.serviceName)) {
      return null;
    }

    return {
      serviceName: decoded.serviceName,
      type: 'service',
    };
  } catch {
    return null;
  }
}
