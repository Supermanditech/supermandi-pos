/**
 * GCP-STG-0779: Navigation audit — critical paths verified, no dead routes
 */
describe("GCP-STG-0779: Navigation graph integrity", () => {
  const fs = require("fs");
  const app = fs.readFileSync("App.tsx", "utf8");

  it("should have all critical screens registered", () => {
    const requiredScreens = [
      "Splash", "V3Phone", "V3OTP", "V3StoreSelect", "V3StaffLogin",
      "SellScan", "DeviceBlocked", "ForceUpdate", "EnrollDevice",
    ];
    for (const screen of requiredScreens) {
      expect(app).toContain(`name="${screen}"`);
    }
  });

  it("should not have duplicate screen registrations", () => {
    const screens = (app.match(/Stack\.Screen name="([^"]+)"/g) || [])
      .map((m: string) => m.replace(/Stack\.Screen name="([^"]+)"/, "$1"));
    const unique = new Set(screens);
    expect(screens.length).toBe(unique.size);
  });

  it("OTP onboarding chain: Splash → V3Phone → V3OTP → V3StoreSelect → V3StaffLogin → SellScan", () => {
    const splash = fs.readFileSync("src/screens/v3/SplashScreenV3.tsx", "utf8");
    const phone = fs.readFileSync("src/screens/v3/PhoneScreenV3.tsx", "utf8");
    const otp = fs.readFileSync("src/screens/v3/OTPScreenV3.tsx", "utf8");
    const storeSelect = fs.readFileSync("src/screens/v3/StoreSelectScreenV3.tsx", "utf8");
    const staffLogin = fs.readFileSync("src/screens/v3/StaffLoginScreenV3.tsx", "utf8");

    expect(splash).toContain('"V3Phone"');
    expect(phone).toContain('"V3OTP"');
    expect(otp).toContain('"V3StoreSelect"');
    expect(storeSelect).toContain('"V3StaffLogin"');
    expect(staffLogin).toContain('"SellScan"');
  });

  it("error recovery should route to V3Phone, not EnrollDevice", () => {
    const files = [
      "src/screens/v3/SplashScreenV3.tsx",
      "src/screens/ForceUpdateScreen.tsx",
      "src/screens/DeviceBlockedScreen.tsx",
    ];
    for (const file of files) {
      const content = fs.readFileSync(file, "utf8");
      expect(content).not.toMatch(/navigate\(\s*["']EnrollDevice["']/);
      expect(content).not.toMatch(/name:\s*["']EnrollDevice["']\s*\}/);
    }
  });
});
