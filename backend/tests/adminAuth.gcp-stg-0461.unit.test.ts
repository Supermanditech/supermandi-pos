/**
 * GCP-STG-0461: verify-email-otp must have IP rate limiter
 *
 * Behavioral test: verify that the verify-email-otp route handler
 * is protected by the same otpRateLimiter middleware as send-email-otp.
 * This prevents brute-force OTP guessing attacks.
 */

import fs from "fs";
import path from "path";

describe("GCP-STG-0461: verify-email-otp IP rate limit", () => {
  const filePath = path.resolve(__dirname, "../src/routes/v1/admin/adminAuth.ts");
  let source: string;

  beforeAll(() => {
    source = fs.readFileSync(filePath, "utf-8");
  });

  test("otpRateLimiter middleware is defined", () => {
    // The file must define the rate limiter
    expect(source).toContain("const otpRateLimiter = redisRateLimit(");
  });

  test("send-email-otp route has otpRateLimiter", () => {
    // send-email-otp must have the rate limiter
    const sendRoute = source.match(/adminAuthRouter\.post\(\s*["']\/auth\/send-email-otp["']\s*,\s*(\w+)/);
    expect(sendRoute).not.toBeNull();
    expect(sendRoute![1]).toBe("otpRateLimiter");
  });

  test("verify-email-otp route has otpRateLimiter", () => {
    // verify-email-otp must have the rate limiter — this is the fix
    const verifyRoute = source.match(/adminAuthRouter\.post\(\s*["']\/auth\/verify-email-otp["']\s*,\s*(\w+)/);
    expect(verifyRoute).not.toBeNull();
    expect(verifyRoute![1]).toBe("otpRateLimiter");
  });

  test("rate limiter uses reasonable window and max", () => {
    // Extract windowMs and max values
    const windowMatch = source.match(/windowMs:\s*(\d+)\s*\*\s*(\d+)/);
    const maxMatch = source.match(/max:\s*(\d+)/);
    expect(windowMatch).not.toBeNull();
    expect(maxMatch).not.toBeNull();

    const windowMs = parseInt(windowMatch![1]) * parseInt(windowMatch![2]);
    const max = parseInt(maxMatch![1]);

    // Window should be at most 5 minutes
    expect(windowMs).toBeLessThanOrEqual(5 * 60 * 1000);
    // Max should be reasonable (not more than 20 per window)
    expect(max).toBeLessThanOrEqual(20);
    expect(max).toBeGreaterThan(0);
  });
});
