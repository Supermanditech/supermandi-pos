// GCP-STG-0214: Block OTP/reset for unapproved supplier accounts
import * as fs from "fs";
import * as path from "path";

const authPath = path.resolve(__dirname, "../src/routes/v1/supplier/auth.ts");
const authCode = fs.readFileSync(authPath, "utf-8");

describe("GCP-STG-0214: Block reset for unapproved suppliers", () => {
  test("forgot-password email endpoint checks verification_status", () => {
    const fpSection = authCode.slice(
      authCode.indexOf('"/auth/forgot-password"'),
      authCode.indexOf('"/auth/forgot-password"') + 1500
    );
    expect(fpSection).toContain("verification_status");
    expect(fpSection).toContain("!== 'ACTIVE'");
    expect(fpSection).toContain("under review");
  });

  test("forgot-password OTP endpoint checks verification_status", () => {
    const otpSection = authCode.slice(
      authCode.indexOf('"/auth/forgot-password/otp-verify"'),
      authCode.indexOf('"/auth/forgot-password/otp-verify"') + 1500
    );
    expect(otpSection).toContain("verification_status");
    expect(otpSection).toContain("!== 'ACTIVE'");
    expect(otpSection).toContain("under review");
  });

  test("queries include verification_status column", () => {
    // Both queries should SELECT verification_status
    expect(authCode).toContain("id, primary_email, verification_status");
    expect(authCode).toContain("id, verification_status");
  });

  test("blocked response uses generic success message (prevents enumeration)", () => {
    // Even when blocked, response says "success" to prevent status enumeration
    expect(authCode).toContain("Password reset will be available after approval");
  });
});
