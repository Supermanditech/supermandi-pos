// Supplier JWT Auth Middleware
// SM-006: Authenticate supplier requests using JWT

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import { config } from '../config';

// JWT issuer must match main-backend for cross-service token validation
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';

// Support both old and new token formats
export interface SupplierTokenPayload {
  // New format (compatible with main-backend)
  sub?: string;
  actorId?: string;
  // Old format (backward compatibility)
  supplierId?: string;
  email: string;
  actorType: 'SUPPLIER';
  permissions?: string[];
}

export interface AuthenticatedRequest extends Request {
  supplier: SupplierTokenPayload & { supplierId: string };
}

/**
 * Middleware to authenticate supplier JWT tokens
 * Adds supplier info to request object
 * Compatible with tokens from both supplier-service and main-backend
 */
export function supplierAuth(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    // Get token from Authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new ApiError(
        401,
        ERROR_CODES.UNAUTHORIZED,
        'Missing or invalid authorization header'
      );
    }

    const token = authHeader.substring(7);

    // Verify and decode token with issuer validation
    let decoded: SupplierTokenPayload;
    try {
      decoded = jwt.verify(token, config.jwtSecret, { issuer: JWT_ISSUER }) as SupplierTokenPayload;
    } catch (err) {
      if (err instanceof jwt.TokenExpiredError) {
        throw new ApiError(401, ERROR_CODES.UNAUTHORIZED, 'Token expired');
      }
      throw new ApiError(401, ERROR_CODES.UNAUTHORIZED, 'Invalid token');
    }

    // Verify actorType
    if (decoded.actorType !== 'SUPPLIER') {
      throw new ApiError(403, ERROR_CODES.FORBIDDEN, 'Invalid token type');
    }

    // Extract supplierId from either format
    const supplierId = decoded.supplierId || decoded.actorId || decoded.sub;
    if (!supplierId) {
      throw new ApiError(401, ERROR_CODES.UNAUTHORIZED, 'Invalid token: missing supplier ID');
    }

    // Add supplier info to request (normalize to include supplierId)
    (req as AuthenticatedRequest).supplier = {
      ...decoded,
      supplierId,
    };

    next();
  } catch (error) {
    next(error);
  }
}

export default supplierAuth;
