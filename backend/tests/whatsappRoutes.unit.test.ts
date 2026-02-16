/**
 * WA-001: WhatsApp POS + Admin route handler unit tests
 * Tests input validation, store isolation, error handling, and API contracts.
 * Tier 1 — DB and WhatsApp service mocked.
 */

// Mock DB
const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// Mock WhatsApp service
const mockSendText = jest.fn();
const mockSendBill = jest.fn();
const mockNormalize = jest.fn((raw: string) => {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && /^[6-9]/.test(digits)) return `91${digits}`;
  return digits;
});

jest.mock("../src/services/whatsappService", () => ({
  isWhatsAppConfigured: () => true,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  sendTextMessage: (p: any) => mockSendText(p),
  sendBillReceipt: (p: any) => mockSendBill(p),
  normalizePhone: (p: any) => mockNormalize(p),
}));

// Mock auth middleware (pass-through)
jest.mock("../src/middleware/deviceToken", () => ({
  requireDeviceToken: (_req: any, _res: any, next: any) => {
    _req.posDevice = { storeId: "store-uuid-123", deviceId: "device-uuid-456" };
    next();
  },
}));

jest.mock("../src/middleware/storeStatusGate", () => ({
  requireActiveStore: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => {
    _req.adminId = "admin-uuid-789";
    next();
  },
}));

import express from "express";
import request from "supertest";
import { posWhatsAppRouter } from "../src/routes/v1/pos/whatsapp";
import { adminWhatsAppRouter } from "../src/routes/v1/admin/whatsapp";

function createPosApp() {
  const app = express();
  app.use(express.json());
  app.use("/pos", posWhatsAppRouter);
  return app;
}

function createAdminApp() {
  const app = express();
  app.use(express.json());
  app.use("/admin", adminWhatsAppRouter);
  return app;
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
  mockSendText.mockReset();
  mockSendBill.mockReset();
  mockNormalize.mockClear();
});

// =============================================================================
// POS: GET /pos/whatsapp/status
// =============================================================================
describe("GET /pos/whatsapp/status", () => {
  const app = createPosApp();

  it("returns configured: true when WhatsApp is configured", async () => {
    const res = await request(app).get("/pos/whatsapp/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: true });
  });
});

// =============================================================================
// POS: POST /pos/whatsapp/send-bill
// =============================================================================
describe("POST /pos/whatsapp/send-bill", () => {
  const app = createPosApp();

  it("sends bill receipt successfully", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "sale-uuid",
        bill_ref: "BILL-042",
        total_minor: 15000,
        currency: "INR",
        status: "PAID_UPI",
        store_name: "Fresh Mart",
      }],
    });

    mockSendBill.mockResolvedValueOnce({ sent: true, wamid: "wamid.bill001" });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Audit log

    const res = await request(app)
      .post("/pos/whatsapp/send-bill")
      .send({ saleId: "sale-uuid", recipientPhone: "9876543210" });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, wamid: "wamid.bill001" });

    // Verify sale query has store isolation
    const saleQuery = mockQuery.mock.calls[0];
    expect(saleQuery[0]).toContain("s.store_id = $2");
    expect(saleQuery[1]).toContain("store-uuid-123");
  });

  it("returns 400 for missing saleId", async () => {
    const res = await request(app)
      .post("/pos/whatsapp/send-bill")
      .send({ recipientPhone: "9876543210" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("saleId");
  });

  it("returns 400 for missing recipientPhone", async () => {
    const res = await request(app)
      .post("/pos/whatsapp/send-bill")
      .send({ saleId: "sale-uuid" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("recipientPhone");
  });

  it("returns 400 for invalid phone number", async () => {
    mockNormalize.mockReturnValueOnce("12345"); // Too short

    const res = await request(app)
      .post("/pos/whatsapp/send-bill")
      .send({ saleId: "sale-uuid", recipientPhone: "12345" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("Invalid phone");
  });

  it("returns 404 when sale not found (store isolation)", async () => {
    mockQuery.mockResolvedValueOnce({ rows: [] }); // No sale

    const res = await request(app)
      .post("/pos/whatsapp/send-bill")
      .send({ saleId: "wrong-sale", recipientPhone: "9876543210" });

    expect(res.status).toBe(404);
    expect(res.body.error).toContain("Sale not found");
  });

  it("returns 502 when WhatsApp send fails", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "sale-uuid",
        bill_ref: "BILL-001",
        total_minor: 5000,
        currency: "INR",
        status: "PAID_CASH",
        store_name: "Test Store",
      }],
    });

    mockSendBill.mockResolvedValueOnce({
      sent: false,
      errorCode: "131026",
      errorMessage: "Rate limit exceeded",
    });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Audit log

    const res = await request(app)
      .post("/pos/whatsapp/send-bill")
      .send({ saleId: "sale-uuid", recipientPhone: "9876543210" });

    expect(res.status).toBe(502);
    expect(res.body.sent).toBe(false);
    expect(res.body.error).toContain("Rate limit");
  });

  it("still returns success even if audit log insert fails", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "sale-uuid",
        bill_ref: "BILL-002",
        total_minor: 10000,
        currency: "INR",
        status: "PAID_UPI",
        store_name: "Test",
      }],
    });

    mockSendBill.mockResolvedValueOnce({ sent: true, wamid: "wamid.x" });
    mockQuery.mockRejectedValueOnce(new Error("DB down")); // Audit fails

    const res = await request(app)
      .post("/pos/whatsapp/send-bill")
      .send({ saleId: "sale-uuid", recipientPhone: "9876543210" });

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(true);
  });

  it("formats INR currency correctly in bill receipt", async () => {
    mockQuery.mockResolvedValueOnce({
      rows: [{
        id: "sale-uuid",
        bill_ref: "BILL-003",
        total_minor: 99950,
        currency: "INR",
        status: "PAID_UPI",
        store_name: "Market Fresh",
      }],
    });

    mockSendBill.mockResolvedValueOnce({ sent: true, wamid: "wamid.fmt" });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    await request(app)
      .post("/pos/whatsapp/send-bill")
      .send({ saleId: "sale-uuid", recipientPhone: "9876543210" });

    const billCall = mockSendBill.mock.calls[0][0];
    expect(billCall.amount).toBe("₹999.50");
    expect(billCall.storeName).toBe("Market Fresh");
    expect(billCall.paymentMode).toBe("UPI");
  });
});

// =============================================================================
// POS: POST /pos/whatsapp/send
// =============================================================================
describe("POST /pos/whatsapp/send", () => {
  const app = createPosApp();

  it("sends general message successfully", async () => {
    mockSendText.mockResolvedValueOnce({ sent: true, wamid: "wamid.gen001" });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 }); // Audit log

    const res = await request(app)
      .post("/pos/whatsapp/send")
      .send({
        recipientPhone: "9876543210",
        message: "Your order is ready for pickup.",
        contextType: "order_update",
        contextId: "order-uuid",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, wamid: "wamid.gen001" });
  });

  it("returns 400 for missing message", async () => {
    const res = await request(app)
      .post("/pos/whatsapp/send")
      .send({ recipientPhone: "9876543210" });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("message");
  });

  it("returns 400 for message over 4096 chars", async () => {
    const res = await request(app)
      .post("/pos/whatsapp/send")
      .send({
        recipientPhone: "9876543210",
        message: "x".repeat(4097),
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("too long");
  });

  it("truncates content_preview to 200 chars in audit log", async () => {
    const longMsg = "A".repeat(500);
    mockSendText.mockResolvedValueOnce({ sent: true, wamid: "wamid.trunc" });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    await request(app)
      .post("/pos/whatsapp/send")
      .send({ recipientPhone: "9876543210", message: longMsg });

    const auditInsert = mockQuery.mock.calls[0];
    const contentPreview = auditInsert[1][2]; // 3rd param = content_preview
    expect(contentPreview.length).toBeLessThanOrEqual(200);
  });

  it("includes store isolation in audit log (storeId from device token)", async () => {
    mockSendText.mockResolvedValueOnce({ sent: true, wamid: "wamid.store" });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    await request(app)
      .post("/pos/whatsapp/send")
      .send({ recipientPhone: "9876543210", message: "Test" });

    const auditInsert = mockQuery.mock.calls[0];
    expect(auditInsert[1][0]).toBe("store-uuid-123"); // storeId
  });

  it("includes deviceId as sent_by in audit log", async () => {
    mockSendText.mockResolvedValueOnce({ sent: true, wamid: "wamid.dev" });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    await request(app)
      .post("/pos/whatsapp/send")
      .send({ recipientPhone: "9876543210", message: "Test" });

    const auditInsert = mockQuery.mock.calls[0];
    expect(auditInsert[1][7]).toBe("device-uuid-456"); // sent_by = deviceId
  });
});

// =============================================================================
// ADMIN: GET /admin/whatsapp/status
// =============================================================================
describe("GET /admin/whatsapp/status", () => {
  const app = createAdminApp();

  it("returns configured: true", async () => {
    const res = await request(app).get("/admin/whatsapp/status");

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ configured: true });
  });
});

// =============================================================================
// ADMIN: POST /admin/whatsapp/send
// =============================================================================
describe("POST /admin/whatsapp/send", () => {
  const app = createAdminApp();

  it("sends message to retailer", async () => {
    mockSendText.mockResolvedValueOnce({ sent: true, wamid: "wamid.adm001" });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    const res = await request(app)
      .post("/admin/whatsapp/send")
      .send({
        recipientPhone: "9876543210",
        message: "Your store account is verified.",
        recipientType: "retailer",
      });

    expect(res.status).toBe(200);
    expect(res.body).toEqual({ sent: true, wamid: "wamid.adm001" });
  });

  it("rejects invalid recipientType", async () => {
    const res = await request(app)
      .post("/admin/whatsapp/send")
      .send({
        recipientPhone: "9876543210",
        message: "Test",
        recipientType: "consumer",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("recipientType");
  });

  it("rejects missing recipientType", async () => {
    const res = await request(app)
      .post("/admin/whatsapp/send")
      .send({
        recipientPhone: "9876543210",
        message: "Test",
      });

    expect(res.status).toBe(400);
  });

  it("rejects message over 4096 chars", async () => {
    const res = await request(app)
      .post("/admin/whatsapp/send")
      .send({
        recipientPhone: "9876543210",
        message: "x".repeat(4097),
        recipientType: "supplier",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("too long");
  });

  it("logs adminId as sent_by in audit log", async () => {
    mockSendText.mockResolvedValueOnce({ sent: true, wamid: "wamid.adm002" });
    mockQuery.mockResolvedValueOnce({ rowCount: 1 });

    await request(app)
      .post("/admin/whatsapp/send")
      .send({
        recipientPhone: "9876543210",
        message: "Test",
        recipientType: "retailer",
      });

    const auditInsert = mockQuery.mock.calls[0];
    expect(auditInsert[1][6]).toBe("admin-uuid-789"); // sent_by = adminId
  });
});

// =============================================================================
// ADMIN: POST /admin/whatsapp/broadcast
// =============================================================================
describe("POST /admin/whatsapp/broadcast", () => {
  const app = createAdminApp();

  it("sends to multiple recipients and returns counts", async () => {
    mockSendText.mockResolvedValue({ sent: true, wamid: "wamid.bc" });
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const res = await request(app)
      .post("/admin/whatsapp/broadcast")
      .send({
        phones: ["9876543210", "8765432109", "7654321098"],
        message: "Important update from SuperMandi!",
        recipientType: "retailer",
      });

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(3);
    expect(res.body.failed).toBe(0);
    expect(res.body.total).toBe(3);
    expect(mockSendText).toHaveBeenCalledTimes(3);
  });

  it("rejects empty phones array", async () => {
    const res = await request(app)
      .post("/admin/whatsapp/broadcast")
      .send({
        phones: [],
        message: "Test",
        recipientType: "retailer",
      });

    expect(res.status).toBe(400);
  });

  it("rejects more than 50 recipients", async () => {
    const phones = Array.from({ length: 51 }, (_, i) => `987654${String(i).padStart(4, "0")}`);

    const res = await request(app)
      .post("/admin/whatsapp/broadcast")
      .send({
        phones,
        message: "Test",
        recipientType: "supplier",
      });

    expect(res.status).toBe(400);
    expect(res.body.error).toContain("50");
  });

  it("counts invalid phone numbers as failed", async () => {
    mockNormalize
      .mockReturnValueOnce("919876543210") // Valid
      .mockReturnValueOnce("12345"); // Invalid (too short)

    mockSendText.mockResolvedValueOnce({ sent: true, wamid: "wamid.bc1" });
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const res = await request(app)
      .post("/admin/whatsapp/broadcast")
      .send({
        phones: ["9876543210", "12345"],
        message: "Test",
        recipientType: "retailer",
      });

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors).toHaveLength(1);
    expect(res.body.errors[0]).toContain("Invalid");
  });

  it("handles mixed success/failure from Meta API", async () => {
    mockSendText
      .mockResolvedValueOnce({ sent: true, wamid: "wamid.ok" })
      .mockResolvedValueOnce({ sent: false, errorMessage: "Rate limit" });
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const res = await request(app)
      .post("/admin/whatsapp/broadcast")
      .send({
        phones: ["9876543210", "8765432109"],
        message: "Test",
        recipientType: "supplier",
      });

    expect(res.status).toBe(200);
    expect(res.body.sent).toBe(1);
    expect(res.body.failed).toBe(1);
    expect(res.body.errors[0]).toContain("Rate limit");
  });

  it("caps error list at 10 entries", async () => {
    // All 15 fail
    mockSendText.mockResolvedValue({ sent: false, errorMessage: "Failed" });
    mockQuery.mockResolvedValue({ rowCount: 1 });

    const phones = Array.from({ length: 15 }, (_, i) => `987654${String(i).padStart(4, "0")}`);

    const res = await request(app)
      .post("/admin/whatsapp/broadcast")
      .send({
        phones,
        message: "Test",
        recipientType: "retailer",
      });

    expect(res.status).toBe(200);
    expect(res.body.errors.length).toBeLessThanOrEqual(10);
  });
});
