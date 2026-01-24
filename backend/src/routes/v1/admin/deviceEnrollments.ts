import { randomBytes } from "crypto";
import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken } from "../../../middleware/adminToken";
import { isDemoStoreCode } from "../../../services/storeCodeService";

export const adminDeviceEnrollmentRouter = Router();

// Demo stores get unlimited multi-use enrollment codes
const DEMO_MAX_USES = 9999;
// Production stores get single-use enrollment codes
const PRODUCTION_MAX_USES = 1;

const ENROLLMENT_TTL_MINUTES = 30;
const CODE_ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ";

function generateCode(): string {
  let code = "";
  for (let i = 0; i < 6; i += 1) {
    const idx = Math.floor(Math.random() * CODE_ALPHABET.length);
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

// POST /api/v1/admin/stores/:storeId/device-enrollments
adminDeviceEnrollmentRouter.post("/stores/:storeId/device-enrollments", requireAdminToken, async (req, res) => {
  try {
    const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
    if (!storeId) {
      return res.status(400).json({ error: "storeId is required" });
    }

    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "database unavailable" });

    // Support both UUID and store code lookups
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(storeId);
    const storeRes = await pool.query(
      `SELECT id::TEXT as id, code FROM platform.stores WHERE ${isUuid ? "id = $1::uuid" : "code = $1"}`,
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

    console.log(`[AdminEnrollment] Created code=${code} store=${storeCode} isDemo=${isDemo} maxUses=${maxUses}`);

    return res.json({
      code,
      expiresAt,
      maxUses,
      isDemo,
      qrPayload: `supermandi://enroll?code=${encodeURIComponent(code)}`
    });
  } catch (error) {
    console.error("[AdminEnrollment] Error creating enrollment:", error);
    return res.status(500).json({ error: "INTERNAL_ERROR", message: "Failed to create enrollment" });
  }
});
