/**
 * STG-485: DPDP Consent API
 *
 * POST /api/v1/consent/record  — Record consent given by customer
 * GET  /api/v1/consent/check   — Check if active consent exists
 * POST /api/v1/consent/revoke  — Revoke previously given consent
 */

import { Router, Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { query, queryOne, ApiError, ERROR_CODES } from '@supermandi/common';
import { log } from '../../lib/logger';

export const consentRouter = Router();

// =============================================================================
// Types
// =============================================================================

interface RecordConsentBody {
  customerPhone: string;
  consentType: string;
}

interface CheckConsentQuery {
  customerPhone: string;
  consentType: string;
}

const VALID_CONSENT_TYPES = ['credit_scoring', 'khata_phone', 'pan_collection', 'aadhaar_collection', 'phone_collection'];

function validatePhone(phone: string): boolean {
  // Indian phone: 10 digits, optionally prefixed with +91
  return /^(\+91)?[6-9]\d{9}$/.test(phone);
}

// =============================================================================
// POST /consent/record — Record customer consent
// =============================================================================

consentRouter.post(
  '/consent/record',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { customerPhone, consentType } = req.body as RecordConsentBody;

      if (!customerPhone || !consentType) {
        throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'customerPhone and consentType are required');
      }

      if (!validatePhone(customerPhone)) {
        throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'Invalid phone number format');
      }

      if (!VALID_CONSENT_TYPES.includes(consentType)) {
        throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, `Invalid consent type. Valid: ${VALID_CONSENT_TYPES.join(', ')}`);
      }

      // R7: Derive store_id from JWT
      const storeId = (req as any).auth?.storeId || (req as any).user?.storeId;
      if (!storeId) {
        throw new ApiError(401, ERROR_CODES.UNAUTHORIZED, 'Store context required');
      }

      const staffId = (req as any).auth?.staffId || (req as any).user?.id || null;

      // Check if active consent already exists
      const existing = await queryOne<{ id: string }>(
        `SELECT id FROM platform.consent_records
         WHERE store_id = $1 AND customer_phone = $2 AND consent_type = $3 AND revoked_at IS NULL`,
        [storeId, customerPhone, consentType]
      );

      if (existing) {
        // Consent already active — return existing
        res.json({ success: true, consentId: existing.id, status: 'already_active' });
        return;
      }

      const id = uuidv4();
      await query(
        `INSERT INTO platform.consent_records (id, store_id, customer_phone, consent_type, given_at, ip_address, user_agent, recorded_by)
         VALUES ($1, $2, $3, $4, NOW(), $5, $6, $7)`,
        [id, storeId, customerPhone, consentType, req.ip || null, req.get('user-agent') || null, staffId]
      );

      log.info('[Consent] Recorded consent', { storeId, consentType, consentId: id });
      res.status(201).json({ success: true, consentId: id, status: 'recorded' });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// GET /consent/check — Check if active consent exists
// =============================================================================

consentRouter.get(
  '/consent/check',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { customerPhone, consentType } = req.query as unknown as CheckConsentQuery;

      if (!customerPhone || !consentType) {
        throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'customerPhone and consentType query params required');
      }

      const storeId = (req as any).auth?.storeId || (req as any).user?.storeId;
      if (!storeId) {
        throw new ApiError(401, ERROR_CODES.UNAUTHORIZED, 'Store context required');
      }

      const consent = await queryOne<{ id: string; given_at: string }>(
        `SELECT id, given_at FROM platform.consent_records
         WHERE store_id = $1 AND customer_phone = $2 AND consent_type = $3 AND revoked_at IS NULL
         ORDER BY given_at DESC LIMIT 1`,
        [storeId, customerPhone, consentType]
      );

      res.json({
        success: true,
        hasConsent: !!consent,
        consentId: consent?.id || null,
        givenAt: consent?.given_at || null,
      });
    } catch (error) {
      next(error);
    }
  }
);

// =============================================================================
// POST /consent/revoke — Revoke previously given consent
// =============================================================================

consentRouter.post(
  '/consent/revoke',
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { customerPhone, consentType } = req.body as RecordConsentBody;

      if (!customerPhone || !consentType) {
        throw new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'customerPhone and consentType are required');
      }

      const storeId = (req as any).auth?.storeId || (req as any).user?.storeId;
      if (!storeId) {
        throw new ApiError(401, ERROR_CODES.UNAUTHORIZED, 'Store context required');
      }

      const result = await query(
        `UPDATE platform.consent_records SET revoked_at = NOW()
         WHERE store_id = $1 AND customer_phone = $2 AND consent_type = $3 AND revoked_at IS NULL`,
        [storeId, customerPhone, consentType]
      );

      const revoked = (result as any).rowCount > 0;
      log.info('[Consent] Revoke consent', { storeId, consentType, revoked });

      res.json({ success: true, revoked });
    } catch (error) {
      next(error);
    }
  }
);
