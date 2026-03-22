/**
 * GCP-STG-0311: POS OTP send-otp blocks deactivated users
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/pos/otpAuth.ts"), "utf8"
);

describe("GCP-STG-0311: OTP blocks deactivated users", () => {
  test("send-otp query checks u.is_active = true", () => {
    expect(SRC).toContain("u.is_active = true");
  });

  test("send-otp query checks both store and user status", () => {
    // Must check BOTH ps.status = 'ACTIVE' AND u.is_active = true
    expect(SRC).toContain("ps.status = 'ACTIVE' AND u.is_active = true");
  });
});
