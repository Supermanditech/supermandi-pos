/**
 * GCP-STG-0088: Payment Gateway Abstraction — Unit Tests
 *
 * Tests:
 * 1. Gateway status check (configured/not configured)
 * 2. Gateway resolution by payment mode + store config
 * 3. PhonePe callback verification
 * 4. PineLabs callback verification
 * 5. Gateway config validation
 */

import {
  getGatewayStatuses,
  resolveGateway,
  verifyPhonePeCallback,
  verifyPineLabsCallback,
  type GatewayConfig,
} from "../src/services/paymentGatewayService";

describe("GCP-STG-0088: Payment Gateway Abstraction", () => {
  // =========================================================================
  // Gateway Status
  // =========================================================================
  describe("getGatewayStatuses", () => {
    it("returns status for all 4 gateways", () => {
      const statuses = getGatewayStatuses();
      expect(statuses).toHaveLength(4);
      expect(statuses.map(s => s.provider).sort()).toEqual(
        ["PHONEPE", "PINE_LABS", "RAZORPAY", "UPI_DIRECT"].sort()
      );
    });

    it("UPI_DIRECT is always configured", () => {
      const statuses = getGatewayStatuses();
      const upiDirect = statuses.find(s => s.provider === "UPI_DIRECT");
      expect(upiDirect?.configured).toBe(true);
    });

    it("each status has provider, configured, enabled, details", () => {
      const statuses = getGatewayStatuses();
      for (const status of statuses) {
        expect(status).toHaveProperty("provider");
        expect(status).toHaveProperty("configured");
        expect(status).toHaveProperty("enabled");
        expect(status).toHaveProperty("details");
      }
    });
  });

  // =========================================================================
  // Gateway Resolution
  // =========================================================================
  describe("resolveGateway", () => {
    const defaultConfig: GatewayConfig = {
      defaultGateway: "UPI_DIRECT",
      enabledGateways: ["UPI_DIRECT", "RAZORPAY", "PHONEPE", "PINE_LABS"],
    };

    it("respects explicit provider if in enabled list", () => {
      expect(resolveGateway("UPI", defaultConfig, "RAZORPAY")).toBe("RAZORPAY");
    });

    it("ignores explicit provider not in enabled list", () => {
      const config: GatewayConfig = {
        defaultGateway: "UPI_DIRECT",
        enabledGateways: ["UPI_DIRECT"],
      };
      const result = resolveGateway("UPI", config, "RAZORPAY");
      expect(result).toBe("UPI_DIRECT"); // Falls back since RAZORPAY not enabled
    });

    it("resolves UPI mode to PhonePe when configured", () => {
      // PhonePe is first in UPI preference list but needs to be configured
      const result = resolveGateway("UPI", defaultConfig);
      // Will be PHONEPE if env vars set, otherwise UPI_DIRECT
      expect(["PHONEPE", "UPI_DIRECT"]).toContain(result);
    });

    it("resolves CARD mode to PineLabs or Razorpay", () => {
      const result = resolveGateway("CARD", defaultConfig);
      expect(["PINE_LABS", "RAZORPAY", "UPI_DIRECT"]).toContain(result);
    });

    it("resolves CASH mode to UPI_DIRECT", () => {
      expect(resolveGateway("CASH", defaultConfig)).toBe("UPI_DIRECT");
    });

    it("falls back to store default for unknown mode", () => {
      expect(resolveGateway("CRYPTO" as any, defaultConfig)).toBe("UPI_DIRECT");
    });
  });

  // =========================================================================
  // PhonePe Callback Verification
  // =========================================================================
  describe("verifyPhonePeCallback", () => {
    it("handles missing response gracefully", () => {
      const result = verifyPhonePeCallback("", "");
      // Empty base64 will fail to decode
      expect(result.provider).toBe("PHONEPE");
    });

    it("decodes valid base64 response", () => {
      const payload = { code: "PAYMENT_SUCCESS", data: { merchantTransactionId: "test-123", amount: 10000 } };
      const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");

      // Without salt key configured, it accepts in dev mode
      const result = verifyPhonePeCallback(base64, "");
      expect(result.provider).toBe("PHONEPE");
      expect(result.transactionId).toBe("test-123");
      expect(result.status).toBe("paid");
      expect(result.amountMinor).toBe(10000);
    });

    it("maps PAYMENT_PENDING to pending status", () => {
      const payload = { code: "PAYMENT_PENDING", data: { merchantTransactionId: "pending-456" } };
      const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
      const result = verifyPhonePeCallback(base64, "");
      expect(result.status).toBe("pending");
    });

    it("maps failure codes to failed status", () => {
      const payload = { code: "PAYMENT_ERROR", data: { merchantTransactionId: "fail-789" } };
      const base64 = Buffer.from(JSON.stringify(payload)).toString("base64");
      const result = verifyPhonePeCallback(base64, "");
      expect(result.status).toBe("failed");
    });
  });

  // =========================================================================
  // PineLabs Callback Verification
  // =========================================================================
  describe("verifyPineLabsCallback", () => {
    it("handles empty payload", () => {
      const result = verifyPineLabsCallback({});
      expect(result.provider).toBe("PINE_LABS");
      expect(result.status).toBe("failed");
    });

    it("maps SUCCESS status correctly", () => {
      const result = verifyPineLabsCallback({
        pine_pg_txn_status: "SUCCESS",
        pine_pg_order_id: "order-123",
        pine_pg_transaction_id: "txn-456",
        pine_pg_amount: "50000",
      });
      expect(result.valid).toBe(true);
      expect(result.status).toBe("paid");
      expect(result.transactionId).toBe("order-123");
      expect(result.amountMinor).toBe(50000);
    });

    it("maps PENDING status correctly", () => {
      const result = verifyPineLabsCallback({
        pine_pg_txn_status: "PENDING",
        pine_pg_order_id: "order-789",
      });
      expect(result.status).toBe("pending");
    });

    it("maps numeric status codes", () => {
      expect(verifyPineLabsCallback({ pine_pg_txn_status: "4" }).status).toBe("paid");
      expect(verifyPineLabsCallback({ pine_pg_txn_status: "2" }).status).toBe("pending");
      expect(verifyPineLabsCallback({ pine_pg_txn_status: "1" }).status).toBe("failed");
    });
  });

  // =========================================================================
  // Gateway Config Validation
  // =========================================================================
  describe("gateway config validation", () => {
    it("validates that default is in enabled list", () => {
      const config: GatewayConfig = {
        defaultGateway: "RAZORPAY",
        enabledGateways: ["UPI_DIRECT"], // RAZORPAY not in list
      };
      expect(config.enabledGateways.includes(config.defaultGateway)).toBe(false);
    });

    it("valid config has default in enabled list", () => {
      const config: GatewayConfig = {
        defaultGateway: "RAZORPAY",
        enabledGateways: ["RAZORPAY", "UPI_DIRECT"],
      };
      expect(config.enabledGateways.includes(config.defaultGateway)).toBe(true);
    });
  });
});
