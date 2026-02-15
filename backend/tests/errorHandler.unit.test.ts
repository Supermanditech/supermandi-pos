// Unit tests for backend/src/middleware/errorHandler.ts
import { errorHandler } from "../src/middleware/errorHandler";
import { HttpError } from "../src/lib/httpError";

function mockReq(): any {
  return {};
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

const next = jest.fn();

describe("errorHandler", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test" };
    jest.spyOn(console, "error").mockImplementation(() => {});
    jest.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it("handles HttpError with correct status code and message", () => {
    const err = new HttpError(400, "Bad input");
    const res = mockRes();
    errorHandler(err, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.body).toEqual({ error: "Bad input", details: undefined });
  });

  it("includes details from HttpError when provided", () => {
    const err = new HttpError(422, "Validation failed", { field: "email" });
    const res = mockRes();
    errorHandler(err, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.body.details).toEqual({ field: "email" });
  });

  it("handles PostgreSQL unique_violation (23505) as 409 Conflict", () => {
    const pgErr: any = new Error("duplicate");
    pgErr.code = "23505";
    pgErr.constraint = "uk_stores_phone";
    const res = mockRes();
    errorHandler(pgErr, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.error).toBe("PHONE_EXISTS");
  });

  it("handles unknown PG constraint with generic DUPLICATE_ENTRY", () => {
    const pgErr: any = new Error("duplicate");
    pgErr.code = "23505";
    pgErr.constraint = "some_unknown_constraint";
    const res = mockRes();
    errorHandler(pgErr, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.body.error).toBe("DUPLICATE_ENTRY");
  });

  it("maps GSTIN constraint to GSTIN_EXISTS", () => {
    const pgErr: any = new Error("dup");
    pgErr.code = "23505";
    pgErr.constraint = "ux_stores_gstin";
    const res = mockRes();
    errorHandler(pgErr, mockReq(), res, next);
    expect(res.body.error).toBe("GSTIN_EXISTS");
  });

  it("maps email constraint to EMAIL_EXISTS", () => {
    const pgErr: any = new Error("dup");
    pgErr.code = "23505";
    pgErr.constraint = "ux_users_email";
    const res = mockRes();
    errorHandler(pgErr, mockReq(), res, next);
    expect(res.body.error).toBe("EMAIL_EXISTS");
  });

  it("maps store_users constraint to ALREADY_LINKED", () => {
    const pgErr: any = new Error("dup");
    pgErr.code = "23505";
    pgErr.constraint = "store_users_store_user_unique";
    const res = mockRes();
    errorHandler(pgErr, mockReq(), res, next);
    expect(res.body.error).toBe("ALREADY_LINKED");
  });

  it("returns generic message in production for non-HttpError", () => {
    process.env.NODE_ENV = "production";
    const err = new Error("sensitive database info");
    const res = mockRes();
    errorHandler(err, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.error).toBe("Internal server error");
  });

  it("returns actual error message in non-production", () => {
    process.env.NODE_ENV = "development";
    const err = new Error("specific error message");
    const res = mockRes();
    errorHandler(err, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.error).toBe("specific error message");
  });

  it("handles non-Error objects as Unknown error", () => {
    process.env.NODE_ENV = "development";
    const res = mockRes();
    errorHandler("string error", mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.body.error).toBe("Unknown error");
  });

  it("returns Internal server error for non-Error in production", () => {
    process.env.NODE_ENV = "production";
    const res = mockRes();
    errorHandler({ weird: "object" }, mockReq(), res, next);
    expect(res.body.error).toBe("Internal server error");
  });
});
