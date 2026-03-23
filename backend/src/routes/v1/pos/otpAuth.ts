/**
 * V3-BE-004: POS OTP Auth — rewritten against canonical schema.
 *
 * Uses: auth.users + auth.store_users + platform.stores (NOT legacy public.stores/users)
 * Device IDs: UUID (gen_random_uuid), not string concatenation
 * OTP: cryptographically strong (crypto.randomInt), SHA-256 hashed
 * Logging: no plaintext OTP unless LOG_OTP_PLAINTEXT=true
 * Rate limiting: 5 attempts per OTP, 5-min expiry
 * Error responses: { error: { code, message } } format
 */

import { Router } from "express";
import { getPool } from "../../../db/client";
import { asError } from "../../../lib/errorUtils";
import crypto from "crypto";
import { sendTextMessage, isWhatsAppConfigured } from "../../../services/whatsappService";
import { redisRateLimit } from "../../../middleware/rateLimit";

// GCP-STG-0308: Rate limiter on send-otp to prevent OTP table flooding
const otpSendLimiter = redisRateLimit({
  keyPrefix: "rl:pos:otp:send",
  windowMs: 60_000,
  max: 5,
  keyGenerator: (req) => req.ip || "unknown",
});

export const posOtpAuthRouter = Router();

// Cryptographically strong 6-digit OTP
function generateOtp(): string {
  return String(crypto.randomInt(100000, 999999));
}

function hashOtp(otp: string): string {
  return crypto.createHash("sha256").update(otp).digest("hex");
}

// ─── POST /pos/auth/send-otp ────────────────────────────────────────────────
posOtpAuthRouter.post("/auth/send-otp", otpSendLimiter, async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone || !/^\d{10}$/.test(phone)) {
    return res.status(400).json({ error: { code: "INVALID_PHONE", message: "Valid 10-digit phone number required" } });
  }

  // GCP-STG-0299: Normalize 10-digit phone to E.164 (+91) for auth.users lookup
  const normalizedPhone = `+91${phone}`;

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } });
  try {
    // V3-BE-004: Query canonical schema — auth.users + auth.store_users + platform.stores
    const storeResult = await pool.query(
      `SELECT ps.id, ps.name AS store_name, ps.code AS store_code, ps.status
       FROM auth.users u
       JOIN auth.store_users su ON su.user_id = u.id
       JOIN platform.stores ps ON ps.id = su.store_id
       WHERE u.phone = $1 AND ps.status = 'ACTIVE' AND u.is_active = true
       ORDER BY ps.created_at DESC
       LIMIT 10`,
      [normalizedPhone]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: { code: "PHONE_NOT_REGISTERED", message: "Phone not registered or store not approved. Register at supermandi.tech" } });
    }

    // Generate OTP
    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000);

    // GCP-STG-0459: Store OTP with normalizedPhone (+91 E.164) to match auth.users format
    await pool.query(
      `INSERT INTO pos_otp (phone, otp_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (phone) DO UPDATE SET otp_hash = $2, expires_at = $3, attempts = 0, created_at = NOW()`,
      [normalizedPhone, hashOtp(otp), expiresAt]
    );

    // Send OTP via WhatsApp (primary) with masked console fallback
    // SECURITY: Never enable LOG_OTP_PLAINTEXT in staging or production
    if (process.env.LOG_OTP_PLAINTEXT === 'true') {
      console.log(`[OTP-DEV] Phone: ${phone}, OTP: ${otp}`);
    } else {
      console.log(`[OTP] Phone: ${phone.slice(0, 3)}***${phone.slice(-2)}, OTP: ****** (expires: ${expiresAt.toISOString()})`);
    }

    if (isWhatsAppConfigured()) {
      try {
        await sendTextMessage({
          to: `91${phone}`,
          body: `Your SuperMandi POS verification code is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
        });
      } catch (waErr) {
        console.error(`[OTP] WhatsApp failed for ${phone.slice(0, 3)}***:`, asError(waErr).message);
      }
    }

    res.json({ success: true, message: "OTP sent to your phone" });
  } catch (err) {
    console.error("[OTP] send-otp error:", asError(err).message);
    res.status(500).json({ error: { code: "OTP_SEND_FAILED", message: "Failed to send OTP" } });
  }
});

// ─── POST /pos/auth/verify-otp ──────────────────────────────────────────────
posOtpAuthRouter.post("/auth/verify-otp", async (req, res) => {
  const { phone, otp, storeId } = req.body as { phone?: string; otp?: string; storeId?: string };
  if (!phone || !otp || !/^\d{6}$/.test(otp)) {
    return res.status(400).json({ error: { code: "INVALID_INPUT", message: "Phone and 6-digit OTP required" } });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: { code: "SERVICE_UNAVAILABLE", message: "Database not available" } });
  try {
    // GCP-STG-0459: Use normalizedPhone (+91 E.164) for pos_otp lookup (matches INSERT format)
    const normalizedPhone = `+91${phone}`;
    const otpResult = await pool.query(
      `SELECT otp_hash, expires_at, attempts FROM pos_otp WHERE phone = $1`,
      [normalizedPhone]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: { code: "OTP_NOT_FOUND", message: "No OTP found. Request a new one." } });
    }

    const row = otpResult.rows[0];
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: { code: "OTP_EXPIRED", message: "OTP expired. Request a new one." } });
    }
    if (row.attempts >= 5) {
      return res.status(429).json({ error: { code: "OTP_RATE_LIMITED", message: "Too many attempts. Request a new OTP." } });
    }

    // GCP-STG-0459: Use normalizedPhone for UPDATE (matches INSERT/SELECT)
    await pool.query(`UPDATE pos_otp SET attempts = attempts + 1 WHERE phone = $1`, [normalizedPhone]);

    if (hashOtp(otp) !== row.otp_hash) {
      return res.status(400).json({ error: { code: "OTP_INVALID", message: "Invalid OTP" } });
    }

    // V3-BE-004: Get ALL stores for this phone from canonical schema
    // (normalizedPhone already declared above — GCP-STG-0459 unified all pos_otp + auth.users to +91)
    const storeResult = await pool.query(
      `SELECT ps.id, ps.name AS store_name, ps.code AS store_code, ps.status
       FROM auth.users u
       JOIN auth.store_users su ON su.user_id = u.id
       JOIN platform.stores ps ON ps.id = su.store_id
       WHERE u.phone = $1 AND ps.status = 'ACTIVE' AND u.is_active = true
       ORDER BY ps.created_at DESC`,
      [normalizedPhone]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: { code: "STORE_NOT_FOUND", message: "No active store found for this phone" } });
    }

    // Multi-store: return list for selection (no token yet)
    if (storeResult.rows.length > 1 && !storeId) {
      return res.json({
        multiStore: true,
        stores: storeResult.rows.map((s: any) => ({ id: s.id, name: s.store_name, code: s.store_code })),
      });
    }

    // Resolve store
    let store;
    if (storeId) {
      store = storeResult.rows.find((s: any) => s.id === storeId);
      if (!store) {
        return res.status(400).json({ error: { code: "INVALID_STORE", message: "Requested store not associated with this phone number" } });
      }
    } else {
      store = storeResult.rows[0];
    }

    // V3-BIZ-008: Check max_devices per store (default 10)
    const deviceCountResult = await pool.query(
      `SELECT COUNT(*)::int AS device_count FROM pos_devices WHERE store_id = $1 AND active = TRUE`,
      [store.id]
    );
    const maxDevices = 10; // Configurable per store in future
    if (deviceCountResult.rows[0]?.device_count >= maxDevices) {
      return res.status(400).json({ error: { code: "MAX_DEVICES_REACHED", message: `This store already has ${maxDevices} active devices. Deactivate an old device first.` } });
    }

    // GCP-STG-0007: Deactivate old devices + create new one in a TRANSACTION
    // Prevents race condition: two simultaneous OTP verifies could both succeed
    // without transaction, leaving two active devices for the same store.
    const token = crypto.randomBytes(32).toString("hex");
    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Deactivate all active devices for this store
      await client.query(
        `UPDATE pos_devices SET active = FALSE, token_revoked_at = NOW()
         WHERE store_id = $1 AND active = TRUE`,
        [store.id]
      );

      // Create new device
      // GCP-STG-0484: Set token_expires_at to 90 days from now (matches FINDING-026 in enroll.ts)
      await client.query(
        `INSERT INTO pos_devices (id, store_id, device_token, label, active, token_expires_at, token_refreshed_at)
         VALUES (gen_random_uuid(), $1, $2, $3, TRUE, NOW() + INTERVAL '90 days', NOW())`,
        [store.id, token, `POS-${phone.slice(-4)}`]
      );

      // GCP-STG-0459: Clean up OTP using normalizedPhone (+91 E.164 format)
      await client.query(`DELETE FROM pos_otp WHERE phone = $1`, [normalizedPhone]);

      await client.query("COMMIT");
    } catch (txErr) {
      await client.query("ROLLBACK");
      throw txErr;
    } finally {
      client.release();
    }

    res.json({
      token,
      storeId: store.id,
      storeName: store.store_name,
      storeCode: store.store_code,
    });
  } catch (err) {
    console.error("[OTP] verify-otp error:", asError(err).message);
    res.status(500).json({ error: { code: "OTP_VERIFY_FAILED", message: "OTP verification failed" } });
  }
});
