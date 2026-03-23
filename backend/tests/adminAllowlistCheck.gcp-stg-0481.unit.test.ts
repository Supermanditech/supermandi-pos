/**
 * GCP-STG-0481: Session invalidation on admin email change
 *
 * Behavioral test: verify that requireAdminToken middleware rejects
 * JWTs whose email is not in ADMIN_EMAIL_ALLOWLIST, and accepts
 * JWTs whose email IS in the allowlist.
 */

import jwt from "jsonwebtoken";

const TEST_SECRET = "test-jwt-secret-0481";
const TEST_ISSUER = "supermandi-auth";

// Set env vars BEFORE importing the middleware (module reads them at load time)
process.env.JWT_SECRET = TEST_SECRET;
process.env.ADMIN_TOKEN = "test-master-token";
// Only allow@example.com is in the allowlist
process.env.ADMIN_EMAIL_ALLOWLIST = "allow@example.com,other@example.com";

// Must import AFTER env setup
import { requireAdminToken } from "../src/middleware/adminToken";
import type { Request, Response, NextFunction } from "express";

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    header: function (name: string) {
      const lower = name.toLowerCase();
      return (this as any).headers[lower];
    },
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): { res: Response; getStatus: () => number; getBody: () => any } {
  let statusCode = 200;
  let body: any = null;
  const res = {
    status(code: number) {
      statusCode = code;
      return this;
    },
    json(data: any) {
      body = data;
      return this;
    },
  } as unknown as Response;
  return { res, getStatus: () => statusCode, getBody: () => body };
}

function signToken(email: string): string {
  return jwt.sign({ email, role: "super_admin", type: "admin" }, TEST_SECRET, {
    expiresIn: "1h",
    issuer: TEST_ISSUER,
    algorithm: "HS256",
  });
}

describe("GCP-STG-0481: Admin allowlist check in requireAdminToken", () => {
  test("rejects JWT with email NOT in allowlist (Bearer)", async () => {
    const token = signToken("revoked@example.com");
    const req = makeReq({
      headers: { authorization: `Bearer ${token}` } as any,
      header: function (name: string) {
        if (name.toLowerCase() === "authorization") return `Bearer ${token}`;
        return undefined;
      },
    } as any);
    const { res, getStatus, getBody } = makeRes();
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };

    await requireAdminToken(req, res, next);

    expect(nextCalled).toBe(false);
    expect(getStatus()).toBe(403);
    expect(getBody()?.error?.code).toBe("EMAIL_REVOKED");
  });

  test("accepts JWT with email IN allowlist (Bearer)", async () => {
    const token = signToken("allow@example.com");
    const req = makeReq({
      headers: { authorization: `Bearer ${token}` } as any,
      header: function (name: string) {
        if (name.toLowerCase() === "authorization") return `Bearer ${token}`;
        return undefined;
      },
    } as any);
    const { res } = makeRes();
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };

    await requireAdminToken(req, res, next);

    expect(nextCalled).toBe(true);
    expect(req.adminId).toBe("allow@example.com");
  });

  test("rejects JWT with email NOT in allowlist (cookie)", async () => {
    const token = signToken("removed@example.com");
    const req = makeReq({
      headers: { cookie: `admin_session=${token}` } as any,
      header: function () { return undefined; },
    } as any);
    const { res, getStatus } = makeRes();
    let nextCalled = false;
    const next: NextFunction = () => { nextCalled = true; };

    await requireAdminToken(req, res, next);

    expect(nextCalled).toBe(false);
    expect(getStatus()).toBe(403);
  });
});
