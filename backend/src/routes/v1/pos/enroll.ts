import { randomBytes, randomUUID } from "crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { getPool } from "../../../db/client";

// Rate limiter for enrollment endpoint to prevent brute force attacks
const enrollmentLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Maximum 10 enrollment attempts per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "enrollment_rate_limited", message: "Too many enrollment attempts. Please try again in 15 minutes." }
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
};

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function generateDeviceToken(): string {
  return randomBytes(32).toString("hex");
}

const DEVICE_TYPES = new Set(["OEM_HANDHELD", "SUPMANDI_PHONE", "RETAILER_PHONE"]);
const PRINTING_MODES = new Set(["DIRECT_ESC_POS", "SHARE_TO_PRINTER_APP", "NONE"]);

function normalizeEnum(value: string | null): string | null {
  return value ? value.trim().toUpperCase() : null;
}

// POST /api/v1/pos/enroll (with rate limiting to prevent brute force)
posEnrollRouter.post("/enroll", enrollmentLimiter, async (req, res) => {
  const code = asTrimmedString(req.body?.code)?.toUpperCase();
  if (!code) {
    return res.status(400).json({ error: "code is required" });
  }

  const meta = (req.body?.deviceMeta ?? {}) as DeviceMeta;
  const appVersion = asTrimmedString(meta.appVersion);
  const label = asTrimmedString(meta.label);
  const deviceType = normalizeEnum(asTrimmedString(meta.deviceType));
  const manufacturer = asTrimmedString(meta.manufacturer);
  const model = asTrimmedString(meta.model);
  const androidVersion = asTrimmedString(meta.androidVersion);
  const printingMode = normalizeEnum(asTrimmedString(meta.printingMode)) ?? "NONE";

  if (!label) {
    return res.status(400).json({ error: "label is required" });
  }
  if (!deviceType) {
    return res.status(400).json({ error: "deviceType is required" });
  }
  if (!DEVICE_TYPES.has(deviceType)) {
    return res.status(400).json({ error: "deviceType invalid" });
  }
  if (!PRINTING_MODES.has(printingMode)) {
    return res.status(400).json({ error: "printingMode invalid" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const enrollmentRes = await client.query(
      `
      SELECT code, store_id, expires_at, used_at
      FROM pos_device_enrollments
      WHERE code = $1
      FOR UPDATE
      `,
      [code]
    );

    const enrollment = enrollmentRes.rows[0];
    if (!enrollment) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "enrollment_invalid" });
    }

    const storeRes = await client.query(`SELECT id, active FROM stores WHERE id = $1`, [enrollment.store_id]);
    const store = storeRes.rows[0];
    if (!store) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "store not found" });
    }

    const existingDeviceRes = await client.query(
      `
      SELECT id, device_token
      FROM pos_devices
      WHERE store_id = $1
        AND lower(label) = lower($2)
      LIMIT 1
      `,
      [enrollment.store_id, label]
    );

    const existingDevice = existingDeviceRes.rows[0];
    const wasUsed = Boolean(enrollment.used_at);
    const expiresAt = new Date(enrollment.expires_at);
    const isExpired = !Number.isFinite(expiresAt.getTime()) || expiresAt.getTime() <= Date.now();

    // Allow re-enrollment for existing devices even if the code was used or expired.
    if ((wasUsed || isExpired) && !existingDevice) {
      await client.query("ROLLBACK");
      return res.status(400).json({ error: "enrollment_invalid" });
    }

    const deviceId = existingDevice?.id ?? randomUUID();
    let deviceToken = generateDeviceToken();
    let inserted = false;

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        if (existingDevice) {
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
                last_seen_online = NOW(),
                updated_at = NOW()
            WHERE id = $9
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
              deviceId
            ]
          );
        } else {
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
              last_seen_online,
              updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW(), NOW())
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
              printingMode
            ]
          );
        }
        inserted = true;
        break;
      } catch (error: any) {
        if (error?.code === "23505") {
          deviceToken = generateDeviceToken();
          continue;
        }
        throw error;
      }
    }

    if (!inserted) {
      throw new Error("device insert failed");
    }

    if (!wasUsed) {
      await client.query(
        `UPDATE pos_device_enrollments SET used_at = NOW() WHERE code = $1`,
        [code]
      );
    }

    await client.query("COMMIT");

    return res.json({
      deviceId,
      storeId: store.id,
      deviceToken,
      storeActive: Boolean(store.active)
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "enrollment_failed" });
  } finally {
    client.release();
  }
});
