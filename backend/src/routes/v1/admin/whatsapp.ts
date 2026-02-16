// WA-001: SuperAdmin WhatsApp API Routes
// Enables superadmin to send messages to retailers and suppliers via WhatsApp Cloud API

import { Router, Request, Response } from "express";
import { requireAdminToken } from "../../../middleware/adminToken";
import { getPool } from "../../../db/client";
import {
  isWhatsAppConfigured,
  sendTextMessage,
  normalizePhone,
} from "../../../services/whatsappService";

export const adminWhatsAppRouter = Router();

adminWhatsAppRouter.use(requireAdminToken);

// =============================================================================
// GET /admin/whatsapp/status — Check if WhatsApp Cloud API is configured
// =============================================================================
adminWhatsAppRouter.get("/whatsapp/status", (_req: Request, res: Response) => {
  res.json({ configured: isWhatsAppConfigured() });
});

// =============================================================================
// POST /admin/whatsapp/send — Send message to retailer or supplier
// =============================================================================
adminWhatsAppRouter.post("/whatsapp/send", async (req: Request, res: Response) => {
  try {
    const { recipientPhone, message, recipientType, contextType } = req.body;
    const adminId = (req as any).adminId;

    if (!recipientPhone || !message) {
      return res.status(400).json({ sent: false, error: "recipientPhone and message are required" });
    }

    if (!recipientType || !["retailer", "supplier"].includes(recipientType)) {
      return res.status(400).json({ sent: false, error: "recipientType must be 'retailer' or 'supplier'" });
    }

    if (!isWhatsAppConfigured()) {
      return res.status(503).json({ sent: false, error: "WhatsApp not configured" });
    }

    if (message.length > 4096) {
      return res.status(400).json({ sent: false, error: "Message too long (max 4096 chars)" });
    }

    const phone = normalizePhone(recipientPhone);
    if (phone.length < 10) {
      return res.status(400).json({ sent: false, error: "Invalid phone number" });
    }

    const result = await sendTextMessage({ to: phone, body: message });

    // Log to audit table
    try {
      const pool = getPool();
      if (pool) await pool.query(
        `INSERT INTO whatsapp.message_logs
          (store_id, sender_type, recipient_type, recipient_phone, message_type,
           content_preview, wamid, delivery_status, context_type, sent_by)
         VALUES (NULL, 'superadmin', $1, $2, 'text', $3, $4, $5, $6, $7)`,
        [
          recipientType,
          phone,
          message.slice(0, 200),
          result.wamid || null,
          result.sent ? "sent" : "failed",
          contextType || null,
          adminId || null,
        ]
      );
    } catch (logErr) {
      console.warn("[WA-001] Failed to log WhatsApp message:", logErr);
    }

    if (!result.sent) {
      return res.status(502).json({ sent: false, error: result.errorMessage || "Failed to send" });
    }

    return res.json({ sent: true, wamid: result.wamid });
  } catch (err: unknown) {
    console.error("[WA-001] admin send error:", err);
    return res.status(500).json({ sent: false, error: "Internal server error" });
  }
});

// =============================================================================
// POST /admin/whatsapp/broadcast — Send message to multiple recipients
// =============================================================================
adminWhatsAppRouter.post("/whatsapp/broadcast", async (req: Request, res: Response) => {
  try {
    const { phones, message, recipientType } = req.body;
    const adminId = (req as any).adminId;

    if (!Array.isArray(phones) || phones.length === 0 || !message) {
      return res.status(400).json({ error: "phones (array) and message are required" });
    }

    if (!recipientType || !["retailer", "supplier"].includes(recipientType)) {
      return res.status(400).json({ error: "recipientType must be 'retailer' or 'supplier'" });
    }

    if (!isWhatsAppConfigured()) {
      return res.status(503).json({ error: "WhatsApp not configured" });
    }

    if (phones.length > 50) {
      return res.status(400).json({ error: "Max 50 recipients per broadcast" });
    }

    let sent = 0;
    let failed = 0;
    const errors: string[] = [];
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database not available" });

    for (const rawPhone of phones) {
      const phone = normalizePhone(String(rawPhone));
      if (phone.length < 10) {
        failed++;
        errors.push(`Invalid: ${rawPhone}`);
        continue;
      }

      const result = await sendTextMessage({ to: phone, body: message });

      // Log each message
      try {
        await pool.query(
          `INSERT INTO whatsapp.message_logs
            (store_id, sender_type, recipient_type, recipient_phone, message_type,
             content_preview, wamid, delivery_status, context_type, sent_by)
           VALUES (NULL, 'superadmin', $1, $2, 'text', $3, $4, $5, 'broadcast', $6)`,
          [
            recipientType,
            phone,
            message.slice(0, 200),
            result.wamid || null,
            result.sent ? "sent" : "failed",
            adminId || null,
          ]
        );
      } catch (logErr) {
        console.warn("[WA-001] Failed to log broadcast message:", logErr);
      }

      if (result.sent) {
        sent++;
      } else {
        failed++;
        errors.push(`${rawPhone}: ${result.errorMessage || "Failed"}`);
      }
    }

    return res.json({ sent, failed, total: phones.length, errors: errors.slice(0, 10) });
  } catch (err: unknown) {
    console.error("[WA-001] broadcast error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});
