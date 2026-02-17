// T-192: Shift Management Zustand store
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as shiftService from "../services/shiftService";
import type {
  Shift,
  StartShiftRequest,
  EndShiftRequest,
} from "../services/shiftService";
import { asError } from "../utils/errorUtils";

interface ShiftState {
  currentShift: Shift | null;
  history: Shift[];
  loading: boolean;
  historyLoading: boolean;
  starting: boolean;
  ending: boolean;
  error: string | null;

  fetchCurrentShift: () => Promise<void>;
  fetchHistory: () => Promise<void>;
  startShift: (data: StartShiftRequest) => Promise<boolean>;
  endShift: (data: EndShiftRequest) => Promise<boolean>;
  clearError: () => void;
}

export const useShiftStore = create<ShiftState>()(
  persist(
    (set, get) => ({
      currentShift: null,
      history: [],
      loading: false,
      historyLoading: false,
      starting: false,
      ending: false,
      error: null,

      fetchCurrentShift: async () => {
        set({ loading: true, error: null });
        try {
          const shift = await shiftService.getCurrentShift();
          set({ currentShift: shift, loading: false });
        } catch (_e: unknown) {
    const e = asError(_e);
          console.error("[ShiftStore] fetchCurrentShift failed:", e);
          set({ loading: false, error: e?.message || "Failed to load current shift" });
        }
      },

      fetchHistory: async () => {
        set({ historyLoading: true, error: null });
        try {
          const shifts = await shiftService.getShiftHistory();
          set({ history: shifts, historyLoading: false });
        } catch (_e: unknown) {
    const e = asError(_e);
          console.error("[ShiftStore] fetchHistory failed:", e);
          set({ historyLoading: false, error: e?.message || "Failed to load shift history" });
        }
      },

      startShift: async (data: StartShiftRequest) => {
        set({ starting: true, error: null });
        try {
          const shift = await shiftService.startShift(data);
          set({ currentShift: shift, starting: false });
          return true;
        } catch (_e: unknown) {
    const e = asError(_e);
          console.error("[ShiftStore] startShift failed:", e);
          set({ starting: false, error: e?.message || "Failed to start shift" });
          return false;
        }
      },

      endShift: async (data: EndShiftRequest) => {
        const current = get().currentShift;
        if (!current) {
          set({ error: "No active shift to end" });
          return false;
        }
        set({ ending: true, error: null });
        try {
          const shift = await shiftService.endShift(current.id, data);
          set({
            currentShift: null,
            ending: false,
            history: [shift, ...get().history],
          });
          return true;
        } catch (_e: unknown) {
    const e = asError(_e);
          console.error("[ShiftStore] endShift failed:", e);
          set({ ending: false, error: e?.message || "Failed to end shift" });
          return false;
        }
      },

      clearError: () => set({ error: null }),
    }),
    {
      name: "supermandi.shift.v1",
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist currentShift so we remember active shift across app restarts
      partialize: (state) => ({
        currentShift: state.currentShift,
      }),
    }
  )
);
