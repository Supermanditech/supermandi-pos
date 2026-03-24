/**
 * GCP-STG-0670: Printer error classification — behavioral unit tests
 *
 * Tests classifyPrinterError and getPrinterErrorMessage pure functions
 * from the POS printerService. We mock expo-print and react-native to
 * allow importing the real functions in a Node.js test environment.
 */

// Mock React Native / Expo dependencies that printerService imports
jest.mock("expo-print", () => ({}));
jest.mock("react-native", () => ({
  Platform: { OS: "android" },
}));
jest.mock("../../src/services/eventLogger", () => ({
  eventLogger: { log: jest.fn() },
}));
jest.mock("../../src/services/cloudEventLogger", () => ({
  logPosEvent: jest.fn(),
}));
jest.mock("../../src/utils/errorUtils", () => ({
  asError: (e: any) => (e instanceof Error ? e : new Error(String(e))),
}));
jest.mock("../../src/stores/settingsStore", () => ({
  useSettingsStore: { getState: () => ({ printerWidth: 80, printerType: 'thermal' }) },
}));

import { classifyPrinterError, getPrinterErrorMessage } from "../../src/services/printerService";

describe("GCP-STG-0670: Printer error classification", () => {
  it("classifies disconnect errors", () => {
    expect(classifyPrinterError("Device disconnected")).toBe("DISCONNECTED");
    expect(classifyPrinterError(new Error("not connected"))).toBe("DISCONNECTED");
  });

  it("classifies paper errors", () => {
    expect(classifyPrinterError("out of paper")).toBe("PAPER_OUT");
    expect(classifyPrinterError(new Error("Paper jam detected"))).toBe("PAPER_OUT");
  });

  it("classifies busy/timeout errors", () => {
    expect(classifyPrinterError("Printer busy")).toBe("BUSY");
    expect(classifyPrinterError(new Error("Connection timeout"))).toBe("BUSY");
  });

  it("defaults to UNKNOWN for unrecognized errors", () => {
    expect(classifyPrinterError("Something went wrong")).toBe("UNKNOWN");
    expect(classifyPrinterError(null)).toBe("UNKNOWN");
    expect(classifyPrinterError(undefined)).toBe("UNKNOWN");
    expect(classifyPrinterError(42)).toBe("UNKNOWN");
  });

  it("getPrinterErrorMessage returns correct messages", () => {
    expect(getPrinterErrorMessage("DISCONNECTED")).toContain("disconnected");
    expect(getPrinterErrorMessage("PAPER_OUT")).toContain("paper");
    expect(getPrinterErrorMessage("BUSY")).toContain("busy");
    expect(getPrinterErrorMessage("UNKNOWN")).toContain("error");
  });
});
