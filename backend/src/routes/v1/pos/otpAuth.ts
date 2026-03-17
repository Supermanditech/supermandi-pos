import { Router } from "express";
import { getPool } from "../../../db/client";
import { asError } from "../../../lib/errorUtils";
import crypto from "crypto";
import { sendTextMessage, isWhatsAppConfigured } from "../../../services/whatsappService";

// V3 OTP Auth — Phone + OTP based authentication for POS app
// Flow: retailer registers on web → superadmin approves → retailer enters phone on POS → gets OTP → verifies → gets device token

export const posOtpAuthRouter = Router();

// POST /pos/auth/send-otp — send OTP to registered phone
posOtpAuthRouter.post("/auth/send-otp", async (req, res) => {
  const { phone } = req.body as { phone?: string };
  if (!phone || phone.length !== 10) {
    return res.status(400).json({ error: { message: "Valid 10-digit phone number required" } });
  }

  const pool = getPool();
  try {
    // Check if phone is registered and approved
    const storeResult = await pool.query(
      `SELECT s.id, s.store_name, s.store_code, s.status
       FROM stores s
       JOIN users u ON u.id = s.owner_id
       WHERE u.phone = $1 AND s.status = 'ACTIVE'
       LIMIT 1`,
      [phone]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: { message: "Phone not registered or store not approved. Register at supermandi.tech" } });
    }

    // Generate 6-digit OTP
    const otp = String(Math.floor(100000 + Math.random() * 900000));
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 min expiry

    // Store OTP (upsert)
    await pool.query(
      `INSERT INTO pos_otp (phone, otp_hash, expires_at, created_at)
       VALUES ($1, $2, $3, NOW())
       ON CONFLICT (phone) DO UPDATE SET otp_hash = $2, expires_at = $3, attempts = 0, created_at = NOW()`,
      [phone, crypto.createHash("sha256").update(otp).digest("hex"), expiresAt]
    );

    // V3-057: Send OTP via WhatsApp Business API (primary) with console.log fallback
    console.log(`[OTP] Phone: ${phone}, OTP: ${otp} (expires: ${expiresAt.toISOString()})`);
    if (isWhatsAppConfigured()) {
      try {
        await sendTextMessage({
          to: `91${phone}`,
          text: `Your SuperMandi POS verification code is: ${otp}\n\nThis code expires in 5 minutes. Do not share it with anyone.`,
        });
        console.log(`[OTP] WhatsApp sent to ${phone}`);
      } catch (waErr) {
        console.error(`[OTP] WhatsApp failed for ${phone}:`, asError(waErr).message);
        // OTP still saved in DB — user can see it in console log as fallback
      }
    }

    res.json({ success: true, message: "OTP sent to your phone" });
  } catch (err) {
    res.status(500).json({ error: { message: "Failed to send OTP", detail: asError(err).message } });
  }
});

// POST /pos/auth/verify-otp — verify OTP and return device token
posOtpAuthRouter.post("/auth/verify-otp", async (req, res) => {
  const { phone, otp } = req.body as { phone?: string; otp?: string };
  if (!phone || !otp || otp.length !== 6) {
    return res.status(400).json({ error: { message: "Phone and 6-digit OTP required" } });
  }

  const pool = getPool();
  try {
    // Verify OTP
    const otpResult = await pool.query(
      `SELECT otp_hash, expires_at, attempts FROM pos_otp WHERE phone = $1`,
      [phone]
    );

    if (otpResult.rows.length === 0) {
      return res.status(400).json({ error: { message: "No OTP found. Request a new one." } });
    }

    const row = otpResult.rows[0];
    if (new Date(row.expires_at) < new Date()) {
      return res.status(400).json({ error: { message: "OTP expired. Request a new one." } });
    }
    if (row.attempts >= 5) {
      return res.status(429).json({ error: { message: "Too many attempts. Request a new OTP." } });
    }

    // Increment attempts
    await pool.query(`UPDATE pos_otp SET attempts = attempts + 1 WHERE phone = $1`, [phone]);

    const otpHash = crypto.createHash("sha256").update(otp).digest("hex");
    if (otpHash !== row.otp_hash) {
      return res.status(400).json({ error: { message: "Invalid OTP" } });
    }

    // V3-063: Get ALL stores for this phone (multi-store support)
    const storeResult = await pool.query(
      `SELECT s.id, s.store_name, s.store_code
       FROM stores s
       JOIN users u ON u.id = s.owner_id
       WHERE u.phone = $1 AND s.status = 'ACTIVE'
       ORDER BY s.created_at DESC`,
      [phone]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: { message: "Store not found" } });
    }

    // If multiple stores, return list for selection (no token yet)
    if (storeResult.rows.length > 1 && !req.body.storeId) {
      return res.json({
        multiStore: true,
        stores: storeResult.rows.map((s: any) => ({ id: s.id, name: s.store_name, code: s.store_code })),
      });
    }

    // Single store or storeId provided — create device token
    const store = req.body.storeId
      ? storeResult.rows.find((s: any) => s.id === req.body.storeId) ?? storeResult.rows[0]
      : storeResult.rows[0];

    const token = crypto.randomBytes(32).toString("hex");

    await pool.query(
      `INSERT INTO devices (token, store_id, phone, label, status, created_at)
       VALUES ($1, $2, $3, $4, 'ACTIVE', NOW())
       ON CONFLICT (token) DO UPDATE SET store_id = $2, phone = $3, status = 'ACTIVE'`,
      [token, store.id, phone, `POS-${phone.slice(-4)}`]
    );

    // Clean up OTP
    await pool.query(`DELETE FROM pos_otp WHERE phone = $1`, [phone]);

    res.json({
      token,
      storeId: store.id,
      storeName: store.store_name,
      storeCode: store.store_code,
    });
  } catch (err) {
    res.status(500).json({ error: { message: "OTP verification failed", detail: asError(err).message } });
  }
});
