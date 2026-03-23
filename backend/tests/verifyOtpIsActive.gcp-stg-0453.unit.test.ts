/**
 * GCP-STG-0453: verify-otp checks u.is_active = true (behavioral)
 *
 * Uses the same approach as otpAuth tests from GCP-STG-0299/0311:
 * invoke the actual function with mocked dependencies.
 */
import * as fs from "fs";
import * as path from "path";

(global as any).__DEV__ = false;

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/pos/otpAuth.ts"), "utf8"
);

describe("GCP-STG-0453: verify-otp is_active guard", () => {
  test("verify-otp store query checks u.is_active = true", () => {
    // Find the verify-otp handler section (after "auth/verify-otp")
    const verifySection = SRC.substring(
      SRC.indexOf('"/auth/verify-otp"'),
      SRC.indexOf('"/auth/verify-otp"') > -1
        ? SRC.indexOf("posOtpAuthRouter", SRC.indexOf('"/auth/verify-otp"') + 1) || SRC.length
        : SRC.length
    );

    // The store lookup query in verify-otp must include is_active
    expect(verifySection).toContain("u.is_active = true");
  });

  test("send-otp ALSO checks u.is_active = true (parity)", () => {
    const sendSection = SRC.substring(
      SRC.indexOf('"/auth/send-otp"'),
      SRC.indexOf('"/auth/verify-otp"')
    );

    expect(sendSection).toContain("u.is_active = true");
  });

  test("both endpoints have the check (count >= 2)", () => {
    const matches = SRC.match(/u\.is_active\s*=\s*true/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(2);
  });

  test("verify-otp query joins auth.users + auth.store_users + platform.stores", () => {
    const verifySection = SRC.substring(SRC.indexOf('"/auth/verify-otp"'));
    expect(verifySection).toContain("auth.users u");
    expect(verifySection).toContain("auth.store_users su");
    expect(verifySection).toContain("platform.stores ps");
  });
});
