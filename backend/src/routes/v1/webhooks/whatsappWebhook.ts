// WA-001: WhatsApp Webhook Handler
// Handles: Meta webhook verification (GET) + delivery status updates (POST)
// Security: X-Hub-Signature-256 verification on POST requests

import crypto from "crypto";
import { Router, Request, Response } from "express";
import { getPool } from "../../../db/client";
import { getWebhookVerifyToken } from "../../../services/whatsappService";
import { log } from "../../../lib/logger";
// GCP-STG-0606: Rate limit webhook endpoints
import { redisRateLimit } from "../../../middleware/rateLimit";

export const whatsappWebhookRouter = Router();

// GCP-STG-0606: Rate limit WhatsApp webhook — 100 req/min per IP
whatsappWebhookRouter.use(redisRateLimit({
  windowMs: 60 * 1000,
  max: 100,
  keyPrefix: 'webhook:whatsapp',
}));

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

        // GCP-STG-0318: Process incoming messages
        const messages = value.messages;
        if (Array.isArray(messages)) {
          for (const msg of messages) {
            await processIncomingMessage(pool, msg, value.contacts);
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
    // Retry once after 1s — delivery status is important for tracking
    try {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await pool.query(
        `UPDATE whatsapp.message_logs SET delivery_status = $1, updated_at = NOW() WHERE wamid = $2`,
        [mappedStatus, wamid]
      );
      log.info(`[WA-001] Retry succeeded for wamid ${wamid}`);
    } catch (retryErr) {
      log.error(`[WA-001] Retry also failed for wamid ${wamid} — status update lost:`, retryErr);
    }
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

// GCP-STG-0318: Store incoming WhatsApp messages
async function processIncomingMessage(
  pool: ReturnType<typeof getPool>,
  msg: {
    id?: string;
    from?: string;
    timestamp?: string;
    type?: string;
    text?: { body?: string };
    image?: { id?: string };
    document?: { id?: string };
    context?: { message_id?: string };
  },
  contacts?: Array<{ profile?: { name?: string } }>
): Promise<void> {
  if (!pool || !msg.id || !msg.from) return;

  const profileName = contacts?.[0]?.profile?.name || null;
  const timestampWa = msg.timestamp
    ? new Date(parseInt(msg.timestamp, 10) * 1000)
    : new Date();
  const textBody = msg.text?.body || null;
  const mediaId = msg.image?.id || msg.document?.id || null;
  const contextMsgId = msg.context?.message_id || null;

  try {
    await pool.query(
      `INSERT INTO whatsapp.incoming_messages
        (wamid, from_phone, message_type, text_body, media_id, timestamp_wa,
         profile_name, context_message_id, raw_payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (wamid) DO NOTHING`,
      [
        msg.id, msg.from, msg.type || "text", textBody, mediaId,
        timestampWa, profileName, contextMsgId, JSON.stringify(msg),
      ]
    );
  } catch (err) {
    log.error(`[WA-001] Failed to store incoming message ${msg.id}:`, err);
  }
}
