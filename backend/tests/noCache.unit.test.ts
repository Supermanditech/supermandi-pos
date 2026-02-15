// Unit tests for backend/src/middleware/noCache.ts
import { noCacheHeaders } from "../src/middleware/noCache";

function mockRes(): any {
  const headers: Record<string, string> = {};
  return {
    _headers: headers,
    set(name: string, value: string) {
      headers[name] = value;
    },
  };
}

describe("noCacheHeaders", () => {
  it("sets Cache-Control to no-store, max-age=0", () => {
    const res = mockRes();
    const next = jest.fn();
    noCacheHeaders({} as any, res, next);
    expect(res._headers["Cache-Control"]).toBe("no-store, max-age=0");
  });

  it("sets Pragma to no-cache", () => {
    const res = mockRes();
    const next = jest.fn();
    noCacheHeaders({} as any, res, next);
    expect(res._headers["Pragma"]).toBe("no-cache");
  });

  it("sets Expires to 0", () => {
    const res = mockRes();
    const next = jest.fn();
    noCacheHeaders({} as any, res, next);
    expect(res._headers["Expires"]).toBe("0");
  });

  it("calls next()", () => {
    const res = mockRes();
    const next = jest.fn();
    noCacheHeaders({} as any, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
