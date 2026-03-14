// T-175: Sync state management store
// Tracks SSE connection status, outbox queue depth, and last sync timestamp
// STG-387: Added manual syncNow with stock refresh
// STG-388: Added stock conflict tracking for user resolution
// STG-389: Added queue expiry warning state
// STG-391: Added offline checkout confirmation state

import { create } from "zustand";
import { syncOutbox } from "../services/offline/sync";
import { pendingOutboxCount } from "../services/offline/outbox";
import { isOnline } from "../services/networkStatus";
import { syncNow as syncServiceNow } from "../services/syncService";

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

export type StockDrift = {
  productId: string;
  productName: string;
  localStock: number;
  serverStock: number;
  delta: number;
};

// STG-388: Stock conflict for user resolution
export type StockConflict = {
  productId: string;
  productName: string;
  localQty: number;
  serverQty: number;
};

// STG-389: Queue expiry warning info
export type QueueExpiryWarning = {
  totalPending: number;
  oldestAgeHours: number;
  showWarning: boolean;
};

type SyncState = {
  connectionStatus: ConnectionStatus;
  outboxCount: number;
  lastSyncAt: Date | null;
  lastSyncError: string | null; // FIX-033: Surface sync errors to UI
  deadletterCount: number;
  stockDrifts: StockDrift[];
  syncing: boolean;

  // STG-388: Stock conflict awaiting user resolution
  pendingStockConflict: StockConflict | null;
  // STG-389: Queue expiry warning
  queueExpiryWarning: QueueExpiryWarning;
  // STG-391: Offline checkout confirmation
  offlineCheckoutPending: boolean;

  setConnectionStatus: (status: ConnectionStatus) => void;
  setOutboxCount: (count: number) => void;
  setLastSyncAt: (date: Date | null) => void;
  setDeadletterCount: (count: number) => void;
  setStockDrifts: (drifts: StockDrift[]) => void;
  setSyncing: (syncing: boolean) => void;
  refreshOutboxCount: () => Promise<void>;
  syncNow: () => Promise<void>;
  // STG-388
  setPendingStockConflict: (conflict: StockConflict | null) => void;
  resolveStockConflict: (useLocal: boolean) => void;
  // STG-389
  updateQueueExpiryWarning: (totalPending: number, oldestCreatedAt: number | null) => void;
  // STG-391
  setOfflineCheckoutPending: (pending: boolean) => void;
};

// STG-389: Warning threshold — 20 hours
const QUEUE_EXPIRY_WARNING_HOURS = 20;

export const useSyncStore = create<SyncState>((set, get) => ({
  connectionStatus: "disconnected",
  outboxCount: 0,
  lastSyncAt: null,
  lastSyncError: null,
  deadletterCount: 0,
  stockDrifts: [],
  syncing: false,
  pendingStockConflict: null,
  queueExpiryWarning: { totalPending: 0, oldestAgeHours: 0, showWarning: false },
  offlineCheckoutPending: false,

  setConnectionStatus: (status) => set({ connectionStatus: status }),
  setOutboxCount: (count) => set({ outboxCount: count }),
  setLastSyncAt: (date) => set({ lastSyncAt: date }),
  setDeadletterCount: (count) => set({ deadletterCount: count }),
  setStockDrifts: (drifts) => set({ stockDrifts: drifts }),
  setSyncing: (syncing) => set({ syncing }),

  refreshOutboxCount: async () => {
    try {
      const count = await pendingOutboxCount();
      set({ outboxCount: count });
    } catch (error) {
      console.warn("[SyncStore] Failed to refresh outbox count:", error);
    }
  },

  // STG-387: Enhanced syncNow that also refreshes stock
  syncNow: async () => {
    const { syncing } = get();
    if (syncing) return;

    const online = await isOnline();
    if (!online) {
      console.log("[SyncStore] Cannot sync — offline");
      return;
    }

    set({ syncing: true, lastSyncError: null });
    try {
      await syncServiceNow();
      const count = await pendingOutboxCount();
      set({
        outboxCount: count,
        lastSyncAt: new Date(),
        lastSyncError: null,
        syncing: false,
      });
      console.log("[SyncStore] Manual sync complete (stock + outbox)");
    } catch (error) {
      // FIX-033: Surface sync error to UI instead of swallowing
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[SyncStore] Manual sync failed:", errorMsg);
      set({ syncing: false, lastSyncError: errorMsg });
    }
  },

  // STG-388: Set pending stock conflict for user resolution
  setPendingStockConflict: (conflict) => set({ pendingStockConflict: conflict }),

  // STG-388: Resolve stock conflict — useLocal=true keeps local, false uses server
  resolveStockConflict: (useLocal) => {
    const { pendingStockConflict } = get();
    if (!pendingStockConflict) return;

    if (useLocal) {
      console.log(
        `[SyncStore] STG-388: User chose local stock (${pendingStockConflict.localQty}) for ${pendingStockConflict.productName}`
      );
      // Local stock is already in cache, nothing to do
    } else {
      console.log(
        `[SyncStore] STG-388: User chose server stock (${pendingStockConflict.serverQty}) for ${pendingStockConflict.productName}`
      );
      // Server stock will be applied by the caller (stockService)
    }

    set({ pendingStockConflict: null });
  },

  // STG-389: Update queue expiry warning based on pending items
  updateQueueExpiryWarning: (totalPending, oldestCreatedAt) => {
    if (totalPending === 0 || oldestCreatedAt === null) {
      set({ queueExpiryWarning: { totalPending: 0, oldestAgeHours: 0, showWarning: false } });
      return;
    }

    const ageMs = Date.now() - oldestCreatedAt;
    const ageHours = ageMs / (1000 * 60 * 60);
    const showWarning = ageHours >= QUEUE_EXPIRY_WARNING_HOURS;

    set({
      queueExpiryWarning: {
        totalPending,
        oldestAgeHours: Math.round(ageHours * 10) / 10,
        showWarning,
      },
    });
  },

  // STG-391: Set offline checkout pending state
  setOfflineCheckoutPending: (pending) => set({ offlineCheckoutPending: pending }),
}));
