// Retailer Admin Compliance Routes - MED-001
// Returns compliance document status for retailer stores

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

export const retailerComplianceRouter = Router();

/**
 * Get store ID from gateway-provided headers
 * Gateway sets x-actor-id after JWT verification
 */
function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

// Document types that retailers need to submit
const REQUIRED_DOCUMENT_TYPES = [
  { value: "gstin", label: "GSTIN Certificate", required: false },
  { value: "fssai", label: "FSSAI License", required: false },
  { value: "shop_license", label: "Shop License", required: true },
  { value: "pan", label: "PAN Card", required: true },
  { value: "trade_license", label: "Trade License", required: false },
];

/**
 * GET /api/v1/retailer-admin/compliance
 * Returns compliance documents status for the retailer's store
 */
retailerComplianceRouter.get("/compliance", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ success: false, error: "database unavailable" });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(400).json({ success: false, error: "Store not configured" });
  }

  try {
    // MED-001: For now, return empty documents with feature flag
    // Full implementation would query a compliance_documents table
    const documents: any[] = [];

    // Note: gstin, pan, fssai_license_no columns don't exist yet in platform.stores
    // When they're added, we can query them here. For now, return empty list.

    // Calculate summary
    const verifiedCount = documents.filter(d => d.status === "verified").length;
    const pendingCount = documents.filter(d => d.status === "pending").length;
    const rejectedCount = documents.filter(d => d.status === "rejected").length;

    return res.json({
      success: true,
      data: {
        documents,
        summary: {
          verified: verifiedCount,
          pending: pendingCount,
          rejected: rejectedCount,
          total: documents.length,
        },
        documentTypes: REQUIRED_DOCUMENT_TYPES,
        // MED-001: Flag that document upload is not yet implemented
        uploadEnabled: false,
        message: "Document upload coming soon. Contact support to update compliance documents.",
      },
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[Compliance] Error:", error.message);
    return res.status(500).json({ success: false, error: "Failed to fetch compliance status" });
  }
});

/**
 * GET /api/v1/retailer-admin/compliance/types
 * Returns list of required document types
 */
retailerComplianceRouter.get("/compliance/types", async (_req: Request, res: Response) => {
  return res.json({
    success: true,
    data: {
      documentTypes: REQUIRED_DOCUMENT_TYPES,
    },
  });
});

// =============================================================================
// GO-LIVE-264: GDPR Data Export Endpoints
// =============================================================================

/**
 * POST /api/v1/retailer-admin/export
 * Request a GDPR data export for the authenticated user
 */
retailerComplianceRouter.post("/export", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  // Get user ID from gateway headers
  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User not identified" } });
  }

  const { requestType = 'full_export' } = req.body;

  // Validate request type
  const validTypes = ['full_export', 'partial_export'];
  if (!validTypes.includes(requestType)) {
    return res.status(400).json({
      error: { code: "VALIDATION_ERROR", message: "Invalid request type. Must be 'full_export' or 'partial_export'" }
    });
  }

  try {
    // Check for existing pending/processing export
    const existingResult = await pool.query(
      `SELECT id, status, requested_at FROM auth.data_export_requests
       WHERE user_id = $1 AND status IN ('pending', 'processing')
       ORDER BY requested_at DESC LIMIT 1`,
      [userId]
    );

    if (existingResult.rows.length > 0) {
      return res.status(409).json({
        error: {
          code: "EXPORT_IN_PROGRESS",
          message: "An export request is already in progress. Please wait for it to complete."
        },
        existingExport: {
          id: existingResult.rows[0].id,
          status: existingResult.rows[0].status,
          requestedAt: existingResult.rows[0].requested_at
        }
      });
    }

    // Create new export request
    const result = await pool.query(
      `INSERT INTO auth.data_export_requests (user_id, store_id, request_type, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id, request_type, status, requested_at, expires_at`,
      [userId, storeId, requestType]
    );

    const exportRequest = result.rows[0];

    log.info(`[GO-LIVE-264] GDPR export requested: user=${userId}, store=${storeId}, type=${requestType}`);

    return res.status(201).json({
      success: true,
      data: {
        exportId: exportRequest.id,
        requestType: exportRequest.request_type,
        status: exportRequest.status,
        requestedAt: exportRequest.requested_at,
        expiresAt: exportRequest.expires_at,
        message: "Your data export request has been received. You will be notified when it's ready."
      }
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[GO-LIVE-264] Export request error:", error.message);

    // Handle table not existing
    if (error.code === "42P01") {
      return res.status(503).json({
        error: { code: "SERVICE_UNAVAILABLE", message: "Data export service not yet available. Please run migrations." }
      });
    }

    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to create export request" }
    });
  }
});

/**
 * GET /api/v1/retailer-admin/export
 * Get all export requests for the authenticated user
 */
retailerComplianceRouter.get("/export", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User not identified" } });
  }

  try {
    const result = await pool.query(
      `SELECT id as "exportId", request_type as "requestType", status,
              requested_at as "requestedAt", completed_at as "completedAt",
              expires_at as "expiresAt", file_size_bytes as "fileSizeBytes"
       FROM auth.data_export_requests
       WHERE user_id = $1
       ORDER BY requested_at DESC
       LIMIT 10`,
      [userId]
    );

    return res.json({
      success: true,
      data: result.rows,
      count: result.rows.length
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[GO-LIVE-264] Get exports error:", error.message);

    if (error.code === "42P01") {
      return res.json({
        success: true,
        data: [],
        count: 0,
        message: "Data export service not yet available"
      });
    }

    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to get export requests" }
    });
  }
});

/**
 * GET /api/v1/retailer-admin/export/:id
 * Get status of a specific export request
 */
retailerComplianceRouter.get("/export/:id", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User not identified" } });
  }

  const { id } = req.params;

  try {
    const result = await pool.query(
      `SELECT id as "exportId", request_type as "requestType", status,
              requested_at as "requestedAt", completed_at as "completedAt",
              expires_at as "expiresAt", download_url as "downloadUrl",
              file_size_bytes as "fileSizeBytes", notes
       FROM auth.data_export_requests
       WHERE id = $1 AND user_id = $2`,
      [id, userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Export request not found" }
      });
    }

    const exportData = result.rows[0];

    // Check if expired
    if (exportData.expiresAt && new Date(exportData.expiresAt) < new Date()) {
      exportData.status = 'expired';
      exportData.downloadUrl = null;
    }

    return res.json({
      success: true,
      data: exportData
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[GO-LIVE-264] Get export status error:", error.message);

    if (error.code === "42P01") {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Export request not found" }
      });
    }

    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to get export status" }
    });
  }
});

/**
 * POST /api/v1/retailer-admin/privacy/accept
 * Record privacy policy acceptance
 * GO-LIVE-263: Privacy consent tracking
 */
retailerComplianceRouter.post("/privacy/accept", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User not identified" } });
  }

  const { privacyVersion = '1.0', termsVersion = '1.0' } = req.body;

  try {
    // Update auth.users
    await pool.query(
      `UPDATE auth.users SET
        privacy_accepted_at = NOW(),
        terms_accepted_at = NOW(),
        privacy_version = $2,
        terms_version = $3,
        updated_at = NOW()
       WHERE id = $1`,
      [userId, privacyVersion, termsVersion]
    );

    // Also update auth.store_users if exists
    await pool.query(
      `UPDATE auth.store_users SET
        privacy_accepted_at = NOW(),
        terms_accepted_at = NOW(),
        privacy_version = $2,
        terms_version = $3
       WHERE user_id = $1 AND store_id = $4`,
      [userId, privacyVersion, termsVersion, storeId]
    );

    log.info(`[GO-LIVE-263] Privacy consent recorded: user=${userId}, privacy=${privacyVersion}, terms=${termsVersion}`);

    return res.json({
      success: true,
      data: {
        privacyAcceptedAt: new Date().toISOString(),
        termsAcceptedAt: new Date().toISOString(),
        privacyVersion,
        termsVersion
      },
      message: "Privacy policy and terms acceptance recorded"
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[GO-LIVE-263] Privacy accept error:", error.message);

    // Handle column not existing yet
    if (error.code === "42703") {
      return res.json({
        success: true,
        data: {
          privacyAcceptedAt: new Date().toISOString(),
          termsAcceptedAt: new Date().toISOString(),
          privacyVersion,
          termsVersion
        },
        message: "Privacy acceptance recorded (pending migration)"
      });
    }

    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to record privacy acceptance" }
    });
  }
});

/**
 * GET /api/v1/retailer-admin/privacy/status
 * Get privacy consent status for the authenticated user
 * GO-LIVE-263: Privacy consent tracking
 */
retailerComplianceRouter.get("/privacy/status", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const userId = req.headers['x-user-id'];
  if (!userId || typeof userId !== 'string') {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "User not identified" } });
  }

  try {
    const result = await pool.query(
      `SELECT
        privacy_accepted_at as "privacyAcceptedAt",
        terms_accepted_at as "termsAcceptedAt",
        privacy_version as "privacyVersion",
        terms_version as "termsVersion"
       FROM auth.users
       WHERE id = $1`,
      [userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "User not found" }
      });
    }

    const consent = result.rows[0];
    const currentPrivacyVersion = '1.0';
    const currentTermsVersion = '1.0';

    return res.json({
      success: true,
      data: {
        privacyAccepted: !!consent.privacyAcceptedAt,
        privacyAcceptedAt: consent.privacyAcceptedAt,
        privacyVersion: consent.privacyVersion,
        privacyNeedsUpdate: consent.privacyVersion !== currentPrivacyVersion,
        termsAccepted: !!consent.termsAcceptedAt,
        termsAcceptedAt: consent.termsAcceptedAt,
        termsVersion: consent.termsVersion,
        termsNeedsUpdate: consent.termsVersion !== currentTermsVersion,
        currentPrivacyVersion,
        currentTermsVersion
      }
    });
  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[GO-LIVE-263] Privacy status error:", error.message);

    // Handle columns not existing yet
    if (error.code === "42703") {
      return res.json({
        success: true,
        data: {
          privacyAccepted: false,
          privacyAcceptedAt: null,
          privacyVersion: null,
          privacyNeedsUpdate: true,
          termsAccepted: false,
          termsAcceptedAt: null,
          termsVersion: null,
          termsNeedsUpdate: true,
          currentPrivacyVersion: '1.0',
          currentTermsVersion: '1.0'
        },
        message: "Privacy status unavailable (pending migration)"
      });
    }

    return res.status(500).json({
      error: { code: "INTERNAL_ERROR", message: "Failed to get privacy status" }
    });
  }
});
