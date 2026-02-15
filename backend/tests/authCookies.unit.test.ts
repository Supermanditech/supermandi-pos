// Unit tests for backend/src/utils/authCookies.ts
import {
  setAuthCookies,
  clearAuthCookies,
  getRefreshTokenFromRequest,
} from "../src/utils/authCookies";

function mockResponse() {
  const cookies: Array<{ name: string; value: string; options: any }> = [];
  const cleared: Array<{ name: string; options: any }> = [];
  return {
    cookies,
    cleared,
    cookie(name: string, value: string, options: any) {
      cookies.push({ name, value, options });
    },
    clearCookie(name: string, options: any) {
      cleared.push({ name, options });
    },
  } as any;
}

function mockRequest(overrides: any = {}) {
  return {
    body: {},
    headers: {},
    ...overrides,
  } as any;
}

describe("setAuthCookies", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "development" };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("sets three cookies: access, refresh, and auth indicator", () => {
    const res = mockResponse();
    setAuthCookies(res, "access-token", "refresh-token", 900, 86400);
    expect(res.cookies.length).toBe(3);
  });

  it("sets sm_access_token as HttpOnly", () => {
    const res = mockResponse();
    setAuthCookies(res, "at", "rt", 900, 86400);
    const accessCookie = res.cookies.find((c: any) => c.name === "sm_access_token");
    expect(accessCookie).toBeDefined();
    expect(accessCookie!.options.httpOnly).toBe(true);
    expect(accessCookie!.options.path).toBe("/api");
    expect(accessCookie!.value).toBe("at");
  });

  it("sets sm_refresh_token as HttpOnly", () => {
    const res = mockResponse();
    setAuthCookies(res, "at", "rt", 900, 86400);
    const refreshCookie = res.cookies.find((c: any) => c.name === "sm_refresh_token");
    expect(refreshCookie).toBeDefined();
    expect(refreshCookie!.options.httpOnly).toBe(true);
    expect(refreshCookie!.options.path).toBe("/api");
    expect(refreshCookie!.value).toBe("rt");
  });

  it("sets sm_auth indicator as NOT HttpOnly (JS-readable)", () => {
    const res = mockResponse();
    setAuthCookies(res, "at", "rt", 900, 86400);
    const authIndicator = res.cookies.find((c: any) => c.name === "sm_auth");
    expect(authIndicator).toBeDefined();
    expect(authIndicator!.options.httpOnly).toBe(false);
    expect(authIndicator!.options.path).toBe("/");
    expect(authIndicator!.value).toBe("1");
  });

  it("calculates maxAge in milliseconds (sec * 1000)", () => {
    const res = mockResponse();
    setAuthCookies(res, "at", "rt", 900, 86400);
    const accessCookie = res.cookies.find((c: any) => c.name === "sm_access_token");
    expect(accessCookie!.options.maxAge).toBe(900_000);
    const refreshCookie = res.cookies.find((c: any) => c.name === "sm_refresh_token");
    expect(refreshCookie!.options.maxAge).toBe(86400_000);
  });

  it("sets secure=false in development", () => {
    process.env.NODE_ENV = "development";
    const res = mockResponse();
    setAuthCookies(res, "at", "rt", 900, 86400);
    expect(res.cookies[0].options.secure).toBe(false);
  });

  it("sets secure=true in production", () => {
    process.env.NODE_ENV = "production";
    const res = mockResponse();
    setAuthCookies(res, "at", "rt", 900, 86400);
    expect(res.cookies[0].options.secure).toBe(true);
  });

  it("sets secure=true when COOKIE_SECURE=true", () => {
    process.env.NODE_ENV = "development";
    process.env.COOKIE_SECURE = "true";
    const res = mockResponse();
    setAuthCookies(res, "at", "rt", 900, 86400);
    expect(res.cookies[0].options.secure).toBe(true);
    delete process.env.COOKIE_SECURE;
  });

  it("uses sameSite=lax", () => {
    const res = mockResponse();
    setAuthCookies(res, "at", "rt", 900, 86400);
    expect(res.cookies[0].options.sameSite).toBe("lax");
  });

  it("includes domain when COOKIE_DOMAIN is set", () => {
    process.env.COOKIE_DOMAIN = ".supermandi.com";
    const res = mockResponse();
    setAuthCookies(res, "at", "rt", 900, 86400);
    expect(res.cookies[0].options.domain).toBe(".supermandi.com");
    delete process.env.COOKIE_DOMAIN;
  });
});

describe("clearAuthCookies", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "development" };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("clears all three cookies", () => {
    const res = mockResponse();
    clearAuthCookies(res);
    expect(res.cleared.length).toBe(3);
    const names = res.cleared.map((c: any) => c.name);
    expect(names).toContain("sm_access_token");
    expect(names).toContain("sm_refresh_token");
    expect(names).toContain("sm_auth");
  });

  it("clears access/refresh cookies with /api path", () => {
    const res = mockResponse();
    clearAuthCookies(res);
    const access = res.cleared.find((c: any) => c.name === "sm_access_token");
    expect(access!.options.path).toBe("/api");
  });

  it("clears auth indicator with / path", () => {
    const res = mockResponse();
    clearAuthCookies(res);
    const auth = res.cleared.find((c: any) => c.name === "sm_auth");
    expect(auth!.options.path).toBe("/");
  });
});

describe("getRefreshTokenFromRequest", () => {
  it("returns token from request body (preferred)", () => {
    const req = mockRequest({ body: { refreshToken: "body-token" } });
    expect(getRefreshTokenFromRequest(req)).toBe("body-token");
  });

  it("returns token from cookie header (fallback)", () => {
    const req = mockRequest({
      body: {},
      headers: { cookie: "sm_refresh_token=cookie-token" },
    });
    expect(getRefreshTokenFromRequest(req)).toBe("cookie-token");
  });

  it("prefers body over cookie", () => {
    const req = mockRequest({
      body: { refreshToken: "body-token" },
      headers: { cookie: "sm_refresh_token=cookie-token" },
    });
    expect(getRefreshTokenFromRequest(req)).toBe("body-token");
  });

  it("returns undefined when no token available", () => {
    const req = mockRequest({ body: {}, headers: {} });
    expect(getRefreshTokenFromRequest(req)).toBeUndefined();
  });

  it("returns undefined when cookie header has no refresh token", () => {
    const req = mockRequest({
      body: {},
      headers: { cookie: "sm_auth=1; other=value" },
    });
    expect(getRefreshTokenFromRequest(req)).toBeUndefined();
  });

  it("handles URL-encoded cookie values", () => {
    const encoded = encodeURIComponent("token+with/special=chars");
    const req = mockRequest({
      body: {},
      headers: { cookie: `sm_refresh_token=${encoded}` },
    });
    expect(getRefreshTokenFromRequest(req)).toBe("token+with/special=chars");
  });

  it("parses cookie from multi-cookie header", () => {
    const req = mockRequest({
      body: {},
      headers: { cookie: "sm_auth=1; sm_refresh_token=found; other=x" },
    });
    expect(getRefreshTokenFromRequest(req)).toBe("found");
  });
});
