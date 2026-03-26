/**
 * GCP-STG-0765: All EnrollDevice navigation references replaced with V3Phone
 */
describe("GCP-STG-0765: No EnrollDevice navigation in error recovery", () => {
  const fs = require("fs");

  const filesToCheck = [
    "src/screens/PaymentSetupScreen.tsx",
    "src/screens/ForceUpdateScreen.tsx",
    "src/screens/DeviceBlockedScreen.tsx",
    "src/screens/v3/SplashScreenV3.tsx",
  ];

  for (const file of filesToCheck) {
    it(`${file.split("/").pop()} should not navigate to EnrollDevice`, () => {
      const content = fs.readFileSync(file, "utf8");
      // Navigation calls should not target EnrollDevice
      expect(content).not.toMatch(/navigate\(\s*["']EnrollDevice["']/);
      expect(content).not.toMatch(/replace\(\s*["']EnrollDevice["']/);
      expect(content).not.toMatch(/name:\s*["']EnrollDevice["']\s*\}/);
    });
  }
});
