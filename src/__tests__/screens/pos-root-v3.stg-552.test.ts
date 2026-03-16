/**
 * STG-552: POS v3 navigation shell — static analysis tests
 * Verifies: feature flag, v3 layout, bottom nav component structure
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-552: POS v3 navigation shell", () => {
  test("settingsStore has posV3Enabled field", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../stores/settingsStore.ts"),
      "utf8"
    );
    expect(src).toContain("posV3Enabled: boolean");
    expect(src).toContain("setPosV3Enabled:");
    expect(src).toContain("posV3Enabled: false");
    // Storage version bumped
    expect(src).toContain("settings.v8");
  });

  test("PosRootLayout conditionally renders v3 when flag is on", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/PosRootLayout.tsx"),
      "utf8"
    );
    expect(src).toContain("posV3Enabled");
    expect(src).toContain("PosRootLayoutV3");
    expect(src).toContain("if (posV3Enabled)");
  });

  test("PosRootLayoutV3 has 4-tab structure", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/PosRootLayoutV3.tsx"),
      "utf8"
    );
    expect(src).toContain('"SELL"');
    expect(src).toContain('"BUY"');
    expect(src).toContain('"STORE"');
    expect(src).toContain('"MORE"');
    expect(src).toContain("BottomNavV3");
    expect(src).toContain("ScreenErrorBoundary");
  });

  test("BottomNavV3 has SVG icons for all 4 tabs", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../components/v3/BottomNavV3.tsx"),
      "utf8"
    );
    expect(src).toContain("SellIcon");
    expect(src).toContain("BuyIcon");
    expect(src).toContain("StoreIcon");
    expect(src).toContain("MoreIcon");
    expect(src).toContain("accessibilityRole");
    expect(src).toContain("iconPillActive");
  });

  test("v3 flag defaults to false (no accidental activation)", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../stores/settingsStore.ts"),
      "utf8"
    );
    const match = src.match(/posV3Enabled:\s*(true|false)/);
    expect(match).toBeTruthy();
    expect(match![1]).toBe("false");
  });
});
