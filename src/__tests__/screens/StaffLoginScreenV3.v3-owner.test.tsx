/**
 * V3-REG-027: Frontend owner/staff auth regression tests
 */

describe("StaffLoginScreenV3 (V3-OWNER-023)", () => {
  it("should be mounted in App.tsx navigator", () => {
    const fs = require("fs");
    const app = fs.readFileSync("App.tsx", "utf8");
    expect(app).toContain('name="V3StaffLogin"');
    expect(app).toContain("StaffLoginScreenV3");
  });

  it("should show store header from settingsStore", () => {
    const fs = require("fs");
    const screen = fs.readFileSync("src/screens/v3/StaffLoginScreenV3.tsx", "utf8");
    expect(screen).toContain("storeName");
    expect(screen).toContain("storeCode");
    expect(screen).toContain('testID="staff-login-store-header"');
  });

  it("should have PIN input and Login CTA", () => {
    const fs = require("fs");
    const screen = fs.readFileSync("src/screens/v3/StaffLoginScreenV3.tsx", "utf8");
    expect(screen).toContain('testID="staff-login-pin-input"');
    expect(screen).toContain('testID="staff-login-cta"');
    expect(screen).toContain("secureTextEntry");
  });

  it("should have Switch Store action", () => {
    const fs = require("fs");
    const screen = fs.readFileSync("src/screens/v3/StaffLoginScreenV3.tsx", "utf8");
    expect(screen).toContain('testID="staff-login-switch-store"');
    expect(screen).toContain("Switch Store");
  });

  it("should call staffLogin with PIN only", () => {
    const fs = require("fs");
    const screen = fs.readFileSync("src/screens/v3/StaffLoginScreenV3.tsx", "utf8");
    expect(screen).toContain("staffLogin({ pin })");
  });

  it("should persist staff session after login", () => {
    const fs = require("fs");
    const screen = fs.readFileSync("src/screens/v3/StaffLoginScreenV3.tsx", "utf8");
    expect(screen).toContain("setSession");
    expect(screen).toContain("staffSessionStore");
  });
});

describe("Navigation flow (V3-NAV-011)", () => {
  it("OTP success should route to V3StaffLogin (not SellScan)", () => {
    const fs = require("fs");
    const otp = fs.readFileSync("src/screens/v3/OTPScreenV3.tsx", "utf8");
    expect(otp).toContain('"V3StaffLogin"');
    expect(otp).not.toContain('reset({ index: 0, routes: [{ name: "SellScan" }]');
  });

  it("StoreSelect success should route to V3StaffLogin", () => {
    const fs = require("fs");
    const ss = fs.readFileSync("src/screens/v3/StoreSelectScreenV3.tsx", "utf8");
    expect(ss).toContain('"V3StaffLogin"');
  });

  it("Splash with device session but no staff session goes to V3StaffLogin", () => {
    const fs = require("fs");
    const splash = fs.readFileSync("src/screens/v3/SplashScreenV3.tsx", "utf8");
    expect(splash).toContain("staffSessionStore");
    expect(splash).toContain('"V3StaffLogin"');
  });

  it("Switch Staff from Settings clears staff session and goes to V3StaffLogin", () => {
    const fs = require("fs");
    const wrappers = fs.readFileSync("src/screens/v3/V3ScreenWrappers.tsx", "utf8");
    expect(wrappers).toContain('"V3StaffLogin"');
    expect(wrappers).not.toContain('"PhoneLogin"');
  });
});

describe("Session timeout (V3-SESSION-025)", () => {
  it("should soft-lock at 10 minutes (not 35)", () => {
    const fs = require("fs");
    const timeout = fs.readFileSync("src/hooks/useSessionTimeout.ts", "utf8");
    expect(timeout).toContain("10 * 60 * 1000");
    expect(timeout).not.toContain("35 * 60 * 1000");
  });
});

describe("Staff management (V3-POS-024)", () => {
  it("Settings should have staff management section for managers", () => {
    const fs = require("fs");
    const settings = fs.readFileSync("src/screens/v3/SettingsScreenV3.tsx", "utf8");
    expect(settings).toContain("STAFF MANAGEMENT");
    expect(settings).toContain("listStaff");
    expect(settings).toContain("createStaff");
  });
});
