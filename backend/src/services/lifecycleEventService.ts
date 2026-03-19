/**
 * V3-HARDEN-188: Lifecycle event fan-out publisher
 *
 * Append-only lifecycle events → fan-out to:
 *   - SSE (real-time in-app)
 *   - WhatsApp Cloud API (message templates)
 *   - In-app notification persistence
 *
 * Idempotency: events keyed by (orderId + eventType + timestamp).
 * Retry: 3 attempts with exponential backoff for WhatsApp.
 * Observability: counts + error rates tracked in-memory.
 */

import { getPool } from "../db/client";
import { log } from "../lib/logger";
import { emitStoreEvent } from "./sseService";
import { isWhatsAppConfigured, sendTextMessage, normalizePhone } from "./whatsappService";
import {
  LIFECYCLE_COMMUNICATION_RULES,
  type LifecycleEventType,
  type LifecycleEvent,
} from "./storeDemandSignal";

// ─── Idempotency ───
const processedEvents = new Map<string, number>();
const DEDUP_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

// Cleanup old entries every 10 minutes
const cleanupTimer = setInterval(() => {
  const cutoff = Date.now() - DEDUP_WINDOW_MS;
  for (const [key, ts] of processedEvents) {
    if (ts < cutoff) processedEvents.delete(key);
  }
}, 600_000);
if (typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
  cleanupTimer.unref();
}

function dedupKey(orderId: string, eventType: string): string {
  return `${orderId}:${eventType}`;
}

// ─── Observability ───
const stats = {
  eventsPublished: 0,
  sseDelivered: 0,
  whatsappAttempted: 0,
  whatsappDelivered: 0,
  whatsappFailed: 0,
  duplicatesSkipped: 0,
};

export function getLifecycleStats() {
  return { ...stats };
}

// ─── WhatsApp message templates per event type ───
const WHATSAPP_TEMPLATES: Partial<Record<LifecycleEventType, {
  templateKey: string;
  buildMessage: (event: LifecycleEvent) => string;
}>> = {
  order_created: {
    templateKey: "order_confirmation",
    buildMessage: (e) => `Your order #${e.orderId.slice(-8)} has been placed. We'll update you when the supplier responds.`,
  },
  supplier_action_required: {
    templateKey: "supplier_new_order",
    buildMessage: (e) => `New order #${e.orderId.slice(-8)} requires your action. Please accept or reject.`,
  },
  supplier_rejected: {
    templateKey: "order_rejected",
    buildMessage: (e) => `Order #${e.orderId.slice(-8)} was declined by the supplier. We'll find an alternative.`,
  },
  dispatched: {
    templateKey: "order_dispatched",
    buildMessage: (e) => `Good news! Order #${e.orderId.slice(-8)} has been dispatched and is on its way.`,
  },
  delivered: {
    templateKey: "order_delivered",
    buildMessage: (e) => `Order #${e.orderId.slice(-8)} has been delivered. Please verify and complete GRN.`,
  },
  repeat_order_prompt: {
    templateKey: "reorder_reminder",
    buildMessage: (e) => `Time to reorder? Your stock for recent items is running low. Tap to review.`,
  },
};

/**
 * Publish a lifecycle event with fan-out.
 * This is the main entry point — call this after any allocation transition.
 *
 * Idempotent: same orderId + eventType within 24h window is skipped.
 */
export async function publishLifecycleEvent(event: LifecycleEvent): Promise<{
  eventId: string;
  delivered: { sse: boolean; whatsapp: boolean };
  duplicate: boolean;
}> {
  const key = dedupKey(event.orderId, event.eventType);

  // Idempotency check
  if (processedEvents.has(key)) {
    stats.duplicatesSkipped++;
    return { eventId: "", delivered: { sse: false, whatsapp: false }, duplicate: true };
  }

  // Persist to lifecycle_event_log
  const pool = getPool();
  let eventId = "";
  if (pool) {
    try {
      const result = await pool.query<{ id: string }>(
        `INSERT INTO public.lifecycle_event_log
          (event_type, order_id, store_id, supplier_id, payload)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id`,
        [event.eventType, event.orderId, event.storeId, event.supplierId, JSON.stringify(event.payload)]
      );
      eventId = result.rows[0].id;
    } catch (err) {
      log.error("[LifecycleEvent] Failed to persist event:", String(err));
    }
  }

  // Mark as processed
  processedEvents.set(key, Date.now());
  stats.eventsPublished++;

  const rules = LIFECYCLE_COMMUNICATION_RULES[event.eventType];
  let sseDelivered = false;
  let whatsappDelivered = false;

  // ─── SSE fan-out (in_app channel) ───
  const sseTargets = new Set<string>();
  if (rules.retailer.includes("in_app")) sseTargets.add(event.storeId);
  // Supplier SSE would use supplier's store context — emit on the order's store for now
  if (rules.admin.includes("in_app")) sseTargets.add("admin"); // Admin SSE channel

  for (const targetId of sseTargets) {
    try {
      emitStoreEvent(targetId, `lifecycle:${event.eventType}`, {
        eventId,
        orderId: event.orderId,
        eventType: event.eventType,
        payload: event.payload,
        timestamp: event.timestamp,
      });
      sseDelivered = true;
      stats.sseDelivered++;
    } catch (err) {
      log.error("[LifecycleEvent] SSE delivery failed:", String(err));
    }
  }

  // ─── WhatsApp fan-out ───
  const template = WHATSAPP_TEMPLATES[event.eventType];
  const shouldWhatsApp =
    template &&
    isWhatsAppConfigured() &&
    (rules.retailer.includes("whatsapp") || rules.supplier.includes("whatsapp"));

  if (shouldWhatsApp && template) {
    stats.whatsappAttempted++;
    try {
      whatsappDelivered = await sendWhatsAppWithRetry(event, template);
      if (whatsappDelivered) stats.whatsappDelivered++;
      else stats.whatsappFailed++;
    } catch {
      stats.whatsappFailed++;
    }
  }

  // ─── Persist in-app notification ───
  if (pool && rules.retailer.includes("in_app")) {
    try {
      await pool.query(
        `INSERT INTO public.notifications
          (store_id, type, title, message, metadata, created_at)
         VALUES ($1, 'order', $2, $3, $4, NOW())
         ON CONFLICT DO NOTHING`,
        [
          event.storeId,
          `Order ${event.eventType.replace(/_/g, " ")}`,
          template?.buildMessage(event) ?? `Order #${event.orderId.slice(-8)}: ${event.eventType}`,
          JSON.stringify({ orderId: event.orderId, eventType: event.eventType }),
        ]
      ).catch(() => { /* notifications table may not exist — non-blocking */ });
    } catch {
      // Non-blocking
    }
  }

  return { eventId, delivered: { sse: sseDelivered, whatsapp: whatsappDelivered }, duplicate: false };
}

/**
 * Query lifecycle events for an order (SSE stream history).
 */
export async function getOrderLifecycleEvents(
  orderId: string,
  options: { limit?: number } = {}
): Promise<Array<{
  id: string;
  eventType: LifecycleEventType;
  payload: Record<string, unknown>;
  createdAt: string;
}>> {
  const pool = getPool();
  if (!pool) return [];

  const limit = Math.min(options.limit ?? 50, 200);
  const result = await pool.query(
    `SELECT id, event_type AS "eventType", payload, created_at AS "createdAt"
     FROM public.lifecycle_event_log
     WHERE order_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [orderId, limit]
  );

  return result.rows;
}

/**
 * Query lifecycle events for a store (timeline view).
 */
export async function getStoreLifecycleEvents(
  storeId: string,
  options: { limit?: number; eventType?: LifecycleEventType } = {}
): Promise<Array<{
  id: string;
  eventType: LifecycleEventType;
  orderId: string;
  payload: Record<string, unknown>;
  createdAt: string;
}>> {
  const pool = getPool();
  if (!pool) return [];

  const limit = Math.min(options.limit ?? 50, 200);
  let query = `SELECT id, event_type AS "eventType", order_id AS "orderId", payload, created_at AS "createdAt"
               FROM public.lifecycle_event_log
               WHERE store_id = $1`;
  const params: (string | number)[] = [storeId];

  if (options.eventType) {
    params.push(options.eventType);
    query += ` AND event_type = $${params.length}`;
  }

  query += ` ORDER BY created_at DESC LIMIT $${params.length + 1}`;
  params.push(limit);

  const result = await pool.query(query, params);
  return result.rows;
}

// ─── Recipient resolution ───

async function resolveRecipientPhone(
  role: "retailer" | "supplier",
  event: LifecycleEvent
): Promise<string | null> {
  const pool = getPool();
  if (!pool) return null;

  try {
    if (role === "retailer" && event.storeId) {
      // Look up store owner phone from platform.stores → platform.users
      const result = await pool.query<{ phone: string }>(
        `SELECT u.phone FROM platform.users u
         JOIN platform.stores s ON s.owner_id = u.id
         WHERE s.id = $1 AND u.phone IS NOT NULL
         LIMIT 1`,
        [event.storeId]
      );
      return result.rows[0]?.phone ?? null;
    }
    if (role === "supplier" && event.supplierId) {
      const result = await pool.query<{ phone: string }>(
        `SELECT phone FROM supplier.suppliers
         WHERE id = $1 AND phone IS NOT NULL
         LIMIT 1`,
        [event.supplierId]
      );
      return result.rows[0]?.phone ?? null;
    }
  } catch {
    // Phone lookup failure is non-blocking
  }
  return null;
}

// ─── WhatsApp retry with exponential backoff ───

async function sendWhatsAppWithRetry(
  event: LifecycleEvent,
  template: { templateKey: string; buildMessage: (e: LifecycleEvent) => string },
  maxAttempts: number = 3
): Promise<boolean> {
  const message = template.buildMessage(event);
  const rules = LIFECYCLE_COMMUNICATION_RULES[event.eventType];

  // Resolve recipients for each role that needs WhatsApp
  const targets: Array<{ role: "retailer" | "supplier"; phone: string }> = [];
  if (rules.retailer.includes("whatsapp")) {
    const phone = await resolveRecipientPhone("retailer", event);
    if (phone) targets.push({ role: "retailer", phone });
  }
  if (rules.supplier.includes("whatsapp")) {
    const phone = await resolveRecipientPhone("supplier", event);
    if (phone) targets.push({ role: "supplier", phone });
  }

  if (targets.length === 0) {
    log.info(`[LifecycleEvent] WhatsApp: no recipients resolved for ${event.eventType}`);
    return false;
  }

  let anySuccess = false;
  for (const target of targets) {
    const normalizedPhone = normalizePhone(target.phone);
    if (!normalizedPhone) continue;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const result = await sendTextMessage({ to: normalizedPhone, body: message });
        if (result.sent) {
          log.info(`[LifecycleEvent] WhatsApp sent to ${target.role}: ${event.eventType} (wamid=${result.wamid})`);
          anySuccess = true;
          break;
        }
        if (result.errorCode === "RATE_LIMITED" && attempt < maxAttempts) {
          const delay = Math.pow(2, attempt) * 500;
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
        log.warn(`[LifecycleEvent] WhatsApp not sent to ${target.role}: ${result.errorCode} — ${result.errorMessage}`);
        break;
      } catch (err) {
        if (attempt < maxAttempts) {
          const delay = Math.pow(2, attempt) * 500;
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          log.error(`[LifecycleEvent] WhatsApp failed after ${maxAttempts} attempts to ${target.role}:`, String(err));
        }
      }
    }
  }
  return anySuccess;
}
