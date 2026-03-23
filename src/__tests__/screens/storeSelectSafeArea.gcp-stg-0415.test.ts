/**
 * GCP-STG-0415: StoreSelectScreenV3 uses safe area insets instead of hardcoded paddingTop:60
 *
 * Tests:
 * 1. useSafeAreaInsets is imported from react-native-safe-area-context
 * 2. createStyles accepts safeTop parameter (no hardcoded 60)
 * 3. Header paddingTop uses insets.top + 16 formula
 * 4. useSafeAreaInsets hook is called in the component
 */

import * as fs from "fs";
import * as path from "path";

const SCREEN_PATH = path.resolve(__dirname, "../../screens/v3/StoreSelectScreenV3.tsx");
const source = fs.readFileSync(SCREEN_PATH, "utf8");

describe("GCP-STG-0415: StoreSelectScreenV3 safe area insets", () => {
  test("imports useSafeAreaInsets from react-native-safe-area-context", () => {
    expect(source).toMatch(/import\s*\{[^}]*useSafeAreaInsets[^}]*\}\s*from\s*["']react-native-safe-area-context["']/);
  });

  test("createStyles accepts safeTop parameter instead of using hardcoded 60", () => {
    expect(source).toMatch(/function\s+createStyles\s*\(\s*colors:\s*ColorPalette\s*,\s*safeTop:\s*number\s*\)/);
    // Must NOT have the old hardcoded paddingTop: 60
    expect(source).not.toMatch(/paddingTop:\s*60/);
  });

  test("header paddingTop uses safeTop + 16 formula", () => {
    expect(source).toMatch(/paddingTop:\s*safeTop\s*\+\s*16/);
  });

  test("component calls useSafeAreaInsets hook", () => {
    expect(source).toMatch(/const\s+insets\s*=\s*useSafeAreaInsets\s*\(\s*\)/);
  });

  test("createStyles is called with insets.top", () => {
    expect(source).toMatch(/createStyles\s*\(\s*colors\s*,\s*insets\.top\s*\)/);
  });
});
