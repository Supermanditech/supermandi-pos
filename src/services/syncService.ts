import NetInfo from "@react-native-community/netinfo";
import { ApiError } from "./api/apiClient";
import { createTransaction, type CreateTransactionInput } from "./api/transactionsApi";
import { syncOutbox } from "./offline/sync";
import { storeScopedStorage } from "./storeScope";
import { uuidv4 } from "../utils/uuid";

const PENDING_TX_KEY = "supermandi.pendingTransactions";

type PendingTx = {
  id: string;
  createdAt: string;
  payload: CreateTransactionInput;
};

async function loadQueue(): Promise<PendingTx[]> {
  const raw = await storeScopedStorage.getItem(PENDING_TX_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as PendingTx[];
  } catch (parseError) {
    // GO-LIVE-168: Log JSON parse errors instead of silently discarding pending transactions
    const errorMsg = parseError instanceof Error ? parseError.message : String(parseError);
    console.error(`[GO-LIVE-168] syncService loadQueue JSON parse error: ${errorMsg}`);
    console.error(`[GO-LIVE-168] Raw data (first 200 chars): ${raw?.slice(0, 200)}`);
    return [];
  }
}

async function saveQueue(queue: PendingTx[]): Promise<void> {
  await storeScopedStorage.setItem(PENDING_TX_KEY, JSON.stringify(queue));
}

export async function enqueueTransaction(payload: CreateTransactionInput): Promise<void> {
  const queue = await loadQueue();
  // ISSUE-MICRO-100: Use cryptographically secure UUID instead of Date.now+Math.random
  queue.push({ id: uuidv4(), createdAt: new Date().toISOString(), payload });
  await saveQueue(queue);
}

export async function syncPendingTransactions(): Promise<{ synced: number; remaining: number }>{
  const queue = await loadQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const nextQueue: PendingTx[] = [];
  let synced = 0;

  for (const item of queue) {
    try {
      await createTransaction(item.payload);
      synced += 1;
    } catch (e) {
      // Keep only transactions that failed due to connectivity / server issues.
      // For validation errors (4xx), drop to avoid infinite retry.
      if (e instanceof ApiError && e.status >= 400 && e.status < 500) {
        continue;
      }
      nextQueue.push(item);
    }
  }

  await saveQueue(nextQueue);
  return { synced, remaining: nextQueue.length };
}

let unsubscribe: null | (() => void) = null;

// GO-LIVE-167: Track retry state for exponential backoff
let pendingTxRetryCount = 0;
let outboxRetryCount = 0;
const MAX_RETRY_COUNT = 5;
const BASE_RETRY_DELAY_MS = 1000;

function getRetryDelay(retryCount: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped)
  return Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCount), 16000);
}

async function syncPendingWithRetry(): Promise<void> {
  try {
    const result = await syncPendingTransactions();
    pendingTxRetryCount = 0; // Reset on success
    if (result.synced > 0 || result.remaining > 0) {
      console.log(`[Sync] Pending transactions: synced=${result.synced}, remaining=${result.remaining}`);
    }
  } catch (error) {
    pendingTxRetryCount++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GO-LIVE-167] syncPendingTransactions failed (attempt ${pendingTxRetryCount}):`, errorMessage);

    if (pendingTxRetryCount < MAX_RETRY_COUNT) {
      const delay = getRetryDelay(pendingTxRetryCount);
      console.log(`[Sync] Retrying pending transactions in ${delay}ms...`);
      setTimeout(() => {
        syncPendingWithRetry().catch(() => {
          console.error('[GO-LIVE-167] Retry of syncPendingTransactions also failed');
        });
      }, delay);
    } else {
      console.error(`[GO-LIVE-167] syncPendingTransactions failed after ${MAX_RETRY_COUNT} attempts, giving up until next connectivity change`);
      pendingTxRetryCount = 0; // Reset for next connectivity event
    }
  }
}

async function syncOutboxWithRetry(): Promise<void> {
  try {
    await syncOutbox();
    outboxRetryCount = 0; // Reset on success
  } catch (error) {
    outboxRetryCount++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GO-LIVE-167] syncOutbox failed (attempt ${outboxRetryCount}):`, errorMessage);

    if (outboxRetryCount < MAX_RETRY_COUNT) {
      const delay = getRetryDelay(outboxRetryCount);
      console.log(`[Sync] Retrying outbox sync in ${delay}ms...`);
      setTimeout(() => {
        syncOutboxWithRetry().catch(() => {
          console.error('[GO-LIVE-167] Retry of syncOutbox also failed');
        });
      }, delay);
    } else {
      console.error(`[GO-LIVE-167] syncOutbox failed after ${MAX_RETRY_COUNT} attempts, giving up until next connectivity change`);
      outboxRetryCount = 0; // Reset for next connectivity event
    }
  }
}

export function startAutoSync(): void {
  if (unsubscribe) return;
  unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      // GO-LIVE-167: Use retry wrappers instead of silent error swallowing
      syncPendingWithRetry();
      syncOutboxWithRetry();
    }
  });
}

export function stopAutoSync(): void {
  unsubscribe?.();
  unsubscribe = null;
}

