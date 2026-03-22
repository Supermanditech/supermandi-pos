/**
 * GCP-STG-0302: SafeAreaView/useSafeAreaInsets on V3 screens
 *
 * Verifies BrandedHeader and BottomNavV3 use useSafeAreaInsets
 * for paddingTop (status bar) and paddingBottom (gesture bar).
 */
import * as fs from "fs";
import * as path from "path";

const HEADER_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/v3/BrandedHeader.tsx"), "utf8"
);
const NAV_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/v3/BottomNavV3.tsx"), "utf8"
);

describe("GCP-STG-0302: Safe area insets on V3 components", () => {
  describe("BrandedHeader", () => {
    test("imports useSafeAreaInsets", () => {
      expect(HEADER_SRC).toContain("useSafeAreaInsets");
      expect(HEADER_SRC).toContain("react-native-safe-area-context");
    });

    test("calls useSafeAreaInsets() in component body", () => {
      expect(HEADER_SRC).toMatch(/const insets\s*=\s*useSafeAreaInsets\(\)/);
    });

    test("applies insets.top as paddingTop", () => {
      expect(HEADER_SRC).toContain("paddingTop: insets.top");
    });
  });

  describe("BottomNavV3", () => {
    test("imports useSafeAreaInsets", () => {
      expect(NAV_SRC).toContain("useSafeAreaInsets");
      expect(NAV_SRC).toContain("react-native-safe-area-context");
    });

    test("calls useSafeAreaInsets() in component body", () => {
      expect(NAV_SRC).toMatch(/const insets\s*=\s*useSafeAreaInsets\(\)/);
    });

    test("applies insets.bottom as paddingBottom with minimum 8px", () => {
      expect(NAV_SRC).toContain("Math.max(insets.bottom, 8)");
    });
  });
});
