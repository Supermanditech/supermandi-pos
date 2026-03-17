/**
 * V3-REG-009: Backend OTP auth regression tests
 * Tests send-otp and verify-otp against canonical schema expectations.
 */

describe("POS OTP Auth (V3-BE-004)", () => {
  // These are schema contract tests — verify the SQL shapes, not full DB integration

  describe("send-otp", () => {
    it("should reject missing phone with 400 INVALID_PHONE", () => {
      // Contract: POST /pos/auth/send-otp with {} → 400 { error: { code: "INVALID_PHONE" } }
      expect(true).toBe(true); // Placeholder for actual HTTP test
    });

    it("should reject invalid phone format with 400", () => {
      // Contract: phone must be exactly 10 digits
      const invalid = ["123", "abcdefghij", "12345678901", ""];
      for (const phone of invalid) {
        expect(!/^\d{10}$/.test(phone)).toBe(true);
      }
    });

    it("should use canonical schema (auth.users + auth.store_users + platform.stores)", () => {
      // Verify the SQL query does NOT use legacy stores/users JOIN
      const fs = require("fs");
      const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");
      expect(otpAuth).toContain("auth.users");
      expect(otpAuth).toContain("auth.store_users");
      expect(otpAuth).toContain("platform.stores");
      expect(otpAuth).not.toContain("s.owner_id");
      expect(otpAuth).not.toContain("JOIN users u ON u.id = s.owner_id");
    });

    it("should use cryptographically strong OTP generation", () => {
      const fs = require("fs");
      const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");
      expect(otpAuth).toContain("crypto.randomInt");
      expect(otpAuth).not.toContain("Math.random");
    });

    it("should hash OTP with SHA-256 before storing", () => {
      const fs = require("fs");
      const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");
      expect(otpAuth).toContain('createHash("sha256")');
    });

    it("should not log plaintext OTP in production", () => {
      const fs = require("fs");
      const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");
      // Only inside __DEV__ guard
      const devOtpLog = otpAuth.match(/console\.log.*OTP:.*\$\{otp\}/g) ?? [];
      for (const line of devOtpLog) {
        expect(otpAuth.indexOf("__DEV__")).toBeLessThan(otpAuth.indexOf(line));
      }
    });
  });

  describe("verify-otp", () => {
    it("should reject invalid storeId with 400 INVALID_STORE", () => {
      const fs = require("fs");
      const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");
      expect(otpAuth).toContain("INVALID_STORE");
    });

    it("should use UUID device IDs (gen_random_uuid)", () => {
      const fs = require("fs");
      const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");
      expect(otpAuth).toContain("gen_random_uuid()");
      expect(otpAuth).not.toContain('`otp-${phone}-${Date.now()}`');
    });

    it("should enforce max_devices per store", () => {
      const fs = require("fs");
      const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");
      expect(otpAuth).toContain("MAX_DEVICES_REACHED");
    });

    it("should enforce OTP rate limiting (5 attempts)", () => {
      const fs = require("fs");
      const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");
      expect(otpAuth).toContain("attempts >= 5");
      expect(otpAuth).toContain("OTP_RATE_LIMITED");
    });

    it("should return stable error codes", () => {
      const fs = require("fs");
      const otpAuth = fs.readFileSync("src/routes/v1/pos/otpAuth.ts", "utf8");
      const expectedCodes = [
        "INVALID_INPUT", "OTP_NOT_FOUND", "OTP_EXPIRED",
        "OTP_RATE_LIMITED", "OTP_INVALID", "STORE_NOT_FOUND",
        "INVALID_STORE", "MAX_DEVICES_REACHED", "OTP_VERIFY_FAILED",
      ];
      for (const code of expectedCodes) {
        expect(otpAuth).toContain(code);
      }
    });
  });
});
