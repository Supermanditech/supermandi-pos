// Admin Routes - PROV-002 / DEV-067
// Store admin APIs for device and enrollment management
// These routes are SUPERADMIN only - enforced by API gateway
// DEV-067: All actions are audit logged to admin.audit_log

import { Router, Request, Response, NextFunction } from 'express';
import { ApiError, query } from '@supermandi/common';
import {
  getAllStores,
  getStoreById,
  createStore,
  updateStore,
  deleteStore,
  type CreateStoreInput,
  type UpdateStoreInput,
} from '../db/queries.js';
import {
  getDevicesForStore,
  getDeviceById,
  updateDeviceStatus,
  createEnrollment,
  getEnrollmentsForStore,
  getEnrollmentById,
  revokeEnrollment,
  countRecentEnrollments,
} from '../db/deviceQueries.js';

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

interface DeviceIdParams {
  deviceId: string;
}

interface EnrollmentIdParams {
  id: string;
}

// =============================================================================
// STORE ADMIN ROUTES
// =============================================================================

/**
 * GET /admin/stores
 * List all stores with pagination
 */
router.get(
  '/stores',
  asyncHandler(async (req: Request, res: Response) => {
    const { page = '1', limit = '50', status } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));

    const allStores = await getAllStores();

    // Filter by status if provided
    let filtered = allStores;
    if (status) {
      filtered = allStores.filter((s) => s.status === status);
    }

    // Paginate
    const total = filtered.length;
    const offset = (pageNum - 1) * limitNum;
    const stores = filtered.slice(offset, offset + limitNum);

    res.json({
      success: true,
      data: stores,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  })
);

/**
 * POST /admin/stores
 * Create a new store
 */
router.post(
  '/stores',
  asyncHandler(async (req: Request, res: Response) => {
    const input = req.body as CreateStoreInput;

    if (!input.name) {
      throw ApiError.badRequest('Store name is required', 'name');
    }
    if (!input.code) {
      throw ApiError.badRequest('Store code is required', 'code');
    }

    const store = await createStore(input);

    res.status(201).json({
      success: true,
      data: store,
    });
  })
);

/**
 * GET /admin/stores/:storeId
 * Get store details
 */
router.get(
  '/stores/:storeId',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const store = await getStoreById(req.params.storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    res.json({
      success: true,
      data: store,
    });
  })
);

/**
 * PUT /admin/stores/:storeId
 * Update store
 */
router.put(
  '/stores/:storeId',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const input = req.body as UpdateStoreInput;
    const store = await updateStore(req.params.storeId, input);

    if (!store) {
      throw ApiError.notFound('Store');
    }

    res.json({
      success: true,
      data: store,
    });
  })
);

/**
 * DELETE /admin/stores/:storeId
 * Delete store
 */
router.delete(
  '/stores/:storeId',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const deleted = await deleteStore(req.params.storeId);
    if (!deleted) {
      throw ApiError.notFound('Store');
    }

    res.json({
      success: true,
      message: 'Store deleted successfully',
    });
  })
);

// =============================================================================
// DEVICE MANAGEMENT ROUTES
// =============================================================================

/**
 * GET /admin/stores/:storeId/devices
 * List all devices for a store
 */
router.get(
  '/stores/:storeId/devices',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const store = await getStoreById(req.params.storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    const devices = await getDevicesForStore(req.params.storeId);

    res.json({
      success: true,
      data: devices.map((d) => ({
        id: d.id,
        deviceId: d.deviceId,
        label: d.label,
        status: d.status,
        deviceType: d.deviceType,
        manufacturer: d.manufacturer,
        model: d.model,
        appVersion: d.appVersion,
        enrolledAt: d.enrolledAt,
        lastSeenAt: d.lastSeenAt,
      })),
    });
  })
);

/**
 * POST /admin/devices/:deviceId/block
 * Block a device
 */
router.post(
  '/devices/:deviceId/block',
  asyncHandler<DeviceIdParams>(async (req, res) => {
    const device = await updateDeviceStatus(req.params.deviceId, 'blocked');

    if (!device) {
      throw ApiError.notFound('Device');
    }

    res.json({
      success: true,
      data: {
        id: device.id,
        deviceId: device.deviceId,
        status: device.status,
      },
    });
  })
);

/**
 * POST /admin/devices/:deviceId/unblock
 * Unblock a device
 */
router.post(
  '/devices/:deviceId/unblock',
  asyncHandler<DeviceIdParams>(async (req, res) => {
    const device = await updateDeviceStatus(req.params.deviceId, 'active');

    if (!device) {
      throw ApiError.notFound('Device');
    }

    res.json({
      success: true,
      data: {
        id: device.id,
        deviceId: device.deviceId,
        status: device.status,
      },
    });
  })
);

// =============================================================================
// ENROLLMENT MANAGEMENT ROUTES
// =============================================================================

/**
 * POST /admin/stores/:storeId/device-enrollments
 * Create a new enrollment code for a store
 * DEV-071: Support isDemo and maxUses for multi-use enrollment codes
 */
router.post(
  '/stores/:storeId/device-enrollments',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const store = await getStoreById(req.params.storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    // Rate limiting: max 10 codes per store per hour
    const recentCount = await countRecentEnrollments(req.params.storeId);
    if (recentCount >= 10) {
      throw ApiError.badRequest(
        'Too many enrollment codes generated. Max 10 per hour.',
        'rate_limit'
      );
    }

    const { expiresInMinutes, label, isDemo, maxUses } = req.body as {
      expiresInMinutes?: number;
      label?: string;
      isDemo?: boolean;
      maxUses?: number;
    };

    const enrollment = await createEnrollment({
      storeId: req.params.storeId,
      expiresInMinutes,
      label,
      isDemo,
      maxUses,
    });

    res.status(201).json({
      success: true,
      data: {
        id: enrollment.id,
        code: enrollment.code,
        storeId: enrollment.storeId,
        expiresAt: enrollment.expiresAt,
        maxUses: enrollment.maxUses,
        usesCount: enrollment.usesCount,
        qrPayload: `supermandi://enroll?code=${enrollment.code}`,
      },
    });
  })
);

/**
 * GET /admin/stores/:storeId/device-enrollments
 * List enrollment codes for a store
 * DEV-071: Include maxUses, usesCount for multi-use code visibility
 */
router.get(
  '/stores/:storeId/device-enrollments',
  asyncHandler<StoreIdParams>(async (req, res) => {
    const store = await getStoreById(req.params.storeId);
    if (!store) {
      throw ApiError.notFound('Store');
    }

    const enrollments = await getEnrollmentsForStore(req.params.storeId);

    res.json({
      success: true,
      data: enrollments.map((e) => {
        // DEV-071: Status calculation for multi-use codes
        const isExpired = new Date(e.expiresAt) < new Date();
        const isFullyUsed = e.usesCount >= e.maxUses;
        let status: string;
        if (e.revokedAt) {
          status = 'revoked';
        } else if (isFullyUsed) {
          status = 'used';
        } else if (isExpired) {
          status = 'expired';
        } else if (e.usesCount > 0) {
          status = 'partially_used';
        } else {
          status = 'pending';
        }

        return {
          id: e.id,
          code: e.code,
          label: e.label,
          expiresAt: e.expiresAt,
          usedAt: e.usedAt,
          revokedAt: e.revokedAt,
          maxUses: e.maxUses,
          usesCount: e.usesCount,
          status,
          createdAt: e.createdAt,
        };
      }),
    });
  })
);

/**
 * POST /admin/device-enrollments/:id/revoke
 * Revoke an enrollment code
 */
router.post(
  '/device-enrollments/:id/revoke',
  asyncHandler<EnrollmentIdParams>(async (req, res) => {
    const enrollment = await revokeEnrollment(req.params.id);

    if (!enrollment) {
      throw ApiError.notFound('Enrollment code not found or already used/revoked');
    }

    res.json({
      success: true,
      data: {
        id: enrollment.id,
        revokedAt: enrollment.revokedAt,
      },
    });
  })
);

// =============================================================================
// PENDING SUPPLIER ENROLLMENT ROUTES (API-021)
// SuperAdmin review and verification of retailer-created suppliers
// =============================================================================

interface PendingRequestIdParams {
  id: string;
}

/**
 * GET /admin/pending-suppliers
 * List all pending supplier requests across all stores
 * SuperAdmin can see the queue of unverified suppliers awaiting verification
 */
router.get(
  '/pending-suppliers',
  asyncHandler(async (req: Request, res: Response) => {
    const { page = '1', limit = '50', status = 'pending' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    // Get pending supplier requests with store info
    const result = await query<{
      id: string;
      store_id: string;
      store_name: string;
      store_code: string;
      requested_gstin: string | null;
      requested_name: string | null;
      requested_phone: string | null;
      requested_email: string | null;
      status: string;
      review_notes: string | null;
      approved_supplier_id: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT sr.id, sr.store_id, s.name as store_name, s.code as store_code,
              sr.requested_gstin, sr.requested_name, sr.requested_phone, sr.requested_email,
              sr.status, sr.review_notes, sr.approved_supplier_id,
              sr.created_at, sr.updated_at
       FROM supplier.supplier_requests sr
       JOIN platform.stores s ON sr.store_id = s.id
       WHERE sr.status = $1
       ORDER BY sr.created_at ASC
       LIMIT $2 OFFSET $3`,
      [status, limitNum, offset]
    );

    // Get total count
    const countResult = await query<{ count: string }>(
      `SELECT COUNT(*) as count FROM supplier.supplier_requests WHERE status = $1`,
      [status]
    );
    const total = parseInt(countResult[0]?.count || '0', 10);

    res.json({
      success: true,
      data: result.map(r => ({
        id: r.id,
        storeId: r.store_id,
        storeName: r.store_name,
        storeCode: r.store_code,
        requestedGstin: r.requested_gstin,
        requestedName: r.requested_name,
        requestedPhone: r.requested_phone,
        requestedEmail: r.requested_email,
        status: r.status,
        reviewNotes: r.review_notes,
        approvedSupplierId: r.approved_supplier_id,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  })
);

/**
 * GET /admin/pending-suppliers/:id
 * Get details of a specific pending supplier request
 */
router.get(
  '/pending-suppliers/:id',
  asyncHandler<PendingRequestIdParams>(async (req, res) => {
    const result = await query<{
      id: string;
      store_id: string;
      store_name: string;
      store_code: string;
      requested_gstin: string | null;
      requested_name: string | null;
      requested_phone: string | null;
      requested_email: string | null;
      status: string;
      review_notes: string | null;
      approved_supplier_id: string | null;
      approved_supplier_name: string | null;
      created_at: Date;
      updated_at: Date;
    }>(
      `SELECT sr.id, sr.store_id, s.name as store_name, s.code as store_code,
              sr.requested_gstin, sr.requested_name, sr.requested_phone, sr.requested_email,
              sr.status, sr.review_notes, sr.approved_supplier_id,
              sup.business_name as approved_supplier_name,
              sr.created_at, sr.updated_at
       FROM supplier.supplier_requests sr
       JOIN platform.stores s ON sr.store_id = s.id
       LEFT JOIN supplier.suppliers sup ON sr.approved_supplier_id = sup.id
       WHERE sr.id = $1`,
      [req.params.id]
    );

    if (result.length === 0) {
      throw ApiError.notFound('Pending supplier request');
    }

    const r = result[0]!;

    // If GSTIN is provided, find potential matches in verified supplier directory
    let potentialMatches: Array<{
      id: string;
      businessName: string;
      gstin: string;
      phone: string | null;
      city: string | null;
      verificationStatus: string;
    }> = [];

    if (r.requested_gstin) {
      const matches = await query<{
        id: string;
        business_name: string;
        gstin: string;
        primary_phone: string | null;
        city: string | null;
        verification_status: string;
      }>(
        `SELECT id, business_name, gstin, primary_phone, city, verification_status
         FROM supplier.suppliers
         WHERE gstin = $1 AND verification_status = 'verified'
         LIMIT 5`,
        [r.requested_gstin]
      );
      potentialMatches = matches.map(m => ({
        id: m.id,
        businessName: m.business_name,
        gstin: m.gstin,
        phone: m.primary_phone,
        city: m.city,
        verificationStatus: m.verification_status,
      }));
    }

    // Also search by phone or name for fuzzy matches
    if (potentialMatches.length === 0 && (r.requested_phone || r.requested_name)) {
      const fuzzyMatches = await query<{
        id: string;
        business_name: string;
        gstin: string;
        primary_phone: string | null;
        city: string | null;
        verification_status: string;
      }>(
        `SELECT id, business_name, gstin, primary_phone, city, verification_status
         FROM supplier.suppliers
         WHERE verification_status = 'verified'
           AND (primary_phone = $1 OR business_name ILIKE $2)
         LIMIT 5`,
        [r.requested_phone || '', `%${r.requested_name || ''}%`]
      );
      potentialMatches = fuzzyMatches.map(m => ({
        id: m.id,
        businessName: m.business_name,
        gstin: m.gstin,
        phone: m.primary_phone,
        city: m.city,
        verificationStatus: m.verification_status,
      }));
    }

    res.json({
      success: true,
      data: {
        id: r.id,
        storeId: r.store_id,
        storeName: r.store_name,
        storeCode: r.store_code,
        requestedGstin: r.requested_gstin,
        requestedName: r.requested_name,
        requestedPhone: r.requested_phone,
        requestedEmail: r.requested_email,
        status: r.status,
        reviewNotes: r.review_notes,
        approvedSupplierId: r.approved_supplier_id,
        approvedSupplierName: r.approved_supplier_name,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
        potentialMatches,
      },
    });
  })
);

/**
 * POST /admin/pending-suppliers/:id/verify
 * Verify a pending supplier request
 *
 * Two modes:
 * 1. { supplierId: string } - Link to existing verified supplier
 * 2. { verifySupplier: true } - Verify the retailer-created supplier directly
 */
router.post(
  '/pending-suppliers/:id/verify',
  asyncHandler<PendingRequestIdParams>(async (req, res) => {
    const { supplierId, verifySupplier, notes } = req.body as {
      supplierId?: string;
      verifySupplier?: boolean;
      notes?: string;
    };

    // Verify the pending request exists and is still pending
    const requestResult = await query<{
      id: string;
      store_id: string;
      status: string;
      approved_supplier_id: string | null;
    }>(
      `SELECT id, store_id, status, approved_supplier_id FROM supplier.supplier_requests WHERE id = $1`,
      [req.params.id]
    );

    if (requestResult.length === 0) {
      throw ApiError.notFound('Pending supplier request');
    }

    if (requestResult[0]!.status !== 'pending') {
      throw ApiError.badRequest('Request has already been processed', 'status');
    }

    const storeId = requestResult[0]!.store_id;
    const retailerSupplierId = requestResult[0]!.approved_supplier_id;

    // MODE 2: Verify the retailer-created supplier directly
    if (verifySupplier) {
      if (!retailerSupplierId) {
        throw ApiError.badRequest('No supplier linked to this request. Use supplierId to link to existing supplier.', 'verifySupplier');
      }

      // Update the supplier's verification_status to 'verified'
      const updateResult = await query<{ id: string; business_name: string }>(
        `UPDATE supplier.suppliers
         SET verification_status = 'verified',
             verified_at = NOW(),
             updated_at = NOW()
         WHERE id = $1
         RETURNING id, business_name`,
        [retailerSupplierId]
      );

      if (updateResult.length === 0) {
        throw ApiError.notFound('Supplier');
      }

      const supplierName = updateResult[0]!.business_name;

      // Update the request to approved
      await query(
        `UPDATE supplier.supplier_requests
         SET status = 'approved',
             review_notes = $1,
             reviewed_at = NOW(),
             updated_at = NOW()
         WHERE id = $2`,
        [notes || 'Supplier verified by SuperAdmin', req.params.id]
      );

      return res.json({
        success: true,
        data: {
          id: req.params.id,
          status: 'approved',
          linkedSupplierId: retailerSupplierId,
          linkedSupplierName: supplierName,
          message: `Successfully verified supplier: ${supplierName}`,
        },
      });
    }

    // MODE 1: Link to existing verified supplier
    if (!supplierId) {
      throw ApiError.badRequest('Either supplierId or verifySupplier=true is required', 'supplierId');
    }

    // Verify the target supplier exists and is verified
    const supplierResult = await query<{
      id: string;
      verification_status: string;
      business_name: string;
    }>(
      `SELECT id, verification_status, business_name FROM supplier.suppliers WHERE id = $1`,
      [supplierId]
    );

    if (supplierResult.length === 0) {
      throw ApiError.notFound('Supplier to link');
    }

    if (supplierResult[0]!.verification_status !== 'verified') {
      throw ApiError.badRequest('Can only link to verified suppliers', 'supplierId');
    }

    const supplierName = supplierResult[0]!.business_name;

    // Update the request to approved
    await query(
      `UPDATE supplier.supplier_requests
       SET status = 'approved',
           approved_supplier_id = $1,
           review_notes = $2,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $3`,
      [supplierId, notes || 'Linked to verified supplier', req.params.id]
    );

    // Create or update the store-supplier link
    await query(
      `INSERT INTO supplier.supplier_store_links (supplier_id, store_id, status)
       VALUES ($1, $2, 'active')
       ON CONFLICT (supplier_id, store_id) DO UPDATE SET status = 'active', updated_at = NOW()`,
      [supplierId, storeId]
    );

    res.json({
      success: true,
      data: {
        id: req.params.id,
        status: 'approved',
        linkedSupplierId: supplierId,
        linkedSupplierName: supplierName,
        message: `Successfully linked to verified supplier: ${supplierName}`,
      },
    });
  })
);

/**
 * POST /admin/pending-suppliers/:id/reject
 * Reject a pending supplier request (keeps supplier as local/unverified)
 * Body: { notes?: string } - Reason for rejection
 */
router.post(
  '/pending-suppliers/:id/reject',
  asyncHandler<PendingRequestIdParams>(async (req, res) => {
    const { notes } = req.body as { notes?: string };

    // Verify the pending request exists and is still pending
    const requestResult = await query<{
      id: string;
      status: string;
    }>(
      `SELECT id, status FROM supplier.supplier_requests WHERE id = $1`,
      [req.params.id]
    );

    if (requestResult.length === 0) {
      throw ApiError.notFound('Pending supplier request');
    }

    if (requestResult[0]!.status !== 'pending') {
      throw ApiError.badRequest('Request has already been processed', 'status');
    }

    // Update the request to rejected
    await query(
      `UPDATE supplier.supplier_requests
       SET status = 'rejected',
           review_notes = $1,
           reviewed_at = NOW(),
           updated_at = NOW()
       WHERE id = $2`,
      [notes || 'Rejected - supplier remains as local supplier', req.params.id]
    );

    res.json({
      success: true,
      data: {
        id: req.params.id,
        status: 'rejected',
        message: 'Request rejected. Supplier remains as local/unverified supplier.',
      },
    });
  })
);

/**
 * GET /admin/verified-suppliers
 * Search verified suppliers directory for linking
 * Used by SuperAdmin when reviewing pending requests to find matches
 */
router.get(
  '/verified-suppliers',
  asyncHandler(async (req: Request, res: Response) => {
    const { search, page = '1', limit = '20' } = req.query;
    const pageNum = Math.max(1, parseInt(page as string, 10));
    const limitNum = Math.min(50, Math.max(1, parseInt(limit as string, 10)));
    const offset = (pageNum - 1) * limitNum;

    let whereClause = "verification_status = 'verified'";
    const params: (string | number)[] = [];

    if (search && typeof search === 'string' && search.trim()) {
      params.push(`%${search.trim()}%`);
      whereClause += ` AND (
        business_name ILIKE $1 OR
        trade_name ILIKE $1 OR
        gstin ILIKE $1 OR
        primary_phone ILIKE $1
      )`;
    }

    const limitParam = params.length + 1;
    const offsetParam = params.length + 2;
    params.push(limitNum, offset);

    const result = await query<{
      id: string;
      business_name: string;
      trade_name: string | null;
      gstin: string;
      primary_phone: string | null;
      city: string | null;
      state: string | null;
    }>(
      `SELECT id, business_name, trade_name, gstin, primary_phone, city, state
       FROM supplier.suppliers
       WHERE ${whereClause}
       ORDER BY business_name
       LIMIT $${limitParam} OFFSET $${offsetParam}`,
      params
    );

    res.json({
      success: true,
      data: result.map(r => ({
        id: r.id,
        businessName: r.business_name,
        tradeName: r.trade_name,
        gstin: r.gstin,
        phone: r.primary_phone,
        city: r.city,
        state: r.state,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
      },
    });
  })
);

export default router;
