import NetInfo from "@react-native-community/netinfo";
import { ApiError } from "./api/apiClient";
import { createTransaction, type CreateTransactionInput } from "./api/transactionsApi";
import { syncOutbox } from "./offline/sync";
import { storeScopedStorage } from "./storeScope";

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
  } catch {
    return [];
  }
}

async function saveQueue(queue: PendingTx[]): Promise<void> {
  await storeScopedStorage.setItem(PENDING_TX_KEY, JSON.stringify(queue));
}

export async function enqueueTransaction(payload: CreateTransactionInput): Promise<void> {
  const queue = await loadQueue();
  queue.push({ id: `${Date.now()}-${Math.random().toString(16).slice(2)}`, createdAt: new Date().toISOString(), payload });
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

export function startAutoSync(): void {
  if (unsubscribe) return;
  unsubscribe = NetInfo.addEventListener((state) => {
    if (state.isConnected) {
      syncPendingTransactions().catch(() => undefined);
      syncOutbox().catch(() => undefined);
    }
  });
}

export function stopAutoSync(): void {
  unsubscribe?.();
  unsubscribe = null;
}

