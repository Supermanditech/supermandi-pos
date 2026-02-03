// Retailer Admin Device Routes
// RET-WEB-002: POS Device Activation via Code
// POS-DEV-001: Device-Generated Activation Code binding
// Store-scoped via JWT (x-actor-id header from gateway)

import { Router, Request, Response } from "express";
import { randomUUID, randomBytes } from "crypto";
import { getPool } from "../../../db/client";
import { StoreStatus, type StoreStatusType } from "../../../services/storeStateMachine";

export const retailerAdminDevicesRouter = Router();

/**
 * Get store ID from gateway-provided headers
 */
function getStoreId(req: Request): string | null {
  const actorId = req.headers['x-actor-id'];
  return typeof actorId === 'string' ? actorId : null;
}

/**
 * RET-WEB-002: Validate activation code format
 * Format: SM-XXXX-XX (e.g., SM-A7K2-91)
 */
function isValidActivationCodeFormat(code: string): boolean {
  const codeRegex = /^SM-[A-Z0-9]{4}-[A-Z0-9]{2}$/;
  return codeRegex.test(code.toUpperCase());
}

/**
 * Generate a device token (64 hex chars)
 */
function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

// =============================================================================
// POST /api/v1/retailer-admin/devices/activate
// RET-WEB-002: Activate device using activation code from POS
// =============================================================================

retailerAdminDevicesRouter.post("/devices/activate", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { activation_code } = req.body as { activation_code?: string };

  // Validate code provided
  if (!activation_code || typeof activation_code !== 'string') {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "activation_code is required" } });
  }

  const normalizedCode = activation_code.trim().toUpperCase();

  // Validate code format
  if (!isValidActivationCodeFormat(normalizedCode)) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid activation code format. Expected format: SM-XXXX-XX"
      }
    });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // RET-WEB-002: Look up activation code with row lock
    const codeResult = await client.query(
      `SELECT
        id,
        code,
        device_fingerprint,
        expires_at,
        used_at,
        bound_store_id
      FROM public.device_activation_codes
      WHERE code = $1
      FOR UPDATE`,
      [normalizedCode]
    );

    if (codeResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: { code: "CODE_NOT_FOUND", message: "Activation code not found" } });
    }

    const codeRecord = codeResult.rows[0];

    // Check if code already used
    if (codeRecord.used_at) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: { code: "CODE_ALREADY_USED", message: "This activation code has already been used" } });
    }

    // Check if code expired
    const expiresAt = new Date(codeRecord.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: { code: "CODE_EXPIRED", message: "This activation code has expired" } });
    }

    // Get current store status
    const storeResult = await client.query(
      `SELECT id, name, status, device_bound FROM platform.stores WHERE id = $1 FOR UPDATE`,
      [storeId]
    );

    if (storeResult.rowCount === 0) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: { code: "STORE_NOT_FOUND", message: "Store not found" } });
    }

    const store = storeResult.rows[0];
    const currentStatus = store.status as StoreStatusType;

    // RET-WEB-002: Create device record
    const deviceId = randomUUID();
    const deviceToken = generateDeviceToken();
    const deviceFingerprint = codeRecord.device_fingerprint;

    // Create device in public.pos_devices
    console.log(`[RET-WEB-002] Creating device: id=${deviceId}, storeId=${storeId}`);
    await client.query(
      `INSERT INTO public.pos_devices (
        id, store_id, device_fingerprint, device_token, label, device_type, printing_mode, created_at
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, NOW()
      )`,
      [deviceId, storeId, deviceFingerprint, deviceToken, 'POS Device', 'RETAILER_PHONE', 'NONE']
    );
    console.log(`[RET-WEB-002] Device created`);

    // Mark activation code as used
    // Note: bound_store_id and bound_device_id are UUID type
    console.log(`[RET-WEB-002] Marking code used: storeId=${storeId}, deviceId=${deviceId}, codeId=${codeRecord.id}`);
    await client.query(
      `UPDATE public.device_activation_codes
       SET used_at = NOW(),
           bound_store_id = $1,
           bound_device_id = $2
       WHERE id = $3`,
      [storeId, deviceId, codeRecord.id]
    );
    console.log(`[RET-WEB-002] Code marked used`);

    // RET-WEB-002: Status transition DRAFT → ENROLLED on device binding
    const shouldTransition = currentStatus === StoreStatus.DRAFT;
    const newStatus = shouldTransition ? StoreStatus.ENROLLED : currentStatus;

    // Update store: set device_bound = true, optionally transition status
    // RET-WEB-002: Use explicit type cast to avoid type inference issues
    const statusReason = shouldTransition ? 'Device activated via web dashboard' : null;
    await client.query(
      `UPDATE platform.stores
       SET device_bound = true,
           status = $2::varchar,
           status_reason = COALESCE($3, status_reason),
           updated_at = NOW()
       WHERE id = $1`,
      [storeId, newStatus, statusReason]
    );

    await client.query("COMMIT");

    // Log the activation
    if (shouldTransition) {
      console.log(`[RET-WEB-002] Store ${storeId} transitioned: ${currentStatus} → ${newStatus}`);
    }
    console.log(`[RET-WEB-002] Device ${deviceId} activated for store ${storeId}`);

    return res.json({
      success: true,
      device_id: deviceId,
      store: {
        id: storeId,
        name: store.name,
        status: newStatus,
        device_bound: true
      }
    });

  } catch (error: any) {
    await client.query("ROLLBACK");
    console.error("[RET-WEB-002] Activate device error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to activate device" } });
  } finally {
    client.release();
  }
});

// =============================================================================
// GET /api/v1/retailer-admin/devices
// RET-WEB-002: List devices bound to current store
// =============================================================================

retailerAdminDevicesRouter.get("/devices", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  try {
    const result = await pool.query(
      `SELECT
        id,
        device_fingerprint as "fingerprint",
        label,
        device_type as "deviceType",
        manufacturer,
        model,
        app_version as "appVersion",
        last_seen_online as "lastSeen",
        created_at as "createdAt",
        token_revoked_at as "revokedAt",
        active
      FROM public.pos_devices
      WHERE store_id = $1
      ORDER BY created_at DESC`,
      [storeId]
    );

    return res.json({
      success: true,
      devices: result.rows.map(device => ({
        id: device.id,
        fingerprint: device.fingerprint,
        label: device.label || 'POS Device',
        deviceType: device.deviceType,
        manufacturer: device.manufacturer,
        model: device.model,
        appVersion: device.appVersion,
        lastSeen: device.lastSeen,
        createdAt: device.createdAt,
        isActive: device.active && !device.revokedAt
      }))
    });

  } catch (error: any) {
    console.error("[RET-WEB-002] List devices error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to list devices" } });
  }
});

// =============================================================================
// PATCH /api/v1/retailer-admin/devices/:deviceId
// RET-AUD-027: Deactivate/reactivate device from retailer portal
// Only allows updating own store's devices
// =============================================================================

retailerAdminDevicesRouter.patch("/devices/:deviceId", async (req: Request, res: Response) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "INTERNAL_ERROR", message: "Database unavailable" } });

  const storeId = getStoreId(req);
  if (!storeId) {
    return res.status(401).json({ error: { code: "UNAUTHORIZED", message: "Store not identified" } });
  }

  const { deviceId } = req.params;
  if (!deviceId || typeof deviceId !== 'string') {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "deviceId is required" } });
  }

  const { active, label } = req.body as { active?: boolean; label?: string };

  // Validate at least one field is being updated
  const hasActive = typeof active === 'boolean';
  const hasLabel = typeof label === 'string' && label.trim().length > 0;

  if (!hasActive && !hasLabel) {
    return res.status(400).json({ error: { code: "VALIDATION_ERROR", message: "At least one field (active or label) is required" } });
  }

  try {
    // First verify the device belongs to this store
    const deviceCheck = await pool.query(
      `SELECT id, store_id, active, label, token_revoked_at FROM public.pos_devices WHERE id = $1`,
      [deviceId]
    );

    if (deviceCheck.rowCount === 0) {
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Device not found" } });
    }

    const device = deviceCheck.rows[0];
    if (device.store_id !== storeId) {
      // Security: Don't reveal that the device exists for another store
      return res.status(404).json({ error: { code: "NOT_FOUND", message: "Device not found" } });
    }

    // Build update query
    const updates: string[] = [];
    const params: (string | boolean)[] = [];
    let paramIndex = 1;

    if (hasActive) {
      params.push(active);
      updates.push(`active = $${paramIndex}`);
      paramIndex++;

      // If deactivating, also revoke the token
      if (!active) {
        updates.push(`token_revoked_at = NOW()`);
      } else {
        // If reactivating, clear the revoked_at (but device will need new token via re-enrollment)
        // Note: We don't clear token_revoked_at on reactivation - device must re-enroll
      }
    }

    if (hasLabel) {
      params.push(label.trim());
      updates.push(`label = $${paramIndex}`);
      paramIndex++;
    }

    updates.push(`updated_at = NOW()`);
    params.push(deviceId);

    const result = await pool.query(
      `UPDATE public.pos_devices
       SET ${updates.join(', ')}
       WHERE id = $${paramIndex}
       RETURNING
         id,
         device_fingerprint as "fingerprint",
         label,
         device_type as "deviceType",
         manufacturer,
         model,
         app_version as "appVersion",
         last_seen_online as "lastSeen",
         created_at as "createdAt",
         token_revoked_at as "revokedAt",
         active`,
      params
    );

    const updatedDevice = result.rows[0];
    console.log(`[RET-AUD-027] Device ${deviceId} updated by store ${storeId}: active=${updatedDevice.active}`);

    return res.json({
      success: true,
      device: {
        id: updatedDevice.id,
        fingerprint: updatedDevice.fingerprint,
        label: updatedDevice.label || 'POS Device',
        deviceType: updatedDevice.deviceType,
        manufacturer: updatedDevice.manufacturer,
        model: updatedDevice.model,
        appVersion: updatedDevice.appVersion,
        lastSeen: updatedDevice.lastSeen,
        createdAt: updatedDevice.createdAt,
        isActive: updatedDevice.active && !updatedDevice.revokedAt
      }
    });

  } catch (error: any) {
    console.error("[RET-AUD-027] Update device error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to update device" } });
  }
});

export default retailerAdminDevicesRouter;
