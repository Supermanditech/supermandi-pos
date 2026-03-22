/**
 * GCP-STG-0308: POS OTP send-otp rate limiter
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/pos/otpAuth.ts"), "utf8"
);

describe("GCP-STG-0308: OTP send rate limiter", () => {
  test("imports redisRateLimit", () => {
    expect(SRC).toContain("import { redisRateLimit }");
  });

  test("creates otpSendLimiter with 5/min per IP", () => {
    expect(SRC).toContain("otpSendLimiter");
    expect(SRC).toContain("max: 5");
    expect(SRC).toContain("windowMs: 60_000");
  });

  test("otpSendLimiter is applied to send-otp route", () => {
    expect(SRC).toContain('"/auth/send-otp", otpSendLimiter');
  });

  test("uses req.ip as rate limit key", () => {
    expect(SRC).toContain("req.ip");
  });

  test("key prefix is specific to OTP send", () => {
    expect(SRC).toContain("rl:pos:otp:send");
  });
});
