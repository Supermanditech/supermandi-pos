// GL-WF-007: Offline Queue Service
// Queues operations when offline and syncs when back online

import AsyncStorage from "@react-native-async-storage/async-storage";
import { isOnline } from "./networkStatus";
import { apiClient } from "./api/apiClient";
import { asError } from "../utils/errorUtils";

import { SK_OFFLINE_QUEUE } from "../constants/storageKeys";
const OFFLINE_QUEUE_KEY = SK_OFFLINE_QUEUE;
const MAX_RETRIES = 3;
// LIVE.POS.OFFLINE_QUEUE_RETRY_POLICY_HARDENING.001: Max age for stale transactions (24 hours)
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
// LIVE.POS.OFFLINE_QUEUE_RETRY_POLICY_HARDENING.001: Base delay for exponential backoff (1 second)
const BACKOFF_BASE_MS = 1000;

export interface QueuedTransaction {
  id: string;
  type: "inventory_sale" | "inventory_return" | "inventory_purchase" | "inventory_adjustment";
  // LIVE.POS.OFFLINE_QUEUE_STORE_SCOPING.001: Store-scoped transactions
  storeId: string;
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

  // LIVE.POS.OFFLINE_QUEUE_STORE_SCOPING.001: Require storeId
  if (!transaction.storeId) {
    throw new Error("[OfflineQueue] storeId is required for offline transactions");
  }

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
 * STG-389: Get the creation timestamp of the oldest pending transaction.
 * Returns null if queue is empty.
 */
export function getOldestTransactionCreatedAt(): number | null {
  if (queueState.transactions.length === 0) return null;
  let oldest = Infinity;
  for (const tx of queueState.transactions) {
    if (tx.createdAt < oldest) oldest = tx.createdAt;
  }
  return oldest === Infinity ? null : oldest;
}

/**
 * STG-389: Get pending transactions (read-only) for expiry checking.
 */
export function getPendingTransactions(): ReadonlyArray<QueuedTransaction> {
  return queueState.transactions;
}

/**
 * Sync all pending transactions when back online
 */
// LIVE.POS.OFFLINE_QUEUE_STORE_SCOPING.001: Accept currentStoreId to only sync matching transactions
export async function syncOfflineQueue(currentStoreId?: string): Promise<{ synced: number; failed: number }> {
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
  const now = Date.now();

  console.log(`[OfflineQueue] Starting sync of ${queueState.transactions.length} transactions`);

  for (const tx of queueState.transactions) {
    // LIVE.POS.OFFLINE_QUEUE_STORE_SCOPING.001: Skip transactions from different stores
    if (currentStoreId && tx.storeId && tx.storeId !== currentStoreId) {
      remainingTransactions.push(tx);
      continue;
    }

    // LIVE.POS.OFFLINE_QUEUE_RETRY_POLICY_HARDENING.001: Discard stale transactions
    if (now - tx.createdAt > MAX_AGE_MS) {
      console.error(`[OfflineQueue] Transaction ${tx.id} expired (age: ${Math.round((now - tx.createdAt) / 3600000)}h), discarding`);
      failed++;
      continue;
    }

    // LIVE.POS.OFFLINE_QUEUE_RETRY_POLICY_HARDENING.001: Exponential backoff with jitter
    if (tx.retryCount > 0) {
      const backoff = BACKOFF_BASE_MS * Math.pow(2, tx.retryCount - 1);
      const jitter = Math.random() * backoff * 0.3;
      await new Promise(resolve => setTimeout(resolve, backoff + jitter));
    }

    try {
      await apiClient.post(`/api/v1/pos/inventory/transactions`, tx.payload);
      synced++;
      console.log(`[OfflineQueue] Synced transaction ${tx.id}`);
    } catch (_error: unknown) {
      const error = asError(_error);
      console.error(`[OfflineQueue] Failed to sync ${tx.id}:`, error.message);

      tx.retryCount++;
      if (tx.retryCount < MAX_RETRIES) {
        remainingTransactions.push(tx);
      } else {
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
