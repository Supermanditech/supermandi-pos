/**
 * GCP-STG-0450: StoreHubScreenV3 — useSafeAreaInsets for paddingTop/paddingBottom
 * GCP-STG-0451: ReorderScreenV3 — useSafeAreaInsets for paddingTop/paddingBottom
 *
 * Behavioral: verifies source imports, hook call, and inline paddingTop/paddingBottom usage.
 */
import * as fs from "fs";
import * as path from "path";

const STORE_HUB_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../screens/v3/StoreHubScreenV3.tsx"), "utf8"
);
const REORDER_SRC = fs.readFileSync(
  path.resolve(__dirname, "../../screens/v3/ReorderScreenV3.tsx"), "utf8"
);

describe("GCP-STG-0450: StoreHubScreenV3 safe area insets", () => {
  test("imports useSafeAreaInsets from react-native-safe-area-context", () => {
    expect(STORE_HUB_SRC).toContain("useSafeAreaInsets");
    expect(STORE_HUB_SRC).toContain("react-native-safe-area-context");
  });

  test("calls useSafeAreaInsets() in component body", () => {
    expect(STORE_HUB_SRC).toMatch(/const insets\s*=\s*useSafeAreaInsets\(\)/);
  });

  test("applies insets.top as paddingTop on container", () => {
    expect(STORE_HUB_SRC).toContain("paddingTop: insets.top");
  });

  test("applies insets.bottom as paddingBottom on ScrollView content", () => {
    expect(STORE_HUB_SRC).toContain("Math.max(insets.bottom");
  });
});

describe("GCP-STG-0451: ReorderScreenV3 safe area insets", () => {
  test("imports useSafeAreaInsets from react-native-safe-area-context", () => {
    expect(REORDER_SRC).toContain("useSafeAreaInsets");
    expect(REORDER_SRC).toContain("react-native-safe-area-context");
  });

  test("calls useSafeAreaInsets() in component body", () => {
    expect(REORDER_SRC).toMatch(/const insets\s*=\s*useSafeAreaInsets\(\)/);
  });

  test("applies insets.top as paddingTop on container", () => {
    expect(REORDER_SRC).toContain("paddingTop: insets.top");
  });

  test("applies insets.bottom as paddingBottom on footer", () => {
    expect(REORDER_SRC).toContain("Math.max(insets.bottom");
  });
});
