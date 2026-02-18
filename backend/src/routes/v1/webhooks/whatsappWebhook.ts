// WA-001: WhatsApp Webhook Handler
// Handles: Meta webhook verification (GET) + delivery status updates (POST)
// Security: X-Hub-Signature-256 verification on POST requests

import crypto from "crypto";
import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { getWebhookVerifyToken } from "../../../services/whatsappService";
import { log } from "../../../lib/logger";

export const whatsappWebhookRouter = Router();

const WHATSAPP_APP_SECRET = process.env.WHATSAPP_APP_SECRET || "";

// =============================================================================
// GET /webhooks/whatsapp — Meta webhook verification challenge
// =============================================================================
whatsappWebhookRouter.get("/whatsapp", (req: Request, res: Response) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  const verifyToken = getWebhookVerifyToken();

  if (mode === "subscribe" && token === verifyToken && verifyToken) {
    log.info("[WA-001] Webhook verified successfully");
    return res.status(200).send(challenge);
  }

  log.warn("[WA-001] Webhook verification failed");
  return res.sendStatus(403);
});

// =============================================================================
// POST /webhooks/whatsapp — Delivery status updates from Meta
// Security: Validates X-Hub-Signature-256 header using WHATSAPP_APP_SECRET
// =============================================================================
whatsappWebhookRouter.post("/whatsapp", async (req: Request, res: Response) => {
  // Verify signature if app secret is configured
  if (WHATSAPP_APP_SECRET) {
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    if (!signature) {
      log.warn("[WA-001] Webhook missing X-Hub-Signature-256 header");
      return res.sendStatus(401);
    }

    // Use raw body buffer captured by express.json verify callback (preserves exact bytes Meta signed)
    // Fallback to JSON.stringify if rawBody not available (e.g., different middleware chain)
    const rawBody = (req as any).rawBody as Buffer | undefined;
    const bodyForHmac = rawBody || Buffer.from(JSON.stringify(req.body));
    const expectedSig = "sha256=" + crypto
      .createHmac("sha256", WHATSAPP_APP_SECRET)
      .update(bodyForHmac)
      .digest("hex");

    // Constant-time comparison to prevent timing attacks
    const sigBuffer = Buffer.from(signature);
    const expectedBuffer = Buffer.from(expectedSig);
    if (sigBuffer.length !== expectedBuffer.length || !crypto.timingSafeEqual(sigBuffer, expectedBuffer)) {
      log.warn("[WA-001] Webhook signature mismatch — rejecting");
      return res.sendStatus(403);
    }
  } else {
    log.warn("[WA-001] WHATSAPP_APP_SECRET not configured — skipping signature verification");
  }

  // Always respond 200 immediately after auth (Meta requirement — they retry on non-200)
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
    log.error("[WA-001] Webhook processing error:", err);
  }
});

async function processStatusUpdate(
  pool: ReturnType<typeof getPool>,
  status: {
    id?: string;
    status?: string;
    timestamp?: string;
    errors?: Array<{ code?: number; title?: string }>;
  }
): Promise<void> {
  if (!pool) return;

  const wamid = status.id;
  const newStatus = status.status;

  if (!wamid || !newStatus) return;

  // Map Meta status to our schema
  const mappedStatus = mapMetaStatus(newStatus);
  if (!mappedStatus) return;

  // Use Meta's timestamp if available (more accurate than server time)
  const eventTime = status.timestamp
    ? new Date(parseInt(status.timestamp, 10) * 1000)
    : new Date();

  try {
    // Atomic idempotent update: single UPDATE with WHERE clause prevents race conditions
    // Only progresses forward in lifecycle (queued→sent→delivered→read)
    // "failed" can overwrite queued/sent but NOT delivered/read
    if (mappedStatus === "failed") {
      // Extract error code from Meta's errors array (e.g., 131026 = "Message Undeliverable")
      const errorCode = status.errors?.[0]?.code
        ? String(status.errors[0].code)
        : status.errors?.[0]?.title || "unknown";
      // Failed can only overwrite queued or sent (not delivered/read)
      await pool.query(
        `UPDATE whatsapp.message_logs
         SET delivery_status = $1,
             delivery_error_code = $2,
             updated_at = NOW()
         WHERE wamid = $3
           AND delivery_status IN ('queued', 'sent')`,
        [mappedStatus, errorCode, wamid]
      );
    } else if (mappedStatus === "delivered") {
      await pool.query(
        `UPDATE whatsapp.message_logs
         SET delivery_status = $1,
             delivered_at = $2,
             updated_at = NOW()
         WHERE wamid = $3
           AND delivery_status IN ('queued', 'sent')`,
        [mappedStatus, eventTime, wamid]
      );
    } else if (mappedStatus === "read") {
      await pool.query(
        `UPDATE whatsapp.message_logs
         SET delivery_status = $1,
             read_at = $2,
             delivered_at = COALESCE(delivered_at, $2),
             updated_at = NOW()
         WHERE wamid = $3
           AND delivery_status IN ('queued', 'sent', 'delivered')`,
        [mappedStatus, eventTime, wamid]
      );
    } else {
      // sent status — only overwrite queued
      await pool.query(
        `UPDATE whatsapp.message_logs
         SET delivery_status = $1,
             updated_at = NOW()
         WHERE wamid = $2
           AND delivery_status = 'queued'`,
        [mappedStatus, wamid]
      );
    }
  } catch (err) {
    log.error(`[WA-001] Failed to update status for wamid ${wamid}:`, err);
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
