/**
 * GCP-STG-0775: PaymentSetupScreen not in default OTP onboarding flow
 */
describe("GCP-STG-0775: PaymentSetup removed from default flow", () => {
  const fs = require("fs");
  const path = require("path");

  const v3Screens = [
    "src/screens/v3/SplashScreenV3.tsx",
    "src/screens/v3/PhoneScreenV3.tsx",
    "src/screens/v3/OTPScreenV3.tsx",
    "src/screens/v3/StoreSelectScreenV3.tsx",
    "src/screens/v3/StaffLoginScreenV3.tsx",
  ];

  for (const file of v3Screens) {
    it(`${path.basename(file)} should not navigate to PaymentSetup`, () => {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toContain('"PaymentSetup"');
    });
  }

  it("PaymentSetupScreen should still be registered in App.tsx for settings access", () => {
    const app = fs.readFileSync("App.tsx", "utf8");
    expect(app).toContain('name="PaymentSetup"');
  });
});
