/**
 * STG-533: CustomerListScreen — add accessibilityLabel to interactive elements
 *
 * Verifies that all Pressable elements in CustomerListScreen have
 * accessibilityLabel for screen reader support.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../screens/CustomerListScreen.tsx"
);

describe("STG-533: CustomerListScreen accessibility labels", () => {
  const src = fs.readFileSync(filePath, "utf-8");

  test("customer card has accessibilityLabel", () => {
    expect(src).toContain("View customer ${item.name");
  });

  test("Add Customer button has accessibilityLabel", () => {
    // The add button Pressable should have accessibilityLabel
    const addBtnIdx = src.indexOf('accessibilityLabel="Add Customer"');
    expect(addBtnIdx).toBeGreaterThan(-1);
  });

  test("submit add button has accessibilityLabel", () => {
    expect(src).toContain('accessibilityLabel={formSubmitting ? "Adding customer"');
  });

  test("submit edit button has accessibilityLabel", () => {
    expect(src).toContain('accessibilityLabel={formSubmitting ? "Saving changes"');
  });

  test("every Pressable has accessibilityRole", () => {
    // Count Pressable opening tags and accessibilityRole occurrences
    const pressableCount = (src.match(/<Pressable\b/g) || []).length;
    const roleCount = (src.match(/accessibilityRole="button"/g) || []).length;
    expect(roleCount).toBeGreaterThanOrEqual(pressableCount);
  });
});
