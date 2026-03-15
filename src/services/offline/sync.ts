import { API_BASE_URL } from "../../config/api";
import NetInfo from "@react-native-community/netinfo";
import { getDeviceToken } from "../deviceSession";
import { getPendingEvents, markEventsSynced, markEventsRejected, pendingOutboxCount, cleanupExpiredDeadLetters, incrementAttempts, getExceededRetryEvents } from "./outbox";
import { offlineDb } from "./localDb";

type SyncResult = {
  results: Array<{ eventId: string; status: "applied" | "duplicate_ignored" | "rejected"; error?: string }>;
  saleMappings?: Array<{
    saleId?: string;
    localSaleId?: string;
    serverSaleId: string;
    billRef: string;
    offlineReceiptRef?: string | null;
  }>;
  collectionMappings?: Array<{ collectionId: string; serverCollectionId: string }>;
};

async function markMappings(result: SyncResult): Promise<void> {
  if (result.saleMappings) {
    for (const mapping of result.saleMappings) {
      const localId = mapping.saleId ?? mapping.localSaleId;
      if (!localId) continue;
      await offlineDb.run(
        `UPDATE offline_sales SET server_sale_id = ?, synced_at = ? WHERE id = ?`,
        [mapping.serverSaleId, new Date().toISOString(), localId]
      );
    }
  }
  if (result.collectionMappings) {
    for (const mapping of result.collectionMappings) {
      await offlineDb.run(
        `UPDATE offline_collections SET server_collection_id = ?, synced_at = ? WHERE id = ?`,
        [mapping.serverCollectionId, new Date().toISOString(), mapping.collectionId]
      );
    }
  }
}

export async function syncOutboxBatch(): Promise<number> {
  const state = await NetInfo.fetch();
  if (!state.isConnected) return 0;

  // ISSUE-MICRO-103: Reduced batch size from 50 to 20 for low-memory POS devices
  const events = await getPendingEvents(20);
  if (events.length === 0) return 0;

  // ISSUE-MICRO-066/076: Track event IDs for attempt counting on failure
  const MAX_SYNC_ATTEMPTS = 10;
  const batchEventIds = events.map(e => e.eventId);

  const count = await pendingOutboxCount();

  const deviceToken = await getDeviceToken();
  if (!deviceToken) {
    return 0;
  }

  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}/api/v1/pos/sync`, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "x-device-token": deviceToken
      },
      body: JSON.stringify({
        pendingOutboxCount: count,
        events
      })
    });
  } catch (networkError) {
    // ISSUE-MICRO-076: Increment attempt counter on network error
    await incrementAttempts(batchEventIds);
    const exhaustedNet = await getExceededRetryEvents(MAX_SYNC_ATTEMPTS);
    if (exhaustedNet.length > 0) {
      await markEventsRejected(exhaustedNet, "max_attempts_exceeded");
      console.warn(`[Sync] ISSUE-MICRO-066: ${exhaustedNet.length} event(s) exceeded ${MAX_SYNC_ATTEMPTS} attempts, marked as rejected`);
    }
    // GO-LIVE-167: Log network errors instead of silent failure
    const errorMsg = networkError instanceof Error ? networkError.message : String(networkError);
    console.error(`[GO-LIVE-167] Sync network error: ${errorMsg}`);
    throw new Error(`Sync network error: ${errorMsg}`);
  }

  let data: SyncResult | { error?: string };
  try {
    data = await res.json() as SyncResult | { error?: string };
  } catch (parseError) {
    // ISSUE-MICRO-076: Increment attempt counter on parse error
    await incrementAttempts(batchEventIds);
    const exhaustedParse = await getExceededRetryEvents(MAX_SYNC_ATTEMPTS);
    if (exhaustedParse.length > 0) {
      await markEventsRejected(exhaustedParse, "max_attempts_exceeded");
      console.warn(`[Sync] ISSUE-MICRO-066: ${exhaustedParse.length} event(s) exceeded ${MAX_SYNC_ATTEMPTS} attempts, marked as rejected`);
    }
    // GO-LIVE-167: Log JSON parse errors
    console.error(`[GO-LIVE-167] Sync response parse error: status=${res.status}`);
    throw new Error(`Sync response parse error: ${res.status}`);
  }

  if (!res.ok) {
    // ISSUE-MICRO-076: Increment attempt counter on server error
    await incrementAttempts(batchEventIds);
    const exhaustedSrv = await getExceededRetryEvents(MAX_SYNC_ATTEMPTS);
    if (exhaustedSrv.length > 0) {
      await markEventsRejected(exhaustedSrv, "max_attempts_exceeded");
      console.warn(`[Sync] ISSUE-MICRO-066: ${exhaustedSrv.length} event(s) exceeded ${MAX_SYNC_ATTEMPTS} attempts, marked as rejected`);
    }
    // GO-LIVE-167: Log server errors with details instead of returning 0
    const errorDetails = (data as { error?: string }).error ?? `HTTP ${res.status}`;
    console.error(`[GO-LIVE-167] Sync API error: ${errorDetails}, events=${events.length}`);
    throw new Error(`Sync API error: ${errorDetails}`);
  }

  const results = (data as SyncResult).results ?? [];

  // AUD-081-A/D FIX: Handle all result statuses properly
  const appliedIds: string[] = [];
  const duplicateIds: string[] = [];
  const rejectedEvents: Array<{ eventId: string; reason: string }> = [];

  for (const r of results) {
    if (r.status === "applied") {
      appliedIds.push(r.eventId);
    } else if (r.status === "duplicate_ignored") {
      duplicateIds.push(r.eventId);
    } else if (r.status === "rejected") {
      // AUD-081-D FIX: Mark permanently rejected events to prevent infinite retry
      rejectedEvents.push({ eventId: r.eventId, reason: r.error ?? "unknown" });
    }
  }

  // STG-546: Process mappings BEFORE clearing outbox entries
  // This ensures duplicate_ignored events have their mappings persisted first
  await markMappings(data as SyncResult);

  // STG-546: Verify duplicate_ignored events have mappings before clearing
  const syncResult = data as SyncResult;
  const mappedLocalIds = new Set<string>();
  if (syncResult.saleMappings) {
    for (const m of syncResult.saleMappings) {
      const localId = m.saleId ?? m.localSaleId;
      if (localId) mappedLocalIds.add(localId);
    }
  }

  const safeToClearDuplicates: string[] = [];
  for (const eventId of duplicateIds) {
    // Find the event in our pending batch to check if it's a sale event
    const event = events.find(e => e.eventId === eventId);
    const isSaleEvent = event?.type === "SALE_CREATED" || event?.type === "PAYMENT_CASH" || event?.type === "PAYMENT_DUE";
    if (isSaleEvent && !mappedLocalIds.has(eventId)) {
      console.warn(`[STG-546] duplicate_ignored event ${eventId} has no mapping — keeping in outbox`);
    } else {
      safeToClearDuplicates.push(eventId);
    }
  }

  // Mark applied + verified duplicate events as synced
  await markEventsSynced([...appliedIds, ...safeToClearDuplicates]);

  // Mark rejected events with error flag to prevent infinite loop
  if (rejectedEvents.length > 0) {
    const rejectedIds = rejectedEvents.map(e => e.eventId);
    const reason = rejectedEvents[0]?.reason ?? "server_rejected";
    await markEventsRejected(rejectedIds, reason);
    console.warn(`[Sync] ${rejectedIds.length} event(s) permanently rejected:`, rejectedEvents);
  }

  // Return total processed (applied + duplicate cleared + rejected) to indicate progress
  return appliedIds.length + safeToClearDuplicates.length + rejectedEvents.length;
}

let syncing = false;

export async function syncOutbox(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    // ISSUE-MICRO-026: Clean up dead letter events older than 30 days
    await cleanupExpiredDeadLetters();

    let batchCount = 0;
    let totalSynced = 0;
    const maxBatches = 100; // GO-LIVE-167: Prevent infinite loops

    let consecutiveErrors = 0;
    while (batchCount < maxBatches) {
      try {
        const synced = await syncOutboxBatch();
        if (synced === 0) break; // No more events to sync
        totalSynced += synced;
        batchCount++;
        consecutiveErrors = 0; // STG-514: Reset backoff on success
      } catch (batchError) {
        consecutiveErrors++;
        // STG-514: Exponential backoff — 1s, 2s, 4s, 8s, max 16s
        const backoffMs = Math.min(1000 * Math.pow(2, consecutiveErrors - 1), 16000);
        const errorMsg = batchError instanceof Error ? batchError.message : String(batchError);
        console.error(`[STG-514] syncOutboxBatch failed (attempt ${consecutiveErrors}, backoff ${backoffMs}ms) after ${batchCount} batches (${totalSynced} synced): ${errorMsg}`);
        if (consecutiveErrors >= 3) {
          // STG-514: After 3 consecutive failures, stop retrying within this sync cycle
          throw batchError;
        }
        await new Promise(r => setTimeout(r, backoffMs));
      }
    }

    if (batchCount >= maxBatches) {
      console.warn(`[GO-LIVE-167] syncOutbox hit max batch limit (${maxBatches}), ${totalSynced} events synced`);
    } else if (totalSynced > 0) {
      console.log(`[Sync] Outbox sync complete: ${totalSynced} events in ${batchCount} batches`);
    }
  } finally {
    syncing = false;
  }
}
