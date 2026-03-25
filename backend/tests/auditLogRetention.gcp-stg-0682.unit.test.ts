/**
 * GCP-STG-0682: Audit log retention — archive old auth events
 *
 * Mounts the adminMaintenanceRouter on an express app with supertest.
 * Verifies the POST /maintenance/archive-auth-events endpoint calls
 * archiveOldAuthEvents and returns the archived count.
 */

const mockQuery = jest.fn();
const mockArchive = jest.fn();

jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../src/lib/errorUtils", () => ({
  asError: (e: any) => e,
}));

// Mock requireAdminToken and requirePermission to pass through
jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => next(),
  requirePermission: () => (_req: any, _res: any, next: any) => next(),
}));

// Mock archiveOldAuthEvents in the authAudit service
jest.mock("../src/services/authAudit", () => ({
  archiveOldAuthEvents: (...args: any[]) => mockArchive(...args),
}));

import express from "express";
import request from "supertest";
import { adminMaintenanceRouter } from "../src/routes/v1/admin/maintenance";

const app = express();
app.use(express.json());
app.use("/admin", adminMaintenanceRouter);

describe("GCP-STG-0682: Audit log retention", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("POST /admin/maintenance/archive-auth-events returns archived count on success", async () => {
    mockArchive.mockResolvedValueOnce(42);

    const res = await request(app).post("/admin/maintenance/archive-auth-events");

    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(42);
    expect(res.body.message).toContain("42");
    expect(mockArchive).toHaveBeenCalledTimes(1);
  });

  it("POST /admin/maintenance/archive-auth-events returns 0 when nothing to archive", async () => {
    mockArchive.mockResolvedValueOnce(0);

    const res = await request(app).post("/admin/maintenance/archive-auth-events");

    expect(res.status).toBe(200);
    expect(res.body.archived).toBe(0);
  });

  it("POST /admin/maintenance/archive-auth-events returns 500 on service error", async () => {
    mockArchive.mockRejectedValueOnce(new Error("DB connection lost"));

    const res = await request(app).post("/admin/maintenance/archive-auth-events");

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("INTERNAL_ERROR");
  });

  it("GET /admin/system/maintenance returns maintenance status", async () => {
    // Mock DB query for getMaintenanceStatus
    mockQuery.mockResolvedValueOnce({
      rowCount: 1,
      rows: [{ value: JSON.stringify({ enabled: false, message: null, updated_at: "2026-03-01T00:00:00Z" }) }],
    });

    const res = await request(app).get("/admin/system/maintenance");

    expect(res.status).toBe(200);
    expect(res.body.maintenance).toBeDefined();
    expect(res.body.maintenance.enabled).toBe(false);
  });
});
