// Admin Routes - PROV-002 / DEV-067
// Store admin APIs for device and enrollment management
// These routes are SUPERADMIN only - enforced by API gateway
// DEV-067: All actions are audit logged to admin.audit_log

import { Router, Request, Response, NextFunction } from 'express';
import { ApiError } from '@supermandi/common';
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

export default router;
