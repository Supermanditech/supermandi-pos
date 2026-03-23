/**
 * GCP-STG-0414: ScanScreenV3 uses safe area insets instead of hardcoded paddingTop:48
 *
 * Tests:
 * 1. useSafeAreaInsets is imported from react-native-safe-area-context
 * 2. createStyles accepts safeTop parameter (no hardcoded 48)
 * 3. Header paddingTop uses insets.top + 8 formula
 * 4. useSafeAreaInsets hook is called in the component
 */

import * as fs from "fs";
import * as path from "path";

const SCREEN_PATH = path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx");
const source = fs.readFileSync(SCREEN_PATH, "utf8");

describe("GCP-STG-0414: ScanScreenV3 safe area insets", () => {
  test("imports useSafeAreaInsets from react-native-safe-area-context", () => {
    expect(source).toMatch(/import\s*\{[^}]*useSafeAreaInsets[^}]*\}\s*from\s*["']react-native-safe-area-context["']/);
  });

  test("createStyles accepts safeTop parameter instead of using hardcoded 48", () => {
    // The function signature must include safeTop
    expect(source).toMatch(/function\s+createStyles\s*\(\s*colors:\s*ColorPalette\s*,\s*safeTop:\s*number\s*\)/);
    // Must NOT have the old hardcoded paddingTop: 48
    expect(source).not.toMatch(/paddingTop:\s*48/);
  });

  test("header paddingTop uses safeTop + 8 formula", () => {
    expect(source).toMatch(/paddingTop:\s*safeTop\s*\+\s*8/);
  });

  test("component calls useSafeAreaInsets hook", () => {
    expect(source).toMatch(/const\s+insets\s*=\s*useSafeAreaInsets\s*\(\s*\)/);
  });

  test("createStyles is called with insets.top", () => {
    expect(source).toMatch(/createStyles\s*\(\s*colors\s*,\s*insets\.top\s*\)/);
  });
});
