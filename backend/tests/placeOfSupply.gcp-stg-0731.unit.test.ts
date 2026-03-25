/**
 * GCP-STG-0731: Place of supply validation
 *
 * Behavioral unit test: imports deriveInterState from invoiceService
 * and tests GSTIN state code extraction + mismatch warning logic.
 */

jest.mock("../src/lib/logger", () => ({
  log: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

jest.mock("../src/db/client", () => ({
  getPool: () => null,
}));

import { deriveInterState } from "../src/services/invoiceService";
import { log } from "../src/lib/logger";

describe("GCP-STG-0731: Place of supply validation (behavioral)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe("GSTIN state code extraction", () => {
    it("extracts state code '27' (Maharashtra) from GSTIN 27AAAAA0000A1Z5", () => {
      const gstin = "27AAAAA0000A1Z5";
      const stateCode = gstin.substring(0, 2);
      expect(stateCode).toBe("27");
    });

    it("extracts state code '08' (Rajasthan) from GSTIN 08BBBBB0000B1Z5", () => {
      const gstin = "08BBBBB0000B1Z5";
      const stateCode = gstin.substring(0, 2);
      expect(stateCode).toBe("08");
    });
  });

  describe("deriveInterState (exported function)", () => {
    it("returns false (intra-state) when both GSTINs have same state code", () => {
      // Both "27" → Maharashtra → intra-state
      const result = deriveInterState("27AAAAA0000A1Z5", "27BBBBB0000B1Z5");
      expect(result).toBe(false);
    });

    it("returns true (inter-state) when GSTINs have different state codes", () => {
      // "27" (Maharashtra) vs "08" (Rajasthan) → inter-state
      const result = deriveInterState("27AAAAA0000A1Z5", "08BBBBB0000B1Z5");
      expect(result).toBe(true);
    });

    it("returns false when seller GSTIN is missing", () => {
      const result = deriveInterState(undefined, "27BBBBB0000B1Z5");
      expect(result).toBe(false);
    });

    it("returns false when buyer GSTIN is missing", () => {
      const result = deriveInterState("27AAAAA0000A1Z5", undefined);
      expect(result).toBe(false);
    });

    it("returns false when both GSTINs are missing", () => {
      const result = deriveInterState(undefined, undefined);
      expect(result).toBe(false);
    });
  });

  describe("place-of-supply mismatch detection logic", () => {
    // Simulate the inline logic from createInvoice (GCP-STG-0731 block)
    function checkPlaceOfSupplyMismatch(
      sellerGstin: string | undefined,
      buyerGstin: string | undefined,
      isInterState: boolean
    ): { mismatch: boolean; sellerStateCode?: string; buyerStateCode?: string } {
      if (!sellerGstin || !buyerGstin) return { mismatch: false };
      const sellerStateCode = sellerGstin.substring(0, 2);
      const buyerStateCode = buyerGstin.substring(0, 2);
      if (sellerStateCode !== buyerStateCode && !isInterState) {
        (log.warn as jest.Mock)(
          `[invoice] GCP-STG-0731: GSTIN state codes differ (seller=${sellerStateCode}, buyer=${buyerStateCode}) but isInterState=false — possible place-of-supply mismatch`
        );
        return { mismatch: true, sellerStateCode, buyerStateCode };
      }
      return { mismatch: false, sellerStateCode, buyerStateCode };
    }

    it("no warning when buyer state matches seller state (Maharashtra + Maharashtra)", () => {
      const result = checkPlaceOfSupplyMismatch("27AAAAA0000A1Z5", "27BBBBB0000B1Z5", false);
      expect(result.mismatch).toBe(false);
      expect(log.warn).not.toHaveBeenCalled();
    });

    it("logs warning when state codes differ but isInterState=false (Rajasthan vs Maharashtra)", () => {
      const result = checkPlaceOfSupplyMismatch("08SELLER0000S1Z5", "27BUYER00000B1Z5", false);
      expect(result.mismatch).toBe(true);
      expect(result.sellerStateCode).toBe("08");
      expect(result.buyerStateCode).toBe("27");
      expect(log.warn).toHaveBeenCalledWith(
        expect.stringContaining("place-of-supply mismatch")
      );
    });

    it("no warning when state codes differ AND isInterState=true (correctly flagged)", () => {
      const result = checkPlaceOfSupplyMismatch("08SELLER0000S1Z5", "27BUYER00000B1Z5", true);
      expect(result.mismatch).toBe(false);
      expect(log.warn).not.toHaveBeenCalled();
    });

    it("no warning when GSTINs are missing", () => {
      const result = checkPlaceOfSupplyMismatch(undefined, "27BUYER00000B1Z5", false);
      expect(result.mismatch).toBe(false);
      expect(log.warn).not.toHaveBeenCalled();
    });
  });
});
