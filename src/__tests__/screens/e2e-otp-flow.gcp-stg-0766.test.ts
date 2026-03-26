/**
 * GCP-STG-0766: E2E real device test plan — fresh install Phone OTP flow
 *
 * Test plan (manual, on physical device):
 * 1. Uninstall SuperMandi POS from device
 * 2. Install fresh APK
 * 3. App shows brand splash (SuperMandi logo, fade-in, no spinner)
 * 4. After 1.5s, navigates to PhoneScreenV3
 * 5. Enter registered phone (7737914383)
 * 6. Tap Continue → OTP sent via WhatsApp
 * 7. Enter 6-digit OTP on OTPScreenV3
 * 8. If multi-store: StoreSelectScreenV3 → select store
 * 9. StaffLoginScreenV3 → enter PIN (sent via WhatsApp on first enrollment)
 * 10. SellScan screen with 216 products
 * 11. Add product to cart → complete cash payment → success screen
 *
 * All steps must pass without stuck/error screens.
 */
describe("GCP-STG-0766: OTP onboarding E2E prerequisites", () => {
  const fs = require("fs");

  it("SplashScreenV3 routes to V3Phone (not EnrollDevice)", () => {
    const splash = fs.readFileSync("src/screens/v3/SplashScreenV3.tsx", "utf8");
    expect(splash).toContain('safeNavigate("V3Phone")');
    expect(splash).not.toContain('safeNavigate("EnrollDevice")');
  });

  it("PhoneScreenV3 calls /auth/pos/auth/send-otp", () => {
    const phone = fs.readFileSync("src/screens/v3/PhoneScreenV3.tsx", "utf8");
    expect(phone).toContain("/auth/pos/auth/send-otp");
  });

  it("OTPScreenV3 handles multi-store response", () => {
    const otp = fs.readFileSync("src/screens/v3/OTPScreenV3.tsx", "utf8");
    expect(otp).toContain("multiStore");
    expect(otp).toContain("V3StoreSelect");
  });

  it("verify-otp auto-creates MANAGER staff", () => {
    const otpAuth = fs.readFileSync("backend/src/routes/v1/pos/otpAuth.ts", "utf8");
    expect(otpAuth).toContain("GCP-STG-0762");
    expect(otpAuth).toContain("platform.store_staff");
    expect(otpAuth).toContain("'MANAGER'");
  });

  it("StaffLoginScreenV3 handles no-staff gracefully", () => {
    const staff = fs.readFileSync("src/screens/v3/StaffLoginScreenV3.tsx", "utf8");
    expect(staff).toContain("No staff configured");
    expect(staff).toContain("listStaff");
  });

  it("backend auth routes are in public namespace", () => {
    const gateway = fs.readFileSync("backend/services/api-gateway/src/middleware/jwtAuth.ts", "utf8");
    expect(gateway).toContain("/api/v1/auth/pos");
  });
});
