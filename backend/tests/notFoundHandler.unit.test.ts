// Unit tests for backend/src/middleware/notFoundHandler.ts
import { notFoundHandler } from "../src/middleware/notFoundHandler";

function mockReq(method: string, originalUrl: string): any {
  return { method, originalUrl };
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

describe("notFoundHandler", () => {
  it("returns 404 status code", () => {
    const req = mockReq("GET", "/api/nonexistent");
    const res = mockRes();
    notFoundHandler(req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it("returns standardized error format with NOT_FOUND code", () => {
    const req = mockReq("GET", "/api/nonexistent");
    const res = mockRes();
    notFoundHandler(req, res, jest.fn());
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("includes method in error message", () => {
    const req = mockReq("POST", "/api/missing");
    const res = mockRes();
    notFoundHandler(req, res, jest.fn());
    expect(res.body.error.message).toContain("POST");
    expect(res.body.error.message).toContain("/api/missing");
  });

  it("includes path in response", () => {
    const req = mockReq("GET", "/api/v1/users/123");
    const res = mockRes();
    notFoundHandler(req, res, jest.fn());
    expect(res.body.error.path).toBe("/api/v1/users/123");
    expect(res.body.error.method).toBe("GET");
  });

  it("handles different HTTP methods", () => {
    for (const method of ["GET", "POST", "PUT", "DELETE", "PATCH"]) {
      const req = mockReq(method, "/test");
      const res = mockRes();
      notFoundHandler(req, res, jest.fn());
      expect(res.body.error.message).toContain(method);
    }
  });
});
