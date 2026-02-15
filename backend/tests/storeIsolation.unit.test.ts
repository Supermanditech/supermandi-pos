// Unit tests for backend/src/middleware/storeIsolation.ts — SECURITY-CRITICAL
import {
  enforceStoreIsolation,
  storeIsolation,
  strictStoreIsolation,
  validateStoreOwnership,
} from "../src/middleware/storeIsolation";

function mockReq(overrides: any = {}): any {
  return {
    path: "/api/products",
    method: "POST",
    body: {},
    query: {},
    params: {},
    headers: {},
    ...overrides,
  };
}

function mockRes(): any {
  const res: any = {
    statusCode: 200,
    body: null,
  };
  res.status = jest.fn((code: number) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((data: any) => {
    res.body = data;
    return res;
  });
  return res;
}

describe("enforceStoreIsolation (default / non-strict)", () => {
  const middleware = enforceStoreIsolation();

  it("calls next() when no storeId context (let auth handle)", () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("injects token storeId into body", () => {
    const req = mockReq({ storeId: "store-abc", body: { name: "product" } });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(req.body.store_id).toBe("store-abc");
    expect(next).toHaveBeenCalled();
  });

  it("strips client-provided store_id from body and replaces with token value", () => {
    const req = mockReq({
      storeId: "store-abc",
      body: { store_id: "store-evil", name: "product" },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(req.body.store_id).toBe("store-abc");
    expect(next).toHaveBeenCalled();
  });

  it("strips client-provided storeId from body", () => {
    const req = mockReq({
      storeId: "store-abc",
      body: { storeId: "store-evil", name: "product" },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    // storeId field should be deleted from body
    expect(req.body.storeId).toBeUndefined();
    // store_id should be set to token value
    expect(req.body.store_id).toBe("store-abc");
    expect(next).toHaveBeenCalled();
  });

  it("allows matching store_id in body (not stripped)", () => {
    const req = mockReq({
      storeId: "store-abc",
      body: { store_id: "store-abc", name: "product" },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(req.body.store_id).toBe("store-abc");
    expect(next).toHaveBeenCalled();
  });

  it("strips store_id from query params by default", () => {
    const req = mockReq({
      storeId: "store-abc",
      query: { store_id: "store-evil" },
      body: {},
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(req.query.store_id).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it("strips nested payload store_id", () => {
    const req = mockReq({
      storeId: "store-abc",
      body: { payload: { store_id: "store-evil", data: "ok" } },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(req.body.payload.store_id).toBeUndefined();
    expect(next).toHaveBeenCalled();
  });

  it("reads storeId from posDevice when not directly on req", () => {
    const req = mockReq({
      posDevice: { storeId: "device-store" },
      body: { name: "item" },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(req.body.store_id).toBe("device-store");
    expect(next).toHaveBeenCalled();
  });
});

describe("enforceStoreIsolation (strict mode)", () => {
  const middleware = enforceStoreIsolation({ strict: true });

  it("returns 403 when client tries to set store_id in body", () => {
    const req = mockReq({
      storeId: "store-abc",
      body: { store_id: "store-evil" },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error).toBe("STORE_ISOLATION_VIOLATION");
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when client tries to set storeId in body", () => {
    const req = mockReq({
      storeId: "store-abc",
      body: { storeId: "store-evil" },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when client tries to set store_id in query", () => {
    const req = mockReq({
      storeId: "store-abc",
      body: {},
      query: { store_id: "store-evil" },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 for nested payload store_id", () => {
    const req = mockReq({
      storeId: "store-abc",
      body: { payload: { store_id: "store-evil" } },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("allows request when no store_id in body (clean request)", () => {
    const req = mockReq({
      storeId: "store-abc",
      body: { name: "clean" },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(req.body.store_id).toBe("store-abc");
  });
});

describe("enforceStoreIsolation (allowQuery option)", () => {
  const middleware = enforceStoreIsolation({ allowQuery: true });

  it("does not strip store_id from query when allowQuery=true", () => {
    const req = mockReq({
      storeId: "store-abc",
      body: {},
      query: { store_id: "store-other" },
    });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    // allowQuery=true means query params are not checked
    expect(req.query.store_id).toBe("store-other");
    expect(next).toHaveBeenCalled();
  });
});

describe("storeIsolation (default export)", () => {
  it("is a middleware function", () => {
    expect(typeof storeIsolation).toBe("function");
  });
});

describe("strictStoreIsolation", () => {
  it("is a middleware function", () => {
    expect(typeof strictStoreIsolation).toBe("function");
  });
});

describe("validateStoreOwnership", () => {
  it("returns 401 when no token store context", () => {
    const req = mockReq({ params: { storeId: "store-abc" } });
    const res = mockRes();
    const next = jest.fn();
    validateStoreOwnership(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.body.error).toBe("STORE_CONTEXT_MISSING");
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 when param storeId does not match token", () => {
    const req = mockReq({
      storeId: "store-abc",
      params: { storeId: "store-other" },
    });
    const res = mockRes();
    const next = jest.fn();
    validateStoreOwnership(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error).toBe("FORBIDDEN");
    expect(next).not.toHaveBeenCalled();
  });

  it("calls next() when param storeId matches token", () => {
    const req = mockReq({
      storeId: "store-abc",
      params: { storeId: "store-abc" },
    });
    const res = mockRes();
    const next = jest.fn();
    validateStoreOwnership(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next() when no storeId in params (no param to check)", () => {
    const req = mockReq({
      storeId: "store-abc",
      params: {},
    });
    const res = mockRes();
    const next = jest.fn();
    validateStoreOwnership(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("checks store_id param (underscore variant)", () => {
    const req = mockReq({
      storeId: "store-abc",
      params: { store_id: "store-other" },
    });
    const res = mockRes();
    const next = jest.fn();
    validateStoreOwnership(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });
});
