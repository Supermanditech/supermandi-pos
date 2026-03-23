/**
 * GCP-STG-0354: Dual Payout Systems Integration — settlement_records ↔ supplier_payouts cross-reference
 *
 * Validates:
 * 1. markSettlementPaid accepts and stores payoutId
 * 2. markSettlementPaidByPayout updates settlements by payout_id FK
 * 3. markSettlementPaidByPayout fallback matches by supplier + order
 * 4. handlePayoutWebhook calls markSettlementPaidByPayout on payout.processed
 * 5. processScheduledPayout calls markSettlementPaidByPayout on success
 * 6. Migration 224 adds payout_id column
 */

import { describe, it, expect, jest, beforeEach } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

// ---------------------------------------------------------------------------
// Mock pool
// ---------------------------------------------------------------------------

type QueryFn = (sql: string, params?: unknown[]) => Promise<{ rows: unknown[]; rowCount: number }>;

function createMockPool(queryFn: QueryFn) {
  const client = {
    query: jest.fn(queryFn as any),
    release: jest.fn(),
  };
  return {
    query: jest.fn(queryFn as any),
    connect: jest.fn(async () => client),
    _client: client,
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GCP-STG-0354: Settlement ↔ Payout Integration", () => {

  // -----------------------------------------------------------------------
  // 1. markSettlementPaid accepts payoutId parameter
  // -----------------------------------------------------------------------
  describe("markSettlementPaid — payoutId parameter", () => {
    it("includes payout_id in the UPDATE query when provided", async () => {
      const { markSettlementPaid } = await import("../src/services/settlementService");
      const pool = createMockPool(async () => ({ rows: [], rowCount: 1 }));

      await markSettlementPaid(
        pool as any,
        "sett-001",
        "ref-123",
        "UTR999",
        "razorpay",
        "payout-abc"
      );

      expect(pool.query).toHaveBeenCalledTimes(1);
      const [sql, params] = (pool.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      expect(sql).toContain("payout_id");
      expect(params).toContain("payout-abc");
    });

    it("passes null when payoutId is omitted (backward-compatible)", async () => {
      const { markSettlementPaid } = await import("../src/services/settlementService");
      const pool = createMockPool(async () => ({ rows: [], rowCount: 1 }));

      await markSettlementPaid(pool as any, "sett-001", "ref-123");

      const [, params] = (pool.query as jest.Mock).mock.calls[0] as [string, unknown[]];
      // Last param should be null (no payoutId)
      expect(params[params.length - 1]).toBeNull();
    });
  });

  // -----------------------------------------------------------------------
  // 2. markSettlementPaidByPayout — direct FK match
  // -----------------------------------------------------------------------
  describe("markSettlementPaidByPayout — direct FK match", () => {
    it("updates settlement via payout_id and returns count", async () => {
      const { markSettlementPaidByPayout } = await import("../src/services/settlementService");
      const pool = createMockPool(async (sql: string) => {
        if (sql.includes("WHERE payout_id")) {
          return { rows: [{ id: "sett-1" }], rowCount: 1 };
        }
        return { rows: [], rowCount: 0 };
      });

      const count = await markSettlementPaidByPayout(
        pool as any,
        "payout-abc",
        "UTR123",
        "supplier-001",
        "po-001"
      );

      expect(count).toBe(1);
      // Should NOT hit fallback query
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 3. markSettlementPaidByPayout — fallback by supplier + order
  // -----------------------------------------------------------------------
  describe("markSettlementPaidByPayout — fallback match", () => {
    it("falls back to supplier_id + order_id match when payout_id has no hits", async () => {
      const { markSettlementPaidByPayout } = await import("../src/services/settlementService");
      let callIndex = 0;
      const pool = createMockPool(async (sql: string) => {
        callIndex++;
        if (callIndex === 1) {
          // Direct FK match returns nothing
          return { rows: [], rowCount: 0 };
        }
        // Fallback matches
        return { rows: [{ id: "sett-2" }], rowCount: 1 };
      });

      const count = await markSettlementPaidByPayout(
        pool as any,
        "payout-xyz",
        "UTR456",
        "supplier-002",
        "po-002"
      );

      expect(count).toBe(1);
      expect(pool.query).toHaveBeenCalledTimes(2);

      // Fallback query should include payout_id to link it
      const [sql2] = (pool.query as jest.Mock).mock.calls[1] as [string, unknown[]];
      expect(sql2).toContain("payout_id");
      expect(sql2).toContain("supplier_id");
      expect(sql2).toContain("order_id");
    });

    it("returns 0 when no settlement matches at all", async () => {
      const { markSettlementPaidByPayout } = await import("../src/services/settlementService");
      const pool = createMockPool(async () => ({ rows: [], rowCount: 0 }));

      const count = await markSettlementPaidByPayout(
        pool as any,
        "payout-none",
        undefined,
        "supplier-003",
        undefined // no purchaseOrderId => skip fallback
      );

      expect(count).toBe(0);
      // Only the direct query, no fallback (no purchaseOrderId)
      expect(pool.query).toHaveBeenCalledTimes(1);
    });
  });

  // -----------------------------------------------------------------------
  // 4. supplierPayoutService exports markSettlementPaidByPayout integration
  // -----------------------------------------------------------------------
  describe("supplierPayoutService imports settlementService", () => {
    it("imports markSettlementPaidByPayout from settlementService", async () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/services/supplierPayoutService.ts"),
        "utf-8"
      );
      expect(src).toContain('import { markSettlementPaidByPayout } from "./settlementService"');
    });

    it("calls markSettlementPaidByPayout in handlePayoutWebhook (payout.processed)", () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/services/supplierPayoutService.ts"),
        "utf-8"
      );
      // The webhook handler should call the cross-reference after marking payout complete
      expect(src).toContain("markSettlementPaidByPayout(pool, payout.id, utr, payout.supplier_id, payout.purchase_order_id)");
    });

    it("calls markSettlementPaidByPayout in processScheduledPayout on success", () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/services/supplierPayoutService.ts"),
        "utf-8"
      );
      expect(src).toContain("markSettlementPaidByPayout(pool, payout.id, result.utr, payout.supplierId, payout.purchaseOrderId)");
    });

    it("webhook SELECT includes supplier_id for cross-reference", () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, "../src/services/supplierPayoutService.ts"),
        "utf-8"
      );
      expect(src).toContain("sp.supplier_id");
    });
  });

  // -----------------------------------------------------------------------
  // 5. Migration 224 adds payout_id column
  // -----------------------------------------------------------------------
  describe("Migration 224", () => {
    it("adds payout_id UUID column with FK to payments.supplier_payouts", () => {
      const migrationPath = path.resolve(
        __dirname,
        "../migrations/224_gcp_stg_0354_settlement_payout_link.sql"
      );
      expect(fs.existsSync(migrationPath)).toBe(true);

      const sql = fs.readFileSync(migrationPath, "utf-8");
      expect(sql).toContain("ADD COLUMN IF NOT EXISTS payout_id UUID");
      expect(sql).toContain("REFERENCES payments.supplier_payouts(id)");
      expect(sql).toContain("idx_settlement_payout");
    });
  });
});
