import { createHash, randomBytes, randomUUID } from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getPool } from "../../../db/client";
import { isDemoStoreCode } from "../../../services/storeCodeService";
import { validateDeviceFingerprint } from "@supermandi/common";
import { enrollStore } from "../../../services/storeStateMachine";  // DR-005
import { log } from "../../../lib/logger";
import { asError } from "../../../lib/errorUtils";

// DEV-071: Enhanced enrollment with multi-use codes, idempotent enrollment, and proper error codes
// BUG-FIX: Demo stores get unlimited multi-use enrollment codes; production stores stay single-use

/** Hash an enrollment code for secure lookup (matches deviceQueries.hashEnrollmentCode) */
function hashCode(code: string): string {
  return createHash('sha256').update(code.toUpperCase()).digest('hex');
}

// AUD-061-A FIX: Stricter burst rate limiter - 3 attempts per minute to prevent rapid-fire attacks
// DEPLOY-OPS: Respect RATE_LIMIT_MULTIPLIER for local-prod/staging (production default=1)
const rateLimitMultiplier = Math.max(1, parseInt(process.env.RATE_LIMIT_MULTIPLIER || "1", 10));

const enrollmentBurstLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 3 * rateLimitMultiplier,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "ENROLLMENT_RATE_LIMITED", message: "Too many enrollment attempts. Please wait a minute before trying again." } }
});

// Rate limiter for enrollment endpoint to prevent brute force attacks
const enrollmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10 * rateLimitMultiplier,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "ENROLLMENT_RATE_LIMITED", message: "Too many enrollment attempts. Please try again in 15 minutes." } }
});

// GO-LIVE-052: Rate limiter for label check endpoint
const labelCheckLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 30, // Maximum 30 label checks per minute per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "RATE_LIMITED", message: "Too many label check requests. Please wait a moment." } }
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

// FINDING-027: Default max devices per store (can be overridden per store in platform.stores.max_devices)
const DEFAULT_MAX_DEVICES_PER_STORE = 10;

// ISSUE-MICRO-091: Max enrollment attempts per store per day (prevents distributed brute-force)
const MAX_DAILY_ENROLLMENTS_PER_STORE = 20;

// FINDING-026: Token expiry duration (90 days - user-friendly with auto-refresh)
const TOKEN_EXPIRY_DAYS = 90;

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
    log.info("[Enroll] Request body keys:", Object.keys(req.body || {}));
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
  const rawDeviceFingerprint = asTrimmedString(meta.deviceFingerprint);

  // GO-LIVE-149: Validate device fingerprint format (reject arbitrary binary)
  let deviceFingerprint: string | undefined;
  if (rawDeviceFingerprint) {
    const fingerprintValidation = validateDeviceFingerprint(rawDeviceFingerprint);
    if (!fingerprintValidation.valid) {
      return res.status(400).json({ error: { code: "DEVICE_FINGERPRINT_INVALID", message: fingerprintValidation.error } });
    }
    deviceFingerprint = fingerprintValidation.value;
  }

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
    const codeHash = hashCode(code);
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
      WHERE e.enrollment_code_hash = $1
      FOR UPDATE
      `,
      [codeHash]
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

    // Set RLS store context now that we know the store_id from enrollment
    await client.query("SET LOCAL app.current_store_id = $1", [enrollment.store_id]);

    // GO-LIVE: Fetch store name, code, and max_devices for enrollment response
    // FINDING-027: Get configurable max_devices per store
    const storeRes = await client.query(
      `SELECT id::TEXT as id, name, code, upi_vpa, (status = 'ACTIVE') as active, COALESCE(max_devices, $2) as max_devices FROM platform.stores WHERE id = $1::uuid`,
      [enrollment.store_id, DEFAULT_MAX_DEVICES_PER_STORE]
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

    // SEC-6: Reject enrollment for non-ACTIVE stores (demo stores bypass)
    if (!store.active && !isDemo) {
      await client.query("ROLLBACK");
      log.info(`[Enroll] REJECT 403: Store ${store.id} is not active (status != ACTIVE)`);
      return res.status(403).json({
        error: { code: "STORE_INACTIVE", message: "This store is not active. Contact support at hello@supermandi.tech" }
      });
    }

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
        WHERE enrollment_code_hash = $1
        `,
        [codeHash]
      );

      // AUD-063-B FIX: Log re-enrollment with full context for audit trail
      // LIVE.SECRETS.ENROLLMENT_CODE_LOG_REDACTION.001: Redact enrollment code from logs
      log.info(`[Enroll] Idempotent re-enrollment: device=${existingDeviceByFingerprint.id} code=***REDACTED store=${store.id} matchType=fingerprint`);

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
        // LIVE.SECRETS.ENROLLMENT_CODE_LOG_REDACTION.001: Redact enrollment code
        log.info(`[Enroll] REJECT 409: Production code ***REDACTED already used (maxUses=${maxUses}, usesCount=${usesCount}, isMultiUse=${isMultiUseMode})`);
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
        // LIVE.SECRETS.ENROLLMENT_CODE_LOG_REDACTION.001: Redact enrollment code
        log.info(`[Enroll] REJECT 409: Production code ***REDACTED expired at ${enrollment.expires_at}`);
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
      // LIVE.SECRETS.ENROLLMENT_CODE_LOG_REDACTION.001: Redact enrollment code
      log.info(`[Enroll] Demo bypass: code=***REDACTED store=${storeCode} uses=${usesCount}/${maxUses} expired=${isExpired}`);
    }

    // ISSUE-MICRO-091: Check daily enrollment attempt count per store
    // Prevents distributed brute-force from multiple IPs targeting one store
    // Skip for re-enrollment (device recovery) and demo stores
    if (!existingDevice && !isDemo) {
      const dailyCountRes = await client.query(
        `SELECT COUNT(*)::int as count FROM device_enrollment_events
         WHERE store_id = $1 AND event_type = 'enrolled' AND created_at >= NOW() - INTERVAL '1 day'`,
        [enrollment.store_id]
      );
      const dailyCount = dailyCountRes.rows[0]?.count ?? 0;
      if (dailyCount >= MAX_DAILY_ENROLLMENTS_PER_STORE) {
        await client.query("ROLLBACK");
        log.warn(`[Enroll] REJECT 429: Store ${store.id} daily enrollment limit reached (${dailyCount}/${MAX_DAILY_ENROLLMENTS_PER_STORE})`);
        return res.status(429).json({
          error: {
            code: "DAILY_ENROLLMENT_LIMIT",
            message: "Too many device enrollments today. Please try again tomorrow or contact support."
          }
        });
      }
    }

    // FINDING-027: Check device count per store using configurable max_devices
    // Skip for re-enrollment and demo stores
    const storeMaxDevices = store.max_devices ?? DEFAULT_MAX_DEVICES_PER_STORE;
    if (!existingDevice && !isDemo) {
      const deviceCountRes = await client.query(
        `SELECT COUNT(*)::int as count FROM pos_devices WHERE store_id = $1 AND active = true`,
        [enrollment.store_id]
      );
      const currentDeviceCount = deviceCountRes.rows[0]?.count ?? 0;
      if (currentDeviceCount >= storeMaxDevices) {
        await client.query("ROLLBACK");
        log.info(`[Enroll] REJECT 409: Store ${store.id} has reached device limit (${currentDeviceCount}/${storeMaxDevices})`);
        return res.status(409).json({
          error: {
            code: "DEVICE_LIMIT_EXCEEDED",
            message: `This store has reached the maximum number of devices (${storeMaxDevices}). Contact support to increase the limit.`
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
          // FINDING-026: Reset token_expires_at on re-enrollment (90 days from now)
          // FINDING-028: Track re-enrollment for superadmin notification
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
                enrollment_code = $12,
                last_seen_online = NOW(),
                updated_at = NOW(),
                re_enrolled = true,
                re_enrolled_at = NOW(),
                token_expires_at = NOW() + ($11 * INTERVAL '1 day'),
                token_refreshed_at = NOW()
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
              deviceId,
              TOKEN_EXPIRY_DAYS,
              code
            ]
          );

          // FINDING-028: Log re-enrollment event for superadmin notification
          try {
            await client.query(
              `INSERT INTO device_enrollment_events (store_id, device_id, event_type, device_fingerprint, device_label, enrollment_code, previous_device_id, previous_device_label, ip_address, metadata)
               VALUES ($1, $2, 're_enrolled', $3, $4, $5, $6, $7, $8, $9)`,
              [
                enrollment.store_id,
                deviceId,
                deviceFingerprint,
                label,
                code,
                existingDevice.id,
                existingDevice.label ?? label,
                req.ip ?? null,
                JSON.stringify({ manufacturer, model, appVersion, androidVersion })
              ]
            );
          } catch (eventErr) {
            // Non-critical, just log
            log.warn("[Enroll] Failed to log re-enrollment event:", eventErr);
          }
        } else {
          // Insert new device
          // FINDING-026: Set token_expires_at to 90 days from now
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
              enrollment_code,
              last_seen_online,
              updated_at,
              token_expires_at,
              token_refreshed_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, NOW(), NOW(), NOW() + ($13 * INTERVAL '1 day'), NOW())
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
              deviceFingerprint,
              code,
              TOKEN_EXPIRY_DAYS
            ]
          );

          // FINDING-028: Log new enrollment event for superadmin dashboard
          try {
            await client.query(
              `INSERT INTO device_enrollment_events (store_id, device_id, event_type, device_fingerprint, device_label, enrollment_code, ip_address, metadata)
               VALUES ($1, $2, 'enrolled', $3, $4, $5, $6, $7)`,
              [
                enrollment.store_id,
                deviceId,
                deviceFingerprint,
                label,
                code,
                req.ip ?? null,
                JSON.stringify({ manufacturer, model, appVersion, androidVersion })
              ]
            );
          } catch (eventErr) {
            // Non-critical, just log
            log.warn("[Enroll] Failed to log enrollment event:", eventErr);
          }
        }
        inserted = true;
        break;
      } catch (_error: unknown) {
    const error = asError(_error);
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
        WHERE enrollment_code_hash = $1
        `,
        [codeHash]
      );
    }

    await client.query("COMMIT");

    // LIVE.SECRETS.ENROLLMENT_CODE_LOG_REDACTION.001: Redact enrollment code
    log.info(`[Enroll] Device ${deviceId} enrolled with code ***REDACTED (uses: ${usesCount + 1}/${maxUses})`);

    // DR-005: Transition store DRAFT → ENROLLED after first device enrollment
    // Non-blocking: if transition fails (already ENROLLED, etc.), enrollment still succeeds
    if (!existingDevice) {
      enrollStore(store.id, "system:enrollment").catch((err) => {
        // Expected to fail if store is already past DRAFT (e.g., ENROLLED, ACTIVE)
        log.info(`[Enroll] DR-005: Store status transition skipped for ${store.id}:`, err?.message);
      });
    }

    // STG-096: Query active device count for multi-device warning in frontend
    let activeDeviceCount = 1;
    try {
      const countRes = await client.query(
        `SELECT COUNT(*)::int as count FROM pos_devices WHERE store_id = $1 AND active = true`,
        [enrollment.store_id]
      );
      activeDeviceCount = countRes.rows[0]?.count ?? 1;
    } catch {
      // Non-critical — default to 1
    }

    return res.json({
      deviceId,
      storeId: store.id,
      storeName: store.name ?? null,       // GO-LIVE: Store name from SuperAdmin
      storeCode: store.code ?? null, // GO-LIVE: Human-readable store code
      deviceToken,
      storeActive: Boolean(store.active),
      reEnrolled: Boolean(existingDevice),
      upiVpa: store.upi_vpa || null, // #333: For payment setup prompt
      activeDeviceCount, // STG-096: Enable multi-device warning in frontend
    });
  } catch (error) {
    await client.query("ROLLBACK");
    log.error("[Enroll] Error:", error);
    return res.status(500).json({ error: { code: "ENROLLMENT_FAILED", message: "Enrollment failed. Please try again." } });
  } finally {
    client.release();
  }
});

// =============================================================================
// GL-RJ-006: Duplicate Label Check Endpoint
// =============================================================================

// POST /api/v1/pos/enroll/check-label
// Check if a device label already exists for the store (before enrollment)
// GO-LIVE-052: Added rate limiting to prevent abuse
posEnrollRouter.post("/enroll/check-label", labelCheckLimiter, async (req, res) => {
  const rawCode = req.body?.code ?? req.body?.enrollmentCode;
  const code = asTrimmedString(rawCode)?.toUpperCase();
  const label = asTrimmedString(req.body?.label);

  if (!code) {
    // ISSUE-MICRO-090: Standardized error format (was flat string)
    return res.status(400).json({ error: { code: "CODE_REQUIRED", message: "Code is required" } });
  }
  if (!label) {
    return res.status(400).json({ error: { code: "LABEL_REQUIRED", message: "Label is required" } });
  }

  const pool = getPool();
  if (!pool) {
    return res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "Database unavailable" } });
  }

  try {
    // Get store ID from enrollment code
    const enrollmentRes = await pool.query(
      `SELECT store_id FROM pos_device_enrollments WHERE enrollment_code_hash = $1`,
      [hashCode(code)]
    );

    if (enrollmentRes.rowCount === 0) {
      // Code not found - return not duplicate (let enrollment handle the error)
      return res.json({ isDuplicate: false });
    }

    const storeId = enrollmentRes.rows[0].store_id;

    // Check for existing device with same label (case-insensitive)
    const existingRes = await pool.query(
      `
      SELECT id, label, active, last_seen_online
      FROM pos_devices
      WHERE store_id = $1 AND lower(label) = lower($2) AND active = true
      `,
      [storeId, label]
    );

    if (existingRes.rowCount && existingRes.rowCount > 0) {
      const existing = existingRes.rows[0];

      // Get existing labels for suggestions
      const labelsRes = await pool.query(
        `
        SELECT label FROM pos_devices
        WHERE store_id = $1 AND active = true
        ORDER BY label
        LIMIT 20
        `,
        [storeId]
      );

      const existingLabels = labelsRes.rows.map((r) => r.label?.toLowerCase() || "");

      // Generate suggestions based on the requested label
      const suggestions: string[] = [];
      const baseLabel = label.replace(/[-_]?\d+$/, "").trim(); // Remove trailing number

      for (let i = 1; i <= 10; i++) {
        const suggestion = `${baseLabel}-${i}`;
        if (!existingLabels.includes(suggestion.toLowerCase())) {
          suggestions.push(suggestion);
          if (suggestions.length >= 3) break;
        }
      }

      // If no numbered suggestions found, try other patterns
      if (suggestions.length < 3) {
        const patterns = ["A", "B", "C", "New", "Alt"];
        for (const p of patterns) {
          const suggestion = `${baseLabel}-${p}`;
          if (!existingLabels.includes(suggestion.toLowerCase()) && !suggestions.includes(suggestion)) {
            suggestions.push(suggestion);
            if (suggestions.length >= 3) break;
          }
        }
      }

      return res.json({
        isDuplicate: true,
        existingDevice: {
          label: existing.label,
          deviceId: existing.id,
          status: existing.active ? "active" : "inactive",
          lastSeen: existing.last_seen_online,
        },
        suggestions,
      });
    }

    return res.json({ isDuplicate: false });
  } catch (error) {
    log.error("[checkDuplicateLabel] Error:", error);
    // ISSUE-MICRO-090: Standardized error format (was flat string)
    return res.status(500).json({ error: { code: "LABEL_CHECK_FAILED", message: "Failed to check label" } });
  }
});

// =============================================================================
// #333: Phone-based activation code lookup
// POS enters phone number → backend returns active enrollment code
// =============================================================================

const lookupBurstLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 3 * rateLimitMultiplier,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "LOOKUP_RATE_LIMITED", message: "Too many lookup attempts. Please wait a minute." } }
});

const lookupSustainedLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10 * rateLimitMultiplier,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "LOOKUP_RATE_LIMITED", message: "Too many lookup attempts. Please try again in 15 minutes." } }
});

posEnrollRouter.post("/lookup-activation", lookupBurstLimiter, lookupSustainedLimiter, async (req, res) => {
  const pool = getPool();
  const rawPhone = typeof req.body?.phone === "string" ? req.body.phone.trim() : "";
  if (!rawPhone) {
    return res.status(400).json({ error: { code: "PHONE_REQUIRED", message: "Phone number is required." } });
  }

  // Normalize to 10-digit Indian mobile
  const digits = rawPhone.replace(/\D/g, "");
  let phone10: string;
  if (digits.length === 12 && digits.startsWith("91")) {
    phone10 = digits.slice(2);
  } else if (digits.length === 10) {
    phone10 = digits;
  } else {
    return res.status(400).json({ error: { code: "PHONE_INVALID", message: "Enter a valid 10-digit Indian mobile number." } });
  }
  if (!/^[6-9]/.test(phone10)) {
    return res.status(400).json({ error: { code: "PHONE_INVALID", message: "Enter a valid Indian mobile number starting with 6-9." } });
  }

  // Try multiple phone formats since DB stores as-entered
  const phoneVariants = [phone10, `91${phone10}`, `+91${phone10}`];

  try {
    // Find store by phone
    const storeRes = await pool.query(
      `SELECT s.id::TEXT as id, s.name, COALESCE(s.store_code, s.code) as code, s.contact_phone
       FROM platform.stores s
       WHERE (s.phone = ANY($1::text[]) OR s.contact_phone = ANY($1::text[])) AND s.status != 'deleted'
       ORDER BY s.created_at DESC LIMIT 1`,
      [phoneVariants]
    );

    if (storeRes.rows.length === 0) {
      log.info(`[LookupActivation] No store for phone=***${phone10.slice(-4)}`);
      return res.status(404).json({
        error: { code: "STORE_NOT_FOUND", message: "No store found for this phone number. Please register at supermandi.tech/retailer/register" }
      });
    }

    const store = storeRes.rows[0];
    const isDemo = isDemoStoreCode(store.code || "");

    // Find active enrollment code
    let enrollQuery: string;
    if (isDemo) {
      // Demo stores: bypass expiry/usage checks
      enrollQuery = `SELECT code FROM pos_device_enrollments
                     WHERE store_id = $1::uuid AND revoked_at IS NULL
                     ORDER BY created_at DESC LIMIT 1`;
    } else {
      enrollQuery = `SELECT code FROM pos_device_enrollments
                     WHERE store_id = $1::uuid
                       AND revoked_at IS NULL
                       AND expires_at > NOW()
                       AND COALESCE(uses_count, 0) < COALESCE(max_uses, 1)
                     ORDER BY created_at DESC LIMIT 1`;
    }
    const enrollRes = await pool.query(enrollQuery, [store.id]);

    if (enrollRes.rows.length === 0) {
      log.info(`[LookupActivation] No active code for store=${store.id}, phone=***${phone10.slice(-4)}`);
      return res.status(404).json({
        error: { code: "NO_ACTIVE_CODE", message: "No active activation code found. Contact support for a new code." }
      });
    }

    log.info(`[LookupActivation] Found code for phone=***${phone10.slice(-4)}, store=${store.name}`);
    return res.json({
      code: enrollRes.rows[0].code,
      storeName: store.name || "Your Store",
    });
  } catch (error) {
    log.error("[LookupActivation] Error:", error);
    return res.status(500).json({ error: { code: "LOOKUP_FAILED", message: "Lookup failed. Please try again." } });
  }
});

// =============================================================================
// POS-DEV-001: Device-Generated Activation Codes
// =============================================================================

/**
 * Generate activation code in SM-XXXX-XX format
 * Uses crypto-safe random alphanumeric characters
 */
function generateActivationCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // Removed ambiguous: 0,O,I,1
  const bytes = randomBytes(6);
  const part1 = Array.from({ length: 4 }, (_, i) => chars[bytes[i]! % chars.length]).join("");
  const part2 = Array.from({ length: 2 }, (_, i) => chars[bytes[i + 4]! % chars.length]).join("");
  return `SM-${part1}-${part2}`;
}

// Activation code expiry in minutes
const ACTIVATION_CODE_EXPIRY_MINUTES = 15;

// POST /api/v1/pos/generate-activation-code
// POS-DEV-001: Generate a new activation code for device binding
posEnrollRouter.post("/generate-activation-code", async (req, res) => {
  const { device_fingerprint } = req.body as { device_fingerprint?: string };

  if (!device_fingerprint || typeof device_fingerprint !== "string") {
    return res.status(400).json({ error: { code: "FINGERPRINT_REQUIRED", message: "device_fingerprint is required" } });
  }

  // Validate fingerprint format
  const fingerprintValidation = validateDeviceFingerprint(device_fingerprint);
  if (!fingerprintValidation.valid) {
    return res.status(400).json({ error: { code: "FINGERPRINT_INVALID", message: fingerprintValidation.error } });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "Database service unavailable" } });

  try {
    // Invalidate any existing unused codes for this device fingerprint
    await pool.query(
      `UPDATE public.device_activation_codes
       SET expires_at = NOW()
       WHERE device_fingerprint = $1
         AND used_at IS NULL
         AND expires_at > NOW()`,
      [device_fingerprint]
    );

    // Generate new code (retry if collision)
    let code: string = "";
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      code = generateActivationCode();
      const existing = await pool.query(
        `SELECT 1 FROM public.device_activation_codes WHERE code = $1`,
        [code]
      );
      if (existing.rowCount === 0) break;
      attempts++;
    }

    if (attempts >= maxAttempts) {
      return res.status(500).json({ error: { code: "CODE_GENERATION_FAILED", message: "Failed to generate unique code" } });
    }

    // Insert new activation code
    const expiresAt = new Date(Date.now() + ACTIVATION_CODE_EXPIRY_MINUTES * 60 * 1000);

    await pool.query(
      `INSERT INTO public.device_activation_codes (code, device_fingerprint, expires_at)
       VALUES ($1, $2, $3)`,
      [code, device_fingerprint, expiresAt.toISOString()]
    );

    log.info(`[POS-DEV-001] Generated activation code ${code} for device ${device_fingerprint.substring(0, 8)}...`);

    return res.json({
      success: true,
      code,
      expires_at: expiresAt.toISOString(),
      expires_in_seconds: ACTIVATION_CODE_EXPIRY_MINUTES * 60
    });

  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[POS-DEV-001] Generate activation code error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to generate activation code" } });
  }
});

// GET /api/v1/pos/activation-status/:fingerprint
// POS-DEV-001: Check if activation code was used (for POS polling)
posEnrollRouter.get("/activation-status/:fingerprint", async (req, res) => {
  const fingerprint = req.params.fingerprint;

  if (!fingerprint) {
    return res.status(400).json({ error: { code: "FINGERPRINT_REQUIRED", message: "Device fingerprint is required" } });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "DATABASE_UNAVAILABLE", message: "Database service unavailable" } });

  try {
    // Get the most recent activation code for this device
    const result = await pool.query(
      `SELECT
        code,
        expires_at,
        used_at,
        bound_store_id,
        bound_device_id
      FROM public.device_activation_codes
      WHERE device_fingerprint = $1
      ORDER BY created_at DESC
      LIMIT 1`,
      [fingerprint]
    );

    if (result.rowCount === 0) {
      return res.json({ status: "no_code", message: "No activation code found for this device" });
    }

    const record = result.rows[0];

    // Check if code was used
    if (record.used_at) {
      // Get store details
      const storeResult = await pool.query(
        `SELECT id, name, code, status FROM platform.stores WHERE id = $1`,
        [record.bound_store_id]
      );

      // Get device token
      const deviceResult = await pool.query(
        `SELECT device_token FROM pos_devices WHERE id = $1`,
        [record.bound_device_id]
      );

      const store = storeResult.rows[0];
      const device = deviceResult.rows[0];

      return res.json({
        status: "activated",
        device_id: record.bound_device_id,
        store_id: record.bound_store_id,
        store_name: store?.name,
        store_code: store?.code,
        device_token: device?.device_token
      });
    }

    // Check if code expired
    const expiresAt = new Date(record.expires_at);
    if (expiresAt.getTime() <= Date.now()) {
      return res.json({ status: "expired", code: record.code });
    }

    // Code is still pending
    return res.json({
      status: "pending",
      code: record.code,
      expires_at: record.expires_at,
      expires_in_seconds: Math.max(0, Math.floor((expiresAt.getTime() - Date.now()) / 1000))
    });

  } catch (_error: unknown) {
    const error = asError(_error);
    log.error("[POS-DEV-001] Activation status check error:", error.message);
    return res.status(500).json({ error: { code: "INTERNAL_ERROR", message: "Failed to check activation status" } });
  }
});
