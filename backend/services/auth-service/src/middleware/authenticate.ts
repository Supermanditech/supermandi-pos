// Authentication Middleware - V3.0.9 compliant
// JWT verification middleware for protected routes

import { Request, Response, NextFunction } from 'express';
import { ApiError } from '@supermandi/common';
import type { JwtPayload, AuthUser } from '@supermandi/common';
import { verifyAccessToken, verifyAccessTokenWithError } from '../services/jwtService';

// Extend Express Request to include authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
      token?: string;
    }
  }
}

/**
 * Extract bearer token from Authorization header
 */
function extractBearerToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return null;
  }

  const parts = authHeader.split(' ');
  if (parts.length !== 2 || parts[0]?.toLowerCase() !== 'bearer') {
    return null;
  }

  return parts[1] ?? null;
}

/**
 * Convert JWT payload to AuthUser
 */
function payloadToAuthUser(payload: JwtPayload): AuthUser {
  return {
    id: payload.userId,
    actorType: payload.actorType,
    actorId: payload.actorId,
    role: payload.role,
    permissions: payload.permissions,
    name: '', // Not stored in token, will be populated from /me endpoint
  };
}

/**
 * Middleware that requires valid JWT authentication
 * Attaches user info to request.user
 * GO-LIVE-174: Enhanced with specific error messages for different JWT errors
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);

  if (!token) {
    next(ApiError.unauthorized('Authentication required'));
    return;
  }

  // GO-LIVE-174: Use enhanced verification with specific error types
  const result = verifyAccessTokenWithError(token);

  if (!result.payload) {
    // Provide specific error message based on error type
    let message = 'Invalid or expired token';

    switch (result.error) {
      case 'EXPIRED':
        message = 'Token has expired. Please log in again.';
        break;
      case 'INVALID_SIGNATURE':
        message = 'Invalid token signature';
        break;
      case 'MALFORMED':
        message = 'Malformed authentication token';
        break;
      case 'NOT_YET_ACTIVE':
        message = 'Token not yet active';
        break;
      case 'INVALID':
        message = result.message || 'Invalid token';
        break;
    }

    next(ApiError.unauthorized(message));
    return;
  }

  // Attach user and token to request
  req.user = payloadToAuthUser(result.payload);
  req.token = token;

  next();
}

/**
 * Optional authentication - doesn't fail if no token provided
 * Useful for routes that behave differently for authenticated users
 */
export function optionalAuthenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const token = extractBearerToken(req);

  if (token) {
    const payload = verifyAccessToken(token);
    if (payload) {
      req.user = payloadToAuthUser(payload);
      req.token = token;
    }
  }

  next();
}

/**
 * Standalone function to verify a JWT token
 * Useful for service-to-service calls
 */
export function verifyJwt(token: string): JwtPayload | null {
  return verifyAccessToken(token);
}

/**
 * Get authenticated user from request
 * Throws if not authenticated
 */
export function getAuthUser(req: Request): AuthUser {
  if (!req.user) {
    throw ApiError.unauthorized('Authentication required');
  }
  return req.user;
}
