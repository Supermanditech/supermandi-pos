// REG-AUTH-203: Registration Guard Middleware
// Enforces the registration-first principle: OTP verify requires application_id
//
// CRITICAL CONTRACT RULE:
// ┌─────────────────────────────────────────────────────────────────────────────┐
// │  OTP VERIFY PERMITTED ONLY WITH EXISTING REGISTRATION/APPLICATION_ID       │
// │                                                                             │
// │  OTHERWISE → 403 FORBIDDEN: "Registration required before login."          │
// └─────────────────────────────────────────────────────────────────────────────┘

import { Request, Response, NextFunction } from "express";

// Error code constants for standardization
export const REG_AUTH_ERRORS = {
  REGISTRATION_REQUIRED: {
    code: 'REGISTRATION_REQUIRED',
    errorCode: 'REG_AUTH_001',
    status: 403,
    message: 'Registration required before login. Please complete registration first.',
  },
  LIMITED_MODE: {
    code: 'LIMITED_MODE',
    errorCode: 'REG_AUTH_002',
    status: 403,
    message: 'Your account is pending approval. Limited access only.',
  },
  GSTIN_EXISTS: {
    code: 'GSTIN_EXISTS',
    errorCode: 'REG_AUTH_003',
    status: 409,
    message: 'GSTIN already registered.',
  },
  INVALID_GSTIN: {
    code: 'INVALID_GSTIN',
    errorCode: 'REG_AUTH_004',
    status: 400,
    message: 'Invalid GSTIN format.',
  },
  APPLICATION_EXPIRED: {
    code: 'APPLICATION_EXPIRED',
    errorCode: 'REG_AUTH_005',
    status: 403,
    message: 'Your application has expired. Please contact support.',
  },
  MISSING_DOCUMENTS: {
    code: 'MISSING_DOCUMENTS',
    errorCode: 'REG_AUTH_006',
    status: 400,
    message: 'Required documents not uploaded.',
  },
  PHONE_MISMATCH: {
    code: 'PHONE_MISMATCH',
    errorCode: 'REG_AUTH_007',
    status: 403,
    message: 'Phone number does not match application.',
  },
  APPLICATION_NOT_FOUND: {
    code: 'APPLICATION_NOT_FOUND',
    errorCode: 'REG_AUTH_008',
    status: 404,
    message: 'Application not found.',
  },
};

/**
 * Middleware: requireRegistrationForOtp
 *
 * REG-AUTH-203: Blocks OTP verification requests that don't include an application_id.
 * This enforces the registration-first principle.
 *
 * Usage:
 * router.post("/verify-otp", requireRegistrationForOtp, async (req, res) => { ... });
 *
 * Returns 403 if applicationId is missing from request body.
 */
export function requireRegistrationForOtp(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const { applicationId } = req.body;

  if (!applicationId) {
    const error = REG_AUTH_ERRORS.REGISTRATION_REQUIRED;
    res.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        errorCode: error.errorCode,
      }
    });
    return;
  }

  next();
}

/**
 * Helper: sendRegistrationRequiredError
 *
 * Standardized error response for registration-required scenarios.
 * Use this when you need to manually return the 403 error.
 */
export function sendRegistrationRequiredError(res: Response): void {
  const error = REG_AUTH_ERRORS.REGISTRATION_REQUIRED;
  res.status(error.status).json({
    error: {
      code: error.code,
      message: error.message,
      errorCode: error.errorCode,
    }
  });
}

/**
 * Helper: validateApplicationId
 *
 * Validates that an applicationId is a valid UUID format.
 * Returns true if valid, false otherwise.
 */
export function validateApplicationId(applicationId: string): boolean {
  if (!applicationId) return false;

  // UUID v4 format: 8-4-4-4-12 hex characters
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(applicationId);
}

/**
 * Middleware factory: requireApplicationStatus
 *
 * REG-AUTH-204: Blocks requests based on application status.
 * Use for endpoints that require ACTIVE status.
 *
 * @param allowedStatuses - Array of statuses that are allowed (default: ['ACTIVE'])
 *
 * Expects req.applicationStatus to be set by previous middleware.
 */
export function requireApplicationStatus(allowedStatuses: string[] = ['ACTIVE']) {
  return (req: Request & { applicationStatus?: string }, res: Response, next: NextFunction): void => {
    const status = req.applicationStatus;

    if (!status) {
      // If no status, registration required
      sendRegistrationRequiredError(res);
      return;
    }

    if (!allowedStatuses.includes(status)) {
      const error = REG_AUTH_ERRORS.LIMITED_MODE;
      res.status(error.status).json({
        error: {
          code: error.code,
          message: error.message,
          errorCode: error.errorCode,
          currentStatus: status,
        }
      });
      return;
    }

    next();
  };
}

export default {
  requireRegistrationForOtp,
  requireApplicationStatus,
  sendRegistrationRequiredError,
  validateApplicationId,
  REG_AUTH_ERRORS,
};
