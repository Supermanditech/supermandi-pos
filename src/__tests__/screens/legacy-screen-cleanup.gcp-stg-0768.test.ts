/**
 * GCP-STG-0768: Verify obsolete test files for removed screens are deleted
 */
describe("GCP-STG-0768: Obsolete test files removed", () => {
  const fs = require("fs");

  const deadTests = [
    "src/__tests__/screens/MenuScreen.stg-014.unit.test.tsx",
    "src/__tests__/screens/HomeScreen.stg-051-152.unit.test.ts",
    "src/__tests__/screens/SellScanScreen.stg-016.unit.test.tsx",
    "src/__tests__/screens/SplashScreen.stg-002.unit.test.tsx",
    "src/__tests__/screens/SplashScreen.stg-310.unit.test.ts",
  ];

  for (const file of deadTests) {
    it(`should not have ${file.split("/").pop()}`, () => {
      expect(fs.existsSync(file)).toBe(false);
    });
  }

  it("should not have tests referencing deleted screens", () => {
    const deletedScreens = ["MenuScreen", "HomeScreen", "SellScanScreen"];
    // SplashScreen (legacy) is deleted; SplashScreenV3 is current
    for (const screen of deletedScreens) {
      expect(fs.existsSync(`src/screens/${screen}.tsx`)).toBe(false);
    }
  });
});
