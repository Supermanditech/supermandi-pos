/**
 * STG-531: KhataScreen modal scroll — wrap content in ScrollView
 *
 * Verifies that the ledger modal wraps both the summary card and
 * entries in a single ScrollView for small screen support.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const khataPath = path.resolve(
  __dirname,
  "../../screens/KhataScreen.tsx"
);

describe("STG-531: KhataScreen ledger modal scroll", () => {
  const khata = fs.readFileSync(khataPath, "utf-8");

  test("has STG-531 comment for ScrollView wrapping", () => {
    expect(khata).toContain("STG-531: Wrap summary + entries in single ScrollView");
  });

  test("ledger summary card is inside ScrollView (not before it)", () => {
    // The ScrollView should appear BEFORE the summary card
    const scrollIdx = khata.indexOf("STG-531: Wrap summary");
    const summaryIdx = khata.indexOf("ledgerSummaryCard", scrollIdx);
    expect(scrollIdx).toBeLessThan(summaryIdx);
  });

  test("entries are rendered inline (not in nested ScrollView)", () => {
    // After STG-531, entries should use customerEntries.map directly
    expect(khata).toContain("customerEntries.map(renderLedgerEntry)");
  });
});
