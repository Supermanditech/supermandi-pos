/**
 * GCP-STG-0316: Reactive store to trigger search-by-name from scan miss.
 * When a barcode scan fails and user taps "Search by Name", the scanner
 * writes the scanned barcode here. The parent screen (Sell/Buy) subscribes
 * and opens its search interface.
 */
import { create } from "zustand";

interface SearchTriggerState {
  /** The barcode that was scanned but not found, or null if idle */
  missedBarcode: string | null;
  /** Monotonic timestamp for change detection */
  timestamp: number;
  /** Signal that a search-by-name was requested */
  triggerSearch: (barcode: string) => void;
  /** Clear after the parent screen has consumed the trigger */
  clearTrigger: () => void;
}

export const useSearchTriggerStore = create<SearchTriggerState>((set) => ({
  missedBarcode: null,
  timestamp: 0,
  triggerSearch: (barcode) => set({ missedBarcode: barcode, timestamp: Date.now() }),
  clearTrigger: () => set({ missedBarcode: null, timestamp: 0 }),
}));
