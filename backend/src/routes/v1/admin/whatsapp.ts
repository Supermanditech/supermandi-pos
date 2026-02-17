// WA-001/WA-002: SuperAdmin WhatsApp API Routes
// Enables superadmin to send messages to retailers and suppliers via WhatsApp Cloud API
// WA-002: Added message log listing + stats endpoint

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
// GET /admin/whatsapp/logs — Query WhatsApp message logs with filtering
// =============================================================================
adminWhatsAppRouter.get("/whatsapp/logs", async (req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database not available" });

    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);
    const senderType = req.query.senderType as string | undefined;
    const recipientType = req.query.recipientType as string | undefined;
    const deliveryStatus = req.query.deliveryStatus as string | undefined;
    const contextType = req.query.contextType as string | undefined;
    const storeId = req.query.storeId as string | undefined;

    let where = "WHERE 1=1";
    const params: any[] = [];
    let idx = 1;

    if (senderType) { where += ` AND ml.sender_type = $${idx++}`; params.push(senderType); }
    if (recipientType) { where += ` AND ml.recipient_type = $${idx++}`; params.push(recipientType); }
    if (deliveryStatus) { where += ` AND ml.delivery_status = $${idx++}`; params.push(deliveryStatus); }
    if (contextType) { where += ` AND ml.context_type = $${idx++}`; params.push(contextType); }
    if (storeId) { where += ` AND ml.store_id = $${idx++}::uuid`; params.push(storeId); }

    const countResult = await pool.query(
      `SELECT COUNT(*) as total FROM whatsapp.message_logs ml ${where}`,
      params
    );
    const total = parseInt(countResult.rows[0]?.total || "0", 10);

    const logsResult = await pool.query(
      `SELECT
        ml.id, ml.store_id as "storeId",
        ml.sender_type as "senderType", ml.recipient_type as "recipientType",
        ml.recipient_phone as "recipientPhone", ml.message_type as "messageType",
        ml.template_name as "templateName",
        ml.content_preview as "contentPreview",
        ml.wamid, ml.delivery_status as "deliveryStatus",
        ml.delivery_error_code as "deliveryErrorCode",
        ml.delivered_at as "deliveredAt", ml.read_at as "readAt",
        ml.context_type as "contextType", ml.context_id as "contextId",
        ml.created_at as "createdAt"
      FROM whatsapp.message_logs ml
      ${where}
      ORDER BY ml.created_at DESC
      LIMIT $${idx} OFFSET $${idx + 1}`,
      [...params, limit, offset]
    );

    return res.json({ data: logsResult.rows, total });
  } catch (err: unknown) {
    console.error("[WA-002] logs query error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

// =============================================================================
// GET /admin/whatsapp/stats — Aggregate message statistics
// =============================================================================
adminWhatsAppRouter.get("/whatsapp/stats", async (_req: Request, res: Response) => {
  try {
    const pool = getPool();
    if (!pool) return res.status(503).json({ error: "Database not available" });

    const result = await pool.query(
      `SELECT
        COUNT(*) as "totalMessages",
        COUNT(*) FILTER (WHERE delivery_status = 'sent') as "sent",
        COUNT(*) FILTER (WHERE delivery_status = 'delivered') as "delivered",
        COUNT(*) FILTER (WHERE delivery_status = 'read') as "read",
        COUNT(*) FILTER (WHERE delivery_status = 'failed') as "failed",
        COUNT(*) FILTER (WHERE sender_type = 'pos') as "fromPos",
        COUNT(*) FILTER (WHERE sender_type = 'superadmin') as "fromAdmin",
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '24 hours') as "last24h",
        COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as "last7d"
      FROM whatsapp.message_logs`
    );

    const row = result.rows[0] || {};
    return res.json({
      totalMessages: parseInt(row.totalMessages || "0", 10),
      sent: parseInt(row.sent || "0", 10),
      delivered: parseInt(row.delivered || "0", 10),
      read: parseInt(row.read || "0", 10),
      failed: parseInt(row.failed || "0", 10),
      fromPos: parseInt(row.fromPos || "0", 10),
      fromAdmin: parseInt(row.fromAdmin || "0", 10),
      last24h: parseInt(row.last24h || "0", 10),
      last7d: parseInt(row.last7d || "0", 10),
    });
  } catch (err: unknown) {
    console.error("[WA-002] stats query error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
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
