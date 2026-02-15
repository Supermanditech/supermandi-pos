// Unit tests for backend/src/middleware/limitedMode.ts

// Declare the global Express.Request.storeStatus that storeStatusGate.ts normally provides
declare global {
  namespace Express {
    interface Request {
      storeStatus?: import("../src/services/storeStateMachine").StoreStatusType;
    }
  }
}

// Mock the registrationGuard before importing limitedMode
jest.mock("../src/middleware/registrationGuard", () => ({
  REG_AUTH_ERRORS: {
    REGISTRATION_REQUIRED: {
      code: "REGISTRATION_REQUIRED",
      errorCode: "REG_AUTH_001",
      status: 403,
      message: "Registration required before login.",
    },
    LIMITED_MODE: {
      code: "LIMITED_MODE",
      errorCode: "REG_AUTH_002",
      status: 403,
      message: "Your account is pending approval. Limited access only.",
    },
  },
}));

import {
  requireActiveStatus,
  isLimitedMode,
  getLimitedModeInfo,
  setStatusFromStore,
  conditionalActiveStatus,
} from "../src/middleware/limitedMode";

function mockReq(overrides: any = {}): any {
  return {
    body: {},
    headers: {},
    params: {},
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

describe("requireActiveStatus", () => {
  it("calls next() when status is ACTIVE", () => {
    const middleware = requireActiveStatus();
    const req = mockReq({ applicationStatus: "ACTIVE" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("calls next() when storeStatus is active (lowercase)", () => {
    const middleware = requireActiveStatus();
    const req = mockReq({ storeStatus: "active" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("returns 403 REGISTRATION_REQUIRED when no status", () => {
    const middleware = requireActiveStatus();
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error.code).toBe("REGISTRATION_REQUIRED");
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 403 LIMITED_MODE when status is PENDING", () => {
    const middleware = requireActiveStatus();
    const req = mockReq({ applicationStatus: "PENDING" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.body.error.code).toBe("LIMITED_MODE");
    expect(next).not.toHaveBeenCalled();
  });

  it("includes currentStatus in error response", () => {
    const middleware = requireActiveStatus();
    const req = mockReq({ storeStatus: "DRAFT" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.body.error.currentStatus).toBe("DRAFT");
  });

  it("includes allowed and blocked actions in response", () => {
    const middleware = requireActiveStatus();
    const req = mockReq({ applicationStatus: "ENROLLED" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.body.error.allowedActions).toContain("VIEW_DASHBOARD");
    expect(res.body.error.blockedActions).toContain("SELL");
  });

  it("supports custom allowed statuses", () => {
    const middleware = requireActiveStatus({
      allowedStatuses: ["ACTIVE", "TRIAL"],
    });
    const req = mockReq({ applicationStatus: "TRIAL" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it("includes custom action name in error message", () => {
    const middleware = requireActiveStatus({ action: "create sales" });
    const req = mockReq({ applicationStatus: "DRAFT" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.body.error.message).toContain("create sales");
  });
});

describe("isLimitedMode", () => {
  it("returns false for undefined", () => {
    expect(isLimitedMode(undefined)).toBe(false);
  });

  it("returns false for ACTIVE", () => {
    expect(isLimitedMode("ACTIVE")).toBe(false);
  });

  it("returns false for active (lowercase)", () => {
    expect(isLimitedMode("active")).toBe(false);
  });

  it("returns true for DRAFT", () => {
    expect(isLimitedMode("DRAFT")).toBe(true);
  });

  it("returns true for ENROLLED", () => {
    expect(isLimitedMode("ENROLLED")).toBe(true);
  });

  it("returns true for PENDING", () => {
    expect(isLimitedMode("PENDING")).toBe(true);
  });

  it("returns true for SUSPENDED", () => {
    expect(isLimitedMode("SUSPENDED")).toBe(true);
  });
});

describe("getLimitedModeInfo", () => {
  it("returns full access for ACTIVE status", () => {
    const info = getLimitedModeInfo("ACTIVE");
    expect(info.isLimited).toBe(false);
    expect(info.message).toBe("Full access granted");
  });

  it("returns restricted info for non-ACTIVE status", () => {
    const info = getLimitedModeInfo("DRAFT");
    expect(info.isLimited).toBe(true);
    expect(info.currentStatus).toBe("DRAFT");
    expect(info.message).toContain("restricted");
  });

  it("includes allowed and blocked actions", () => {
    const info = getLimitedModeInfo("ENROLLED");
    expect(info.allowedActions).toContain("VIEW_DASHBOARD");
    expect(info.blockedActions).toContain("SELL");
  });
});

describe("setStatusFromStore", () => {
  it("sets storeStatus to ACTIVE when storeId exists but no status", () => {
    const req = mockReq({ storeId: "store-123" });
    const res = mockRes();
    const next = jest.fn();
    setStatusFromStore(req, res, next);
    expect(req.storeStatus).toBe("ACTIVE");
    expect(next).toHaveBeenCalled();
  });

  it("does not override existing storeStatus", () => {
    const req = mockReq({ storeId: "store-123", storeStatus: "DRAFT" });
    const res = mockRes();
    const next = jest.fn();
    setStatusFromStore(req, res, next);
    expect(req.storeStatus).toBe("DRAFT");
    expect(next).toHaveBeenCalled();
  });

  it("calls next() when no storeId", () => {
    const req = mockReq();
    const res = mockRes();
    const next = jest.fn();
    setStatusFromStore(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

describe("conditionalActiveStatus", () => {
  it("applies status check when condition returns true", () => {
    const middleware = conditionalActiveStatus(
      (req) => req.method === "POST",
      { action: "create" }
    );
    const req = mockReq({ method: "POST", applicationStatus: "DRAFT" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    expect(next).not.toHaveBeenCalled();
  });

  it("skips status check when condition returns false", () => {
    const middleware = conditionalActiveStatus(
      (req) => req.method === "POST",
      { action: "create" }
    );
    const req = mockReq({ method: "GET", applicationStatus: "DRAFT" });
    const res = mockRes();
    const next = jest.fn();
    middleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});
