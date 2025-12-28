import crypto from "crypto";
import { desc } from "drizzle-orm";
import { getDb } from "../db/client";
import { ensurePosEventsTable } from "../db/ensureSchema";
import { posEvents } from "../db/schema/posEvents";

export type IncomingPosEvent = {
  deviceId?: unknown;
  storeId?: unknown;
  eventType?: unknown;
  payload?: unknown;
};

function normalize(input: IncomingPosEvent) {
  const deviceId = typeof input.deviceId === "string" && input.deviceId.trim() ? input.deviceId.trim() : "unknown";
  const storeId = typeof input.storeId === "string" && input.storeId.trim() ? input.storeId.trim() : "unknown";
  const eventType = typeof input.eventType === "string" && input.eventType.trim() ? input.eventType.trim() : "UNKNOWN";
  const payload = input.payload && typeof input.payload === "object" ? input.payload : { value: input.payload };
  return { deviceId, storeId, eventType, payload };
}

// Fire-and-forget: swallow all errors.
export async function logPosEventSafe(body: unknown): Promise<void> {
  try {
    const db = getDb();
    if (!db) return;

    await ensurePosEventsTable();

    const { deviceId, storeId, eventType, payload } = normalize((body ?? {}) as IncomingPosEvent);

    await db.insert(posEvents).values({
      id: crypto.randomUUID(),
      deviceId,
      storeId,
      eventType,
      payload,
      createdAt: new Date()
    });
  } catch (e) {
    console.error("POS event insert failed (swallowed):", e);
  }
}

export async function fetchLatestPosEvents(opts: { limit: number }) {
  const db = getDb();
  if (!db) return [];

  await ensurePosEventsTable();

  const rows = await db
    .select({
      id: posEvents.id,
      deviceId: posEvents.deviceId,
      storeId: posEvents.storeId,
      eventType: posEvents.eventType,
      payload: posEvents.payload,
      createdAt: posEvents.createdAt
    })
    .from(posEvents)
    .orderBy(desc(posEvents.createdAt))
    .limit(opts.limit);

  return rows.map((r: any) => ({
    ...r,
    createdAt: r.createdAt instanceof Date ? r.createdAt.toISOString() : String(r.createdAt)
  }));
}
