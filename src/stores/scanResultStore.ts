/**
 * V3-FIX-157: Reactive scan result store for cross-screen intent handoff.
 * When a scan completes in ScanScreenV3, the result is written here.
 * The destination screen (BuyScreenV3, CounterPurchaseScreenV3) subscribes
 * via useEffect on the reactive state and consumes the result.
 */
import { create } from "zustand";
import type { ScanIntent } from "../services/scanIntent";

interface ScanResultState {
  /** Barcode from the last scan, or null if consumed/cleared */
  barcode: string | null;
  /** Which intent produced this result — typed to canonical ScanIntent */
  intent: ScanIntent | null;
  /** Monotonic timestamp for change detection */
  timestamp: number;
  /** Set a new scan result (called by V3ScanWrapper) */
  setScanResult: (barcode: string, intent: ScanIntent) => void;
  /** Clear the result after consumption (called by destination screen) */
  clearScanResult: () => void;
}

export const useScanResultStore = create<ScanResultState>((set) => ({
  barcode: null,
  intent: null,
  timestamp: 0,
  setScanResult: (barcode, intent) => set({ barcode, intent, timestamp: Date.now() }),
  clearScanResult: () => set({ barcode: null, intent: null, timestamp: 0 }),
}));
