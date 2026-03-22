// GCP-STG-0340: Approval Status Filter — backend unit tests
// Validates that GET /api/v1/admin/catalog/products?approvalStatus=<status> filters correctly

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock pool
const mockQuery = vi.fn();
vi.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// Mock middleware
vi.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

vi.mock("../src/services/stockReconciliation", () => ({
  reconcileStockBalances: vi.fn(),
  checkStockDivergence: vi.fn(),
}));

import express from "express";
import request from "supertest";
import { adminCatalogRouter } from "../src/routes/v1/admin/catalog";

function buildApp() {
  const app = express();
  app.use(express.json());
  app.use("/api/v1/admin", adminCatalogRouter);
  return app;
}

describe("GCP-STG-0340: approvalStatus query parameter filter", () => {
  beforeEach(() => {
    mockQuery.mockReset();
  });

  it("filters by 'pending' approval status", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "3" }] })
      .mockResolvedValueOnce({
        rows: [
          { id: "p1", approvalStatus: "pending" },
          { id: "p2", approvalStatus: "pending" },
          { id: "p3", approvalStatus: "pending" },
        ],
      });

    const app = buildApp();
    const res = await request(app)
      .get("/api/v1/admin/catalog/products?approvalStatus=pending")
      .expect(200);

    expect(res.body.success).toBe(true);

    const countCall = mockQuery.mock.calls[0];
    expect(countCall[0]).toContain("sp.approval_status = $");
    expect(countCall[1]).toContain("pending");

    expect(res.body.filters.approvalStatus).toBe("pending");
  });

  it("filters by 'approved' approval status", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "1" }] })
      .mockResolvedValueOnce({ rows: [{ id: "p1", approvalStatus: "approved" }] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/v1/admin/catalog/products?approvalStatus=approved")
      .expect(200);

    const countCall = mockQuery.mock.calls[0];
    expect(countCall[0]).toContain("sp.approval_status = $");
    expect(countCall[1]).toContain("approved");

    expect(res.body.filters.approvalStatus).toBe("approved");
  });

  it("filters by 'rejected' approval status", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/v1/admin/catalog/products?approvalStatus=rejected")
      .expect(200);

    const countCall = mockQuery.mock.calls[0];
    expect(countCall[0]).toContain("sp.approval_status = $");
    expect(countCall[1]).toContain("rejected");

    expect(res.body.filters.approvalStatus).toBe("rejected");
  });

  it("ignores invalid approval status values (SQL injection prevention)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/v1/admin/catalog/products?approvalStatus='; DROP TABLE products;--")
      .expect(200);

    // Should NOT add approval_status to WHERE clause
    const countCall = mockQuery.mock.calls[0];
    expect(countCall[0]).not.toContain("sp.approval_status");

    expect(res.body.filters.approvalStatus).toBeNull();
  });

  it("is case-insensitive (Pending → pending)", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/v1/admin/catalog/products?approvalStatus=Pending")
      .expect(200);

    const countCall = mockQuery.mock.calls[0];
    expect(countCall[0]).toContain("sp.approval_status = $");
    expect(countCall[1]).toContain("pending");

    expect(res.body.filters.approvalStatus).toBe("pending");
  });

  it("returns approvalStatus: null when not provided", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    const res = await request(app)
      .get("/api/v1/admin/catalog/products")
      .expect(200);

    expect(res.body.filters.approvalStatus).toBeNull();
  });

  it("combines approvalStatus with supplierId and search", async () => {
    const supplierId = "a1b2c3d4-e5f6-4a7b-8c9d-0e1f2a3b4c5d";
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    await request(app)
      .get(`/api/v1/admin/catalog/products?q=rice&supplierId=${supplierId}&approvalStatus=approved`)
      .expect(200);

    const countCall = mockQuery.mock.calls[0];
    expect(countCall[0]).toContain("ILIKE"); // search
    expect(countCall[0]).toContain("sp.supplier_id"); // supplier
    expect(countCall[0]).toContain("sp.approval_status"); // status

    expect(countCall[1]).toContain("%rice%");
    expect(countCall[1]).toContain(supplierId);
    expect(countCall[1]).toContain("approved");
  });

  it("ignores empty string approvalStatus", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ total: "0" }] })
      .mockResolvedValueOnce({ rows: [] });

    const app = buildApp();
    await request(app)
      .get("/api/v1/admin/catalog/products?approvalStatus=")
      .expect(200);

    const countCall = mockQuery.mock.calls[0];
    expect(countCall[0]).not.toContain("sp.approval_status");
  });
});
