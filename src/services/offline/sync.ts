import { API_BASE_URL } from "../../config/api";
import NetInfo from "@react-native-community/netinfo";
import { getDeviceToken } from "../deviceSession";
import { getPendingEvents, markEventsSynced, markEventsRejected, pendingOutboxCount } from "./outbox";
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

  const events = await getPendingEvents(50);
  if (events.length === 0) return 0;

  const count = await pendingOutboxCount();

  const deviceToken = await getDeviceToken();
  if (!deviceToken) {
    return 0;
  }

  const res = await fetch(`${API_BASE_URL}/api/v1/pos/sync`, {
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

  const data = (await res.json().catch(() => ({}))) as SyncResult | { error?: string };
  if (!res.ok) {
    return 0;
  }

  const results = (data as SyncResult).results ?? [];

  // AUD-081-A/D FIX: Handle all result statuses properly
  const appliedIds: string[] = [];
  const rejectedEvents: Array<{ eventId: string; reason: string }> = [];

  for (const r of results) {
    if (r.status === "applied" || r.status === "duplicate_ignored") {
      appliedIds.push(r.eventId);
    } else if (r.status === "rejected") {
      // AUD-081-D FIX: Mark permanently rejected events to prevent infinite retry
      rejectedEvents.push({ eventId: r.eventId, reason: r.error ?? "unknown" });
    }
  }

  // Mark applied events as synced
  await markEventsSynced(appliedIds);

  // Mark rejected events with error flag to prevent infinite loop
  if (rejectedEvents.length > 0) {
    const rejectedIds = rejectedEvents.map(e => e.eventId);
    const reason = rejectedEvents[0]?.reason ?? "server_rejected";
    await markEventsRejected(rejectedIds, reason);
    console.warn(`[Sync] ${rejectedIds.length} event(s) permanently rejected:`, rejectedEvents);
  }

  await markMappings(data as SyncResult);

  // Return total processed (applied + rejected) to indicate progress
  return appliedIds.length + rejectedEvents.length;
}

let syncing = false;

export async function syncOutbox(): Promise<void> {
  if (syncing) return;
  syncing = true;
  try {
    while (await syncOutboxBatch()) {
      // continue until empty
    }
  } finally {
    syncing = false;
  }
}
