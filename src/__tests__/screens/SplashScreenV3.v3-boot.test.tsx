/**
 * V3-REG-009: Frontend splash/auth funnel regression tests
 * Tests boot flow, navigation decisions, and prototype UI parity.
 */

describe("SplashScreenV3 (V3-BOOT-001 + V3-NAV-002)", () => {
  it("should be the mounted splash in App.tsx navigator", () => {
    const fs = require("fs");
    const app = fs.readFileSync("App.tsx", "utf8");
    expect(app).toContain('name="Splash" component={SplashScreenV3}');
    expect(app).not.toContain('name="Splash" component={SplashScreen}');
  });

  it("should not navigate to EnrollDevice for recovery", () => {
    const fs = require("fs");
    const splash = fs.readFileSync("src/screens/v3/SplashScreenV3.tsx", "utf8");
    // Comments mentioning EnrollDevice are OK, but navigation calls are not
    expect(splash).not.toContain('navigate("EnrollDevice"');
    expect(splash).not.toContain('replace("EnrollDevice"');
    expect(splash).not.toContain('safeNavigate("EnrollDevice"');
  });

  it("GCP-STG-0757: fresh install and auth failure both route to V3Phone", () => {
    const fs = require("fs");
    const splash = fs.readFileSync("src/screens/v3/SplashScreenV3.tsx", "utf8");
    // Both no-session and auth-failure paths must navigate to V3Phone
    const v3PhoneNavCount = (splash.match(/safeNavigate\("V3Phone"\)/g) || []).length;
    // At least 2: one for no-session, one for auth failure (plus handleContinue)
    expect(v3PhoneNavCount).toBeGreaterThanOrEqual(2);
  });

  it("should match prototype UI elements", () => {
    const fs = require("fs");
    const splash = fs.readFileSync("src/screens/v3/SplashScreenV3.tsx", "utf8");
    expect(splash).toContain("SuperMandi");
    expect(splash).toContain("Point of Sale");
    expect(splash).toContain("Connecting to store...");
    expect(splash).toContain("Continue");
    expect(splash).not.toContain("v3.0"); // No version watermark per prototype
  });

  it("should have testIDs for automation", () => {
    const fs = require("fs");
    const splash = fs.readFileSync("src/screens/v3/SplashScreenV3.tsx", "utf8");
    const requiredTestIds = ["splash-screen", "splash-logo", "splash-spinner", "splash-status", "splash-continue-cta"];
    for (const id of requiredTestIds) {
      expect(splash).toContain(`testID="${id}"`);
    }
  });

  it("should distinguish auth failure from network failure", () => {
    const fs = require("fs");
    const splash = fs.readFileSync("src/screens/v3/SplashScreenV3.tsx", "utf8");
    expect(splash).toContain("DEVICE_UNAUTHORIZED");
    expect(splash).toContain("TOKEN_EXPIRED");
    expect(splash).toContain("TOKEN_REVOKED");
  });
});

describe("V3-CLIENT-003: Client auth normalization", () => {
  it("deviceSession should accept opaque tokens", () => {
    const fs = require("fs");
    const ds = fs.readFileSync("src/services/deviceSession.ts", "utf8");
    // Opaque tokens (non-JWT) should return true, not false
    expect(ds).toContain("// Opaque token — assume valid");
  });

  it("apiClient should match backend error codes case-insensitive", () => {
    const fs = require("fs");
    const ac = fs.readFileSync("src/services/api/apiClient.ts", "utf8");
    expect(ac).toContain("toUpperCase");
    expect(ac).toContain("DEVICE_UNAUTHORIZED");
    expect(ac).toContain("TOKEN_EXPIRED");
    expect(ac).toContain("TOKEN_REVOKED");
  });

  it("OTPScreenV3 should hydrate storeName into settingsStore", () => {
    const fs = require("fs");
    const otp = fs.readFileSync("src/screens/v3/OTPScreenV3.tsx", "utf8");
    expect(otp).toContain("setStoreName");
    expect(otp).toContain("setStoreCode");
  });

  it("StoreSelectScreenV3 should hydrate storeName into settingsStore", () => {
    const fs = require("fs");
    const ss = fs.readFileSync("src/screens/v3/StoreSelectScreenV3.tsx", "utf8");
    expect(ss).toContain("setStoreName");
    expect(ss).toContain("setStoreCode");
  });

  it("PosRootLayoutV3 should start SSE client on mount", () => {
    const fs = require("fs");
    const pos = fs.readFileSync("src/screens/v3/PosRootLayoutV3.tsx", "utf8");
    expect(pos).toContain("startSSEClient");
    expect(pos).toContain("stopSSEClient");
  });
});

describe("V3-API-005: ui-status auth hardening", () => {
  it("should throw on 401/403 instead of falling back", () => {
    const fs = require("fs");
    const uiStatus = fs.readFileSync("src/services/api/uiStatusApi.ts", "utf8");
    expect(uiStatus).toContain("response.status === 401");
    expect(uiStatus).toContain("response.status === 403");
    expect(uiStatus).toContain("throw new Error(errorCode)");
  });
});
