import { offlineDb } from "./localDb";
import { uuidv4 } from "../../utils/uuid";

// GL-CRIT-0012: Callback for corrupted event notification
type CorruptedEventsCallback = (count: number) => void;
let corruptedEventsCallback: CorruptedEventsCallback | null = null;

export function setCorruptedEventsCallback(callback: CorruptedEventsCallback | null): void {
  corruptedEventsCallback = callback;
}

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
    WHERE synced_at IS NULL AND error_flag IS NULL
    ORDER BY created_at ASC
    LIMIT ?
    `,
    [limit]
  );

  // AUD-081-A FIX: Wrap JSON.parse in try/catch to prevent corrupted events from blocking sync
  const validEvents: OfflineEvent[] = [];
  const corruptedEventIds: string[] = [];

  for (const row of rows) {
    try {
      validEvents.push({
        eventId: row.event_id,
        type: row.event_type,
        payload: JSON.parse(row.payload),
        createdAt: row.created_at
      });
    } catch (parseError) {
      console.error(`[Outbox] Corrupted JSON in event ${row.event_id}:`, parseError);
      corruptedEventIds.push(row.event_id);
    }
  }

  // Mark corrupted events with error flag so they're skipped in future batches
  if (corruptedEventIds.length > 0) {
    await markEventsCorrupted(corruptedEventIds);
    // GL-CRIT-0012: Notify callback about corrupted events
    if (corruptedEventsCallback) {
      corruptedEventsCallback(corruptedEventIds.length);
    }
  }

  return validEvents;
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
    `SELECT COUNT(*) as count FROM offline_outbox WHERE synced_at IS NULL AND error_flag IS NULL`
  );
  return rows[0]?.count ?? 0;
}

// AUD-081-A FIX: Mark events as corrupted so they're skipped in future sync batches
export async function markEventsCorrupted(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = eventIds.map(() => "?").join(",");
  await offlineDb.run(
    `
    UPDATE offline_outbox
    SET error_flag = 'corrupted_json', error_at = ?
    WHERE event_id IN (${placeholders})
    `,
    [now, ...eventIds]
  );
}

// AUD-081-A FIX: Get count of failed/corrupted events for UI display
export async function failedOutboxCount(): Promise<number> {
  const rows = await offlineDb.all<{ count: number }>(
    `SELECT COUNT(*) as count FROM offline_outbox WHERE error_flag IS NOT NULL`
  );
  return rows[0]?.count ?? 0;
}

// AUD-081-A FIX: Clear corrupted events (user can retry or discard)
export async function clearCorruptedEvents(): Promise<number> {
  // First get count, then delete (offlineDb.run doesn't return changes)
  const count = await failedOutboxCount();
  if (count > 0) {
    await offlineDb.run(
      `DELETE FROM offline_outbox WHERE error_flag IS NOT NULL`
    );
  }
  return count;
}

// AUD-081-D FIX: Mark events as permanently rejected (server rejected, won't ever succeed)
// This prevents infinite retry loops for invalid events
export async function markEventsRejected(eventIds: string[], reason: string): Promise<void> {
  if (eventIds.length === 0) return;
  const now = new Date().toISOString();
  const placeholders = eventIds.map(() => "?").join(",");
  const errorFlag = `rejected:${reason.slice(0, 50)}`; // Truncate reason to prevent excessive storage
  await offlineDb.run(
    `
    UPDATE offline_outbox
    SET error_flag = ?, error_at = ?
    WHERE event_id IN (${placeholders})
    `,
    [errorFlag, now, ...eventIds]
  );
}

// AUD-081-D FIX: Increment attempt count for retryable failures
export async function incrementAttempts(eventIds: string[]): Promise<void> {
  if (eventIds.length === 0) return;
  const placeholders = eventIds.map(() => "?").join(",");
  await offlineDb.run(
    `
    UPDATE offline_outbox
    SET attempts = attempts + 1
    WHERE event_id IN (${placeholders})
    `,
    eventIds
  );
}

// AUD-081-D FIX: Get events that have exceeded max retry attempts
export async function getExceededRetryEvents(maxAttempts: number): Promise<string[]> {
  const rows = await offlineDb.all<{ event_id: string }>(
    `
    SELECT event_id FROM offline_outbox
    WHERE synced_at IS NULL AND error_flag IS NULL AND attempts >= ?
    `,
    [maxAttempts]
  );
  return rows.map(r => r.event_id);
}
