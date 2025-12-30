import { randomBytes } from "crypto";
import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken } from "../../../middleware/adminToken";

export const adminDeviceEnrollmentRouter = Router();

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
  const storeId = typeof req.params.storeId === "string" ? req.params.storeId.trim() : "";
  if (!storeId) {
    return res.status(400).json({ error: "storeId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const storeRes = await pool.query(`SELECT id FROM stores WHERE id = $1`, [storeId]);
  if (storeRes.rowCount === 0) {
    return res.status(404).json({ error: "store not found" });
  }

  const code = await generateUniqueCode(pool);
  const expiresAt = new Date(Date.now() + ENROLLMENT_TTL_MINUTES * 60_000).toISOString();

  await pool.query(
    `
    INSERT INTO pos_device_enrollments (code, store_id, expires_at, created_by)
    VALUES ($1, $2, $3, $4)
    `,
    [code, storeId, expiresAt, "superadmin"]
  );

  return res.json({
    code,
    expiresAt,
    qrPayload: `supermandi://enroll?code=${encodeURIComponent(code)}`
  });
});
