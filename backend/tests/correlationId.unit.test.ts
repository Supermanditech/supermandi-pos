// Unit tests for backend/src/middleware/correlationId.ts
import { correlationIdMiddleware } from "../src/middleware/correlationId";

function mockReq(headers: Record<string, string> = {}): any {
  return { headers, correlationId: undefined };
}

function mockRes(): any {
  const resHeaders: Record<string, string> = {};
  return {
    setHeader(name: string, value: string) {
      resHeaders[name] = value;
    },
    getHeader(name: string) {
      return resHeaders[name];
    },
    _headers: resHeaders,
  };
}

describe("correlationIdMiddleware", () => {
  it("uses X-Request-Id header when present", () => {
    const req = mockReq({ "x-request-id": "req-123" });
    const res = mockRes();
    const next = jest.fn();
    correlationIdMiddleware(req, res, next);
    expect(req.correlationId).toBe("req-123");
    expect(res._headers["X-Request-Id"]).toBe("req-123");
    expect(next).toHaveBeenCalled();
  });

  it("extracts trace ID from X-Cloud-Trace-Context", () => {
    const req = mockReq({
      "x-cloud-trace-context": "traceid123/spanid456;o=1",
    });
    const res = mockRes();
    const next = jest.fn();
    correlationIdMiddleware(req, res, next);
    expect(req.correlationId).toBe("traceid123");
    expect(res._headers["X-Request-Id"]).toBe("traceid123");
    expect(next).toHaveBeenCalled();
  });

  it("handles X-Cloud-Trace-Context without slash", () => {
    const req = mockReq({
      "x-cloud-trace-context": "onlytraceid",
    });
    const res = mockRes();
    const next = jest.fn();
    correlationIdMiddleware(req, res, next);
    expect(req.correlationId).toBe("onlytraceid");
  });

  it("generates UUID when no tracing headers present", () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    correlationIdMiddleware(req, res, next);
    expect(req.correlationId).toBeDefined();
    expect(typeof req.correlationId).toBe("string");
    // UUID v4 pattern
    expect(req.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/
    );
    expect(next).toHaveBeenCalled();
  });

  it("prefers X-Request-Id over X-Cloud-Trace-Context", () => {
    const req = mockReq({
      "x-request-id": "preferred-id",
      "x-cloud-trace-context": "trace-id/span-id;o=1",
    });
    const res = mockRes();
    const next = jest.fn();
    correlationIdMiddleware(req, res, next);
    expect(req.correlationId).toBe("preferred-id");
  });

  it("sets X-Request-Id response header", () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    correlationIdMiddleware(req, res, next);
    expect(res._headers["X-Request-Id"]).toBeDefined();
  });

  it("always calls next()", () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    correlationIdMiddleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });
});
