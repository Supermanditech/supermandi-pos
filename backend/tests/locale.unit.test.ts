// Unit tests for backend/src/middleware/locale.ts

// Mock the translationService
jest.mock("../src/services/translationService", () => ({
  isLocaleSupported: (locale: string) => ["en", "hi"].includes(locale),
}));

import { localeMiddleware, getRequestLocale } from "../src/middleware/locale";

function mockReq(headers: Record<string, string> = {}): any {
  return { headers, locale: undefined as any };
}

function mockRes(): any {
  return {};
}

describe("localeMiddleware", () => {
  it("sets locale to en when no Accept-Language header", () => {
    const req = mockReq();
    const next = jest.fn();
    localeMiddleware(req, mockRes(), next);
    expect(req.locale).toBe("en");
    expect(next).toHaveBeenCalled();
  });

  it("sets locale to hi for Hindi Accept-Language", () => {
    const req = mockReq({ "accept-language": "hi-IN,hi;q=0.9,en;q=0.8" });
    const next = jest.fn();
    localeMiddleware(req, mockRes(), next);
    expect(req.locale).toBe("hi");
  });

  it("sets locale to en for English Accept-Language", () => {
    const req = mockReq({ "accept-language": "en-US,en;q=0.9" });
    const next = jest.fn();
    localeMiddleware(req, mockRes(), next);
    expect(req.locale).toBe("en");
  });

  it("defaults to en for unsupported language", () => {
    const req = mockReq({ "accept-language": "fr,de" });
    const next = jest.fn();
    localeMiddleware(req, mockRes(), next);
    expect(req.locale).toBe("en");
  });

  it("respects quality values (highest first)", () => {
    // hi has higher quality than en
    const req = mockReq({
      "accept-language": "en;q=0.5,hi;q=0.9",
    });
    const next = jest.fn();
    localeMiddleware(req, mockRes(), next);
    expect(req.locale).toBe("hi");
  });

  it("extracts primary language from locale tag", () => {
    // "hi-IN" -> "hi"
    const req = mockReq({ "accept-language": "hi-IN" });
    const next = jest.fn();
    localeMiddleware(req, mockRes(), next);
    expect(req.locale).toBe("hi");
  });

  it("handles quality=1 as default", () => {
    const req = mockReq({ "accept-language": "hi" });
    const next = jest.fn();
    localeMiddleware(req, mockRes(), next);
    expect(req.locale).toBe("hi");
  });

  it("always calls next()", () => {
    const req = mockReq({ "accept-language": "invalid" });
    const next = jest.fn();
    localeMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("getRequestLocale", () => {
  it("returns req.locale when set", () => {
    const req = mockReq();
    req.locale = "hi";
    expect(getRequestLocale(req)).toBe("hi");
  });

  it("falls back to en when no locale", () => {
    const req = mockReq();
    // locale is undefined
    expect(getRequestLocale(req)).toBe("en");
  });
});
