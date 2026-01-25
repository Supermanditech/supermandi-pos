import { randomBytes, randomUUID } from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getPool } from "../../../db/client";
import { isDemoStoreCode } from "../../../services/storeCodeService";

// DEV-071: Enhanced enrollment with multi-use codes, idempotent enrollment, and proper error codes
// BUG-FIX: Demo stores get unlimited multi-use enrollment codes; production stores stay single-use

// AUD-061-A FIX: Stricter burst rate limiter - 3 attempts per minute to prevent rapid-fire attacks
const enrollmentBurstLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3, // Maximum 3 enrollment attempts per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "ENROLLMENT_RATE_LIMITED", message: "Too many enrollment attempts. Please wait a minute before trying again." } }
});

// Rate limiter for enrollment endpoint to prevent brute force attacks
const enrollmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 10 enrollment attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "ENROLLMENT_RATE_LIMITED", message: "Too many enrollment attempts. Please try again in 15 minutes." } }
});

export const posEnrollRouter = Router();

type DeviceMeta = {
  manufacturer?: unknown;
  model?: unknown;
  androidVersion?: unknown;
  appVersion?: unknown;
  label?: unknown;
  printingMode?: unknown;
  deviceType?: unknown;
  deviceFingerprint?: unknown;
};

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

const DEVICE_TYPES = new Set(["OEM_HANDHELD", "SUPMANDI_PHONE", "RETAILER_PHONE"]);
const PRINTING_MODES = new Set(["DIRECT_ESC_POS", "SHARE_TO_PRINTER_APP", "NONE"]);

// AUD-061-B FIX: Maximum devices per store to prevent abuse
const MAX_DEVICES_PER_STORE = 20;

function normalizeEnum(value: string | null): string | null {
  return value ? value.trim().toUpperCase() : null;
}

// Check if code is a demo code (SM-DEMO prefix)
function isDemoCode(code: string): boolean {
  return code.toUpperCase().startsWith("SM-DEMO");
}

// Check if multi-use demo codes are allowed
function isMultiUseDemoAllowed(): boolean {
  return process.env.ALLOW_DEMO_MULTIUSE === "true";
}

// POST /api/v1/pos/enroll (with rate limiting to prevent brute force)
// AUD-061-A: Apply both burst limiter (3/min) and sustained limiter (10/15min)
posEnrollRouter.post("/enroll", enrollmentBurstLimiter, enrollmentLimiter, async (req, res) => {
  // DEV-071: Accept both field names for backward/forward compatibility during rollout
  // - Old clients send: enrollmentCode
  // - New clients send: code
  const rawCode = req.body?.code ?? req.body?.enrollmentCode ?? req.body?.enrollment_code;
  const code = asTrimmedString(rawCode)?.toUpperCase();

  // Dev logging to debug field name issues
  if (process.env.NODE_ENV !== "production" && !code) {
    console.log("[Enroll] Request body keys:", Object.keys(req.body || {}));
  }

  if (!code) {
    return res.status(400).json({ error: { code: "CODE_REQUIRED", message: "Enrollment code is required" } });
  }

  const meta = (req.body?.deviceMeta ?? {}) as DeviceMeta;
  const appVersion = asTrimmedString(meta.appVersion);
  const label = asTrimmedString(meta.label);
  const deviceType = normalizeEnum(asTrimmedString(meta.deviceType));
  const manufacturer = asTrimmedString(meta.manufacturer);
  const model = asTrimmedString(meta.model);
  const androidVersion = asTrimmedString(meta.androidVersion);
  const printingMode = normalizeEnum(asTrimmedString(meta.printingMode)) ?? "NONE";
  const deviceFingerprint = asTrimmedString(meta.deviceFingerprint);

  if (!label) {
    return res.status(400).json({ error: { code: "LABEL_REQUIRED", message: "Device label is required" } });
  }
  if (!deviceType) {
    return res.status(400).json({ error: { code: "DEVICE_TYPE_REQUIRED", message: "Device type is required" } });
  }
  if (!DEVICE_TYPES.has(deviceType)) {
    return res.status(400).json({ error: { code: "DEVICE_TYPE_INVALID", message: "Device type must be OEM_HANDHELD, SUPMANDI_PHONE, or RETAILER_PHONE" } });
  }
  if (!PRINTING_MODES.has(printingMode)) {
    return res.status(400).json({ error: { code: "PRINTING_MODE_INVALID", message: "Printing mode must be DIRECT_ESC_POS, SHARE_TO_PRINTER_APP, or NONE" } });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "Database service unavailable" } });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Fetch enrollment with row lock, including multi-use columns
    const enrollmentRes = await client.query(
      `
      SELECT
        e.code,
        e.store_id,
        e.expires_at,
        e.used_at,
        e.revoked_at,
        COALESCE(e.max_uses, 1) as max_uses,
        COALESCE(e.uses_count, CASE WHEN e.used_at IS NOT NULL THEN 1 ELSE 0 END) as uses_count
      FROM pos_device_enrollments e
      WHERE e.code = $1
      FOR UPDATE
      `,
      [code]
    );

    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: { code: "ENROLLMENT_CODE_INVALID", message: "Enrollment code not found" } });
    }

    // Check if code is revoked
    if (enrollment.revoked_at) {
      await client.query("ROLLBACK");
      return res.status(409).json({ error: { code: "ENROLLMENT_CODE_REVOKED", message: "This enrollment code has been revoked" } });
    }

    // GO-LIVE: Fetch store name and code for enrollment response
    const storeRes = await client.query(
      `SELECT id::TEXT as id, name, code, (status = 'active') as active FROM platform.stores WHERE id = $1::uuid`,
      [enrollment.store_id]
    );
    const store = storeRes.rows[0];
    if (!store) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: { code: "STORE_NOT_FOUND", message: "Store not found" } });
    }

    // AUD-054-A FIX: Add FOR UPDATE lock to prevent race conditions on concurrent enrollment
    // Check for existing device by label (same store) WITH row lock
    const existingDeviceRes = await client.query(
      `
      SELECT id, device_token, device_fingerprint, enrollment_id
      FROM pos_devices
      WHERE store_id = $1
        AND lower(label) = lower($2)
      FOR UPDATE
      `,
      [enrollment.store_id, label]
    );
    const existingDeviceByLabel = existingDeviceRes.rows[0];

    // AUD-054-A FIX: Check for existing device by fingerprint WITH row lock (idempotent enrollment)
    let existingDeviceByFingerprint = null;
    if (deviceFingerprint) {
      const fingerprintRes = await client.query(
        `
        SELECT id, device_token, label, enrollment_id
        FROM pos_devices
        WHERE store_id = $1
          AND device_fingerprint = $2
        FOR UPDATE
        `,
        [enrollment.store_id, deviceFingerprint]
      );
      existingDeviceByFingerprint = fingerprintRes.rows[0];
    }

    // BUG-FIX: Detect demo FIRST - they get unlimited multi-use enrollment
    // Detection (3 layers):
    //   1. store.is_demo flag
    //   2. store_code matches demo pattern (DM*, QA*, %demo%, etc.)
    //   3. enrollment CODE itself is demo pattern (SM-DEMO*)
    const storeCode = store.code ?? "";
    const isDemo = isDemoStoreCode(storeCode) || isDemoCode(code);

    // Parse enrollment state
    const expiresAt = new Date(enrollment.expires_at);
    const isExpired = !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now();
    const maxUses = enrollment.max_uses;
    const usesCount = enrollment.uses_count;

    // Handle single-use vs multi-use logic
    const isMultiUseMode = maxUses > 1;
    let usesExhausted: boolean;
    if (isMultiUseMode) {
      usesExhausted = usesCount >= maxUses;
    } else {
      // Single-use: exhausted if uses_count >= 1 or used_at is set
      usesExhausted = usesCount >= 1 || enrollment.used_at != null;
    }

    // Determine if this is a re-enrollment scenario
    const existingDevice = existingDeviceByLabel || existingDeviceByFingerprint;

    // AUD-054-B FIX: Idempotent enrollment for fingerprint matches ONLY
    // Fingerprint match = same physical device, return existing token (true idempotency)
    // Label match = device recovery scenario, device needs NEW token (handled below)
    if (existingDeviceByFingerprint) {
      // AUD-054-C FIX: Track re-enrollment attempts in audit log (increment last_used_at without consuming uses)
      await client.query(
        `
        UPDATE pos_device_enrollments
        SET last_used_at = NOW(),
            updated_at = NOW()
        WHERE code = $1
        `,
        [code]
      );

      // AUD-063-B FIX: Log re-enrollment with full context for audit trail
      console.log(`[Enroll] Idempotent re-enrollment: device=${existingDeviceByFingerprint.id} code=${code} store=${store.id} matchType=fingerprint`);

      await client.query("COMMIT");
      return res.json({
        deviceId: existingDeviceByFingerprint.id,
        storeId: store.id,
        storeName: store.name ?? null,
        storeCode: store.code ?? null,
        deviceToken: existingDeviceByFingerprint.device_token,
        storeActive: Boolean(store.active),
        reEnrolled: true
      });
    }

    // AUD-054-B FIX: Label-only match (no fingerprint) = device recovery scenario
    // Device needs NEW token but should NOT consume additional uses
    // This is handled below by setting existingDevice which skips uses_count increment

    // =========================================================================
    // ENROLLMENT ENFORCEMENT RULES
    // =========================================================================
    // Demo stores: BYPASS all restrictions (used, exhausted, expired)
    // Production stores: ENFORCE single-use (used/exhausted -> 409, expired -> 409)
    // Re-enrollment (existingDevice): ALWAYS allowed (device recovery scenario)
    // =========================================================================

    if (!isDemo && !existingDevice) {
      // PRODUCTION store with NEW device - enforce restrictions

      // Check if code is already used/exhausted
      if (usesExhausted) {
        await client.query("ROLLBACK");
        console.log(`[Enroll] REJECT 409: Production code ${code} already used (maxUses=${maxUses}, usesCount=${usesCount}, isMultiUse=${isMultiUseMode})`);
        return res.status(409).json({
          error: {
            code: "ENROLLMENT_CODE_USED",
            message: "This enrollment code has already been used. Ask your SuperAdmin to generate a new code."
          }
        });
      }

      // Check if code is expired
      if (isExpired) {
        await client.query("ROLLBACK");
        console.log(`[Enroll] REJECT 409: Production code ${code} expired at ${enrollment.expires_at}`);
        return res.status(409).json({
          error: {
            code: "ENROLLMENT_CODE_EXPIRED",
            message: "This enrollment code has expired. Ask your SuperAdmin to generate a new code."
          }
        });
      }
    }

    // Log demo multi-use enrollment (for monitoring)
    if (isDemo && (usesExhausted || isExpired)) {
      console.log(`[Enroll] Demo bypass: code=${code} store=${storeCode} uses=${usesCount}/${maxUses} expired=${isExpired}`);
    }

    // AUD-061-B FIX: Check device count per store (skip for re-enrollment and demo stores)
    if (!existingDevice && !isDemo) {
      const deviceCountRes = await client.query(
        `SELECT COUNT(*)::int as count FROM pos_devices WHERE store_id = $1`,
        [enrollment.store_id]
      );
      const currentDeviceCount = deviceCountRes.rows[0]?.count ?? 0;
      if (currentDeviceCount >= MAX_DEVICES_PER_STORE) {
        await client.query("ROLLBACK");
        console.log(`[Enroll] REJECT 409: Store ${store.id} has reached device limit (${currentDeviceCount}/${MAX_DEVICES_PER_STORE})`);
        return res.status(409).json({
          error: {
            code: "DEVICE_LIMIT_EXCEEDED",
            message: `This store has reached the maximum number of devices (${MAX_DEVICES_PER_STORE}). Contact support to increase the limit.`
          }
        });
      }
    }

    // Allow re-enrollment for existing devices even with expired/used code (for device recovery)
    const deviceId = existingDevice?.id ?? randomUUID();
    let deviceToken = generateDeviceToken();
    let inserted = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (existingDevice) {
          // Update existing device with new token and metadata
          await client.query(
            `
            UPDATE pos_devices
            SET device_token = $1,
                label = $2,
                device_type = $3,
                manufacturer = $4,
                model = $5,
                android_version = $6,
                app_version = $7,
                printing_mode = $8,
                device_fingerprint = COALESCE($9, device_fingerprint),
                last_seen_online = NOW(),
                updated_at = NOW()
            WHERE id = $10
            `,
            [
              deviceToken,
              label,
              deviceType,
              manufacturer,
              model,
              androidVersion,
              appVersion,
              printingMode,
              deviceFingerprint,
              deviceId
            ]
          );
        } else {
          // Insert new device
          await client.query(
            `
            INSERT INTO pos_devices (
              id,
              store_id,
              device_token,
              label,
              device_type,
              manufacturer,
              model,
              android_version,
              app_version,
              printing_mode,
              device_fingerprint,
              last_seen_online,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW(), NOW())
            `,
            [
              deviceId,
              enrollment.store_id,
              deviceToken,
              label,
              deviceType,
              manufacturer,
              model,
              androidVersion,
              appVersion,
              printingMode,
              deviceFingerprint
            ]
          );
        }
        inserted = true;
        break;
      } catch (error: any) {
        if (error?.code === "23505") {
          // Token collision, retry with new token
          deviceToken = generateDeviceToken();
          continue;
        }
        throw error;
      }
    }

    if (!inserted) {
      throw new Error("device insert failed");
    }

    // Atomically increment uses_count for new enrollments (not re-enrollments)
    if (!existingDevice) {
      await client.query(
        `
        UPDATE pos_device_enrollments
        SET
          used_at = COALESCE(used_at, NOW()),
          uses_count = COALESCE(uses_count, 0) + 1,
          last_used_at = NOW(),
          updated_at = NOW()
        WHERE code = $1
        `,
        [code]
      );
    }

    await client.query("COMMIT");

    console.log(`[Enroll] Device ${deviceId} enrolled with code ${code} (uses: ${usesCount + 1}/${maxUses})`);

    return res.json({
      deviceId,
      storeId: store.id,
      storeName: store.name ?? null,       // GO-LIVE: Store name from SuperAdmin
      storeCode: store.code ?? null, // GO-LIVE: Human-readable store code
      deviceToken,
      storeActive: Boolean(store.active),
      reEnrolled: Boolean(existingDevice)
    });
  } catch (error) {
    await client.query("ROLLBACK");
    console.error("[Enroll] Error:", error);
    return res.status(500).json({ error: { code: "ENROLLMENT_FAILED", message: "Enrollment failed. Please try again." } });
  } finally {
    client.release();
  }
});
