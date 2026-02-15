// Unit tests for backend/src/services/ipBlockingService.ts

// Mock the db/client before importing
jest.mock("../src/db/client", () => ({
  getPool: jest.fn(() => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
  })),
}));

import {
  checkIpBlocked,
  recordAuthFailure,
  clearIpFailures,
  getBlockedIpStats,
  checkIpBlockMiddleware,
} from "../src/services/ipBlockingService";

// Clean state between tests
afterEach(() => {
  clearIpFailures("test-ip-1");
  clearIpFailures("test-ip-2");
  clearIpFailures("test-ip-3");
  clearIpFailures("blocked-ip");
});

describe("checkIpBlocked", () => {
  it("returns blocked=false for unknown IPs", () => {
    const result = checkIpBlocked("new-ip-" + Date.now());
    expect(result.blocked).toBe(false);
  });

  it("returns blocked=false for IP that was cleared", () => {
    clearIpFailures("test-ip-1");
    const result = checkIpBlocked("test-ip-1");
    expect(result.blocked).toBe(false);
  });
});

describe("recordAuthFailure", () => {
  it("does not block on first failure", async () => {
    const ip = "first-fail-" + Date.now();
    const result = await recordAuthFailure(ip, "login_failed");
    expect(result.blocked).toBe(false);
    expect(result.attemptsRemaining).toBeDefined();
    expect(result.attemptsRemaining).toBeGreaterThan(0);
    clearIpFailures(ip);
  });

  it("blocks after 10 failures", async () => {
    const ip = "block-test-" + Date.now();
    for (let i = 0; i < 9; i++) {
      const r = await recordAuthFailure(ip, "login_failed");
      expect(r.blocked).toBe(false);
    }
    const final = await recordAuthFailure(ip, "login_failed");
    expect(final.blocked).toBe(true);
    expect(final.blockedUntil).toBeInstanceOf(Date);
    clearIpFailures(ip);
  });

  it("decrements attempts remaining correctly", async () => {
    const ip = "attempts-" + Date.now();
    const r1 = await recordAuthFailure(ip, "login_failed");
    expect(r1.attemptsRemaining).toBe(9);
    const r2 = await recordAuthFailure(ip, "login_failed");
    expect(r2.attemptsRemaining).toBe(8);
    clearIpFailures(ip);
  });

  it("supports different failure types", async () => {
    const ip = "types-" + Date.now();
    const r = await recordAuthFailure(ip, "otp_failed");
    expect(r.blocked).toBe(false);
    clearIpFailures(ip);
  });
});

describe("clearIpFailures", () => {
  it("clears failure tracking for an IP", async () => {
    const ip = "clear-test-" + Date.now();
    await recordAuthFailure(ip, "login_failed");
    clearIpFailures(ip);
    const result = checkIpBlocked(ip);
    expect(result.blocked).toBe(false);
  });
});

describe("getBlockedIpStats", () => {
  it("returns stats object with blockedCount and totalTracked", () => {
    const stats = getBlockedIpStats();
    expect(stats).toHaveProperty("blockedCount");
    expect(stats).toHaveProperty("totalTracked");
    expect(typeof stats.blockedCount).toBe("number");
    expect(typeof stats.totalTracked).toBe("number");
  });
});

describe("checkIpBlockMiddleware", () => {
  function mockReq(ip?: string): any {
    return {
      ip: ip || "127.0.0.1",
      socket: { remoteAddress: ip || "127.0.0.1" },
    };
  }

  function mockRes(): any {
    const res: any = {
      statusCode: 200,
      body: null,
      headers: {} as Record<string, string>,
    };
    res.status = jest.fn((code: number) => {
      res.statusCode = code;
      return res;
    });
    res.json = jest.fn((data: any) => {
      res.body = data;
      return res;
    });
    res.setHeader = jest.fn((name: string, value: string) => {
      res.headers[name] = value;
    });
    return res;
  }

  it("calls next() for non-blocked IPs", () => {
    const req = mockReq("clean-ip-" + Date.now());
    const res = mockRes();
    const next = jest.fn();
    checkIpBlockMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 429 for blocked IPs", async () => {
    const ip = "middleware-block-" + Date.now();
    // Block the IP
    for (let i = 0; i < 10; i++) {
      await recordAuthFailure(ip, "login_failed");
    }

    const req = mockReq(ip);
    const res = mockRes();
    const next = jest.fn();
    checkIpBlockMiddleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(429);
    expect(res.body.error.code).toBe("IP_BLOCKED");
    expect(res.setHeader).toHaveBeenCalledWith("Retry-After", expect.any(String));
    expect(next).not.toHaveBeenCalled();
    clearIpFailures(ip);
  });
});
