/**
 * GCP-STG-0311: POS OTP send-otp blocks deactivated users
 * Updated: u.is_active replaced with u.deleted_at IS NULL (auth.users has no is_active column)
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/pos/otpAuth.ts"), "utf8"
);

describe("GCP-STG-0311: OTP blocks deactivated users", () => {
  test("send-otp query filters out soft-deleted users", () => {
    expect(SRC).toContain("u.deleted_at IS NULL");
  });

  test("send-otp query checks both store status and user not deleted", () => {
    expect(SRC).toContain("ps.status = 'ACTIVE' AND u.deleted_at IS NULL");
  });
});
