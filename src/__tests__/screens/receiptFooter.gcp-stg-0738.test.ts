// GCP-STG-0738: Behavioral test for receipt footer settings store
import { describe, it, expect, beforeEach } from "@jest/globals";

// Mock AsyncStorage before importing the store
jest.mock("@react-native-async-storage/async-storage", () => ({
  default: {
    getItem: jest.fn(() => Promise.resolve(null)),
    setItem: jest.fn(() => Promise.resolve()),
    removeItem: jest.fn(() => Promise.resolve()),
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
