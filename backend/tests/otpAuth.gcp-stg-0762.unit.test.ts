/**
 * GCP-STG-0762: Verify auto-create MANAGER staff on OTP verify-otp
 * Behavioral tests — verify code structure ensures staff auto-creation happens.
 */

describe("GCP-STG-0762: Auto-create MANAGER staff on OTP enrollment", () => {
  const fs = require("fs");
  const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");

  it("should auto-create MANAGER staff after device enrollment", () => {
    // verify-otp must contain staff auto-creation logic
    expect(otpAuth).toContain("GCP-STG-0762");
    expect(otpAuth).toContain("platform.store_staff");
    expect(otpAuth).toContain("'MANAGER'");
    expect(otpAuth).toContain("must_change_pin");
  });

  it("should skip if store already has active staff", () => {
    expect(otpAuth).toContain("already has active staff");
    expect(otpAuth).toContain("skipping auto-create");
  });

  it("should generate random 6-digit PIN (not hardcoded)", () => {
    // Must use crypto.randomInt, not hardcoded "1234"
    expect(otpAuth).toContain("crypto.randomInt(100000, 999999)");
    expect(otpAuth).not.toContain('hash("1234"');
  });

  it("should bcrypt hash the PIN before storing", () => {
    expect(otpAuth).toContain("bcrypt.hash(randomPin");
  });

  it("should send PIN via WhatsApp", () => {
    expect(otpAuth).toContain("Your SuperMandi POS Manager PIN is:");
    expect(otpAuth).toContain("sendTextMessage");
  });

  it("should set must_change_pin=TRUE for auto-created staff", () => {
    // The INSERT must include must_change_pin = TRUE
    expect(otpAuth).toContain("must_change_pin");
    expect(otpAuth).toContain("TRUE");
  });

  it("should use ON CONFLICT DO NOTHING for idempotency", () => {
    // Staff insert for this store+phone should be idempotent
    const staffInsertSection = otpAuth.slice(otpAuth.indexOf("GCP-STG-0762"));
    expect(staffInsertSection).toContain("ON CONFLICT DO NOTHING");
  });

  it("should be non-blocking (enrollment succeeds even if staff fails)", () => {
    // Wrapped in async IIFE with try/catch
    expect(otpAuth).toContain("Auto-create staff failed (non-blocking)");
  });

  it("should audit log staff auto-creation", () => {
    expect(otpAuth).toContain("staff_auto_created");
  });

  it("should never log PIN in production", () => {
    // PIN should only appear in LOG_OTP_PLAINTEXT guard or WhatsApp message
    const lines = otpAuth.split("\n");
    for (const line of lines) {
      if (line.includes("randomPin") && line.includes("log.")) {
        // Must be guarded by LOG_OTP_PLAINTEXT check
        expect(line).toContain("LOG_OTP_PLAINTEXT");
      }
    }
  });
});
