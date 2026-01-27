// Supplier JWT Auth Middleware
// SM-006: Authenticate supplier requests using JWT

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import { config } from '../config.js';

export interface SupplierTokenPayload {
  supplierId: string;
  email: string;
  actorType: 'SUPPLIER';
}

export interface AuthenticatedRequest extends Request {
  supplier: SupplierTokenPayload;
}

/**
 * Middleware to authenticate supplier JWT tokens
 * Adds supplier info to request object
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

    // Verify and decode token
    let decoded: SupplierTokenPayload;
    try {
      decoded = jwt.verify(token, config.jwtSecret) as SupplierTokenPayload;
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

    // Add supplier info to request
    (req as AuthenticatedRequest).supplier = decoded;

    next();
  } catch (error) {
    next(error);
  }
}

export default supplierAuth;
