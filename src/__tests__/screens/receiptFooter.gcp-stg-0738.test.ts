// GCP-STG-0738: Behavioral test for receipt footer settings store
import { describe, it, expect, beforeEach } from "@jest/globals";

// Mock AsyncStorage before importing the store
// Zustand persist uses createJSONStorage(() => AsyncStorage) which calls
// AsyncStorage.getItem/setItem/removeItem directly on the default export.
const mockStorage: Record<string, string> = {};
jest.mock("@react-native-async-storage/async-storage", () => ({
  __esModule: true,
  default: {
    getItem: jest.fn((key: string) => Promise.resolve(mockStorage[key] ?? null)),
    setItem: jest.fn((key: string, value: string) => { mockStorage[key] = value; return Promise.resolve(); }),
    removeItem: jest.fn((key: string) => { delete mockStorage[key]; return Promise.resolve(); }),
    getAllKeys: jest.fn(() => Promise.resolve(Object.keys(mockStorage))),
    multiGet: jest.fn((keys: string[]) => Promise.resolve(keys.map((k: string) => [k, mockStorage[k] ?? null]))),
    multiSet: jest.fn((pairs: [string, string][]) => { pairs.forEach(([k, v]: [string, string]) => { mockStorage[k] = v; }); return Promise.resolve(); }),
    multiRemove: jest.fn((keys: string[]) => { keys.forEach((k: string) => { delete mockStorage[k]; }); return Promise.resolve(); }),
    clear: jest.fn(() => { Object.keys(mockStorage).forEach(k => delete mockStorage[k]); return Promise.resolve(); }),
  },
}));

// Mock i18n to avoid side effects
jest.mock("../../i18n", () => ({
  setLanguage: jest.fn(),
}));

import { useSettingsStore } from "../../stores/settingsStore";

describe("GCP-STG-0738: Receipt footer customization", () => {
  beforeEach(() => {
    // Reset store to defaults between tests
    useSettingsStore.setState({
      receiptFooterLine1: "",
      receiptFooterLine2: "",
    });
  });

  it("setReceiptFooterLine1 stores the value", () => {
    const { setReceiptFooterLine1 } = useSettingsStore.getState();
    setReceiptFooterLine1("Thank you!");
    expect(useSettingsStore.getState().receiptFooterLine1).toBe("Thank you!");
  });

  it("setReceiptFooterLine2 stores the value", () => {
    const { setReceiptFooterLine2 } = useSettingsStore.getState();
    setReceiptFooterLine2("Visit again soon");
    expect(useSettingsStore.getState().receiptFooterLine2).toBe("Visit again soon");
  });

  it("getState returns both footer lines together (receipt config shape)", () => {
    const { setReceiptFooterLine1, setReceiptFooterLine2 } = useSettingsStore.getState();
    setReceiptFooterLine1("Thank you for shopping!");
    setReceiptFooterLine2("GST: 27AABCS1234Z1Z5");

    const state = useSettingsStore.getState();
    expect(state.receiptFooterLine1).toBe("Thank you for shopping!");
    expect(state.receiptFooterLine2).toBe("GST: 27AABCS1234Z1Z5");
  });

  it("defaults to empty strings for both footer lines", () => {
    useSettingsStore.setState({
      receiptFooterLine1: "",
      receiptFooterLine2: "",
    });
    const state = useSettingsStore.getState();
    expect(state.receiptFooterLine1).toBe("");
    expect(state.receiptFooterLine2).toBe("");
  });

  it("overwriting footer line replaces previous value", () => {
    const { setReceiptFooterLine1 } = useSettingsStore.getState();
    setReceiptFooterLine1("Old footer");
    setReceiptFooterLine1("New footer");
    expect(useSettingsStore.getState().receiptFooterLine1).toBe("New footer");
  });
});
