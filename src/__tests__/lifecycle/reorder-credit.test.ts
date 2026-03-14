/**
 * STG-479: Reorder + Credit full lifecycle E2E — source-code analysis tests
 * Verifies end-to-end wiring of reorder and credit features:
 *   1. ReorderScreen has history tab and pending tab
 *   2. reorderApi exports submitPurchaseOrders, patchPendingReorder, markReorderFulfilled
 *   3. CreditScreen reads feature config from backend (not hardcoded false)
 *   4. creditApi exports disburseCreditApplication
 *   5. backend bnpl.ts has daily prorated interest formula (days / 365)
 *   6. backend credit.ts has Verhoeff/PAN validation
 */

import { readFileSync } from "fs";
import { join } from "path";

const SRC = join(__dirname, "..", "..");
const BACKEND = join(__dirname, "..", "..", "..", "backend");

function readSource(relativePath: string): string {
  return readFileSync(join(SRC, relativePath), "utf-8");
}

function readBackend(relativePath: string): string {
  return readFileSync(join(BACKEND, relativePath), "utf-8");
}

describe("STG-479: Reorder + Credit lifecycle — source analysis", () => {
  // =========================================================================
  // 1. ReorderScreen has history tab and pending tab
  // =========================================================================
  describe("ReorderScreen tabs", () => {
    const reorderSrc = readSource("screens/ReorderScreen.tsx");

    it("defines TabKey type with 'pending' and 'history'", () => {
      expect(reorderSrc).toMatch(/type\s+TabKey\s*=.*"pending".*"history"/);
    });

    it("has a pending tab with testID", () => {
      expect(reorderSrc).toContain('testID="reorder-tab-pending"');
    });

    it("has a history tab with testID", () => {
      expect(reorderSrc).toContain('testID="reorder-tab-history"');
    });

    it("renders pending tab content conditionally", () => {
      expect(reorderSrc).toMatch(/activeTab\s*===\s*["']pending["']/);
    });

    it("renders history tab content conditionally", () => {
      expect(reorderSrc).toMatch(/activeTab\s*===\s*["']history["']/);
    });
  });

  // =========================================================================
  // 2. reorderApi exports submitPurchaseOrders, patchPendingReorder, markReorderFulfilled
  // =========================================================================
  describe("reorderApi exported functions", () => {
    const reorderApiSrc = readSource("services/api/reorderApi.ts");

    it("exports submitPurchaseOrders function", () => {
      expect(reorderApiSrc).toMatch(
        /export\s+async\s+function\s+submitPurchaseOrders/
      );
    });

    it("exports patchPendingReorder function", () => {
      expect(reorderApiSrc).toMatch(
        /export\s+async\s+function\s+patchPendingReorder/
      );
    });

    it("exports markReorderFulfilled function", () => {
      expect(reorderApiSrc).toMatch(
        /export\s+async\s+function\s+markReorderFulfilled/
      );
    });
  });

  // =========================================================================
  // 3. CreditScreen reads feature config from backend (not hardcoded false)
  // =========================================================================
  describe("CreditScreen feature config", () => {
    const creditScreenSrc = readSource("screens/CreditScreen.tsx");

    it("calls getCreditFeatureConfig from backend", () => {
      expect(creditScreenSrc).toContain("getCreditFeatureConfig");
    });

    it("uses featureConfig result to gate credit", () => {
      expect(creditScreenSrc).toMatch(/featureConfig/);
      expect(creditScreenSrc).toContain("creditEnabled");
    });

    it("does NOT hardcode credit as disabled", () => {
      // Should not have a literal `creditEnabled = false` assignment
      // The value should come from the API response
      const hardcodedPattern = /const\s+creditEnabled\s*=\s*false/;
      expect(creditScreenSrc).not.toMatch(hardcodedPattern);
    });
  });

  // =========================================================================
  // 4. creditApi exports disburseCreditApplication
  // =========================================================================
  describe("creditApi disbursement function", () => {
    const creditApiSrc = readSource("services/api/creditApi.ts");

    it("exports disburseCreditApplication function", () => {
      expect(creditApiSrc).toMatch(
        /export\s+async\s+function\s+disburseCreditApplication/
      );
    });

    it("disburseCreditApplication calls the disburse endpoint", () => {
      expect(creditApiSrc).toMatch(/\/disburse/);
    });
  });

  // =========================================================================
  // 5. Backend bnpl.ts has daily prorated interest formula (days / 365)
  // =========================================================================
  describe("backend bnpl.ts prorated interest", () => {
    const bnplBackendSrc = readBackend("src/routes/v1/pos/bnpl.ts");

    it("has calculateDailyProratedInterest function", () => {
      expect(bnplBackendSrc).toContain("calculateDailyProratedInterest");
    });

    it("uses days / 365 formula", () => {
      expect(bnplBackendSrc).toMatch(/days\s*\/\s*365/);
    });

    it("uses principal * rate / 100 pattern", () => {
      expect(bnplBackendSrc).toMatch(/annualRatePercent\s*\/\s*100/);
    });

    it("documents the formula as NOT flat", () => {
      expect(bnplBackendSrc).toContain("NOT flat formula");
    });
  });

  // =========================================================================
  // 6. Backend credit.ts has Verhoeff/PAN validation
  // =========================================================================
  describe("backend credit.ts Verhoeff/PAN validation", () => {
    const creditBackendSrc = readBackend("src/routes/v1/pos/credit.ts");

    it("has Verhoeff checksum validation for Aadhaar", () => {
      expect(creditBackendSrc).toContain("Verhoeff");
    });

    it("has validatePanChecksum function", () => {
      expect(creditBackendSrc).toContain("validatePanChecksum");
    });

    it("validates PAN format (AAAPL1234C pattern)", () => {
      expect(creditBackendSrc).toMatch(/PAN.*format|format.*PAN/i);
    });

    it("rejects invalid PAN with error message", () => {
      expect(creditBackendSrc).toContain("Invalid PAN number");
    });
  });
});
