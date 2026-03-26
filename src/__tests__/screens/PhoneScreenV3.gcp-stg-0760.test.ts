/**
 * GCP-STG-0760: PhoneScreenV3 "Not registered?" CTA
 */
describe("GCP-STG-0760: Phone not registered CTA", () => {
  const fs = require("fs");
  const phone = fs.readFileSync("src/screens/v3/PhoneScreenV3.tsx", "utf8");

  it("should track showRegisterCta state", () => {
    expect(phone).toContain("showRegisterCta");
    expect(phone).toContain("setShowRegisterCta");
  });

  it("should detect PHONE_NOT_REGISTERED error code", () => {
    expect(phone).toContain("PHONE_NOT_REGISTERED");
    expect(phone).toContain("setShowRegisterCta(true)");
  });

  it("should show registration CTA with testID", () => {
    expect(phone).toContain('testID="phone-register-cta"');
    expect(phone).toContain('testID="phone-register-cta-btn"');
  });

  it("should display helpful registration guidance text", () => {
    expect(phone).toContain("Phone not registered");
    expect(phone).toContain("Register your store online first");
    expect(phone).toContain("supermandi.tech/retailer/register");
  });

  it("should reset CTA when phone number changes", () => {
    expect(phone).toContain("setShowRegisterCta(false)");
    // Should be in onChangeText handler
    const changeTextIdx = phone.indexOf("onChangeText");
    const resetIdx = phone.indexOf("setShowRegisterCta(false)");
    expect(resetIdx).toBeGreaterThan(changeTextIdx);
  });

  it("should keep existing register link for discoverability", () => {
    expect(phone).toContain("New store?");
    expect(phone).toContain("Register here");
  });
});
