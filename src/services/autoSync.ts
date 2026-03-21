// T-179: Background auto-sync with configurable interval
// Periodically syncs the outbox queue, pulls product updates, and refreshes stock.
// Skips ticks when offline. Interval is configurable via AsyncStorage.

import AsyncStorage from "@react-native-async-storage/async-storage";
import { isOnline } from "./networkStatus";
import { syncOutbox } from "./offline/sync";
import { pendingOutboxCount } from "./offline/outbox";
import { refreshStockSnapshot } from "./stockService";
import { useProductsStore } from "../stores/productsStore";
import { useSyncStore } from "../stores/syncStore";
import { refreshDeadletterCount } from "./deadletterService";
import { checkAndExecuteForceSync } from "./forceSyncCheck";

const SYNC_INTERVAL_KEY = "supermandi.autoSync.intervalMs";
// GCP-STG-0091: Reduced from 60s to 30s for near-real-time product metadata sync
// POS ↔ retailer web edits must reflect within seconds, not minutes
const DEFAULT_SYNC_INTERVAL_MS = 30000; // 30 seconds

let syncInterval: ReturnType<typeof setInterval> | null = null;
let syncInFlight = false;
let currentIntervalMs = DEFAULT_SYNC_INTERVAL_MS;

/**
 * Load the configured sync interval from AsyncStorage.
 * Returns the default if no custom interval is set.
 */
async function loadSyncInterval(): Promise<number> {
  try {
    const raw = await AsyncStorage.getItem(SYNC_INTERVAL_KEY);
    if (raw) {
      const parsed = parseInt(raw, 10);
      if (Number.isFinite(parsed) && parsed >= 10000) {
        return parsed;
      }
    }
  } catch (error) {
    console.warn("[AutoSync] Failed to load interval:", error);
  }
  return DEFAULT_SYNC_INTERVAL_MS;
}

/**
 * Save a custom sync interval to AsyncStorage.
 * Minimum allowed interval is 10 seconds.
 */
export async function setSyncInterval(intervalMs: number): Promise<void> {
  const safeInterval = Math.max(10000, Math.round(intervalMs));
  try {
    await AsyncStorage.setItem(SYNC_INTERVAL_KEY, String(safeInterval));
    currentIntervalMs = safeInterval;

    // Restart with new interval if already running
    if (syncInterval) {
      stopAutoSync();
      startAutoSync(safeInterval);
    }

    console.log(`[AutoSync] Interval updated to ${safeInterval}ms`);
  } catch (error) {
    console.error("[AutoSync] Failed to save interval:", error);
  }
}

/**
 * Get the current sync interval in milliseconds.
 */
export function getSyncInterval(): number {
  return currentIntervalMs;
}

/**
 * Perform a single sync tick:
 * 1. Sync outbox queue (push local changes to server)
 * 2. Pull product updates (check freshness)
 * 3. Refresh stock snapshot
 * 4. Update sync store state
 */
async function syncTick(): Promise<void> {
  if (syncInFlight) {
    console.log("[AutoSync] Previous tick still running — skipping");
    return;
  }

  const online = await isOnline();
  if (!online) {
    useSyncStore.getState().setConnectionStatus("disconnected");
    return;
  }

  syncInFlight = true;
  useSyncStore.getState().setSyncing(true);

  try {
    // Step 1: Sync outbox — push local events to server
    try {
      await syncOutbox();
    } catch (error) {
      console.warn("[AutoSync] Outbox sync failed:", error);
    }

    // Step 2: Pull product updates (check if catalog is stale)
    try {
      await useProductsStore.getState().checkAndRefresh();
    } catch (error) {
      console.warn("[AutoSync] Product refresh failed:", error);
    }

    // Step 3: Refresh stock snapshot
    try {
      await refreshStockSnapshot();
    } catch (error) {
      console.warn("[AutoSync] Stock refresh failed:", error);
    }

    // Step 4: Update state
    const outboxCount = await pendingOutboxCount();
    const store = useSyncStore.getState();
    store.setOutboxCount(outboxCount);
    store.setLastSyncAt(new Date());
    store.setSyncing(false);

    // Step 5: Refresh deadletter count
    await refreshDeadletterCount();

    // Step 6: SA-P2-005 — Check for pending force-sync commands from SuperAdmin
    try {
      await checkAndExecuteForceSync();
    } catch (error) {
      console.warn("[AutoSync] Force sync check failed:", error);
    }

  } catch (error) {
    console.error("[AutoSync] Tick failed:", error);
    useSyncStore.getState().setSyncing(false);
  } finally {
    syncInFlight = false;
  }
}

/**
 * Start the auto-sync background timer.
 * Safe to call multiple times — subsequent calls are no-ops.
 *
 * @param intervalMs Optional override for the sync interval. If not provided,
 *                   uses the stored interval from AsyncStorage.
 */
export async function startAutoSync(intervalMs?: number): Promise<void> {
  if (syncInterval) return;

  if (intervalMs !== undefined) {
    currentIntervalMs = Math.max(10000, intervalMs);
  } else {
    currentIntervalMs = await loadSyncInterval();
  }

  console.log(`[AutoSync] Starting auto-sync (interval: ${currentIntervalMs}ms)`);

  // Run first tick after a short delay (let other services initialize)
  setTimeout(() => {
    void syncTick();
  }, 5000);

  syncInterval = setInterval(() => {
    void syncTick();
  }, currentIntervalMs);
}

/**
 * Stop the auto-sync background timer.
 */
export function stopAutoSync(): void {
  if (syncInterval) {
    clearInterval(syncInterval);
    syncInterval = null;
    console.log("[AutoSync] Stopped");
  }
}

/**
 * Check if auto-sync is currently running.
 */
export function isAutoSyncRunning(): boolean {
  return syncInterval !== null;
}

/**
 * Force an immediate sync tick (manual trigger).
 */
export async function forceSyncNow(): Promise<void> {
  await syncTick();
}
