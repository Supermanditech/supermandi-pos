/**
 * WA-001: WhatsApp Webhook unit tests
 * Tests HMAC signature verification, webhook verification challenge,
 * status mapping, and delivery status update logic.
 * Tier 1 — no DB required. DB calls are mocked.
 */

import crypto from "crypto";

// Set env BEFORE module imports (module captures at load time)
const TEST_APP_SECRET = "test-app-secret-2026";
process.env.WHATSAPP_APP_SECRET = TEST_APP_SECRET;

// Mock DB before importing routes
const mockQuery = jest.fn().mockResolvedValue({ rows: [], rowCount: 0 });
jest.mock("../src/db/client", () => ({
  getPool: () => ({ query: mockQuery }),
}));

// Mock whatsappService
jest.mock("../src/services/whatsappService", () => ({
  getWebhookVerifyToken: () => "test-verify-secret-2026",
}));

import express from "express";
import request from "supertest";
import { whatsappWebhookRouter } from "../src/routes/v1/webhooks/whatsappWebhook";

// Build test app (uses the single TEST_APP_SECRET set above)
function createApp() {
  const app = express();
  // Capture raw body like production app.ts does
  app.use(express.json({
    verify: (req, _res, buf) => {
      (req as any).rawBody = buf;
    },
  }));
  app.use("/webhooks", whatsappWebhookRouter);
  return app;
}

function signPayload(payload: object, secret: string): string {
  const raw = JSON.stringify(payload);
  return "sha256=" + crypto.createHmac("sha256", secret).update(raw).digest("hex");
}

beforeEach(() => {
  mockQuery.mockReset();
  mockQuery.mockResolvedValue({ rows: [], rowCount: 0 });
});

// =============================================================================
// GET /webhooks/whatsapp — VERIFICATION CHALLENGE
// =============================================================================
describe("GET /webhooks/whatsapp — verification challenge", () => {
  const app = createApp();

  it("responds with challenge when token matches", async () => {
    const res = await request(app)
      .get("/webhooks/whatsapp")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "test-verify-secret-2026",
        "hub.challenge": "CHALLENGE_ABC_123",
      });

    expect(res.status).toBe(200);
    expect(res.text).toBe("CHALLENGE_ABC_123");
  });

  it("returns 403 for wrong verify token", async () => {
    const res = await request(app)
      .get("/webhooks/whatsapp")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "CHALLENGE_XYZ",
      });

    expect(res.status).toBe(403);
  });

  it("returns 403 for missing mode", async () => {
    const res = await request(app)
      .get("/webhooks/whatsapp")
      .query({
        "hub.verify_token": "test-verify-secret-2026",
        "hub.challenge": "CHALLENGE",
      });

    expect(res.status).toBe(403);
  });

  it("returns 403 for mode !== subscribe", async () => {
    const res = await request(app)
      .get("/webhooks/whatsapp")
      .query({
        "hub.mode": "unsubscribe",
        "hub.verify_token": "test-verify-secret-2026",
        "hub.challenge": "CHALLENGE",
      });

    expect(res.status).toBe(403);
  });

  it("returns 403 when verify token is empty (not configured)", async () => {
    // The mock always returns "test-verify-secret-2026" so this tests the
    // actual path. If user sends empty token, it won't match.
    const res = await request(app)
      .get("/webhooks/whatsapp")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "",
        "hub.challenge": "CHALLENGE",
      });

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// POST /webhooks/whatsapp — SIGNATURE VERIFICATION
// =============================================================================
describe("POST /webhooks/whatsapp — signature verification", () => {
  const app = createApp();

  it("accepts valid signature", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [],
    };

    const sig = signPayload(payload, TEST_APP_SECRET);

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("X-Hub-Signature-256", sig)
      .send(payload);

    expect(res.status).toBe(200);
  });

  it("rejects missing signature header", async () => {
    const res = await request(app)
      .post("/webhooks/whatsapp")
      .send({ object: "whatsapp_business_account", entry: [] });

    expect(res.status).toBe(401);
  });

  it("rejects wrong signature", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("X-Hub-Signature-256", "sha256=0000000000000000000000000000000000000000000000000000000000000000")
      .send(payload);

    expect(res.status).toBe(403);
  });

  it("rejects truncated signature", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };
    const validSig = signPayload(payload, TEST_APP_SECRET);

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("X-Hub-Signature-256", validSig.slice(0, 20))
      .send(payload);

    expect(res.status).toBe(403);
  });

  it("rejects signature with extra bytes", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };
    const validSig = signPayload(payload, TEST_APP_SECRET);

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("X-Hub-Signature-256", validSig + "ff")
      .send(payload);

    expect(res.status).toBe(403);
  });

  it("rejects signature computed with wrong secret", async () => {
    const payload = { object: "whatsapp_business_account", entry: [] };
    const wrongSig = signPayload(payload, "wrong-secret");

    const res = await request(app)
      .post("/webhooks/whatsapp")
      .set("X-Hub-Signature-256", wrongSig)
      .send(payload);

    expect(res.status).toBe(403);
  });
});

// =============================================================================
// POST /webhooks/whatsapp — DELIVERY STATUS PROCESSING
// =============================================================================
describe("POST /webhooks/whatsapp — delivery status updates", () => {
  const app = createApp();

  function sendWebhook(payload: object) {
    const sig = signPayload(payload, TEST_APP_SECRET);
    return request(app)
      .post("/webhooks/whatsapp")
      .set("X-Hub-Signature-256", sig)
      .send(payload);
  }

  it("processes 'sent' status update", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: "wamid.sent123",
              status: "sent",
              timestamp: "1700000000",
            }],
          },
        }],
      }],
    };

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    // Wait for async processing
    await new Promise((r) => setTimeout(r, 50));

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("UPDATE whatsapp.message_logs"),
      expect.arrayContaining(["sent", "wamid.sent123"])
    );
  });

  it("processes 'delivered' status update with timestamp", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: "wamid.del456",
              status: "delivered",
              timestamp: "1700000100",
            }],
          },
        }],
      }],
    };

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    expect(mockQuery).toHaveBeenCalledWith(
      expect.stringContaining("delivered_at"),
      expect.arrayContaining(["delivered", expect.any(Date), "wamid.del456"])
    );
  });

  it("processes 'read' status update with COALESCE on delivered_at", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: "wamid.read789",
              status: "read",
              timestamp: "1700000200",
            }],
          },
        }],
      }],
    };

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const query = mockQuery.mock.calls[0][0];
    expect(query).toContain("read_at");
    expect(query).toContain("COALESCE(delivered_at");
    expect(query).toContain("IN ('queued', 'sent', 'delivered')");
  });

  it("processes 'failed' status — only overwrites queued/sent", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: "wamid.fail000",
              status: "failed",
            }],
          },
        }],
      }],
    };

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    const query = mockQuery.mock.calls[0][0];
    expect(query).toContain("delivery_error_code");
    expect(query).toContain("IN ('queued', 'sent')");
    // Should NOT include 'delivered' or 'read' in WHERE
    expect(query).not.toContain("'delivered'");
  });

  it("ignores unknown status values", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{
              id: "wamid.unknown",
              status: "accepted", // Not a valid status
            }],
          },
        }],
      }],
    };

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    // No DB query should have been made
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("ignores entries without statuses", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            messages: [{ from: "919876543210", text: { body: "Hello" } }],
          },
        }],
      }],
    };

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("handles missing wamid gracefully", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{ status: "sent" }], // no id
          },
        }],
      }],
    };

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("handles missing status field gracefully", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{ id: "wamid.nostatus" }], // no status
          },
        }],
      }],
    };

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    expect(mockQuery).not.toHaveBeenCalled();
  });

  it("processes multiple statuses in single webhook", async () => {
    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [
              { id: "wamid.multi1", status: "sent", timestamp: "1700000000" },
              { id: "wamid.multi2", status: "delivered", timestamp: "1700000001" },
            ],
          },
        }],
      }],
    };

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200);

    await new Promise((r) => setTimeout(r, 50));

    expect(mockQuery).toHaveBeenCalledTimes(2);
  });

  it("survives DB query failure without crashing", async () => {
    mockQuery.mockRejectedValueOnce(new Error("Connection refused"));

    const payload = {
      object: "whatsapp_business_account",
      entry: [{
        changes: [{
          value: {
            statuses: [{ id: "wamid.dberr", status: "sent" }],
          },
        }],
      }],
    };

    const res = await sendWebhook(payload);
    expect(res.status).toBe(200); // Still 200 — Meta expects it

    await new Promise((r) => setTimeout(r, 50));
    // No crash — error was caught internally
  });
});

// =============================================================================
// MALFORMED WEBHOOK PAYLOADS
// =============================================================================
describe("POST /webhooks/whatsapp — malformed payloads", () => {
  const app = createApp();

  function sendWebhook(payload: object) {
    const sig = signPayload(payload, TEST_APP_SECRET);
    return request(app)
      .post("/webhooks/whatsapp")
      .set("X-Hub-Signature-256", sig)
      .send(payload);
  }

  it("handles empty body gracefully", async () => {
    const res = await sendWebhook({});
    expect(res.status).toBe(200);
  });

  it("handles entry as non-array", async () => {
    const res = await sendWebhook({ entry: "not-array" });
    expect(res.status).toBe(200);
  });

  it("handles changes as non-array", async () => {
    const res = await sendWebhook({ entry: [{ changes: "not-array" }] });
    expect(res.status).toBe(200);
  });

  it("handles null value in changes", async () => {
    const res = await sendWebhook({
      entry: [{ changes: [{ value: null }] }],
    });
    expect(res.status).toBe(200);
  });
});
