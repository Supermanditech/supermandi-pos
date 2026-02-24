// Payment Service Database Queries
// SM-004: Queries for payments.* tables from SM-002 migration

import { query, queryOne } from '@supermandi/common';

// =============================================================================
// SELL PAYMENT QUERIES
// =============================================================================

export interface SellPayment {
  id: string;
  saleId: string;
  storeId: string;
  mode: 'CASH' | 'UPI' | 'DUE' | 'SPLIT';
  amountMinor: number;
  upiOrderId?: string;
  upiPaymentId?: string;
  upiQrData?: string;
  upiVpa?: string;
  upiPayerVpa?: string;
  upiTxnRef?: string;
  status: 'pending' | 'initiated' | 'completed' | 'failed' | 'refunded';
  initiatedAt?: Date;
  completedAt?: Date;
  failureReason?: string;
  idempotencyKey?: string;
  createdAt: Date;
}

/**
 * Create a new sell payment record
 */
export async function createSellPayment(params: {
  saleId: string;
  storeId: string;
  mode: SellPayment['mode'];
  amountMinor: number;
  idempotencyKey?: string;
}): Promise<SellPayment> {
  const sql = `
    INSERT INTO payments.sell_payments (
      sale_id, store_id, mode, amount_minor, idempotency_key
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const row = await queryOne<any>(sql, [
    params.saleId,
    params.storeId,
    params.mode,
    params.amountMinor,
    params.idempotencyKey,
  ]);

  return mapSellPaymentRow(row!);
}

/**
 * Update sell payment with UPI order details
 */
export async function updateSellPaymentWithOrder(
  paymentId: string,
  params: {
    upiOrderId: string;
    upiQrData?: string;
    status: 'initiated';
  }
): Promise<SellPayment | null> {
  const sql = `
    UPDATE payments.sell_payments
    SET upi_order_id = $2, upi_qr_data = $3, status = $4, initiated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const row = await queryOne<any>(sql, [
    paymentId,
    params.upiOrderId,
    params.upiQrData,
    params.status,
  ]);

  return row ? mapSellPaymentRow(row) : null;
}

/**
 * Update sell payment status to completed
 */
export async function completeSellPayment(
  paymentId: string,
  params: {
    upiPaymentId: string;
    upiPayerVpa?: string;
    upiTxnRef?: string;
  }
): Promise<SellPayment | null> {
  const sql = `
    UPDATE payments.sell_payments
    SET upi_payment_id = $2, upi_payer_vpa = $3, upi_txn_ref = $4,
        status = 'completed', completed_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const row = await queryOne<any>(sql, [
    paymentId,
    params.upiPaymentId,
    params.upiPayerVpa,
    params.upiTxnRef,
  ]);

  return row ? mapSellPaymentRow(row) : null;
}

/**
 * Mark sell payment as failed
 */
export async function failSellPayment(
  paymentId: string,
  failureReason: string
): Promise<SellPayment | null> {
  const sql = `
    UPDATE payments.sell_payments
    SET status = 'failed', failure_reason = $2
    WHERE id = $1
    RETURNING *
  `;

  const row = await queryOne<any>(sql, [paymentId, failureReason]);
  return row ? mapSellPaymentRow(row) : null;
}

/**
 * Get sell payment by ID
 * R6.BE.002: store_id filter enforces store isolation
 */
export async function getSellPaymentById(paymentId: string, storeId: string): Promise<SellPayment | null> {
  const sql = `SELECT * FROM payments.sell_payments WHERE id = $1 AND store_id = $2`;
  const row = await queryOne<any>(sql, [paymentId, storeId]);
  return row ? mapSellPaymentRow(row) : null;
}

/**
 * Get sell payment by UPI order ID
 * R6.BE.002: store_id filter enforces store isolation
 */
export async function getSellPaymentByOrderId(upiOrderId: string, storeId: string): Promise<SellPayment | null> {
  const sql = `SELECT * FROM payments.sell_payments WHERE upi_order_id = $1 AND store_id = $2`;
  const row = await queryOne<any>(sql, [upiOrderId, storeId]);
  return row ? mapSellPaymentRow(row) : null;
}

function mapSellPaymentRow(row: any): SellPayment {
  return {
    id: row.id,
    saleId: row.sale_id,
    storeId: row.store_id,
    mode: row.mode,
    amountMinor: row.amount_minor,
    upiOrderId: row.upi_order_id ?? undefined,
    upiPaymentId: row.upi_payment_id ?? undefined,
    upiQrData: row.upi_qr_data ?? undefined,
    upiVpa: row.upi_vpa ?? undefined,
    upiPayerVpa: row.upi_payer_vpa ?? undefined,
    upiTxnRef: row.upi_txn_ref ?? undefined,
    status: row.status,
    initiatedAt: row.initiated_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    idempotencyKey: row.idempotency_key ?? undefined,
    createdAt: row.created_at,
  };
}

// =============================================================================
// BUY PAYMENT QUERIES
// =============================================================================

export interface BuyPayment {
  id: string;
  storeId: string;
  supplierId: string;
  purchaseOrderId?: string;
  mode: 'UPI' | 'BANK' | 'BNPL' | 'CREDIT';
  amountMinor: number;
  payoutId?: string;
  payoutUtr?: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  bnplDrawdownId?: string;
  initiatedAt?: Date;
  completedAt?: Date;
  failureReason?: string;
  createdAt: Date;
}

/**
 * Create a new buy payment record
 */
export async function createBuyPayment(params: {
  storeId: string;
  supplierId: string;
  purchaseOrderId?: string;
  mode: BuyPayment['mode'];
  amountMinor: number;
  bnplDrawdownId?: string;
}): Promise<BuyPayment> {
  const sql = `
    INSERT INTO payments.buy_payments (
      store_id, supplier_id, purchase_order_id, mode, amount_minor, bnpl_drawdown_id
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

  const row = await queryOne<any>(sql, [
    params.storeId,
    params.supplierId,
    params.purchaseOrderId,
    params.mode,
    params.amountMinor,
    params.bnplDrawdownId,
  ]);

  return mapBuyPaymentRow(row!);
}

/**
 * Update buy payment with payout details
 */
export async function updateBuyPaymentWithPayout(
  paymentId: string,
  params: {
    payoutId: string;
    status: 'processing';
  }
): Promise<BuyPayment | null> {
  const sql = `
    UPDATE payments.buy_payments
    SET payout_id = $2, status = $3, initiated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const row = await queryOne<any>(sql, [paymentId, params.payoutId, params.status]);
  return row ? mapBuyPaymentRow(row) : null;
}

/**
 * Complete buy payment
 */
export async function completeBuyPayment(
  paymentId: string,
  payoutUtr?: string
): Promise<BuyPayment | null> {
  const sql = `
    UPDATE payments.buy_payments
    SET payout_utr = $2, status = 'completed', completed_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  const row = await queryOne<any>(sql, [paymentId, payoutUtr]);
  return row ? mapBuyPaymentRow(row) : null;
}

function mapBuyPaymentRow(row: any): BuyPayment {
  return {
    id: row.id,
    storeId: row.store_id,
    supplierId: row.supplier_id,
    purchaseOrderId: row.purchase_order_id ?? undefined,
    mode: row.mode,
    amountMinor: row.amount_minor,
    payoutId: row.payout_id ?? undefined,
    payoutUtr: row.payout_utr ?? undefined,
    status: row.status,
    bnplDrawdownId: row.bnpl_drawdown_id ?? undefined,
    initiatedAt: row.initiated_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    failureReason: row.failure_reason ?? undefined,
    createdAt: row.created_at,
  };
}

// =============================================================================
// BNPL QUERIES
// =============================================================================

export interface BnplDrawdown {
  id: string;
  storeId: string;
  supplierId: string;
  purchaseOrderId: string;
  principalMinor: number;
  dueDate: Date;
  status: 'active' | 'paid' | 'overdue' | 'defaulted';
  paidAt?: Date;
  paidAmountMinor?: number;
  createdAt: Date;
}

/**
 * Create a BNPL drawdown
 */
export async function createBnplDrawdown(params: {
  storeId: string;
  supplierId: string;
  purchaseOrderId: string;
  principalMinor: number;
  dueDate: Date;
}): Promise<BnplDrawdown> {
  const sql = `
    INSERT INTO payments.bnpl_drawdowns (
      store_id, supplier_id, purchase_order_id, principal_minor, due_date
    ) VALUES ($1, $2, $3, $4, $5)
    RETURNING *
  `;

  const row = await queryOne<any>(sql, [
    params.storeId,
    params.supplierId,
    params.purchaseOrderId,
    params.principalMinor,
    params.dueDate,
  ]);

  return mapBnplDrawdownRow(row!);
}

/**
 * Get active BNPL drawdowns for a store
 */
export async function getStoreBnplDrawdowns(
  storeId: string,
  status?: BnplDrawdown['status']
): Promise<BnplDrawdown[]> {
  let sql = `
    SELECT * FROM payments.bnpl_drawdowns
    WHERE store_id = $1
  `;
  const params: any[] = [storeId];

  if (status) {
    sql += ` AND status = $2`;
    params.push(status);
  }

  sql += ` ORDER BY due_date ASC`;

  const rows = await query<any>(sql, params);
  return rows.map(mapBnplDrawdownRow);
}

function mapBnplDrawdownRow(row: any): BnplDrawdown {
  return {
    id: row.id,
    storeId: row.store_id,
    supplierId: row.supplier_id,
    purchaseOrderId: row.purchase_order_id,
    principalMinor: row.principal_minor,
    dueDate: row.due_date,
    status: row.status,
    paidAt: row.paid_at ?? undefined,
    paidAmountMinor: row.paid_amount_minor ?? undefined,
    createdAt: row.created_at,
  };
}
