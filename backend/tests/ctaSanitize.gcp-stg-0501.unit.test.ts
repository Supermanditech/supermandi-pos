/**
 * GCP-STG-0501: Sanitize CTA message content
 * Behavioral tests using supertest — verifies HTML tags are stripped
 * from messages before storage via the PUT handler.
 */

// Mock DB
const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// Mock WhatsApp service
jest.mock("../src/services/whatsappService", () => ({
  isWhatsAppConfigured: () => true,
  sendTextMessage: jest.fn().mockResolvedValue({ sent: true }),
  sendBillReceipt: jest.fn().mockResolvedValue({ sent: true }),
  normalizePhone: (raw: string) => raw.replace(/\D/g, ""),
}));

// Mock auth middleware (pass-through)
jest.mock("../src/middleware/adminToken", () => ({
  requireAdminToken: (_req: any, _res: any, next: any) => {
    _req.adminId = "admin-uuid-789";
    next();
  },
}));

import express from "express";
import request from "supertest";
import { adminWhatsAppRouter } from "../src/routes/v1/admin/whatsapp";

function createApp() {
  const app = express();
  app.use(express.json());
  app.use("/admin", adminWhatsAppRouter);
  return app;
}

const validPayload = {
  enabled: true,
  superadminNumber: "919251893684",
  superadminMessage: "Hello from support",
  companyNumber: "919251893684",
  companyMessage: "Welcome to SuperMandi",
};

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 1 });
});

describe("PUT /admin/whatsapp/cta-config — GCP-STG-0501 sanitization", () => {
  const app = createApp();

  it("strips HTML tags from superadminMessage", async () => {
    const res = await request(app)
      .put("/admin/whatsapp/cta-config")
      .send({
        ...validPayload,
        superadminMessage: "Hello <b>world</b> and <i>everyone</i>",
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);

    // Verify the sanitized message was passed to DB
    const queryParams = mockQuery.mock.calls[0][1];
    // superadminMessage is param index 2 (enabled=0, superadminNumber=1, superadminMessage=2)
    expect(queryParams[2]).toBe("Hello world and everyone");
  });

  it("strips script tags from companyMessage", async () => {
    const res = await request(app)
      .put("/admin/whatsapp/cta-config")
      .send({
        ...validPayload,
        companyMessage: 'Welcome<script>alert("xss")</script> to us',
      });

    expect(res.status).toBe(200);

    const queryParams = mockQuery.mock.calls[0][1];
    // companyMessage is param index 4 (enabled=0, superadminNumber=1, superadminMessage=2, companyNumber=3, companyMessage=4)
    expect(queryParams[4]).toBe('Welcomealert("xss") to us');
  });

  it("strips nested and malformed HTML tags", async () => {
    const res = await request(app)
      .put("/admin/whatsapp/cta-config")
      .send({
        ...validPayload,
        superadminMessage: "<div><p>Nested <a href='x'>link</a></p></div>",
      });

    expect(res.status).toBe(200);

    const queryParams = mockQuery.mock.calls[0][1];
    expect(queryParams[2]).toBe("Nested link");
  });

  it("passes normal text through unchanged", async () => {
    const res = await request(app)
      .put("/admin/whatsapp/cta-config")
      .send(validPayload);

    expect(res.status).toBe(200);

    const queryParams = mockQuery.mock.calls[0][1];
    expect(queryParams[2]).toBe("Hello from support");
    expect(queryParams[4]).toBe("Welcome to SuperMandi");
  });

  it("trims whitespace left by removed tags", async () => {
    const res = await request(app)
      .put("/admin/whatsapp/cta-config")
      .send({
        ...validPayload,
        superadminMessage: "  <br>  Hello  <br>  ",
      });

    expect(res.status).toBe(200);

    const queryParams = mockQuery.mock.calls[0][1];
    expect(queryParams[2]).toBe("Hello");
  });

  it("strips img tags with attributes", async () => {
    const res = await request(app)
      .put("/admin/whatsapp/cta-config")
      .send({
        ...validPayload,
        companyMessage: 'Check <img src="evil.jpg" onerror="alert(1)"> this',
      });

    expect(res.status).toBe(200);

    const queryParams = mockQuery.mock.calls[0][1];
    expect(queryParams[4]).toBe("Check  this");
  });
});
