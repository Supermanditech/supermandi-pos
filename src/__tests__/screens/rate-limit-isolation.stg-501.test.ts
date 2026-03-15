/**
 * STG-501: Enrollment rate limiters — isolated burst vs sustained keys
 *
 * Verifies that the burst and sustained rate limiters use separate
 * keyPrefix values so their Redis sorted sets don't interfere.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const enrollPath = path.resolve(
  __dirname,
  "../../../backend/src/routes/v1/pos/enroll.ts"
);
const rateLimitPath = path.resolve(
  __dirname,
  "../../../backend/src/middleware/rateLimit.ts"
);

describe("STG-501: Rate limiter isolation via keyPrefix", () => {
  const enroll = fs.readFileSync(enrollPath, "utf-8");
  const rateLimit = fs.readFileSync(rateLimitPath, "utf-8");

  test("RedisRateLimitOptions has keyPrefix field", () => {
    expect(rateLimit).toContain("keyPrefix?: string");
  });

  test("rate limiter applies keyPrefix to Redis key", () => {
    expect(rateLimit).toContain(
      '`${opts.keyPrefix}:${keyGen(req)}`'
    );
  });

  test("burst limiter has enroll-burst prefix", () => {
    expect(enroll).toContain('keyPrefix: "enroll-burst"');
  });

  test("sustained limiter has enroll-sustained prefix", () => {
    expect(enroll).toContain('keyPrefix: "enroll-sustained"');
  });

  test("burst and sustained use different prefixes", () => {
    const burstMatch = enroll.match(/keyPrefix:\s*"([^"]+)"/g);
    expect(burstMatch).toBeTruthy();
    expect(burstMatch!.length).toBeGreaterThanOrEqual(2);
    // Verify they're different
    const prefixes = burstMatch!.map((m) => m.match(/"([^"]+)"/)?.[1]);
    const uniquePrefixes = new Set(prefixes);
    expect(uniquePrefixes.size).toBe(prefixes.length);
  });
});
