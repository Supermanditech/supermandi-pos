/**
 * GCP-STG-0745: Notification center — behavioral supertest tests
 *
 * Tests:
 * - GET /notifications?unread=true (filter by unread)
 * - PATCH /notifications/:id/read (mark notification read)
 * - createNotification() helper function
 */

const mockQuery = jest.fn();
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));
jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (req: any, _res: any, next: any) => {
    (req as any).deviceUserId = "user-1";
    (req as any).posDevice = { storeId: "store-1", deviceId: "dev-1" };
    next();
  },
}));
jest.mock("../src/services/fcmService", () => ({
  registerDeviceToken: jest.fn(),
  removeDeviceToken: jest.fn(),
}));

import express from "express";
import request from "supertest";
import { posNotificationsRouter } from "../src/routes/v1/pos/notifications";
import { createNotification } from "../src/services/notificationHelper";

const app = express();
app.use(express.json());
app.use("/", posNotificationsRouter);

beforeEach(() => {
  mockQuery.mockReset();
});

describe("GET /notifications?unread=true (GCP-STG-0745)", () => {
  it("filters only unread notifications when unread=true", async () => {
    mockQuery
      .mockResolvedValueOnce({
        rows: [
          { id: "n1", title: "Order shipped", body: "Your order was shipped", data: null, notification_type: "order", priority: "normal", is_read: false, read_at: null, delivered_at: null, created_at: "2026-03-25T10:00:00Z" },
        ],
      })
      .mockResolvedValueOnce({ rows: [{ total: 1 }] });

    const res = await request(app).get("/notifications?unread=true&limit=20");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0].isRead).toBe(false);
    // Verify unread filter was applied in query
    const firstCall = mockQuery.mock.calls[0][0];
    expect(firstCall).toContain("is_read = false");
  });

  it("returns all notifications when unread not set", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [] })
      .mockResolvedValueOnce({ rows: [{ total: 0 }] });

    const res = await request(app).get("/notifications?limit=20");

    expect(res.status).toBe(200);
    const firstCall = mockQuery.mock.calls[0][0];
    expect(firstCall).not.toContain("is_read = false");
  });
});

describe("PATCH /notifications/:id/read (GCP-STG-0745)", () => {
  it("marks notification as read via PATCH", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "n1" }] });

    const res = await request(app).patch("/notifications/n1/read");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it("returns 404 for unknown notification", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const res = await request(app).patch("/notifications/n999/read");

    expect(res.status).toBe(404);
  });
});

describe("createNotification() helper (GCP-STG-0745)", () => {
  it("creates notification in user-scoped table", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ id: "notif-1" }] });

    const result = await createNotification({
      recipientId: "user-1",
      title: "Test notification",
      body: "This is a test",
      notificationType: "order",
    });

    expect(result).toBe("notif-1");
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it("creates in both tables when storeId provided", async () => {
    mockQuery
      .mockResolvedValueOnce({ rows: [{ id: "notif-2" }] })
      .mockResolvedValueOnce({ rows: [] });

    const result = await createNotification({
      recipientId: "user-1",
      storeId: "store-1",
      title: "Store notification",
    });

    expect(result).toBe("notif-2");
    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("returns null when table missing (42P01)", async () => {
    const err: any = new Error("relation does not exist");
    err.code = "42P01";
    mockQuery.mockRejectedValueOnce(err);

    const result = await createNotification({
      recipientId: "user-1",
      title: "Test",
    });

    expect(result).toBeNull();
  });
});
