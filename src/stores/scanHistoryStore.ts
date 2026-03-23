import { create } from 'zustand';

// GCP-STG-0523: Scan history log — last 50 scans for debugging and analytics

type ScanHistoryEntry = {
  barcode: string;
  timestamp: number;
  result: 'found' | 'not_found' | 'duplicate' | 'error';
  productName?: string;
  source: 'hid' | 'camera' | 'manual';
};

type ScanHistoryState = {
  entries: ScanHistoryEntry[];
  addEntry: (entry: ScanHistoryEntry) => void;
  clear: () => void;
};

const MAX_ENTRIES = 50;

export const useScanHistoryStore = create<ScanHistoryState>((set) => ({
  entries: [],
  addEntry: (entry) => set((state) => ({
    entries: [entry, ...state.entries].slice(0, MAX_ENTRIES),
  })),
  clear: () => set({ entries: [] }),
}));
