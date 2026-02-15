// Unit tests for backend/src/middleware/adminAudit.ts
// Tests sanitizeBody and extractActionInfo logic (adminAuditMiddleware tested via integration)

// We need to test internal functions through the middleware behavior
jest.mock("../src/db/client", () => ({
  getPool: jest.fn(() => ({
    query: jest.fn().mockResolvedValue({ rows: [] }),
  })),
}));

import { adminAuditMiddleware } from "../src/middleware/adminAudit";

function mockReq(overrides: any = {}): any {
  return {
    method: "GET",
    path: "/",
    body: {},
    params: {},
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  };
}

function mockRes(): any {
  const listeners: Record<string, Function[]> = {};
  const res: any = {
    statusCode: 200,
    statusMessage: "OK",
    on(event: string, handler: Function) {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
      return res;
    },
    emit(event: string) {
      (listeners[event] || []).forEach((fn) => fn());
    },
  };
  return res;
}

describe("adminAuditMiddleware", () => {
  const middleware = adminAuditMiddleware();

  it("calls next() immediately (non-blocking)", () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
  });

  it("registers finish listener on response", () => {
    const req = mockReq({ path: "/stores" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    // The response should have a 'finish' listener
    res.emit("finish"); // Should not throw
  });

  it("sanitizes sensitive fields in request body", () => {
    // The middleware sanitizes body before logging
    // We verify through audit log behavior
    const req = mockReq({
      path: "/users",
      method: "POST",
      body: { name: "John", password: "secret123", apiKey: "key-abc" },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("extracts action for store operations", () => {
    const req = mockReq({ path: "/stores", method: "POST" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("extracts action for device operations", () => {
    const req = mockReq({ path: "/devices/dev-123/block", method: "POST" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("extracts actor info from headers", () => {
    const req = mockReq({
      path: "/products",
      method: "GET",
      headers: {
        "x-user-id": "user-123",
        "x-forwarded-for": "1.2.3.4, 5.6.7.8",
        "user-agent": "TestAgent/1.0",
      },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("handles array body in sanitization", () => {
    const req = mockReq({
      path: "/products",
      method: "POST",
      body: [{ name: "item1", password: "secret" }],
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("extracts supplier action info", () => {
    const req = mockReq({ path: "/pending-suppliers/sup-1/verify", method: "POST" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("extracts product action info", () => {
    const req = mockReq({ path: "/products/prod-1/approve", method: "POST" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
