// Retailer Admin Routes - SuperAdmin Portal Management
// Routes for initializing and managing retailer portal access
// These routes are SUPERADMIN only - enforced by API gateway

import { Router, Request, Response, NextFunction } from 'express';
import { ApiError } from '@supermandi/common';
import { getStoreById } from '../db/queries';
import {
  getRetailerPortalInfo,
  enableRetailerPortal,
  updateRetailerPortalPhone,
  disableRetailerPortal,
  createStoreUser,
  getStoreUser,
  deleteStoreUser,
  getComplianceDocuments,
  getComplianceDocumentById,
  updateComplianceDocumentStatus,
  createImpersonationLog,
  getImpersonationLogs,
} from '../db/retailerAdminQueries';
import {
  normalizePhoneNumber,
  isValidPhoneNumber,
  maskPhoneNumber,
} from '@supermandi/common';
import { generateSignedDownloadUrl } from '@supermandi/common';

const router: Router = Router();

// =============================================================================
// ASYNC HANDLER
// =============================================================================

type AsyncHandler<P = Record<string, string>> = (
  req: Request<P>,
  res: Response,
  next: NextFunction
) => Promise<void>;

function asyncHandler<P = Record<string, string>>(fn: AsyncHandler<P>): AsyncHandler<P> {
  return async (req, res, next) => {
    try {
      await fn(req, res, next);
    } catch (error) {
      next(error);
    }
  };
}

// =============================================================================
// ROUTE PARAMS
// =============================================================================

interface StoreIdParams {
  storeId: string;
}

interface ComplianceIdParams {
  storeId: string;
  id: string;
}

// =============================================================================
// RETAILER PORTAL INIT ROUTES
// =============================================================================

/**
 * POST /admin/stores/:storeId/retailer-admin/init
 * Initialize retailer portal access for a store
 * Creates user in auth.users, links via auth.store_users, enables portal
 */
router.post(
  '/stores/:storeId/retailer-admin/init',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const { storeId } = req.params;
    const { phone } = req.body as { phone: string };

    // Validate store exists
    const store = await getStoreById(storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    // Validate phone
    if (!phone) {
      throw ApiError.badRequest('Phone number is required', 'phone');
    }

    const normalizedPhone = normalizePhoneNumber(phone);
    if (!isValidPhoneNumber(normalizedPhone)) {
      throw ApiError.badRequest('Invalid phone number format. Must be 10-digit Indian number.', 'phone');
    }

    // Check if portal already enabled
    const portalInfo = await getRetailerPortalInfo(storeId);
    if (portalInfo?.retailer_portal_enabled) {
      throw ApiError.conflict('PORTAL_ALREADY_ENABLED', 'Retailer portal is already enabled for this store');
    }

    // Get admin user ID from JWT (set by API gateway)
    const adminUserId = req.headers['x-user-id'] as string;
    if (!adminUserId) {
      throw ApiError.unauthorized('Admin user ID required');
    }

    // For now, we'll create the user record when they first login via Firebase
    // Just enable the portal with the phone number
    await enableRetailerPortal({
      storeId,
      phone: normalizedPhone,
      enabledBy: adminUserId,
    });

    res.status(201).json({
      success: true,
      data: {
        storeId,
        storeCode: store.code,
        portalUrl: `https://supermandi.tech/s/${store.code}`,
        phone: normalizedPhone,
        maskedPhone: maskPhoneNumber(normalizedPhone),
        message: 'Retailer portal initialized. User will complete registration on first login.',
      },
    });
  })
);

/**
 * GET /admin/stores/:storeId/retailer-admin
 * Get retailer portal status for a store
 */
router.get(
  '/stores/:storeId/retailer-admin',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const { storeId } = req.params;

    // Validate store exists
    const store = await getStoreById(storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    const portalInfo = await getRetailerPortalInfo(storeId);

    res.json({
      success: true,
      data: {
        storeId,
        storeCode: store.code,
        portalEnabled: portalInfo?.retailer_portal_enabled || false,
        portalUrl: portalInfo?.retailer_portal_enabled ? `https://supermandi.in/s/${store.code}` : null,
        phone: portalInfo?.retailer_portal_phone || null,
        maskedPhone: portalInfo?.retailer_portal_phone
          ? maskPhoneNumber(portalInfo.retailer_portal_phone)
          : null,
        enabledAt: portalInfo?.retailer_portal_enabled_at || null,
      },
    });
  })
);

/**
 * PATCH /admin/stores/:storeId/retailer-admin
 * Update retailer portal settings (e.g., change phone)
 */
router.patch(
  '/stores/:storeId/retailer-admin',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const { storeId } = req.params;
    const { phone } = req.body as { phone?: string };

    // Validate store exists
    const store = await getStoreById(storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    // Check if portal enabled
    const portalInfo = await getRetailerPortalInfo(storeId);
    if (!portalInfo?.retailer_portal_enabled) {
      throw ApiError.badRequest('Retailer portal is not enabled for this store');
    }

    // Update phone if provided
    if (phone) {
      const normalizedPhone = normalizePhoneNumber(phone);
      if (!isValidPhoneNumber(normalizedPhone)) {
        throw ApiError.badRequest('Invalid phone number format', 'phone');
      }

      await updateRetailerPortalPhone(storeId, normalizedPhone);

      res.json({
        success: true,
        data: {
          storeId,
          phone: normalizedPhone,
          maskedPhone: maskPhoneNumber(normalizedPhone),
          message: 'Phone number updated. User must use new number to login.',
        },
      });
    } else {
      res.json({
        success: true,
        data: { storeId, message: 'No changes made' },
      });
    }
  })
);

/**
 * DELETE /admin/stores/:storeId/retailer-admin
 * Disable retailer portal access for a store
 */
router.delete(
  '/stores/:storeId/retailer-admin',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const { storeId } = req.params;

    // Validate store exists
    const store = await getStoreById(storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    await disableRetailerPortal(storeId);

    res.json({
      success: true,
      data: {
        storeId,
        message: 'Retailer portal access disabled',
      },
    });
  })
);

// =============================================================================
// IMPERSONATION ROUTES
// =============================================================================

/**
 * POST /admin/stores/:storeId/impersonate
 * Generate a short-lived JWT for impersonating a retailer
 * Audited and time-limited (15 minutes)
 */
router.post(
  '/stores/:storeId/impersonate',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const { storeId } = req.params;

    // Validate store exists
    const store = await getStoreById(storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    // Check if portal enabled
    const portalInfo = await getRetailerPortalInfo(storeId);
    if (!portalInfo?.retailer_portal_enabled) {
      throw ApiError.badRequest('Retailer portal is not enabled for this store');
    }

    // Get admin user ID from JWT
    const adminUserId = req.headers['x-user-id'] as string;
    if (!adminUserId) {
      throw ApiError.unauthorized('Admin user ID required');
    }

    // Token expires in 15 minutes
    const tokenExpiresAt = new Date(Date.now() + 15 * 60 * 1000);

    // Create audit log
    await createImpersonationLog({
      adminUserId,
      targetStoreId: storeId,
      ipAddress: req.ip || req.headers['x-forwarded-for'] as string,
      userAgent: req.headers['user-agent'],
      tokenExpiresAt,
    });

    // Generate impersonation token
    // Note: This would call auth-service to generate a special JWT
    // For now, return the portal URL with a note about implementation
    res.json({
      success: true,
      data: {
        storeId,
        storeCode: store.code,
        portalUrl: `https://supermandi.tech/s/${store.code}`,
        expiresAt: tokenExpiresAt,
        impersonatedBy: adminUserId,
        message: 'Impersonation session created. Token generation requires auth-service integration.',
      },
    });
  })
);

/**
 * GET /admin/stores/:storeId/impersonation-logs
 * Get impersonation audit logs for a store
 */
router.get(
  '/stores/:storeId/impersonation-logs',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const { storeId } = req.params;

    // Validate store exists
    const store = await getStoreById(storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    const logs = await getImpersonationLogs(storeId);

    res.json({
      success: true,
      data: logs.map((log) => ({
        id: log.id,
        adminUserId: log.admin_user_id,
        ipAddress: log.ip_address,
        tokenExpiresAt: log.token_expires_at,
        createdAt: log.created_at,
      })),
    });
  })
);

// =============================================================================
// COMPLIANCE DOCUMENT ROUTES (SuperAdmin View)
// =============================================================================

/**
 * GET /admin/stores/:storeId/compliance
 * List compliance documents for a store
 */
router.get(
  '/stores/:storeId/compliance',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const { storeId } = req.params;

    // Validate store exists
    const store = await getStoreById(storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    const docs = await getComplianceDocuments(storeId);

    res.json({
      success: true,
      data: docs.map((doc) => ({
        id: doc.id,
        documentType: doc.document_type,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
        fileSize: doc.file_size,
        status: doc.status,
        rejectionReason: doc.rejection_reason,
        uploadedAt: doc.uploaded_at,
        verifiedAt: doc.verified_at,
        createdAt: doc.created_at,
      })),
    });
  })
);

/**
 * GET /admin/stores/:storeId/compliance/:id/download
 * Get signed download URL for a compliance document
 */
router.get(
  '/stores/:storeId/compliance/:id/download',
  asyncHandler<ComplianceIdParams>(async (req, res) => {
    const { storeId, id } = req.params;

    // Validate store exists
    const store = await getStoreById(storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    const doc = await getComplianceDocumentById(id);
    if (!doc || doc.store_id !== storeId) {
      throw ApiError.notFound('Document');
    }

    if (doc.status === 'pending') {
      throw ApiError.badRequest('Document not yet uploaded');
    }

    const { downloadUrl, expiresAt } = await generateSignedDownloadUrl({
      bucket: doc.gcs_bucket,
      objectKey: doc.gcs_object_key,
    });

    res.json({
      success: true,
      data: {
        downloadUrl,
        expiresAt,
        fileName: doc.file_name,
        mimeType: doc.mime_type,
      },
    });
  })
);

/**
 * PATCH /admin/stores/:storeId/compliance/:id
 * Verify or reject a compliance document
 */
router.patch(
  '/stores/:storeId/compliance/:id',
  asyncHandler<ComplianceIdParams>(async (req, res) => {
    const { storeId, id } = req.params;
    const { status, rejectionReason } = req.body as {
      status: 'verified' | 'rejected';
      rejectionReason?: string;
    };

    // Validate store exists
    const store = await getStoreById(storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    // Validate status
    if (!['verified', 'rejected'].includes(status)) {
      throw ApiError.badRequest('Status must be "verified" or "rejected"', 'status');
    }

    if (status === 'rejected' && !rejectionReason) {
      throw ApiError.badRequest('Rejection reason is required', 'rejectionReason');
    }

    // Get admin user ID
    const adminUserId = req.headers['x-user-id'] as string;
    if (!adminUserId) {
      throw ApiError.unauthorized('Admin user ID required');
    }

    const doc = await getComplianceDocumentById(id);
    if (!doc || doc.store_id !== storeId) {
      throw ApiError.notFound('Document');
    }

    if (doc.status !== 'uploaded') {
      throw ApiError.badRequest(`Cannot ${status} a document with status "${doc.status}"`);
    }

    const updated = await updateComplianceDocumentStatus({
      id,
      status,
      rejectionReason,
      verifiedByUserId: adminUserId,
    });

    res.json({
      success: true,
      data: {
        id: updated?.id,
        status: updated?.status,
        rejectionReason: updated?.rejection_reason,
        verifiedAt: updated?.verified_at,
      },
    });
  })
);

export default router;
