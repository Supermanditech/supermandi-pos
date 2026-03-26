/**
 * WA-001: WhatsApp Service unit tests
 * Tests phone normalization, rate limiting, configuration check, and send functions.
 * Tier 1 — no DB or external dependencies required.
 */

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch as any;

// Set env vars BEFORE importing the module (module reads them at load time)
const ORIGINAL_ENV = process.env;

beforeAll(() => {
  process.env = {
    ...ORIGINAL_ENV,
    WHATSAPP_ACCESS_TOKEN: "test-token-123",
    WHATSAPP_PHONE_NUMBER_ID: "968976229638443",
    WHATSAPP_VERIFY_TOKEN: "test-verify-token",
  };
  // Prevent setInterval (rate-limit cleanup) from keeping Jest open.
  // Must be AFTER setup.ts beforeAll (which needs real timers for DB pool).
  jest.useFakeTimers();
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
  jest.useRealTimers();
});

// Dynamic import after env is set
let normalizePhone: typeof import("../src/services/whatsappService").normalizePhone;
let isWhatsAppConfigured: typeof import("../src/services/whatsappService").isWhatsAppConfigured;
let sendTextMessage: typeof import("../src/services/whatsappService").sendTextMessage;
let sendTemplateMessage: typeof import("../src/services/whatsappService").sendTemplateMessage;
let sendBillReceipt: typeof import("../src/services/whatsappService").sendBillReceipt;
let getWebhookVerifyToken: typeof import("../src/services/whatsappService").getWebhookVerifyToken;

beforeAll(async () => {
  const mod = require("../src/services/whatsappService");
  normalizePhone = mod.normalizePhone;
  isWhatsAppConfigured = mod.isWhatsAppConfigured;
  sendTextMessage = mod.sendTextMessage;
  sendTemplateMessage = mod.sendTemplateMessage;
  sendBillReceipt = mod.sendBillReceipt;
  getWebhookVerifyToken = mod.getWebhookVerifyToken;
});

beforeEach(() => {
  mockFetch.mockReset();
});

// =============================================================================
// PHONE NORMALIZATION
// =============================================================================
describe("normalizePhone", () => {
  describe("valid Indian mobile numbers", () => {
    it("prepends 91 to 10-digit number starting with 9", () => {
      expect(normalizePhone("9876543210")).toBe("919876543210");
    });

    it("prepends 91 to 10-digit number starting with 8", () => {
      expect(normalizePhone("8765432109")).toBe("918765432109");
    });

    it("prepends 91 to 10-digit number starting with 7", () => {
      expect(normalizePhone("7654321098")).toBe("917654321098");
    });

    it("prepends 91 to 10-digit number starting with 6", () => {
      expect(normalizePhone("6543210987")).toBe("916543210987");
    });

    it("handles 11-digit with leading 0 (Indian local format)", () => {
      expect(normalizePhone("09876543210")).toBe("919876543210");
    });

    it("passes through 12-digit with 91 prefix (already E.164)", () => {
      expect(normalizePhone("919876543210")).toBe("919876543210");
    });
  });

  describe("strips non-digit characters", () => {
    it("strips spaces", () => {
      expect(normalizePhone("98765 43210")).toBe("919876543210");
    });

    it("strips dashes", () => {
      expect(normalizePhone("987-654-3210")).toBe("919876543210");
    });

    it("strips parentheses and plus", () => {
      expect(normalizePhone("+91(987)654-3210")).toBe("919876543210");
    });

    it("strips dots", () => {
      expect(normalizePhone("987.654.3210")).toBe("919876543210");
    });
  });

  describe("invalid/non-Indian numbers", () => {
    it("rejects 10-digit starting with 5 (not Indian mobile)", () => {
      expect(normalizePhone("5876543210")).toBe("5876543210");
    });

    it("rejects 10-digit starting with 1", () => {
      expect(normalizePhone("1234567890")).toBe("1234567890");
    });

    it("returns short number as-is", () => {
      expect(normalizePhone("12345")).toBe("12345");
    });

    it("returns empty string for empty input", () => {
      expect(normalizePhone("")).toBe("");
    });

    it("returns empty string for non-digit input", () => {
      expect(normalizePhone("abcdef")).toBe("");
    });

    it("handles 13+ digit numbers as-is", () => {
      expect(normalizePhone("9199876543210")).toBe("9199876543210");
    });
  });

  describe("edge cases", () => {
    it("handles 11-digit with leading 0 but non-mobile digit", () => {
      // 0 + 5xxxxxxxxx — not valid Indian mobile
      expect(normalizePhone("05876543210")).toBe("05876543210");
    });

    it("handles 12-digit with 91 but non-mobile digit", () => {
      // 91 + 5xxxxxxxxx — not valid Indian mobile
      expect(normalizePhone("915876543210")).toBe("915876543210");
    });
  });
});

// =============================================================================
// CONFIGURATION CHECK
// =============================================================================
describe("isWhatsAppConfigured", () => {
  it("returns true when both token and phone number ID are set", () => {
    expect(isWhatsAppConfigured()).toBe(true);
  });
});

describe("getWebhookVerifyToken", () => {
  it("returns the configured verify token", () => {
    expect(getWebhookVerifyToken()).toBe("test-verify-token");
  });
});

// =============================================================================
// SEND TEXT MESSAGE
// =============================================================================
describe("sendTextMessage", () => {
  it("sends text message and returns wamid on success", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.abc123" }] }),
    });

    const result = await sendTextMessage({ to: "9876543210", body: "Hello!" });

    expect(result.sent).toBe(true);
    expect(result.wamid).toBe("wamid.abc123");
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(url).toContain("graph.facebook.com/v22.0/968976229638443/messages");
    expect(opts.method).toBe("POST");
    expect(opts.headers.Authorization).toBe("Bearer test-token-123");

    const body = JSON.parse(opts.body);
    expect(body.messaging_product).toBe("whatsapp");
    expect(body.to).toBe("919876543210");
    expect(body.type).toBe("text");
    expect(body.text.body).toBe("Hello!");
  });

  it("returns error on Meta API failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({
        error: { message: "Invalid phone number", code: 100 },
      }),
    });

    const result = await sendTextMessage({ to: "9876543210", body: "Hello!" });

    expect(result.sent).toBe(false);
    expect(result.errorCode).toBe("100");
    expect(result.errorMessage).toBe("Invalid phone number");
  });

  it("returns error on network failure", async () => {
    // WA-002: Provide 3 rejection mocks (original + 2 retries) for network errors
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));
    mockFetch.mockRejectedValueOnce(new Error("Network timeout"));

    const resultPromise = sendTextMessage({ to: "9876543210", body: "Test" });
    await jest.advanceTimersByTimeAsync(10000);
    const result = await resultPromise;

    expect(result.sent).toBe(false);
    expect(result.errorCode).toBe("REQUEST_FAILED");
    expect(result.errorMessage).toBe("Network timeout");
  });

  it("rejects invalid phone number (too short)", async () => {
    const result = await sendTextMessage({ to: "12345", body: "Test" });

    expect(result.sent).toBe(false);
    expect(result.errorCode).toBe("INVALID_PHONE");
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("normalizes phone before sending", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.xyz" }] }),
    });

    await sendTextMessage({ to: "07000000005", body: "Test" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.to).toBe("917000000005");
  });
});

// =============================================================================
// SEND TEMPLATE MESSAGE
// =============================================================================
describe("sendTemplateMessage", () => {
  it("sends template with correct payload structure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.tmpl1" }] }),
    });

    const result = await sendTemplateMessage({
      to: "7000000001",
      templateName: "bill_receipt",
      languageCode: "en_US",
      components: [
        {
          type: "body",
          parameters: [{ type: "text", text: "₹500.00" }],
        },
      ],
    });

    expect(result.sent).toBe(true);

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("bill_receipt");
    expect(body.template.language.code).toBe("en_US");
    expect(body.template.components).toHaveLength(1);
    expect(body.template.components[0].type).toBe("body");
  });

  it("defaults languageCode to en_US", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.tmpl2" }] }),
    });

    await sendTemplateMessage({ to: "7000000002", templateName: "hello_world" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.template.language.code).toBe("en_US");
  });

  it("omits components when not provided", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.tmpl3" }] }),
    });

    await sendTemplateMessage({ to: "7000000003", templateName: "hello_world" });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(body.template.components).toBeUndefined();
  });
});

// =============================================================================
// SEND BILL RECEIPT
// =============================================================================
describe("sendBillReceipt", () => {
  it("formats bill receipt text correctly", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.bill1" }] }),
    });

    await sendBillReceipt({
      to: "7000000004",
      storeName: "Fresh Mart",
      billRef: "BILL-001",
      amount: "₹150.00",
      paymentMode: "UPI",
    });

    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    // sendBillReceipt sends a template message first (not a text message)
    expect(body.type).toBe("template");
    expect(body.template.name).toBe("bill_receipt");
    const params = body.template.components[0].parameters;
    expect(params[0].text).toBe("Fresh Mart");
    expect(params[1].text).toBe("BILL-001");
    expect(params[2].text).toBe("₹150.00");
    expect(params[3].text).toBe("UPI");
  });
});

// =============================================================================
// RATE LIMITING
// =============================================================================
describe("rate limiting", () => {
  it("blocks after 3 messages per minute to same number", async () => {
    // Send 3 messages (should succeed)
    for (let i = 0; i < 3; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: `wamid.rl${i}` }] }),
      });
    }

    const phone = "6000000001"; // unique per test to avoid rate limit bleed
    const r1 = await sendTextMessage({ to: phone, body: "msg 1" });
    const r2 = await sendTextMessage({ to: phone, body: "msg 2" });
    const r3 = await sendTextMessage({ to: phone, body: "msg 3" });

    expect(r1.sent).toBe(true);
    expect(r2.sent).toBe(true);
    expect(r3.sent).toBe(true);

    // 4th should be rate limited
    const r4 = await sendTextMessage({ to: phone, body: "msg 4" });
    expect(r4.sent).toBe(false);
    expect(r4.errorCode).toBe("RATE_LIMITED");
    expect(mockFetch).toHaveBeenCalledTimes(3); // Only 3 actual API calls
  });

  it("allows messages to different phone numbers", async () => {
    for (let i = 0; i < 6; i++) {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ messages: [{ id: `wamid.diff${i}` }] }),
      });
    }

    const phones = ["6000000010", "6000000020", "6000000030", "6000000040", "6000000050", "6000000060"];
    for (const phone of phones) {
      const result = await sendTextMessage({ to: phone, body: "Hello" });
      expect(result.sent).toBe(true);
    }
  });
});

// =============================================================================
// RESPONSE HANDLING EDGE CASES
// =============================================================================
describe("Meta API response edge cases", () => {
  it("handles response with no messages array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({}), // No messages array
    });

    const result = await sendTextMessage({ to: "6000000100", body: "Test" });

    expect(result.sent).toBe(true);
    expect(result.wamid).toBeUndefined();
  });

  it("handles non-Error thrown by fetch", async () => {
    // WA-002: Provide 3 rejection mocks (original + 2 retries)
    mockFetch.mockRejectedValueOnce("string error");
    mockFetch.mockRejectedValueOnce("string error");
    mockFetch.mockRejectedValueOnce("string error");

    const resultPromise = sendTextMessage({ to: "6000000200", body: "Test" });
    await jest.advanceTimersByTimeAsync(10000);
    const result = await resultPromise;

    expect(result.sent).toBe(false);
    expect(result.errorCode).toBe("REQUEST_FAILED");
    expect(result.errorMessage).toBe("Unknown error");
  });

  it("handles Meta error without code field", async () => {
    // WA-002: Provide 3 mocks (original + 2 retries) for retryable 500 status
    const errorResponse = {
      ok: false,
      status: 500,
      json: async () => ({ error: { message: "Internal error" } }),
    };
    mockFetch.mockResolvedValueOnce(errorResponse);
    mockFetch.mockResolvedValueOnce(errorResponse);
    mockFetch.mockResolvedValueOnce(errorResponse);

    const resultPromise = sendTextMessage({ to: "6000000300", body: "Test" });
    await jest.advanceTimersByTimeAsync(10000);
    const result = await resultPromise;

    expect(result.sent).toBe(false);
    expect(result.errorMessage).toBe("Internal error");
  });

  it("handles HTTP error without error body", async () => {
    // WA-002: Provide 3 mocks (original + 2 retries) for retryable 429 status
    const errorResponse = {
      ok: false,
      status: 429,
      json: async () => ({}),
    };
    mockFetch.mockResolvedValueOnce(errorResponse);
    mockFetch.mockResolvedValueOnce(errorResponse);
    mockFetch.mockResolvedValueOnce(errorResponse);

    const resultPromise = sendTextMessage({ to: "6000000400", body: "Test" });
    await jest.advanceTimersByTimeAsync(10000);
    const result = await resultPromise;

    expect(result.sent).toBe(false);
    expect(result.errorCode).toBe("429");
    expect(result.errorMessage).toContain("Meta API error: 429");
  });
});

// =============================================================================
// WA-002: RETRY LOGIC TESTS
// =============================================================================
describe("Retry logic", () => {
  it("succeeds after transient 503 then success", async () => {
    // First attempt: 503 (retryable)
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
    });
    // Second attempt: success
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.retry_success" }] }),
    });

    const resultPromise = sendTextMessage({ to: "6000000500", body: "Retry test" });
    await jest.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;

    expect(result.sent).toBe(true);
    expect(result.wamid).toBe("wamid.retry_success");
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it("succeeds after network error then success", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNRESET"));
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.net_retry" }] }),
    });

    const resultPromise = sendTextMessage({ to: "6000000600", body: "Net retry" });
    await jest.advanceTimersByTimeAsync(5000);
    const result = await resultPromise;

    expect(result.sent).toBe(true);
    expect(result.wamid).toBe("wamid.net_retry");
  });

  it("does not retry on 400 (non-retryable)", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ error: { message: "Bad request", code: 100 } }),
    });

    const result = await sendTextMessage({ to: "6000000700", body: "No retry" });

    expect(result.sent).toBe(false);
    expect(result.errorCode).toBe("100");
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
