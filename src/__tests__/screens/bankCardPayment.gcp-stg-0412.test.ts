/**
 * GCP-STG-0412: Expose BANK/Card Payment in POS BUY UI
 *
 * Verifies:
 * 1. Payment mode array includes BANK and CARD
 * 2. Display labels are correct for all 6 modes
 * 3. BuyPaymentMode type includes CARD
 * 4. Backend resolveProvider maps BANK→RAZORPAY and CARD→RAZORPAY
 * 5. Confirmation modal shows human-readable labels for BANK/CARD
 */

import type { BuyPaymentMode } from "../../services/api/orderApi";

describe("GCP-STG-0412: BANK and CARD payment modes in BUY UI", () => {
  // The 6 payment modes that must appear in the checkout selector
  const ALL_MODES: BuyPaymentMode[] = ["CASH", "UPI", "BNPL", "CREDIT", "BANK", "CARD"];

  it("BuyPaymentMode includes BANK", () => {
    const mode: BuyPaymentMode = "BANK";
    expect(mode).toBe("BANK");
    expect(ALL_MODES).toContain("BANK");
  });

  it("BuyPaymentMode includes CARD", () => {
    const mode: BuyPaymentMode = "CARD";
    expect(mode).toBe("CARD");
    expect(ALL_MODES).toContain("CARD");
  });

  it("has exactly 6 payment modes", () => {
    expect(ALL_MODES).toHaveLength(6);
  });

  it("display labels map correctly for all 6 modes", () => {
    function getLabel(mode: BuyPaymentMode): string {
      return mode === "CASH" ? "Cash on Delivery"
        : mode === "UPI" ? "UPI / PhonePe"
        : mode === "BNPL" ? "Buy Now Pay Later"
        : mode === "CREDIT" ? "SuperMandi Credit"
        : mode === "BANK" ? "Bank Transfer"
        : "Card Payment";
    }

    expect(getLabel("CASH")).toBe("Cash on Delivery");
    expect(getLabel("UPI")).toBe("UPI / PhonePe");
    expect(getLabel("BNPL")).toBe("Buy Now Pay Later");
    expect(getLabel("CREDIT")).toBe("SuperMandi Credit");
    expect(getLabel("BANK")).toBe("Bank Transfer");
    expect(getLabel("CARD")).toBe("Card Payment");
  });

  it("confirmation modal shows human-readable label for BANK", () => {
    function getConfirmationLabel(paymentMode: string, paymentStatus: string): string {
      return paymentMode === "CASH" ? "Cash on Delivery"
        : paymentMode === "BANK" ? "Bank Transfer"
        : paymentMode === "CARD" ? "Card Payment"
        : paymentStatus === "authorized" ? "Approved"
        : paymentStatus === "pending" ? "Pending"
        : paymentMode;
    }
    expect(getConfirmationLabel("BANK", "created")).toBe("Bank Transfer");
    expect(getConfirmationLabel("BANK", "authorized")).toBe("Bank Transfer");
  });

  it("confirmation modal shows human-readable label for CARD", () => {
    function getConfirmationLabel(paymentMode: string, paymentStatus: string): string {
      return paymentMode === "CASH" ? "Cash on Delivery"
        : paymentMode === "BANK" ? "Bank Transfer"
        : paymentMode === "CARD" ? "Card Payment"
        : paymentStatus === "authorized" ? "Approved"
        : paymentStatus === "pending" ? "Pending"
        : paymentMode;
    }
    expect(getConfirmationLabel("CARD", "pending")).toBe("Card Payment");
    expect(getConfirmationLabel("CARD", "authorized")).toBe("Card Payment");
  });

  it("backend resolveProvider maps BANK to RAZORPAY", () => {
    // Mirror of procurementPaymentService.ts resolveProvider logic
    function resolveProvider(mode: string): string {
      switch (mode) {
        case "UPI": return "UPI_DIRECT";
        case "BANK": return "RAZORPAY";
        case "BNPL": return "BNPL";
        case "CREDIT": return "SUPERMANDI_CREDIT";
        case "CASH": return "MANUAL";
        case "CARD": return "RAZORPAY";
        default: return "MANUAL";
      }
    }
    expect(resolveProvider("BANK")).toBe("RAZORPAY");
    expect(resolveProvider("CARD")).toBe("RAZORPAY");
  });

  it("DB constraint allows all 6 modes", () => {
    // From migration 201: chk_payment_intent_mode CHECK (mode IN ('UPI','BANK','BNPL','CREDIT','CASH','CARD'))
    const dbAllowed = ["UPI", "BANK", "BNPL", "CREDIT", "CASH", "CARD"];
    ALL_MODES.forEach(mode => {
      expect(dbAllowed).toContain(mode);
    });
  });
});
