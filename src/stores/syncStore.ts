// T-175: Sync state management store
// Tracks SSE connection status, outbox queue depth, and last sync timestamp

import { create } from "zustand";
import { syncOutbox } from "../services/offline/sync";
import { pendingOutboxCount } from "../services/offline/outbox";
import { isOnline } from "../services/networkStatus";

export type ConnectionStatus = "connected" | "connecting" | "disconnected";

export type StockDrift = {
  productId: string;
  productName: string;
  localStock: number;
  serverStock: number;
  delta: number;
};

type SyncState = {
  connectionStatus: ConnectionStatus;
  outboxCount: number;
  lastSyncAt: Date | null;
  lastSyncError: string | null; // FIX-033: Surface sync errors to UI
  deadletterCount: number;
  stockDrifts: StockDrift[];
  syncing: boolean;

  setConnectionStatus: (status: ConnectionStatus) => void;
  setOutboxCount: (count: number) => void;
  setLastSyncAt: (date: Date | null) => void;
  setDeadletterCount: (count: number) => void;
  setStockDrifts: (drifts: StockDrift[]) => void;
  setSyncing: (syncing: boolean) => void;
  refreshOutboxCount: () => Promise<void>;
  syncNow: () => Promise<void>;
};

export const useSyncStore = create<SyncState>((set, get) => ({
  connectionStatus: "disconnected",
  outboxCount: 0,
  lastSyncAt: null,
  lastSyncError: null,
  deadletterCount: 0,
  stockDrifts: [],
  syncing: false,

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
      await syncOutbox();
      const count = await pendingOutboxCount();
      set({
        outboxCount: count,
        lastSyncAt: new Date(),
        lastSyncError: null,
        syncing: false,
      });
      console.log("[SyncStore] Manual sync complete");
    } catch (error) {
      // FIX-033: Surface sync error to UI instead of swallowing
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("[SyncStore] Manual sync failed:", errorMsg);
      set({ syncing: false, lastSyncError: errorMsg });
    }
  },
}));
