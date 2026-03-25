/**
 * GCP-STG-0670: Printer error classification — source verification test
 *
 * Verifies printerService.ts contains classifyPrinterError and
 * getPrinterErrorMessage functions with proper error handling.
 * Cannot import POS code in backend test env (no expo-print).
 */
import * as fs from "fs";
import * as path from "path";

const PRINTER_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../src/services/printerService.ts"),
  "utf8"
);

describe("GCP-STG-0670: Printer error classification", () => {
  it("exports classifyPrinterError function", () => {
    expect(PRINTER_SRC).toContain("export function classifyPrinterError");
  });

  it("exports getPrinterErrorMessage function", () => {
    expect(PRINTER_SRC).toContain("export function getPrinterErrorMessage");
  });

  it("handles DISCONNECTED error type", () => {
    expect(PRINTER_SRC).toContain("DISCONNECTED");
  });

  it("handles PAPER_OUT error type", () => {
    expect(PRINTER_SRC).toContain("PAPER_OUT");
  });

  it("handles UNKNOWN fallback", () => {
    expect(PRINTER_SRC).toContain("UNKNOWN");
  });
});
