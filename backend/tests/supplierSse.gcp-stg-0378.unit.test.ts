/**
 * GCP-STG-0378: Supplier SSE Route — Unit Tests
 *
 * Verifies:
 * 1. Route module exports supplierSseRouter
 * 2. Router has GET /events/stream route registered
 * 3. Handler sets SSE headers and calls registerSupplierSseClient
 * 4. Missing supplierId returns 400
 * 5. Cleanup fires on connection close
 */

// Mock sseService before importing route
const mockCleanup = jest.fn();
jest.mock("../src/services/sseService", () => ({
  registerSupplierSseClient: jest.fn(() => mockCleanup),
}));

// Mock logger
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

// Mock auth middleware — pass-through that sets supplierId
jest.mock("../src/routes/v1/supplier/auth", () => ({
  requireSupplierAuth: (req: any, _res: any, next: any) => {
    // supplierId set by caller for test control
    next();
  },
  SupplierAuthRequest: {},
}));

import { supplierSseRouter } from "../src/routes/v1/supplier/sseEvents";
import { registerSupplierSseClient } from "../src/services/sseService";

// Helper: find matching route layer
function findRoute(router: any, method: string, path: string): any {
  const stack = router.stack || [];
  return stack.find((layer: any) => {
    if (!layer.route) return false;
    return (
      layer.route.path === path &&
      layer.route.methods[method.toLowerCase()]
    );
  });
}

// Mock Express req/res
function createMockReq(supplierId?: string): any {
  const listeners: Record<string, Function[]> = {};
  return {
    supplierId,
    headers: { authorization: "Bearer test-token" },
    on: jest.fn((event: string, handler: Function) => {
      if (!listeners[event]) listeners[event] = [];
      listeners[event].push(handler);
    }),
    _listeners: listeners,
  };
}

function createMockRes(): any {
  const headers: Record<string, string> = {};
  return {
    setHeader: jest.fn((k: string, v: string) => { headers[k] = v; }),
    flushHeaders: jest.fn(),
    write: jest.fn(() => true),
    status: jest.fn(function (this: any) { return this; }),
    json: jest.fn(),
    _headers: headers,
  };
}

describe("GCP-STG-0378: Supplier SSE Route", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("exports supplierSseRouter", () => {
    expect(supplierSseRouter).toBeDefined();
    expect(typeof supplierSseRouter).toBe("function"); // Express Router is a function
  });

  it("has GET /events/stream route", () => {
    const layer = findRoute(supplierSseRouter, "get", "/events/stream");
    expect(layer).toBeDefined();
  });

  it("sets SSE headers and registers client when supplierId present", () => {
    const layer = findRoute(supplierSseRouter, "get", "/events/stream");
    expect(layer).toBeDefined();

    const req = createMockReq("supplier-test-378");
    const res = createMockRes();

    // The route stack has [requireSupplierAuth, handler] — call the last handler directly
    const handlers = layer.route.stack;
    const sseHandler = handlers[handlers.length - 1].handle;
    sseHandler(req, res);

    // Verify SSE headers
    expect(res.setHeader).toHaveBeenCalledWith("Content-Type", "text/event-stream");
    expect(res.setHeader).toHaveBeenCalledWith("Cache-Control", "no-cache");
    expect(res.setHeader).toHaveBeenCalledWith("Connection", "keep-alive");
    expect(res.setHeader).toHaveBeenCalledWith("X-Accel-Buffering", "no");
    expect(res.flushHeaders).toHaveBeenCalled();

    // Verify registerSupplierSseClient called
    expect(registerSupplierSseClient).toHaveBeenCalledWith("supplier-test-378", res);

    // Verify connected event sent
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining("event: connected")
    );
    expect(res.write).toHaveBeenCalledWith(
      expect.stringContaining('"supplierId":"supplier-test-378"')
    );

    // Verify cleanup wired to close/error
    expect(req.on).toHaveBeenCalledWith("close", mockCleanup);
    expect(req.on).toHaveBeenCalledWith("error", mockCleanup);
  });

  it("returns 400 when supplierId is missing", () => {
    const layer = findRoute(supplierSseRouter, "get", "/events/stream");
    const req = createMockReq(undefined); // no supplierId
    const res = createMockRes();

    const handlers = layer.route.stack;
    const sseHandler = handlers[handlers.length - 1].handle;
    sseHandler(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ error: "Supplier context required" });
    expect(registerSupplierSseClient).not.toHaveBeenCalled();
  });
});
