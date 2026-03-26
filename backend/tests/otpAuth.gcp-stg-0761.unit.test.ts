/**
 * GCP-STG-0761: OTP WhatsApp message updated for POS login context
 */
describe("GCP-STG-0761: OTP message POS context", () => {
  const fs = require("fs");
  const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");

  it("should mention POS login in OTP message", () => {
    expect(otpAuth).toContain("POS login OTP");
  });

  it("should include validity period", () => {
    expect(otpAuth).toContain("Valid for 5 minutes");
  });

  it("should warn not to share", () => {
    expect(otpAuth).toContain("Do not share this code");
  });
});
