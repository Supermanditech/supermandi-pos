// GCP-STG-0353: Inter-State GST Detection — IGST vs CGST+SGST
// Tests deriveInterState helper and createInvoice integration with isInterState flag

import { calculateItemTax, deriveInterState } from "../src/services/invoiceService";

describe("GCP-STG-0353: Inter-State GST Detection", () => {
  // -----------------------------------------------------------------------
  // deriveInterState
  // -----------------------------------------------------------------------
  describe("deriveInterState", () => {
    it("returns true when seller and buyer have different state codes", () => {
      // 08 = Rajasthan, 27 = Maharashtra
      expect(deriveInterState("08ABRCS8282R1ZY", "27AAFCM1234A1ZF")).toBe(true);
    });

    it("returns false when seller and buyer have same state code", () => {
      // Both 08 = Rajasthan
      expect(deriveInterState("08ABRCS8282R1ZY", "08XYZAB1234C1ZD")).toBe(false);
    });

    it("returns false when seller GSTIN is missing", () => {
      expect(deriveInterState(undefined, "27AAFCM1234A1ZF")).toBe(false);
    });

    it("returns false when buyer GSTIN is missing", () => {
      expect(deriveInterState("08ABRCS8282R1ZY", undefined)).toBe(false);
    });

    it("returns false when both GSTINs are missing", () => {
      expect(deriveInterState(undefined, undefined)).toBe(false);
    });

    it("returns false when seller GSTIN is empty string", () => {
      expect(deriveInterState("", "27AAFCM1234A1ZF")).toBe(false);
    });

    it("returns false when buyer GSTIN is too short", () => {
      expect(deriveInterState("08ABRCS8282R1ZY", "0")).toBe(false);
    });

    it("handles GSTIN with leading zeros correctly", () => {
      // 01 = Jammu & Kashmir, 02 = Himachal Pradesh
      expect(deriveInterState("01ABRCS8282R1ZY", "02XYZAB1234C1ZD")).toBe(true);
    });
  });

  // -----------------------------------------------------------------------
  // calculateItemTax with isInterState
  // -----------------------------------------------------------------------
  describe("calculateItemTax", () => {
    it("splits into CGST+SGST for intra-state (default)", () => {
      const tax = calculateItemTax(10000, 18, false);
      expect(tax.igstMinor).toBe(0);
      expect(tax.cgstMinor).toBe(900); // 9%
      expect(tax.sgstMinor).toBe(900); // 9%
      expect(tax.totalTaxMinor).toBe(1800);
      expect(tax.totalMinor).toBe(11800);
    });

    it("uses IGST for inter-state", () => {
      const tax = calculateItemTax(10000, 18, true);
      expect(tax.igstMinor).toBe(1800); // 18%
      expect(tax.cgstMinor).toBe(0);
      expect(tax.sgstMinor).toBe(0);
      expect(tax.totalTaxMinor).toBe(1800);
      expect(tax.totalMinor).toBe(11800);
    });

    it("defaults to intra-state when isInterState omitted", () => {
      const tax = calculateItemTax(10000, 12);
      expect(tax.igstMinor).toBe(0);
      expect(tax.cgstMinor).toBe(600);
      expect(tax.sgstMinor).toBe(600);
    });

    it("handles 0% GST correctly for inter-state", () => {
      const tax = calculateItemTax(5000, 0, true);
      expect(tax.igstMinor).toBe(0);
      expect(tax.cgstMinor).toBe(0);
      expect(tax.sgstMinor).toBe(0);
      expect(tax.totalTaxMinor).toBe(0);
      expect(tax.totalMinor).toBe(5000);
    });

    it("handles odd amounts with correct rounding for intra-state", () => {
      // 5% on 1001 = 50.05 → 50, split: cgst=25, sgst=25
      const tax = calculateItemTax(1001, 5, false);
      expect(tax.totalTaxMinor).toBe(50);
      expect(tax.cgstMinor + tax.sgstMinor).toBe(50);
    });
  });

  // -----------------------------------------------------------------------
  // Integration: deriveInterState used to choose tax split
  // -----------------------------------------------------------------------
  describe("Integration: GSTIN-based tax determination", () => {
    it("Rajasthan seller → Maharashtra buyer = IGST", () => {
      const isInter = deriveInterState("08ABRCS8282R1ZY", "27AAFCM1234A1ZF");
      const tax = calculateItemTax(10000, 18, isInter);
      expect(isInter).toBe(true);
      expect(tax.igstMinor).toBe(1800);
      expect(tax.cgstMinor).toBe(0);
      expect(tax.sgstMinor).toBe(0);
    });

    it("Rajasthan seller → Rajasthan buyer = CGST+SGST", () => {
      const isInter = deriveInterState("08ABRCS8282R1ZY", "08XYZAB1234C1ZD");
      const tax = calculateItemTax(10000, 18, isInter);
      expect(isInter).toBe(false);
      expect(tax.igstMinor).toBe(0);
      expect(tax.cgstMinor).toBe(900);
      expect(tax.sgstMinor).toBe(900);
    });

    it("Missing buyer GSTIN = intra-state (safe default)", () => {
      const isInter = deriveInterState("08ABRCS8282R1ZY", undefined);
      const tax = calculateItemTax(10000, 18, isInter);
      expect(isInter).toBe(false);
      expect(tax.igstMinor).toBe(0);
      expect(tax.cgstMinor).toBe(900);
    });
  });
});
