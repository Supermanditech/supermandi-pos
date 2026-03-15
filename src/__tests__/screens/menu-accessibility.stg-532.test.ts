/**
 * STG-532: MenuScreen — verify accessibilityLabel on all interactive icons
 *
 * Verifies that all Pressable elements in MenuScreen have
 * accessibilityLabel and accessibilityRole for screen reader support.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../screens/MenuScreen.tsx"
);

describe("STG-532: MenuScreen accessibility labels", () => {
  const src = fs.readFileSync(filePath, "utf-8");

  test("every Pressable has accessibilityRole='button'", () => {
    const pressableCount = (src.match(/<Pressable\b/g) || []).length;
    const roleCount = (src.match(/accessibilityRole="button"/g) || []).length;
    expect(roleCount).toBeGreaterThanOrEqual(pressableCount);
  });

  test("every Pressable has accessibilityLabel", () => {
    const pressableCount = (src.match(/<Pressable\b/g) || []).length;
    const labelCount = (src.match(/accessibilityLabel[={]/g) || []).length;
    expect(labelCount).toBeGreaterThanOrEqual(pressableCount);
  });

  test("sync button has dynamic accessibility label", () => {
    expect(src).toContain('accessibilityLabel={syncing ? "Syncing data"');
  });

  test("status panel toggle has accessibility label", () => {
    expect(src).toContain("Expand operational status");
    expect(src).toContain("Collapse operational status");
  });
});
