// GL-WF-007: Offline Queue Service
// Queues operations when offline and syncs when back online

import AsyncStorage from "@react-native-async-storage/async-storage";
import { isOnline } from "./networkStatus";
import { apiClient } from "./api/apiClient";

const OFFLINE_QUEUE_KEY = "supermandi.offline.queue.v1";
const MAX_RETRIES = 3;

export interface QueuedTransaction {
  id: string;
  type: "inventory_sale" | "inventory_return" | "inventory_purchase" | "inventory_adjustment";
  payload: {
    items: Array<{ productId: string; quantity: number; unitCost?: number }>;
    transactionType: string;
    referenceType: string;
    referenceId: string;
    notes?: string;
  };
  createdAt: number;
  retryCount: number;
}

interface OfflineQueueState {
  transactions: QueuedTransaction[];
  syncing: boolean;
}

let queueState: OfflineQueueState = {
  transactions: [],
  syncing: false,
};

let hydrated = false;

/**
 * Hydrate the queue from persistent storage
 */
export async function hydrateOfflineQueue(): Promise<void> {
  if (hydrated) return;

  try {
    const raw = await AsyncStorage.getItem(OFFLINE_QUEUE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as QueuedTransaction[];
      queueState.transactions = Array.isArray(parsed) ? parsed : [];
    }
  } catch (error) {
    console.error("[OfflineQueue] Failed to hydrate:", error);
    queueState.transactions = [];
  }

  hydrated = true;
}

/**
 * Persist the queue to storage
 */
async function persistQueue(): Promise<void> {
  try {
    await AsyncStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queueState.transactions));
  } catch (error) {
    console.error("[OfflineQueue] Failed to persist:", error);
  }
}

/**
 * Queue a transaction for later sync
 */
export async function queueOfflineTransaction(transaction: Omit<QueuedTransaction, "id" | "createdAt" | "retryCount">): Promise<string> {
  await hydrateOfflineQueue();

  const id = `offline_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const queued: QueuedTransaction = {
    ...transaction,
    id,
    createdAt: Date.now(),
    retryCount: 0,
  };

  queueState.transactions.push(queued);
  await persistQueue();

  console.log(`[OfflineQueue] Queued transaction ${id} for later sync`);
  return id;
}

/**
 * Get pending transaction count
 */
export function getPendingTransactionCount(): number {
  return queueState.transactions.length;
}

/**
 * Sync all pending transactions when back online
 */
export async function syncOfflineQueue(): Promise<{ synced: number; failed: number }> {
  await hydrateOfflineQueue();

  if (queueState.syncing) {
    console.log("[OfflineQueue] Sync already in progress");
    return { synced: 0, failed: 0 };
  }

  if (!(await isOnline())) {
    console.log("[OfflineQueue] Still offline, skipping sync");
    return { synced: 0, failed: 0 };
  }

  if (queueState.transactions.length === 0) {
    return { synced: 0, failed: 0 };
  }

  queueState.syncing = true;
  let synced = 0;
  let failed = 0;
  const remainingTransactions: QueuedTransaction[] = [];

  console.log(`[OfflineQueue] Starting sync of ${queueState.transactions.length} transactions`);

  for (const tx of queueState.transactions) {
    try {
      await apiClient.post(`/api/v1/pos/inventory/transactions`, tx.payload);
      synced++;
      console.log(`[OfflineQueue] Synced transaction ${tx.id}`);
    } catch (error: any) {
      console.error(`[OfflineQueue] Failed to sync ${tx.id}:`, error.message);

      tx.retryCount++;
      if (tx.retryCount < MAX_RETRIES) {
        remainingTransactions.push(tx);
      } else {
        // Max retries exceeded - log and discard
        console.error(`[OfflineQueue] Transaction ${tx.id} exceeded max retries, discarding`);
        failed++;
      }
    }
  }

  queueState.transactions = remainingTransactions;
  await persistQueue();
  queueState.syncing = false;

  console.log(`[OfflineQueue] Sync complete: ${synced} synced, ${failed} failed`);
  return { synced, failed };
}

/**
 * Clear all queued transactions (use with caution)
 */
export async function clearOfflineQueue(): Promise<void> {
  queueState.transactions = [];
  await persistQueue();
}
