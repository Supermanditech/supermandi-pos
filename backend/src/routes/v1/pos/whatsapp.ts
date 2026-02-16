// WA-001: POS WhatsApp API Routes
// Enables POS app to send bill receipts and messages via WhatsApp Cloud API

import { Router, Request, Response } from "express";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { requireActiveStore } from "../../../middleware/storeStatusGate";
import { getPool } from "../../../db/client";
import {
  isWhatsAppConfigured,
  sendTextMessage,
  sendBillReceipt,
  normalizePhone,
} from "../../../services/whatsappService";
// Inline money formatter (backend has no shared formatMoney)
function formatMinor(minor: number, currency: string): string {
  const amount = (minor / 100).toFixed(2);
  return currency === "INR" ? `₹${amount}` : `${currency} ${amount}`;
}

export const posWhatsAppRouter = Router();

// All routes require device auth + active store
posWhatsAppRouter.use(requireDeviceToken);
posWhatsAppRouter.use(requireActiveStore);

// =============================================================================
// GET /pos/whatsapp/status — Check if WhatsApp Cloud API is configured
// =============================================================================
posWhatsAppRouter.get("/whatsapp/status", (_req: Request, res: Response) => {
  res.json({ configured: isWhatsAppConfigured() });
});

// =============================================================================
// POST /pos/whatsapp/send-bill — Send bill receipt to customer via WhatsApp
// =============================================================================
posWhatsAppRouter.post("/whatsapp/send-bill", async (req: Request, res: Response) => {
  try {
    const { saleId, recipientPhone } = req.body;
    const storeId = (req as any).posDevice?.storeId;
    const deviceId = (req as any).posDevice?.deviceId;

    if (!saleId || !recipientPhone) {
      return res.status(400).json({ sent: false, error: "saleId and recipientPhone are required" });
    }

    if (!isWhatsAppConfigured()) {
      return res.status(503).json({ sent: false, error: "WhatsApp not configured" });
    }

    const phone = normalizePhone(recipientPhone);
    if (phone.length < 10) {
      return res.status(400).json({ sent: false, error: "Invalid phone number" });
    }

    // Fetch sale data with store isolation
    const pool = getPool();
    const saleResult = await pool.query(
      `SELECT s.id, s.bill_ref, s.total_minor, s.currency, s.status,
              st.name as store_name
       FROM public.sales s
       LEFT JOIN platform.stores st ON st.id = s.store_id
       WHERE s.id = $1 AND s.store_id = $2`,
      [saleId, storeId]
    );

    if (saleResult.rows.length === 0) {
      return res.status(404).json({ sent: false, error: "Sale not found" });
    }

    const sale = saleResult.rows[0];
    const amount = formatMinor(sale.total_minor, sale.currency || "INR");
    const storeName = sale.store_name || "SuperMandi Store";
    const paymentMode = sale.status === "PAID_UPI" ? "UPI" : sale.status === "PAID_CASH" ? "Cash" : sale.status;

    const result = await sendBillReceipt({
      to: phone,
      storeName,
      billRef: sale.bill_ref,
      amount,
      paymentMode,
    });

    // Log to audit table
    try {
      await pool.query(
        `INSERT INTO whatsapp.message_logs
          (store_id, sender_type, recipient_type, recipient_phone, message_type,
           content_preview, wamid, delivery_status, context_type, context_id, sent_by)
         VALUES ($1, 'pos', 'consumer', $2, 'text', $3, $4, $5, 'bill_receipt', $6, $7)`,
        [
          storeId,
          phone,
          `Bill #${sale.bill_ref} - ${amount}`.slice(0, 200),
          result.wamid || null,
          result.sent ? "sent" : "failed",
          saleId,
          deviceId || null,
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
    console.error("[WA-001] send-bill error:", err);
    return res.status(500).json({ sent: false, error: "Internal server error" });
  }
});

// =============================================================================
// POST /pos/whatsapp/send — General-purpose message send from POS
// =============================================================================
posWhatsAppRouter.post("/whatsapp/send", async (req: Request, res: Response) => {
  try {
    const { recipientPhone, message, contextType, contextId } = req.body;
    const storeId = (req as any).posDevice?.storeId;
    const deviceId = (req as any).posDevice?.deviceId;

    if (!recipientPhone || !message) {
      return res.status(400).json({ sent: false, error: "recipientPhone and message are required" });
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
      await pool.query(
        `INSERT INTO whatsapp.message_logs
          (store_id, sender_type, recipient_type, recipient_phone, message_type,
           content_preview, wamid, delivery_status, context_type, context_id, sent_by)
         VALUES ($1, 'pos', 'consumer', $2, 'text', $3, $4, $5, $6, $7, $8)`,
        [
          storeId,
          phone,
          message.slice(0, 200),
          result.wamid || null,
          result.sent ? "sent" : "failed",
          contextType || null,
          contextId || null,
          deviceId || null,
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
    console.error("[WA-001] send error:", err);
    return res.status(500).json({ sent: false, error: "Internal server error" });
  }
});
