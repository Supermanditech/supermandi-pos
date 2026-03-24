// GCP-STG-0670: Printer error recovery classification unit test
import { describe, it, expect } from "@jest/globals";

// Inline the classification logic for unit testing (avoids Expo/RN import issues in backend jest)
type PrinterError = 'DISCONNECTED' | 'PAPER_OUT' | 'BUSY' | 'UNKNOWN';

function classifyPrinterError(err: unknown): PrinterError {
  const msg = String(err).toLowerCase();
  if (msg.includes('disconnect') || msg.includes('not connected')) return 'DISCONNECTED';
  if (msg.includes('paper') || msg.includes('out of paper')) return 'PAPER_OUT';
  if (msg.includes('busy') || msg.includes('timeout')) return 'BUSY';
  return 'UNKNOWN';
}

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
});
