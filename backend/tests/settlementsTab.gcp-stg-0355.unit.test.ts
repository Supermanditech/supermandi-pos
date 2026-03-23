/**
 * GCP-STG-0355: Settlements Management Tab — Contract + Wiring Tests
 *
 * Validates:
 * 1. API client functions exist with correct signatures
 * 2. SettlementsTab component exports correctly
 * 3. Tab is wired into App.tsx (TabKey, sidebar, content rendering)
 * 4. All 5 settlement API functions match backend route signatures
 */
import * as fs from "fs";
import * as path from "path";

const SA_ROOT = path.resolve(__dirname, "../../supermandi-superadmin/src");

describe("GCP-STG-0355: Settlements Management Tab", () => {
  // =========================================================================
  // 1. API client file exists and exports required functions
  // =========================================================================
  describe("API client (settlements.ts)", () => {
    const apiPath = path.join(SA_ROOT, "api/settlements.ts");
    let apiSrc: string;

    beforeAll(() => {
      apiSrc = fs.readFileSync(apiPath, "utf-8");
    });

    it("file exists", () => {
      expect(fs.existsSync(apiPath)).toBe(true);
    });

    it("exports fetchSettlements function", () => {
      expect(apiSrc).toContain("export async function fetchSettlements");
    });

    it("exports fetchSettlementSummary function", () => {
      expect(apiSrc).toContain("export async function fetchSettlementSummary");
    });

    it("exports approveSettlement function", () => {
      expect(apiSrc).toContain("export async function approveSettlement");
    });

    it("exports bulkApproveSettlements function", () => {
      expect(apiSrc).toContain("export async function bulkApproveSettlements");
    });

    it("exports markSettlementPaid function", () => {
      expect(apiSrc).toContain("export async function markSettlementPaid");
    });

    it("calls correct admin endpoint for list", () => {
      expect(apiSrc).toContain("/api/v1/admin/settlements");
    });

    it("calls correct admin endpoint for summary", () => {
      expect(apiSrc).toContain("/api/v1/admin/settlements/summary");
    });

    it("calls correct admin endpoint for approve", () => {
      expect(apiSrc).toContain("/admin/settlements/${encodeURIComponent(id)}/approve");
    });

    it("calls correct admin endpoint for bulk-approve", () => {
      expect(apiSrc).toContain("/api/v1/admin/settlements/bulk-approve");
    });

    it("calls correct admin endpoint for mark-paid", () => {
      expect(apiSrc).toContain("/admin/settlements/${encodeURIComponent(id)}/mark-paid");
    });

    it("exports SettlementRecord type", () => {
      expect(apiSrc).toContain("export interface SettlementRecord");
    });

    it("exports SettlementSummary type", () => {
      expect(apiSrc).toContain("export interface SettlementSummary");
    });

    it("exports SettlementStatus type", () => {
      expect(apiSrc).toContain("export type SettlementStatus");
    });

    it("uses getAuthHeaders for authentication", () => {
      expect(apiSrc).toContain("getAuthHeaders()");
    });

    it("uses fetchWithTimeout (not raw fetch)", () => {
      expect(apiSrc).toContain("fetchWithTimeout");
      // Should NOT use raw fetch
      expect(apiSrc).not.toMatch(/\bfetch\(/);
    });
  });

  // =========================================================================
  // 2. Tab component file exists and exports SettlementsTab
  // =========================================================================
  describe("Tab component (SettlementsTab.tsx)", () => {
    const tabPath = path.join(SA_ROOT, "tabs/SettlementsTab.tsx");
    let tabSrc: string;

    beforeAll(() => {
      tabSrc = fs.readFileSync(tabPath, "utf-8");
    });

    it("file exists", () => {
      expect(fs.existsSync(tabPath)).toBe(true);
    });

    it("exports SettlementsTab function", () => {
      expect(tabSrc).toContain("export function SettlementsTab");
    });

    it("imports all 5 API functions", () => {
      expect(tabSrc).toContain("fetchSettlements");
      expect(tabSrc).toContain("fetchSettlementSummary");
      expect(tabSrc).toContain("approveSettlement");
      expect(tabSrc).toContain("bulkApproveSettlements");
      expect(tabSrc).toContain("markSettlementPaid");
    });

    it("renders summary cards (Pending, Approved, Paid)", () => {
      expect(tabSrc).toContain("totalPendingMinor");
      expect(tabSrc).toContain("totalApprovedMinor");
      expect(tabSrc).toContain("totalPaidMinor");
    });

    it("has status filter dropdown", () => {
      expect(tabSrc).toContain("filter-settlement-status");
    });

    it("has supplier filter input", () => {
      expect(tabSrc).toContain("filter-settlement-supplier");
    });

    it("has date range filters", () => {
      expect(tabSrc).toContain("filter-settlement-from");
      expect(tabSrc).toContain("filter-settlement-to");
    });

    it("has Approve button for pending settlements", () => {
      expect(tabSrc).toContain('s.status === "pending"');
      expect(tabSrc).toContain("handleApprove");
    });

    it("has Mark Paid button for approved settlements", () => {
      expect(tabSrc).toContain('s.status === "approved"');
      expect(tabSrc).toContain("setMarkPaidId");
    });

    it("has Mark Paid modal with UTR input", () => {
      expect(tabSrc).toContain("payout-ref");
      expect(tabSrc).toContain("payout-utr");
      expect(tabSrc).toContain("Mark Settlement as Paid");
    });

    it("has bulk approve functionality", () => {
      expect(tabSrc).toContain("bulk-approve-supplier");
      expect(tabSrc).toContain("handleBulkApprove");
      expect(tabSrc).toContain("Bulk Approve");
    });

    it("uses ConfirmDialog for money-movement actions (R7.SA.007)", () => {
      expect(tabSrc).toContain("ConfirmDialog");
      expect(tabSrc).toContain("confirmDialog");
    });

    it("uses Indian currency formatting", () => {
      expect(tabSrc).toContain("en-IN");
      expect(tabSrc).toContain("INR");
    });

    it("has pagination controls", () => {
      expect(tabSrc).toContain("Previous");
      expect(tabSrc).toContain("Next");
      expect(tabSrc).toContain("sa-pagination");
    });

    it("handles all 4 UX states (loading/success/empty/error)", () => {
      expect(tabSrc).toContain("Loading settlements...");
      expect(tabSrc).toContain("No settlements found");
      expect(tabSrc).toContain("sa-alert-error");
      expect(tabSrc).toContain("<table");
    });
  });

  // =========================================================================
  // 3. App.tsx wiring
  // =========================================================================
  describe("App.tsx wiring", () => {
    const appPath = path.join(SA_ROOT, "App.tsx");
    let appSrc: string;

    beforeAll(() => {
      appSrc = fs.readFileSync(appPath, "utf-8");
    });

    it("imports SettlementsTab", () => {
      expect(appSrc).toContain('import { SettlementsTab } from "./tabs/SettlementsTab"');
    });

    it("has settlements sidebar button", () => {
      expect(appSrc).toContain('tab === "settlements"');
      expect(appSrc).toContain("Settlements</span>");
    });

    it("has settlements mobile tab button", () => {
      expect(appSrc).toContain('aria-selected={tab === "settlements"}');
    });

    it("renders SettlementsTab when tab is active", () => {
      expect(appSrc).toContain('{tab === "settlements" && <SettlementsTab />}');
    });

    it("imports Banknote icon for settlements", () => {
      expect(appSrc).toContain("Banknote");
    });
  });

  // =========================================================================
  // 4. TabKey type includes settlements
  // =========================================================================
  describe("types.ts", () => {
    const typesPath = path.join(SA_ROOT, "types.ts");
    let typesSrc: string;

    beforeAll(() => {
      typesSrc = fs.readFileSync(typesPath, "utf-8");
    });

    it("TabKey includes 'settlements'", () => {
      expect(typesSrc).toContain('"settlements"');
    });
  });

  // =========================================================================
  // 5. Backend route exists (cross-check)
  // =========================================================================
  describe("Backend admin settlement routes", () => {
    const routePath = path.resolve(__dirname, "../src/routes/v1/admin/settlements.ts");
    let routeSrc: string;

    beforeAll(() => {
      routeSrc = fs.readFileSync(routePath, "utf-8");
    });

    it("has GET /settlements list route", () => {
      expect(routeSrc).toContain('get("/settlements"');
    });

    it("has GET /settlements/summary route", () => {
      expect(routeSrc).toContain('get("/settlements/summary"');
    });

    it("has POST /settlements/:id/approve route", () => {
      expect(routeSrc).toContain('post("/settlements/:id/approve"');
    });

    it("has POST /settlements/bulk-approve route", () => {
      expect(routeSrc).toContain('post("/settlements/bulk-approve"');
    });

    it("has POST /settlements/:id/mark-paid route", () => {
      expect(routeSrc).toContain('post("/settlements/:id/mark-paid"');
    });
  });
});
