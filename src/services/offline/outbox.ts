import { offlineDb } from "./localDb";
import { uuidv4 } from "../../utils/uuid";

export type OfflineEventType =
  | "PRODUCT_UPSERT"
  | "PRODUCT_PRICE_SET"
  | "SALE_CREATED"
  | "PAYMENT_CASH"
  | "PAYMENT_DUE"
  | "COLLECTION_CREATED"
  | "PURCHASE_SUBMIT";

export type OfflineEvent = {
  eventId: string;
  type: OfflineEventType;
  payload: Record<string, unknown>;
  createdAt: string;
};

export async function enqueueEvent(type: OfflineEventType, payload: Record<string, unknown>): Promise<string> {
  const eventId = uuidv4();
  const createdAt = new Date().toISOString();

  await offlineDb.run(
    `
    INSERT INTO offline_outbox (event_id, event_type, payload, created_at, attempts, synced_at)
    VALUES (?, ?, ?, ?, 0, NULL)
    `,
    [eventId, type, JSON.stringify(payload), createdAt]
  );

  return eventId;
}

export async function getPendingEvents(limit = 50): Promise<OfflineEvent[]> {
  const rows = await offlineDb.all<{
    event_id: string;
    event_type: OfflineEventType;
    payload: string;
    created_at: string;
  }>(
    `
    SELECT event_id, event_type, payload, created_at
    FROM offline_outbox
    WHERE synced_at IS NULL
    ORDER BY created_at ASC
    LIMIT ?
    `,
    [limit]
  );

  return rows.map((row) => ({
    eventId: row.event_id,
    type: row.event_type,
    payload: JSON.parse(row.payload),
    createdAt: row.created_at
  }));
}

export async function markEventsSynced(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = eventIds.map(() => "?").join(",");
  await offlineDb.run(
    `
    UPDATE offline_outbox
    SET synced_at = ?
    WHERE event_id IN (${placeholders})
    `,
    [now, ...eventIds]
  );
}

export async function pendingOutboxCount(): Promise<number> {
  const rows = await offlineDb.all<{ count: number }>(
    `SELECT COUNT(*) as count FROM offline_outbox WHERE synced_at IS NULL`
  );
  return rows[0]?.count ?? 0;
}
