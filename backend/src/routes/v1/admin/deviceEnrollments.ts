import { randomBytes } from "crypto";
import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken } from "../../../middleware/adminToken";
import { isDemoStoreCode } from "../../../services/storeCodeService";
import { sendWelcomeNotification } from "../../../services/notificationService";
import { log } from "../../../lib/logger";

export const adminDeviceEnrollmentRouter = Router();

// Demo stores get unlimited multi-use enrollment codes
const DEMO_MAX_USES = 9999;
// Production stores get single-use enrollment codes
const PRODUCTION_MAX_USES = 1;

// SA-ENROLL-UX G4: Configurable production code expiry (default 24hr for field agents)
const ENROLLMENT_TTL_MINUTES = parseInt(process.env.ENROLLMENT_TTL_MINUTES || "1440", 10);
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

// AUD-063-A FIX: Use crypto.randomBytes instead of Math.random() for secure code generation
function generateCode(): string {
  const bytes = randomBytes(6);
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    const idx = bytes[i] % CODE_ALPHABET.length;
    code += CODE_ALPHABET[idx];
  }
  return `SM-${code}`;
}

async function generateUniqueCode(pool: ReturnType<typeof getPool>): Promise<string> {
  if (!pool) throw new Error("database unavailable");
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateCode();
    const exists = await pool.query(`SELECT 1 FROM pos_device_enrollments WHERE code = $1`, [code]);
    if (exists.rowCount === 0) {
      return code;
    }
  }
  return `SM-${randomBytes(4).toString("hex").toUpperCase()}`;
}

// GET /api/v1/admin/device-enrollments - List all device enrollments
adminDeviceEnrollmentRouter.get("/device-enrollments", requireAdminToken, async (req, res) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const limit = Math.min(parseInt(req.query.limit as string) || 50, 200);
    const offset = parseInt(req.query.offset as string) || 0;
    const storeId = req.query.storeId as string;

    // Build WHERE clause for both queries
    let whereClause = "";
    const countParams: string[] = [];
    const dataParams: (string | number)[] = [];

    if (storeId) {
      whereClause = ` WHERE e.store_id = $1::uuid`;
      countParams.push(storeId);
      dataParams.push(storeId);
    }

    // SA-GAP-001 FIX: Get total count separately for accurate pagination
    const countQuery = `SELECT COUNT(*) as total FROM pos_device_enrollments e${whereClause}`;
    const countResult = await pool.query(countQuery, countParams);
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    // Get paginated data (SA-ENROLL-UX G5: include status + revocation fields)
    const dataQuery = `
      SELECT
        e.code as id,
        e.code,
        e.store_id,
        s.name as store_name,
        s.code as store_code,
        e.expires_at,
        e.max_uses,
        e.uses_count,
        e.created_at,
        e.created_by,
        e.revoked_at,
        e.used_at,
        e.last_used_at,
        CASE
          WHEN e.revoked_at IS NOT NULL THEN 'REVOKED'
          WHEN e.expires_at < NOW() THEN 'EXPIRED'
          WHEN COALESCE(e.uses_count, 0) >= COALESCE(e.max_uses, 1) THEN 'USED'
          ELSE 'ACTIVE'
        END as status
      FROM pos_device_enrollments e
      LEFT JOIN platform.stores s ON e.store_id = s.id
      ${whereClause}
      ORDER BY e.created_at DESC
      LIMIT $${dataParams.length + 1} OFFSET $${dataParams.length + 2}
    `;
    dataParams.push(limit, offset);

    const result = await pool.query(dataQuery, dataParams);

    return res.json({
      enrollments: result.rows,
      pagination: {
        limit,
        offset,
        total
      }
    });
  } catch (error) {
    log.error("[AdminEnrollment] Error listing enrollments:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list enrollments" });
  }
});

// POST /api/v1/admin/stores/:storeId/device-enrollments
adminDeviceEnrollmentRouter.post("/stores/:storeId/device-enrollments", requireAdminToken, async (req, res) => {
  try {
    const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
    if (!storeId) {
      return res.status(400).json({ error: "storeId is required" });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    // Support both UUID and store code lookups (case-insensitive for codes)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
    const storeRes = await pool.query(
      `SELECT id::TEXT as id, code FROM platform.stores WHERE ${isUuid ? "id = $1::uuid" : "UPPER(code) = UPPER($1)"}`,
      [storeId]
    );
    if (storeRes.rowCount === 0) {
      return res.status(404).json({ error: "store not found" });
    }

    const store = storeRes.rows[0];
    const storeCode = store.code ?? "";
    const isDemo = isDemoStoreCode(storeCode);

    // Demo stores get unlimited multi-use enrollment codes
    // Production stores get single-use codes
    const maxUses = isDemo ? DEMO_MAX_USES : PRODUCTION_MAX_USES;
    // Demo codes don't expire (set far future)
    const expiresAt = isDemo
      ? new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString() // 1 year for demo
      : new Date(Date.now() + ENROLLMENT_TTL_MINUTES * 60_000).toISOString();

    const code = await generateUniqueCode(pool);

    await pool.query(
      `
      INSERT INTO pos_device_enrollments (code, store_id, expires_at, max_uses, created_by)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [code, store.id, expiresAt, maxUses, "superadmin"]
    );

    log.info(`[AdminEnrollment] Created code=${code} store=${storeCode} isDemo=${isDemo} maxUses=${maxUses}`);

    return res.json({
      code,
      expiresAt,
      maxUses,
      isDemo,
      qrPayload: `supermandi://enroll?code=${encodeURIComponent(code)}`
    });
  } catch (error) {
    log.error("[AdminEnrollment] Error creating enrollment:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create enrollment" });
  }
});

// SA-ENROLL-UX G2: PATCH /api/v1/admin/device-enrollments/:code/revoke
adminDeviceEnrollmentRouter.patch("/device-enrollments/:code/revoke", requireAdminToken, async (req, res) => {
  try {
    const code = typeof req.params.code === "string" ? req.params.code.trim() : "";
    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const result = await pool.query(
      `UPDATE pos_device_enrollments
       SET revoked_at = NOW(), updated_at = NOW()
       WHERE code = $1 AND revoked_at IS NULL
       RETURNING code, store_id, revoked_at, expires_at, max_uses, uses_count, created_at`,
      [code]
    );

    if (result.rowCount === 0) {
      const check = await pool.query(`SELECT code, revoked_at FROM pos_device_enrollments WHERE code = $1`, [code]);
      if (check.rowCount === 0) {
        return res.status(404).json({ error: "enrollment code not found" });
      }
      return res.status(409).json({ error: "enrollment code already revoked" });
    }

    log.info(`[AdminEnrollment] Revoked code=${code}`);
    return res.json({ success: true, enrollment: result.rows[0] });
  } catch (error) {
    log.error("[AdminEnrollment] Error revoking enrollment:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to revoke enrollment" });
  }
});

// #369: PATCH /api/v1/admin/device-enrollments/:code/reinstate — Un-revoke a code
adminDeviceEnrollmentRouter.patch("/device-enrollments/:code/reinstate", requireAdminToken, async (req, res) => {
  try {
    const code = typeof req.params.code === "string" ? req.params.code.trim() : "";
    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    const result = await pool.query(
      `UPDATE pos_device_enrollments
       SET revoked_at = NULL, updated_at = NOW()
       WHERE code = $1 AND revoked_at IS NOT NULL
       RETURNING code, store_id, expires_at, max_uses, uses_count, created_at`,
      [code]
    );

    if (result.rowCount === 0) {
      const check = await pool.query(`SELECT code, revoked_at FROM pos_device_enrollments WHERE code = $1`, [code]);
      if (check.rowCount === 0) {
        return res.status(404).json({ error: "enrollment code not found" });
      }
      return res.status(409).json({ error: "enrollment code is not revoked" });
    }

    log.info(`[AdminEnrollment] Reinstated code=${code}`);
    return res.json({ success: true, enrollment: result.rows[0] });
  } catch (error) {
    log.error("[AdminEnrollment] Error reinstating enrollment:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to reinstate enrollment" });
  }
});

// #369: GET /api/v1/admin/device-enrollments/:code/devices — List devices enrolled via code
adminDeviceEnrollmentRouter.get("/device-enrollments/:code/devices", requireAdminToken, async (req, res) => {
  try {
    const code = typeof req.params.code === "string" ? req.params.code.trim() : "";
    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    // Verify code exists
    const enrollment = await pool.query(
      `SELECT code, store_id, max_uses, uses_count, revoked_at FROM pos_device_enrollments WHERE code = $1`,
      [code]
    );
    if (enrollment.rowCount === 0) {
      return res.status(404).json({ error: "enrollment code not found" });
    }

    // Find devices enrolled with this code
    const devices = await pool.query(
      `SELECT id, label, device_fingerprint, active, last_seen_online,
              app_version, created_at, token_revoked_at, re_enrolled
       FROM pos_devices
       WHERE enrollment_code = $1
       ORDER BY created_at DESC`,
      [code]
    );

    return res.json({
      code,
      enrollment: enrollment.rows[0],
      devices: devices.rows
    });
  } catch (error) {
    log.error("[AdminEnrollment] Error listing devices for code:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to list devices" });
  }
});

// #369: POST /api/v1/admin/device-enrollments/:code/revoke-devices — Revoke all devices for code
adminDeviceEnrollmentRouter.post("/device-enrollments/:code/revoke-devices", requireAdminToken, async (req, res) => {
  try {
    const code = typeof req.params.code === "string" ? req.params.code.trim() : "";
    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    // Verify code exists and is revoked
    const enrollment = await pool.query(
      `SELECT code, revoked_at FROM pos_device_enrollments WHERE code = $1`,
      [code]
    );
    if (enrollment.rowCount === 0) {
      return res.status(404).json({ error: "enrollment code not found" });
    }

    // Deactivate all devices enrolled with this code
    const result = await pool.query(
      `UPDATE pos_devices
       SET active = false, token_revoked_at = NOW(), updated_at = NOW()
       WHERE enrollment_code = $1 AND active = true
       RETURNING id, label`,
      [code]
    );

    log.info(`[AdminEnrollment] Revoked ${result.rowCount} devices for code=${code}`);
    return res.json({
      success: true,
      revokedCount: result.rowCount,
      devices: result.rows
    });
  } catch (error) {
    log.error("[AdminEnrollment] Error revoking devices for code:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to revoke devices" });
  }
});

// #330: POST /api/v1/admin/device-enrollments/:code/resend — Re-send activation code notification
adminDeviceEnrollmentRouter.post("/device-enrollments/:code/resend", requireAdminToken, async (req, res) => {
  try {
    const code = typeof req.params.code === "string" ? req.params.code.trim() : "";
    if (!code) {
      return res.status(400).json({ error: "code is required" });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    // Fetch enrollment + store + application contact info
    const result = await pool.query(
      `SELECT
        e.code, e.store_id, e.expires_at, e.revoked_at,
        CASE
          WHEN e.revoked_at IS NOT NULL THEN 'REVOKED'
          WHEN e.expires_at < NOW() THEN 'EXPIRED'
          WHEN COALESCE(e.uses_count, 0) >= COALESCE(e.max_uses, 1) THEN 'USED'
          ELSE 'ACTIVE'
        END as status,
        s.name as store_name, s.code as store_code, s.phone as store_phone, s.email as store_email,
        s.contact_name as contact_name
      FROM pos_device_enrollments e
      LEFT JOIN platform.stores s ON e.store_id = s.id
      WHERE e.code = $1`,
      [code]
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "enrollment code not found" });
    }

    const enrollment = result.rows[0];

    if (!enrollment.store_phone) {
      return res.status(400).json({ error: "No phone number found for this store" });
    }

    // Resend welcome message (code NOT included — POS fetches via phone lookup)
    const notifResult = await sendWelcomeNotification({
      phone: enrollment.store_phone,
      email: enrollment.store_email || undefined,
      ownerName: enrollment.contact_name || enrollment.store_name || "Retailer",
      storeName: enrollment.store_name || "Your Store",
      storeCode: enrollment.store_code || "",
    });

    const channels: string[] = [];
    if (notifResult.whatsappSent) channels.push("whatsapp");
    if (notifResult.smsSent) channels.push("sms");
    if (notifResult.emailSent) channels.push("email");

    log.info(`[AdminEnrollment] Resent welcome message for code=${code} via ${channels.join(", ") || "none"}`);
    return res.json({ sent: true, channels, sentTo: enrollment.store_phone });
  } catch (error) {
    log.error("[AdminEnrollment] Error resending enrollment:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to resend enrollment code" });
  }
});
