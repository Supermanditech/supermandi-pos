// Authentication Middleware - V3.0.9 compliant
// JWT verification middleware for protected routes

import { Request, Response, NextFunction } from 'express';
import { ApiError } from '@supermandi/common';
import type { JwtPayload, AuthUser } from '@supermandi/common';
import { verifyAccessToken } from '../services/jwtService';

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

  const payload = verifyAccessToken(token);
  if (!payload) {
    next(ApiError.unauthorized('Invalid or expired token'));
    return;
  }

  // Attach user and token to request
  req.user = payloadToAuthUser(payload);
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
