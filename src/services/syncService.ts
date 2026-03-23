import NetInfo from "@react-native-community/netinfo";
import { syncOutbox } from "./offline/sync";
import { refreshStockSnapshot } from "./stockService";
import { isOnline } from "./networkStatus";
// GCP-STG-0091: Wire product freshness check into active sync loop
import { useProductsStore } from "../stores/productsStore";

let unsubscribe: null | (() => void) = null;

// GO-LIVE-167: Track retry state for exponential backoff
let outboxRetryCount = 0;
const MAX_RETRY_COUNT = 5;
const BASE_RETRY_DELAY_MS = 1000;

// STG-387: Reduced stock sync interval from 5 minutes to 30 seconds
const STOCK_SYNC_INTERVAL_MS = 30 * 1000;
let stockSyncInterval: ReturnType<typeof setInterval> | null = null;

// GCP-STG-0371: Per-request timeout for sync API calls via AbortController
const SYNC_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * GCP-STG-0371: Wrap a promise with a timeout.
 * Rejects with an AbortError-style message if the promise doesn't resolve in `ms`.
 * Does NOT crash the app — callers catch AbortError gracefully.
 */
export function withSyncTimeout<T>(promise: Promise<T>, ms: number = SYNC_TIMEOUT_MS, label = "sync"): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        const err = new Error(`[GCP-STG-0371] ${label} timed out after ${ms}ms`);
        err.name = "AbortError";
        reject(err);
      }
    }, ms);

    promise.then(
      (value) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          resolve(value);
        }
      },
      (reason) => {
        if (!settled) {
          settled = true;
          clearTimeout(timer);
          reject(reason);
        }
      },
    );
  });
}

// STG-390: Track reconnection for price cache refresh
type ReconnectCallback = () => void;
let reconnectCallbacks: ReconnectCallback[] = [];
let wasOffline = false;

function getRetryDelay(retryCount: number): number {
  // Exponential backoff: 1s, 2s, 4s, 8s, 16s (capped)
  return Math.min(BASE_RETRY_DELAY_MS * Math.pow(2, retryCount), 16000);
}

async function syncOutboxWithRetry(): Promise<void> {
  try {
    // GCP-STG-0371: Timeout outbox sync to prevent indefinite hang
    await withSyncTimeout(syncOutbox(), SYNC_TIMEOUT_MS, "syncOutbox");
    outboxRetryCount = 0; // Reset on success
  } catch (error) {
    outboxRetryCount++;
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[GO-LIVE-167] syncOutbox failed (attempt ${outboxRetryCount}):`, errorMessage);

    if (outboxRetryCount < MAX_RETRY_COUNT) {
      const delay = getRetryDelay(outboxRetryCount);
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

/**
 * STG-387: Start periodic stock sync (30s interval).
 * Replaces the old 5-minute polling with more frequent checks.
 */
function startStockSync(): void {
  if (stockSyncInterval) return;
  stockSyncInterval = setInterval(async () => {
    try {
      if (await isOnline()) {
        // GCP-STG-0371: Timeout each sync call to prevent indefinite hang
        await withSyncTimeout(refreshStockSnapshot(), SYNC_TIMEOUT_MS, "refreshStockSnapshot");
        // GCP-STG-0091: Check product catalog freshness every sync tick
        // Detects retailer web / CSV / supplier edits and reloads if stale
        await withSyncTimeout(
          useProductsStore.getState().checkAndRefresh(),
          SYNC_TIMEOUT_MS,
          "checkAndRefresh",
        );
      }
    } catch (error) {
      // GCP-STG-0371: Gracefully handle AbortError (timeout) — log warning, don't crash
      const isTimeout = error instanceof Error && error.name === "AbortError";
      if (isTimeout) {
        console.warn("[SyncService] GCP-STG-0371: Sync tick timed out:", error.message);
      } else {
        console.warn("[SyncService] STG-387: Stock sync failed:", error);
      }
    }
  }, STOCK_SYNC_INTERVAL_MS);
  console.log("[SyncService] GCP-STG-0091: Stock + catalog sync started (30s interval)");
}

function stopStockSync(): void {
  if (stockSyncInterval) {
    clearInterval(stockSyncInterval);
    stockSyncInterval = null;
    console.log("[SyncService] STG-387: Stock sync stopped");
  }
}

/**
 * STG-387: Manual "Sync Now" — triggers immediate stock + outbox sync.
 */
export async function syncNow(): Promise<void> {
  if (!(await isOnline())) {
    console.log("[SyncService] Cannot sync — offline");
    return;
  }
  // GCP-STG-0371: Timeout each sync call to prevent indefinite hang on manual sync
  await Promise.all([
    withSyncTimeout(refreshStockSnapshot(), SYNC_TIMEOUT_MS, "syncNow:refreshStock"),
    withSyncTimeout(syncOutboxWithRetry(), SYNC_TIMEOUT_MS, "syncNow:outbox"),
    // GCP-STG-0091: Also check catalog freshness on manual sync
    withSyncTimeout(
      useProductsStore.getState().checkAndRefresh(),
      SYNC_TIMEOUT_MS,
      "syncNow:checkAndRefresh",
    ),
  ]);
}

/**
 * STG-390: Register a callback to run when device reconnects.
 * Used for price cache refresh on reconnect.
 */
export function onReconnect(callback: ReconnectCallback): () => void {
  reconnectCallbacks.push(callback);
  return () => {
    reconnectCallbacks = reconnectCallbacks.filter((cb) => cb !== callback);
  };
}

export function startAutoSync(): void {
  if (unsubscribe) return;

  // Check initial state
  isOnline().then((online) => {
    wasOffline = !online;
  });

  unsubscribe = NetInfo.addEventListener((state) => {
    const connected = Boolean(state.isConnected);

    if (connected) {
      // GO-LIVE-167: Use retry wrapper instead of silent error swallowing
      syncOutboxWithRetry();

      // STG-390: Fire reconnect callbacks when transitioning from offline to online
      if (wasOffline) {
        console.log("[SyncService] STG-390: Device reconnected, firing reconnect callbacks");
        for (const cb of reconnectCallbacks) {
          try {
            cb();
          } catch (error) {
            console.warn("[SyncService] Reconnect callback error:", error);
          }
        }
      }

      // STG-387: Start stock sync when connected
      startStockSync();
    } else {
      // STG-387: Stop stock sync when disconnected
      stopStockSync();
    }

    wasOffline = !connected;
  });
}

export function stopAutoSync(): void {
  unsubscribe?.();
  unsubscribe = null;
  stopStockSync();
}
