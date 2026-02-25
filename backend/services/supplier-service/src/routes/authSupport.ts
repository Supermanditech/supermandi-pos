import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { ApiError, ERROR_CODES } from '@supermandi/common';
import { config } from '../config';

// =============================================================================
// GL-AUD-008: Bank Detail Validation Functions
// =============================================================================

/**
 * Validate Indian bank account number
 * Indian bank account numbers are typically 9-18 digits
 */
export function isValidBankAccountNumber(accountNumber: string): boolean {
  const trimmed = accountNumber.replace(/\s/g, '');
  return /^\d{9,18}$/.test(trimmed);
}

/**
 * Validate IFSC code
 * Format: 4 letters (bank code) + 0 + 6 alphanumeric characters (branch code)
 * Example: SBIN0001234, HDFC0000001
 */
export function isValidIfscCode(ifsc: string): boolean {
  const trimmed = ifsc.toUpperCase().trim();
  return /^[A-Z]{4}0[A-Z0-9]{6}$/.test(trimmed);
}

/**
 * Validate UPI VPA
 * Format: username@bankhandle
 * Example: merchant@paytm, shop123@ybl
 */
export function isValidUpiVpa(vpa: string): boolean {
  const trimmed = vpa.trim().toLowerCase();
  return /^[a-z0-9._-]{3,}@[a-z0-9]{2,}$/.test(trimmed) && trimmed.length >= 6 && trimmed.length <= 100;
}

// =============================================================================
// T-214 PARITY: Password Strength Validation (matches auth-service)
// =============================================================================

const COMMON_PASSWORDS = new Set([
  'password', 'password1', '12345678', '123456789', '1234567890',
  'qwerty12', 'qwertyui', 'letmein1', 'welcome1', 'monkey12',
  'dragon12', 'master12', 'abc12345', 'abcd1234', 'football',
  'baseball', 'iloveyou', 'trustno1', 'sunshine', 'princess',
  'admin123', 'passw0rd', 'shadow12', 'michael1', 'jennifer',
]);

const PASSWORD_STRENGTH_REGEX = /^(?=.*[a-zA-Z])(?=.*\d).{8,}$/;

export function validatePasswordStrength(password: string): string | null {
  if (!password || password.length < 8) {
    return 'Password must be at least 8 characters';
  }
  if (!PASSWORD_STRENGTH_REGEX.test(password)) {
    return 'Password must contain at least one letter and one number';
  }
  if (COMMON_PASSWORDS.has(password.toLowerCase())) {
    return 'This password is too common. Please choose a stronger password.';
  }
  return null;
}

// =============================================================================
// TYPES
// =============================================================================

export interface RegisterBody {
  businessName: string;
  gstin: string;
  email: string;
  phone: string;
  password: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
  bankAccountName?: string;
  upiVpa?: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export interface SupplierRow {
  id: string;
  gstin: string;
  business_name: string;
  primary_email: string;
  primary_phone: string;
  password_hash: string | null;
  verification_status: string;
  status: string;
}

// =============================================================================
// Request body schema parsing
// =============================================================================

type BodyRecord = Record<string, unknown>;

function toBodyRecord(value: unknown): BodyRecord {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, 'Request body must be a JSON object');
  }
  return value as BodyRecord;
}

function readOptionalString(body: BodyRecord, field: string): string | undefined {
  const value = body[field];
  if (value === undefined || value === null) {
    return undefined;
  }
  if (typeof value !== 'string') {
    throw new ApiError(422, ERROR_CODES.VALIDATION_ERROR, `Field ${field} must be a string`);
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function parseRegisterBody(value: unknown): RegisterBody {
  const body = toBodyRecord(value);

  const requiredFields = ['businessName', 'gstin', 'email', 'phone', 'password'] as const;
  const missingFields = requiredFields.filter((field) => {
    const fieldValue = body[field];
    return typeof fieldValue !== 'string' || fieldValue.trim().length === 0;
  });

  if (missingFields.length > 0) {
    throw new ApiError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      `Missing required fields: ${missingFields.join(', ')}`
    );
  }

  return {
    businessName: (body.businessName as string).trim(),
    gstin: (body.gstin as string).trim(),
    email: (body.email as string).trim(),
    phone: (body.phone as string).trim(),
    password: body.password as string,
    bankAccountNumber: readOptionalString(body, 'bankAccountNumber'),
    bankIfsc: readOptionalString(body, 'bankIfsc'),
    bankAccountName: readOptionalString(body, 'bankAccountName'),
    upiVpa: readOptionalString(body, 'upiVpa'),
  };
}

export function parseLoginBody(value: unknown): LoginBody {
  const body = toBodyRecord(value);

  const requiredFields = ['email', 'password'] as const;
  const missingFields = requiredFields.filter((field) => {
    const fieldValue = body[field];
    return typeof fieldValue !== 'string' || fieldValue.trim().length === 0;
  });

  if (missingFields.length > 0) {
    throw new ApiError(
      422,
      ERROR_CODES.VALIDATION_ERROR,
      `Missing required fields: ${missingFields.join(', ')}`
    );
  }

  return {
    email: (body.email as string).trim(),
    password: body.password as string,
  };
}

// =============================================================================
// JWT token generation support
// =============================================================================

// JWT issuer must match main-backend for cross-service token validation
const JWT_ISSUER = process.env['JWT_ISSUER'] || 'supermandi-auth';

export function getJwtIssuer(): string {
  return JWT_ISSUER;
}

export function generateSupplierToken(supplierId: string, email: string): string {
  const payload = {
    sub: supplierId,
    jti: crypto.randomUUID(),
    actorType: 'SUPPLIER',
    actorId: supplierId,
    email,
    supplierId,
    permissions: ['supplier:read', 'supplier:write', 'products:read', 'products:write'],
  };

  return jwt.sign(payload, config.jwtSecret, {
    expiresIn: '1h',
    issuer: JWT_ISSUER,
  });
}
