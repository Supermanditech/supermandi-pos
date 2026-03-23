/**
 * GCP-STG-0413: Auth Screens Missing SafeAreaView — Content Behind Notch/Status Bar
 *
 * Verifies all 5 POS auth screens import useSafeAreaInsets from react-native-safe-area-context.
 */
import * as fs from "fs";
import * as path from "path";

const AUTH_SCREENS = [
  "SplashScreenV3.tsx",
  "PhoneScreenV3.tsx",
  "OTPScreenV3.tsx",
  "StoreSelectScreenV3.tsx",
  "StaffLoginScreenV3.tsx",
];

const SCREENS_DIR = path.resolve(__dirname, "../../screens/v3");

describe("GCP-STG-0413: Auth screens SafeAreaView", () => {
  for (const screen of AUTH_SCREENS) {
    const filePath = path.join(SCREENS_DIR, screen);

    it(`${screen} imports useSafeAreaInsets`, () => {
      const src = fs.readFileSync(filePath, "utf-8");
      expect(src).toContain("useSafeAreaInsets");
      expect(src).toContain("react-native-safe-area-context");
    });

    it(`${screen} calls useSafeAreaInsets()`, () => {
      const src = fs.readFileSync(filePath, "utf-8");
      expect(src).toMatch(/const\s+insets\s*=\s*useSafeAreaInsets\(\)/);
    });

    it(`${screen} applies insets.top padding`, () => {
      const src = fs.readFileSync(filePath, "utf-8");
      // Either inline style with insets.top or via createStyles parameter
      const hasInlineInsets = src.includes("insets.top");
      const hasSafeTopParam = src.includes("safeTop");
      expect(hasInlineInsets || hasSafeTopParam).toBe(true);
    });
  }
});
