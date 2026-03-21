// GCP-STG-0106: Settlement Service
// Manages settlement records — tracks what SuperMandi owes suppliers
// after deducting margin/commission from retailer payments.

import type { Pool } from "pg";
import { log } from "../lib/logger";

// =============================================================================
// Types
// =============================================================================

export type SettlementStatus = "pending" | "approved" | "scheduled" | "paid" | "reconciled" | "disputed" | "cancelled";

export interface CreateSettlementInput {
  supplierId: string;
  storeId: string;
  orderId?: string;
  purchaseInvoiceId?: string;
  saleInvoiceId?: string;
  platformFeeId?: string;
  billingModel: "SUPERMANDI_PRINCIPAL" | "DIRECT_SUPPLIER";
  grossAmountMinor: number;
  commissionMinor: number;
  commissionPercent: number;
  tdsPercent?: number;
  settlementCycle?: string;
  notes?: string;
}

export interface SettlementRecord {
  id: string;
  supplierId: string;
  storeId: string;
  orderId?: string;
  billingModel: string;
  grossAmountMinor: number;
  commissionMinor: number;
  commissionPercent: number;
  gstOnCommissionMinor: number;
  tdsMinor: number;
  netPayoutMinor: number;
  status: SettlementStatus;
  settlementDate?: string;
  payoutReference?: string;
  payoutUtr?: string;
  paidAt?: string;
  createdAt: string;
}

export interface SettlementSummary {
  totalPendingMinor: number;
  totalApprovedMinor: number;
  totalPaidMinor: number;
  pendingCount: number;
  approvedCount: number;
  paidCount: number;
}

// =============================================================================
// Create Settlement
// =============================================================================

/**
 * Create a settlement record for a completed order.
 * Calculates GST on commission (18%) and optional TDS.
 */
export async function createSettlement(
  pool: Pool,
  input: CreateSettlementInput
): Promise<SettlementRecord> {
  // GCP-STG-0114: Fee safety bounds checking — commission must be non-negative and capped
  const MAX_COMMISSION_PERCENT = parseFloat(process.env.MAX_COMMISSION_PERCENT || "30"); // configurable cap
  if (input.commissionMinor < 0) throw new Error("commission_negative: Commission cannot be negative");
  if (input.grossAmountMinor > 0) {
    const commissionPercent = (input.commissionMinor / input.grossAmountMinor) * 100;
    if (commissionPercent > MAX_COMMISSION_PERCENT) {
      throw new Error(`commission_exceeds_cap: Commission ${commissionPercent.toFixed(1)}% exceeds max ${MAX_COMMISSION_PERCENT}%`);
    }
  }
  if (input.grossAmountMinor < 0) throw new Error("gross_amount_negative: Gross amount cannot be negative");

  const gstOnCommission = Math.round(input.commissionMinor * 18 / 100); // 18% GST on services
  const tdsPercent = input.tdsPercent || 0;
  if (tdsPercent < 0 || tdsPercent > 30) throw new Error("tds_percent_invalid: TDS must be 0-30%");
  const tdsMinor = tdsPercent > 0 ? Math.round(input.grossAmountMinor * tdsPercent / 100) : 0;
  const netPayout = input.grossAmountMinor - input.commissionMinor - gstOnCommission - tdsMinor;
  // GCP-STG-0114: Net payout must not be negative (SuperMandi can't owe more than gross)
  if (netPayout < 0) throw new Error("net_payout_negative: Net payout cannot be negative — check commission/TDS values");

  const result = await pool.query(
    `INSERT INTO invoicing.settlement_records (
      supplier_id, store_id, order_id,
      purchase_invoice_id, sale_invoice_id, platform_fee_id,
      billing_model,
      gross_amount_minor, commission_minor, commission_percent,
      gst_on_commission_minor, tds_minor, tds_percent,
      net_payout_minor, status, settlement_cycle, notes
    ) VALUES (
      $1::uuid, $2::uuid, $3::uuid,
      $4, $5, $6,
      $7,
      $8, $9, $10,
      $11, $12, $13,
      $14, 'pending', $15, $16
    ) RETURNING
      id, supplier_id as "supplierId", store_id as "storeId",
      order_id as "orderId", billing_model as "billingModel",
      gross_amount_minor as "grossAmountMinor",
      commission_minor as "commissionMinor",
      commission_percent as "commissionPercent",
      gst_on_commission_minor as "gstOnCommissionMinor",
      tds_minor as "tdsMinor",
      net_payout_minor as "netPayoutMinor",
      status, created_at as "createdAt"`,
    [
      input.supplierId, input.storeId, input.orderId || null,
      input.purchaseInvoiceId || null, input.saleInvoiceId || null, input.platformFeeId || null,
      input.billingModel,
      input.grossAmountMinor, input.commissionMinor, input.commissionPercent,
      gstOnCommission, tdsMinor, tdsPercent,
      netPayout, input.settlementCycle || "weekly", input.notes || null,
    ]
  );

  log.info(`[settlement] Created: supplier=${input.supplierId}, gross=${input.grossAmountMinor}, net=${netPayout}`);
  return result.rows[0];
}

// =============================================================================
// List Settlements (Admin)
// =============================================================================

export async function listSettlements(
  pool: Pool,
  filters: {
    supplierId?: string;
    storeId?: string;
    status?: string;
    billingModel?: string;
    fromDate?: string;
    toDate?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ data: SettlementRecord[]; total: number }> {
  let where = "WHERE 1=1";
  const params: any[] = [];
  let idx = 1;

  if (filters.supplierId) { where += ` AND sr.supplier_id = $${idx++}::uuid`; params.push(filters.supplierId); }
  if (filters.storeId) { where += ` AND sr.store_id = $${idx++}::uuid`; params.push(filters.storeId); }
  if (filters.status) { where += ` AND sr.status = $${idx++}`; params.push(filters.status); }
  if (filters.billingModel) { where += ` AND sr.billing_model = $${idx++}`; params.push(filters.billingModel); }
  if (filters.fromDate) { where += ` AND sr.created_at >= $${idx++}::date`; params.push(filters.fromDate); }
  if (filters.toDate) { where += ` AND sr.created_at < ($${idx++}::date + interval '1 day')`; params.push(filters.toDate); }

  const limit = Math.min(filters.limit || 50, 100);
  const offset = Math.max(filters.offset || 0, 0);

  const countResult = await pool.query(
    `SELECT COUNT(*)::int as total FROM invoicing.settlement_records sr ${where}`,
    params
  );

  const result = await pool.query(
    `SELECT
      sr.id, sr.supplier_id as "supplierId", sr.store_id as "storeId",
      sr.order_id as "orderId", sr.billing_model as "billingModel",
      sr.gross_amount_minor as "grossAmountMinor",
      sr.commission_minor as "commissionMinor",
      sr.commission_percent as "commissionPercent",
      sr.gst_on_commission_minor as "gstOnCommissionMinor",
      sr.tds_minor as "tdsMinor",
      sr.net_payout_minor as "netPayoutMinor",
      sr.status,
      sr.settlement_date as "settlementDate",
      sr.payout_reference as "payoutReference",
      sr.payout_utr as "payoutUtr",
      sr.paid_at as "paidAt",
      sr.created_at as "createdAt",
      COALESCE(s.business_name, s.trade_name) as "supplierName",
      st.name as "storeName"
    FROM invoicing.settlement_records sr
    LEFT JOIN supplier.suppliers s ON s.id = sr.supplier_id
    LEFT JOIN platform.stores st ON st.id = sr.store_id
    ${where}
    ORDER BY sr.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return {
    data: result.rows,
    total: countResult.rows[0]?.total || 0,
  };
}

// =============================================================================
// Settlement Summary (per supplier or global)
// =============================================================================

export async function getSettlementSummary(
  pool: Pool,
  supplierId?: string
): Promise<SettlementSummary> {
  const where = supplierId ? "WHERE supplier_id = $1::uuid" : "";
  const params = supplierId ? [supplierId] : [];

  const result = await pool.query(
    `SELECT
      COALESCE(SUM(CASE WHEN status = 'pending' THEN net_payout_minor ELSE 0 END), 0)::bigint as "totalPendingMinor",
      COALESCE(SUM(CASE WHEN status = 'approved' THEN net_payout_minor ELSE 0 END), 0)::bigint as "totalApprovedMinor",
      COALESCE(SUM(CASE WHEN status IN ('paid', 'reconciled') THEN net_payout_minor ELSE 0 END), 0)::bigint as "totalPaidMinor",
      COUNT(CASE WHEN status = 'pending' THEN 1 END)::int as "pendingCount",
      COUNT(CASE WHEN status = 'approved' THEN 1 END)::int as "approvedCount",
      COUNT(CASE WHEN status IN ('paid', 'reconciled') THEN 1 END)::int as "paidCount"
    FROM invoicing.settlement_records ${where}`,
    params
  );

  return result.rows[0] || {
    totalPendingMinor: 0, totalApprovedMinor: 0, totalPaidMinor: 0,
    pendingCount: 0, approvedCount: 0, paidCount: 0,
  };
}

// =============================================================================
// Approve Settlement (Admin action)
// =============================================================================

export async function approveSettlement(
  pool: Pool,
  settlementId: string,
  adminId: string
): Promise<void> {
  const result = await pool.query(
    `UPDATE invoicing.settlement_records
     SET status = 'approved', approved_by = $2::uuid, approved_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid AND status = 'pending'
     RETURNING id`,
    [settlementId, adminId]
  );

  if (result.rowCount === 0) {
    throw new Error("Settlement not found or not in pending status");
  }
}

/**
 * Bulk approve all pending settlements for a supplier.
 */
export async function bulkApproveSettlements(
  pool: Pool,
  supplierId: string,
  adminId: string
): Promise<number> {
  const result = await pool.query(
    `UPDATE invoicing.settlement_records
     SET status = 'approved', approved_by = $2::uuid, approved_at = NOW(), updated_at = NOW()
     WHERE supplier_id = $1::uuid AND status = 'pending'`,
    [supplierId, adminId]
  );

  return result.rowCount || 0;
}

// =============================================================================
// Mark Settlement as Paid (after Razorpay payout)
// =============================================================================

export async function markSettlementPaid(
  pool: Pool,
  settlementId: string,
  payoutReference: string,
  payoutUtr?: string,
  payoutMethod?: string
): Promise<void> {
  await pool.query(
    `UPDATE invoicing.settlement_records
     SET status = 'paid', payout_reference = $2, payout_utr = $3,
         payout_method = $4, paid_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid AND status IN ('approved', 'scheduled')`,
    [settlementId, payoutReference, payoutUtr || null, payoutMethod || "razorpay"]
  );
}

// =============================================================================
// Supplier Settlement History
// =============================================================================

export async function getSupplierSettlements(
  pool: Pool,
  supplierId: string,
  limit: number = 50,
  offset: number = 0
): Promise<{ data: SettlementRecord[]; total: number; summary: SettlementSummary }> {
  const { data, total } = await listSettlements(pool, { supplierId, limit, offset });
  const summary = await getSettlementSummary(pool, supplierId);
  return { data, total, summary };
}
