// T-178: Periodic stock reconciliation POS <-> server
// Fetches all stock balances from the server, compares with local cache,
// logs stock_drift events for discrepancies > 5 units, and auto-updates
// local cache to match server (server is always the source of truth).

import { isOnline } from "./networkStatus";
import { getDeviceStoreId } from "./deviceSession";
import { getStockStatement, type StockStatementItem } from "./api/inventoryApi";
import { getCachedStock, updateStockCacheEntries } from "./stockCache";
import { eventLogger } from "./eventLogger";
import { useSyncStore, type StockDrift } from "../stores/syncStore";

const RECONCILIATION_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
const DRIFT_THRESHOLD = 5; // Log drift if discrepancy > 5 units

let reconciliationInterval: ReturnType<typeof setInterval> | null = null;
let reconciliationInFlight = false;

/**
 * Perform a single stock reconciliation cycle.
 * 1. Fetch stock_balances from server
 * 2. Compare with local cache
 * 3. Log stock_drift for discrepancies > threshold
 * 4. Auto-update local cache to match server
 * 5. Update sync store with drift summary
 */
export async function reconcileStock(): Promise<{
  checked: number;
  drifts: StockDrift[];
  updated: number;
}> {
  if (reconciliationInFlight) {
    console.log("[StockReconciliation] Already in progress, skipping");
    return { checked: 0, drifts: [], updated: 0 };
  }

  reconciliationInFlight = true;

  try {
    const online = await isOnline();
    if (!online) {
      console.log("[StockReconciliation] Offline — skipping reconciliation");
      return { checked: 0, drifts: [], updated: 0 };
    }

    const storeId = await getDeviceStoreId();
    if (!storeId) {
      console.log("[StockReconciliation] No store ID — skipping");
      return { checked: 0, drifts: [], updated: 0 };
    }

    // Fetch server stock balances (up to 500 items)
    const statement = await getStockStatement(500, true);
    if (!statement.success || !statement.data || statement.data.length === 0) {
      console.log("[StockReconciliation] No server stock data");
      return { checked: 0, drifts: [], updated: 0 };
    }

    const drifts: StockDrift[] = [];
    const cacheUpdates: Array<{ key: string; stock: number }> = [];

    for (const item of statement.data) {
      const serverStock = item.currentStock;
      const localStock = getCachedStock(item.productId);

      // Always update local cache to match server
      cacheUpdates.push({ key: item.productId, stock: serverStock });

      // If barcode is available, update that too
      if (item.barcode) {
        cacheUpdates.push({ key: item.barcode, stock: serverStock });
      }

      // Only track drift if we had a local cached value
      if (localStock !== null) {
        const delta = Math.abs(serverStock - localStock);
        if (delta > DRIFT_THRESHOLD) {
          drifts.push({
            productId: item.productId,
            productName: item.displayName || item.productId,
            localStock,
            serverStock,
            delta,
          });
        }
      }
    }

    // Update local cache in bulk (server is truth)
    if (cacheUpdates.length > 0) {
      updateStockCacheEntries(cacheUpdates);
    }

    // Log drift events
    if (drifts.length > 0) {
      console.warn(
        `[StockReconciliation] ${drifts.length} stock drift(s) detected (threshold > ${DRIFT_THRESHOLD} units)`
      );
      for (const drift of drifts) {
        await eventLogger.log("stock_drift", {
          productId: drift.productId,
          productName: drift.productName,
          localStock: drift.localStock,
          serverStock: drift.serverStock,
          delta: drift.delta,
          storeId,
          reconciledAt: new Date().toISOString(),
        });
      }
    }

    // Update sync store with drift summary
    useSyncStore.getState().setStockDrifts(drifts);

    console.log(
      `[StockReconciliation] Complete: ${statement.data.length} checked, ${drifts.length} drifts, ${cacheUpdates.length} updated`
    );

    return {
      checked: statement.data.length,
      drifts,
      updated: cacheUpdates.length,
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    console.error("[StockReconciliation] Failed:", errorMsg);
    return { checked: 0, drifts: [], updated: 0 };
  } finally {
    reconciliationInFlight = false;
  }
}

/**
 * Start periodic stock reconciliation (every 15 minutes).
 * Safe to call multiple times — subsequent calls are no-ops.
 */
export function startStockReconciliation(): void {
  if (reconciliationInterval) return;

  console.log("[StockReconciliation] Starting periodic reconciliation (every 15 min)");

  // Run first reconciliation after a short delay (let app finish initializing)
  setTimeout(() => {
    void reconcileStock();
  }, 10000); // 10 second initial delay

  reconciliationInterval = setInterval(() => {
    void reconcileStock();
  }, RECONCILIATION_INTERVAL_MS);
}

/**
 * Stop periodic stock reconciliation.
 */
export function stopStockReconciliation(): void {
  if (reconciliationInterval) {
    clearInterval(reconciliationInterval);
    reconciliationInterval = null;
    console.log("[StockReconciliation] Stopped");
  }
}

/**
 * Check if reconciliation is currently running.
 */
export function isReconciliationRunning(): boolean {
  return reconciliationInterval !== null;
}
