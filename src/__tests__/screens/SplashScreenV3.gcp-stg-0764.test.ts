/**
 * GCP-STG-0764: No spinner/loading in fresh install flow
 */
describe("GCP-STG-0764: Clean fresh install flow", () => {
  const fs = require("fs");
  const splash = fs.readFileSync("src/screens/v3/SplashScreenV3.tsx", "utf8");

  it("should not import ActivityIndicator", () => {
    expect(splash).not.toContain("ActivityIndicator");
  });

  it("should not reference 'Activate' in splash", () => {
    // "Activate Your POS" belongs in deprecated EnrollDevice, not splash
    expect(splash).not.toContain("Activate");
  });

  it("should use animated fade instead of spinner", () => {
    expect(splash).toContain("Animated.View");
    expect(splash).toContain("fadeAnim");
  });

  it("should show brand during session check, not a blank screen", () => {
    expect(splash).toContain("SuperMandi");
    expect(splash).toContain("Point of Sale");
    expect(splash).toContain("splash-logo");
  });

  it("should have subtle status text, not prominent loading indicator", () => {
    expect(splash).toContain("Connecting to store...");
    // Status text should be small and subtle (12px or similar)
    expect(splash).toContain("fontSize: 12");
  });
});
