// WA-001: WhatsApp Webhook Handler
// Handles: Meta webhook verification (GET) + delivery status updates (POST)
// Pattern: refundWebhook.ts (signature verify, idempotent updates)

import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { getWebhookVerifyToken } from "../../../services/whatsappService";

export const whatsappWebhookRouter = Router();

// Delivery status progression order (for idempotent updates)
const STATUS_ORDER: Record<string, number> = {
  queued: 0,
  sent: 1,
  delivered: 2,
  read: 3,
  failed: 4,
};

// =============================================================================
// GET /webhooks/whatsapp — Meta webhook verification challenge
// =============================================================================
whatsappWebhookRouter.get("/whatsapp", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = getWebhookVerifyToken();

  if (mode === "subscribe" && token === verifyToken && verifyToken) {
    console.log("[WA-001] Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  console.warn("[WA-001] Webhook verification failed");
  return res.sendStatus(403);
});

// =============================================================================
// POST /webhooks/whatsapp — Delivery status updates from Meta
// =============================================================================
whatsappWebhookRouter.post("/whatsapp", async (req: Request, res: Response) => {
  // Always respond 200 immediately (Meta requirement — they retry on non-200)
  res.sendStatus(200);

  try {
    const body = req.body;
    const entries = body?.entry;
    if (!Array.isArray(entries)) return;

    const pool = getPool();

    for (const entry of entries) {
      const changes = entry?.changes;
      if (!Array.isArray(changes)) continue;

      for (const change of changes) {
        const value = change?.value;
        if (!value) continue;

        // Process delivery status updates
        const statuses = value.statuses;
        if (Array.isArray(statuses)) {
          for (const status of statuses) {
            await processStatusUpdate(pool, status);
          }
        }
      }
    }
  } catch (err) {
    console.error("[WA-001] Webhook processing error:", err);
  }
});

async function processStatusUpdate(
  pool: ReturnType<typeof getPool>,
  status: { id?: string; status?: string; timestamp?: string }
): Promise<void> {
  const wamid = status.id;
  const newStatus = status.status;

  if (!wamid || !newStatus) return;

  // Map Meta status to our schema
  const mappedStatus = mapMetaStatus(newStatus);
  if (!mappedStatus) return;

  try {
    // Idempotent update: only progress forward in status lifecycle
    const existing = await pool.query(
      `SELECT delivery_status FROM whatsapp.message_logs WHERE wamid = $1`,
      [wamid]
    );

    if (existing.rows.length === 0) {
      // Message not in our logs (possibly sent before integration)
      return;
    }

    const currentStatus = existing.rows[0].delivery_status;
    const currentOrder = STATUS_ORDER[currentStatus] ?? -1;
    const newOrder = STATUS_ORDER[mappedStatus] ?? -1;

    // Only update if new status is later in lifecycle (or is "failed")
    if (newOrder <= currentOrder && mappedStatus !== "failed") {
      return;
    }

    const updateFields: string[] = [
      "delivery_status = $1",
      "updated_at = NOW()",
    ];
    const params: unknown[] = [mappedStatus];
    let paramIndex = 2;

    if (mappedStatus === "delivered") {
      updateFields.push(`delivered_at = $${paramIndex++}`);
      params.push(new Date());
    }
    if (mappedStatus === "read") {
      updateFields.push(`read_at = $${paramIndex++}`);
      params.push(new Date());
    }

    params.push(wamid);
    await pool.query(
      `UPDATE whatsapp.message_logs SET ${updateFields.join(", ")} WHERE wamid = $${paramIndex}`,
      params
    );
  } catch (err) {
    console.error(`[WA-001] Failed to update status for wamid ${wamid}:`, err);
  }
}

function mapMetaStatus(metaStatus: string): string | null {
  switch (metaStatus) {
    case "sent": return "sent";
    case "delivered": return "delivered";
    case "read": return "read";
    case "failed": return "failed";
    default: return null;
  }
}
