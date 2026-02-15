// T-191: Daily Closing / Z-Report Zustand store
import { create } from "zustand";
import * as dailyClosingService from "../services/dailyClosingService";
import type {
  DailyClosingSummary,
  DailyClosingRecord,
  CloseDayRequest,
} from "../services/dailyClosingService";

interface DailyClosingState {
  summary: DailyClosingSummary | null;
  history: DailyClosingRecord[];
  loading: boolean;
  historyLoading: boolean;
  closing: boolean;
  error: string | null;

  fetchSummary: (date?: string) => Promise<void>;
  fetchHistory: () => Promise<void>;
  closeDay: (data: CloseDayRequest) => Promise<boolean>;
  clearError: () => void;
}

export const useDailyClosingStore = create<DailyClosingState>()((set, get) => ({
  summary: null,
  history: [],
  loading: false,
  historyLoading: false,
  closing: false,
  error: null,

  fetchSummary: async (date?: string) => {
    set({ loading: true, error: null });
    try {
      const summary = await dailyClosingService.getDailyClosingSummary(date);
      set({ summary, loading: false });
    } catch (e: any) {
      console.error("[DailyClosingStore] fetchSummary failed:", e);
      set({ loading: false, error: e?.message || "Failed to load summary" });
    }
  },

  fetchHistory: async () => {
    set({ historyLoading: true, error: null });
    try {
      const records = await dailyClosingService.getDailyClosingHistory();
      set({ history: records, historyLoading: false });
    } catch (e: any) {
      console.error("[DailyClosingStore] fetchHistory failed:", e);
      set({ historyLoading: false, error: e?.message || "Failed to load history" });
    }
  },

  closeDay: async (data: CloseDayRequest) => {
    set({ closing: true, error: null });
    try {
      const record = await dailyClosingService.closeDay(data);
      set({
        closing: false,
        history: [record, ...get().history],
      });
      return true;
    } catch (e: any) {
      console.error("[DailyClosingStore] closeDay failed:", e);
      set({ closing: false, error: e?.message || "Failed to close day" });
      return false;
    }
  },

  clearError: () => set({ error: null }),
}));
