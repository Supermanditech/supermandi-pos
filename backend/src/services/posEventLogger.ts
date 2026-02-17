import crypto from "crypto";
import { desc, eq, ilike, gte, lte, and, type SQL } from "drizzle-orm";
import { getDb, getPool } from "../db/client";
import { ensurePosEventsTable } from "../db/ensureSchema";
import { posEvents } from "../db/schema/posEvents";
// GO-LIVE-181: Use centralized schema error handling
import { handleSchemaError, isSchemaError } from "@supermandi/common";
import { log } from "../lib/logger";

export type IncomingPosEvent = {
  deviceId?: unknown;
  storeId?: unknown;
  eventType?: unknown;
  payload?: unknown;
  pendingOutboxCount?: unknown;
};

function normalize(input: IncomingPosEvent) {
  const deviceId = typeof input.deviceId === "string" && input.deviceId.trim() ? input.deviceId.trim() : "unknown";
  const storeId = typeof input.storeId === "string" && input.storeId.trim() ? input.storeId.trim() : "unknown";
  const eventType = typeof input.eventType === "string" && input.eventType.trim() ? input.eventType.trim() : "UNKNOWN";
  const payload = input.payload && typeof input.payload === "object" ? input.payload : { value: input.payload };
  const pendingRaw =
    typeof input.pendingOutboxCount === "number"
      ? input.pendingOutboxCount
      : typeof (payload as any)?.pendingOutboxCount === "number"
      ? (payload as any).pendingOutboxCount
      : null;
  const pendingOutboxCount =
    typeof pendingRaw === "number" && Number.isFinite(pendingRaw) && pendingRaw >= 0 ? Math.round(pendingRaw) : null;
  const appVersion =
    typeof (payload as any)?.appVersion === "string"
      ? (payload as any).appVersion.trim()
      : typeof (payload as any)?.app_version === "string"
      ? (payload as any).app_version.trim()
      : null;
  return { deviceId, storeId, eventType, payload, pendingOutboxCount, appVersion };
}

// Fire-and-forget: swallow all errors.
export async function logPosEventSafe(body: unknown): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;

    await ensurePosEventsTable();

    const { deviceId, storeId, eventType, payload, pendingOutboxCount, appVersion } = normalize(
      (body ?? {}) as IncomingPosEvent
    );

    await db.insert(posEvents).values({
      id: crypto.randomUUID(),
      deviceId,
      storeId,
      eventType,
      payload,
      createdAt: new Date()
    });

    const pool = getPool();
    if (pool) {
      await pool.query(
        `
        INSERT INTO pos_devices (id, store_id, last_seen_online, pending_outbox_count, updated_at)
        VALUES ($1, $2, NOW(), COALESCE($3, 0), NOW())
        ON CONFLICT (id) DO UPDATE SET
          store_id = EXCLUDED.store_id,
          last_seen_online = EXCLUDED.last_seen_online,
          pending_outbox_count = CASE
            WHEN $3 IS NULL THEN pos_devices.pending_outbox_count
            ELSE EXCLUDED.pending_outbox_count
          END,
          app_version = COALESCE($4, pos_devices.app_version),
          updated_at = NOW()
        `,
        [deviceId, storeId, pendingOutboxCount, appVersion]
      );
    }
  } catch (e) {
    log.error("POS event insert failed (swallowed):", e);
  }
}

export async function fetchLatestPosEvents(opts: {
  limit: number;
  deviceId?: string;
  storeId?: string;
  eventType?: string;
  from?: string;
  to?: string;
}) {
  const db = getDb();
  if (!db) return [];

  try {
    await ensurePosEventsTable();

    // Build WHERE conditions
    const conditions: SQL[] = [];
    if (opts.deviceId) conditions.push(eq(posEvents.deviceId, opts.deviceId));
    if (opts.storeId) conditions.push(eq(posEvents.storeId, opts.storeId));
    if (opts.eventType) conditions.push(ilike(posEvents.eventType, `%${opts.eventType}%`));
    if (opts.from) conditions.push(gte(posEvents.createdAt, new Date(opts.from)));
    if (opts.to) conditions.push(lte(posEvents.createdAt, new Date(opts.to)));

    const query = db
      .select({
        id: posEvents.id,
        deviceId: posEvents.deviceId,
        storeId: posEvents.storeId,
        eventType: posEvents.eventType,
        payload: posEvents.payload,
        createdAt: posEvents.createdAt
      })
      .from(posEvents);

    const rows = await (conditions.length > 0 ? query.where(and(...conditions)) : query)
      .orderBy(desc(posEvents.createdAt))
      .limit(opts.limit);

    return rows.map((r: any) => ({
      ...r,
      createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)
    }));
  } catch (error) {
    // GO-LIVE-181: Use centralized schema error handling with tracking
    if (isSchemaError(error)) {
      handleSchemaError(error, {
        operation: 'fetchLatestPosEvents',
        table: 'pos_events',
      });
      return [];
    }
    throw error;
  }
}
