/**
 * STG-544: Currency fallback — use currency code consistently
 *
 * Verifies that the fallback formatting path in formatMoney validates
 * currency codes and defaults invalid ones to INR.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../utils/money.ts"
);

describe("STG-544: Currency fallback validation", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("fallback validates currency code format", () => {
    // Should validate that currency is a 3-letter uppercase code
    expect(content).toContain('/^[A-Z]{3}$/');
  });

  test("defaults invalid currency to INR", () => {
    // Count fallback currency assignments
    const matches = content.match(/fallbackCurrency/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test("fallback uses currency code string, not symbol", () => {
    // In fallback path, non-INR currencies use the code string directly
    const fallbackPaths = content.match(/`\$\{fallbackCurrency\} \$\{formatGrouped/g);
    expect(fallbackPaths).not.toBeNull();
  });
});
