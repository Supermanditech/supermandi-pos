/**
 * V3-HARDEN-103: Runtime proof for WhatsApp server-send + fallback
 * Tests the REAL shareBillWhatsApp function from billShare.ts
 * SuccessScreenV3 delegates to shareBillWhatsApp, so these tests
 * cover the live screen path. Zero fs.readFileSync.
 */

// ── Mock setup (before imports) ────────────────────────────────────────────

const mockApiPost = jest.fn();
const mockIsOnline = jest.fn();
const mockCanOpenURL = jest.fn();
const mockOpenURL = jest.fn();

jest.mock("../../services/networkStatus", () => ({
  isOnline: () => mockIsOnline(),
}));

jest.mock("../../services/api/apiClient", () => ({
  apiClient: { post: (...args: any[]) => mockApiPost(...args), get: jest.fn() },
}));

jest.mock("../../config/api", () => ({
  API_BASE_URL: "http://test",
  BUILD_INFO: { gitSha: "test" },
}));

// Mock Linking on the real react-native module
beforeAll(() => {
  const RN = require("react-native");
  RN.Linking.openURL = mockOpenURL;
  RN.Linking.canOpenURL = mockCanOpenURL;
});

jest.mock("expo-print", () => ({ printToFileAsync: jest.fn() }));
jest.mock("expo-sharing", () => ({ shareAsync: jest.fn() }));

// ── Import REAL production code ────────────────────────────────────────────

import { shareBillWhatsApp } from "../../services/billing/billShare";
import type { BillSnapshot } from "../../services/billing/billTypes";

// ── Tests ──────────────────────────────────────────────────────────────────

const makeSnapshot = (saleId?: string): BillSnapshot => ({
  saleId: saleId ?? "sale-001",
  billRef: "SM-2026-001",
  status: "completed",
  paymentMode: "CASH",
  currency: "INR",
  createdAt: new Date().toISOString(),
  subtotalMinor: 4000,
  discountMinor: 0,
  totalMinor: 4000,
  items: [{ name: "Coke", quantity: 2, priceMinor: 2000, lineTotalMinor: 4000 }],
});

describe("V3-HARDEN-103: shareBillWhatsApp (real function)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockCanOpenURL.mockResolvedValue(true);
    mockOpenURL.mockResolvedValue(undefined);
    mockIsOnline.mockResolvedValue(true);
    mockApiPost.mockResolvedValue({ sent: true });
  });

  it("sends { saleId, recipientPhone } to server when phone exists and online", async () => {
    await shareBillWhatsApp(makeSnapshot("sale-001"), "+91-9876543210");

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/v1/pos/whatsapp/send-bill",
      { saleId: "sale-001", recipientPhone: "919876543210" }
    );
    // Deep-link should NOT be called when server succeeds
    expect(mockOpenURL).not.toHaveBeenCalled();
  });

  it("falls back to deep-link when server send fails", async () => {
    mockApiPost.mockRejectedValue(new Error("server error"));

    await shareBillWhatsApp(makeSnapshot("sale-001"), "9876543210");

    expect(mockApiPost).toHaveBeenCalledTimes(1);
    // Should fall through to deep-link
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    expect(mockOpenURL.mock.calls[0][0]).toContain("whatsapp://send");
  });

  it("falls back to deep-link when offline", async () => {
    mockIsOnline.mockResolvedValue(false);

    await shareBillWhatsApp(makeSnapshot("sale-001"), "9876543210");

    // Server send NOT attempted when offline
    expect(mockApiPost).not.toHaveBeenCalled();
    // Deep-link used instead
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
  });

  it("uses deep-link when no phone provided", async () => {
    await shareBillWhatsApp(makeSnapshot("sale-001"));

    // No server send without phone
    expect(mockApiPost).not.toHaveBeenCalled();
    // Deep-link used
    expect(mockOpenURL).toHaveBeenCalledTimes(1);
    expect(mockOpenURL.mock.calls[0][0]).toContain("whatsapp://send?text=");
  });

  it("uses deep-link when no saleId", async () => {
    await shareBillWhatsApp(makeSnapshot(undefined), "9876543210");

    // saleId is "sale-001" from makeSnapshot default — let's test with empty
    // Actually makeSnapshot always provides saleId. Test with explicit undefined:
    const noSaleSnapshot = { ...makeSnapshot(), saleId: undefined } as any;
    await shareBillWhatsApp(noSaleSnapshot, "9876543210");

    // Server send requires saleId — should skip and use deep-link
    expect(mockOpenURL).toHaveBeenCalled();
  });

  it("cleans phone digits before sending to server", async () => {
    await shareBillWhatsApp(makeSnapshot(), "+91-987-654-3210");

    expect(mockApiPost).toHaveBeenCalledWith(
      "/api/v1/pos/whatsapp/send-bill",
      expect.objectContaining({ recipientPhone: "919876543210" })
    );
  });
});
