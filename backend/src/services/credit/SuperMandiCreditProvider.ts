// T-263: Internal SuperMandi BNPL provider
// Wraps existing BNPL logic (bnpl_drawdowns table) into the CreditProvider interface
// This is the default provider — always active, no external dependency

import type { Pool } from 'pg';
import type {
  CreditProvider,
  CreditMode,
  EligibilityResult,
  CreditOffer,
  DrawdownParams,
  DrawdownResult,
  RepaymentSchedule,
  RepaymentParams,
  RepaymentResult,
  BalanceResult,
  ProviderHealth,
} from './CreditProvider';

export class SuperMandiCreditProvider implements CreditProvider {
  readonly providerId = 'supermandi_internal';
  readonly providerName = 'SuperMandi BNPL';
  readonly mode: CreditMode = 'trade_credit';

  constructor(private pool: Pool) {}

  async checkEligibility(storeId: string): Promise<EligibilityResult> {
    const storeResult = await this.pool.query(
      `SELECT bnpl_enabled, bnpl_credit_limit, bnpl_max_days
       FROM platform.stores WHERE id = $1`,
      [storeId]
    );
    const store = storeResult.rows[0];
    if (!store || !store.bnpl_enabled) {
      return { eligible: false, maxAmountMinor: 0, minAmountMinor: 0, tenureOptions: [], reason: 'BNPL not enabled for store' };
    }

    const maxDays = store.bnpl_max_days || 7;
    return {
      eligible: true,
      maxAmountMinor: store.bnpl_credit_limit || 5000000,
      minAmountMinor: 100,    // Rs 1
      tenureOptions: [
        { days: maxDays, interestRateAnnual: 0 },
      ],
    };
  }

  async getOffers(storeId: string): Promise<CreditOffer[]> {
    const elig = await this.checkEligibility(storeId);
    if (!elig.eligible) return [];

    const balance = await this.getBalance(storeId);
    if (balance.availableMinor <= 0) return [];

    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    return [{
      offerId: `smbnpl-${storeId.slice(0, 8)}`,
      providerId: this.providerId,
      providerName: this.providerName,
      mode: this.mode,
      amountMinor: balance.availableMinor,
      tenureDays: elig.tenureOptions[0]?.days || 7,
      interestRateAnnual: 0,
      totalRepayableMinor: balance.availableMinor,
      validUntil,
      terms: `${elig.tenureOptions[0]?.days || 7}-day interest-free supplier credit`,
    }];
  }

  async createDrawdown(params: DrawdownParams): Promise<DrawdownResult> {
    // Amount validation
    if (!params.amountMinor || params.amountMinor <= 0) {
      return { success: false, drawdownId: '', status: 'rejected', message: 'Invalid amount' };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the store row to prevent TOCTOU race on credit limit
      const storeResult = await client.query(
        `SELECT bnpl_credit_limit FROM platform.stores WHERE id = $1 FOR UPDATE`,
        [params.storeId]
      );
      const limit = storeResult.rows[0]?.bnpl_credit_limit || 5000000;

      // Recompute outstanding under lock
      const outstandingResult = await client.query(
        `SELECT COALESCE(SUM(principal_minor - COALESCE(paid_amount_minor, 0)), 0) AS outstanding
         FROM payments.bnpl_drawdowns
         WHERE store_id = $1 AND provider_id = $2 AND status IN ('active','overdue','partial')`,
        [params.storeId, this.providerId]
      );
      const used = parseInt(outstandingResult.rows[0].outstanding, 10) || 0;
      const available = Math.max(0, limit - used);

      if (params.amountMinor > available) {
        await client.query('ROLLBACK');
        return { success: false, drawdownId: '', status: 'rejected', message: 'Exceeds available credit' };
      }

      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + params.tenureDays);

      const result = await client.query(
        `INSERT INTO payments.bnpl_drawdowns (store_id, supplier_id, purchase_order_id, principal_minor, due_date, status, provider_id)
         VALUES ($1, $2, $3, $4, $5, 'active', $6)
         RETURNING id`,
        [params.storeId, params.supplierId, params.purchaseOrderId, params.amountMinor, dueDate.toISOString().split('T')[0], this.providerId]
      );

      await client.query('COMMIT');
      return {
        success: true,
        drawdownId: result.rows[0].id,
        status: 'active',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getRepaymentSchedule(drawdownId: string, storeId?: string): Promise<RepaymentSchedule> {
    // Include store_id filter when provided for store isolation
    const dd = storeId
      ? await this.pool.query(
          `SELECT principal_minor, due_date, paid_amount_minor, status FROM payments.bnpl_drawdowns WHERE id = $1 AND store_id = $2`,
          [drawdownId, storeId]
        )
      : await this.pool.query(
          `SELECT principal_minor, due_date, paid_amount_minor, status FROM payments.bnpl_drawdowns WHERE id = $1`,
          [drawdownId]
        );
    if (dd.rows.length === 0) {
      return { installments: [], totalPrincipalMinor: 0, totalInterestMinor: 0, totalRepayableMinor: 0 };
    }

    const row = dd.rows[0];
    const remaining = row.principal_minor - (row.paid_amount_minor || 0);

    return {
      installments: [{
        number: 1,
        dueDate: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date),
        principalMinor: row.principal_minor,
        interestMinor: 0,
        totalMinor: row.principal_minor,
        status: row.status === 'paid' ? 'paid' : row.status === 'overdue' ? 'overdue' : 'pending',
        paidAt: undefined,
      }],
      totalPrincipalMinor: row.principal_minor,
      totalInterestMinor: 0,
      totalRepayableMinor: row.principal_minor,
      nextDueDate: remaining > 0 ? (row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date)) : undefined,
      nextAmountMinor: remaining > 0 ? remaining : undefined,
    };
  }

  async processRepayment(params: RepaymentParams): Promise<RepaymentResult> {
    if (!params.amountMinor || params.amountMinor <= 0) {
      return { success: false, repaymentId: '', remainingMinor: 0, status: 'failed', message: 'Invalid amount' };
    }

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');

      // Lock the drawdown row + include store_id filter for isolation
      const dd = await client.query(
        `SELECT principal_minor, paid_amount_minor, status, store_id FROM payments.bnpl_drawdowns WHERE id = $1 FOR UPDATE`,
        [params.drawdownId]
      );
      if (dd.rows.length === 0) {
        await client.query('ROLLBACK');
        return { success: false, repaymentId: '', remainingMinor: 0, status: 'failed', message: 'Drawdown not found' };
      }

      const row = dd.rows[0];
      // Verify store isolation if storeId is provided in params
      if ((params as any).storeId && row.store_id !== (params as any).storeId) {
        await client.query('ROLLBACK');
        return { success: false, repaymentId: '', remainingMinor: 0, status: 'failed', message: 'Drawdown not found' };
      }

      const newPaid = (row.paid_amount_minor || 0) + params.amountMinor;
      const remaining = row.principal_minor - newPaid;
      const newStatus = remaining <= 0 ? 'paid' : 'active';

      await client.query(
        `UPDATE payments.bnpl_drawdowns SET paid_amount_minor = $1, status = $2, paid_at = CASE WHEN $2 = 'paid' THEN NOW() ELSE paid_at END, updated_at = NOW()
         WHERE id = $3`,
        [Math.min(newPaid, row.principal_minor), newStatus, params.drawdownId]
      );

      await client.query('COMMIT');
      return {
        success: true,
        repaymentId: `sm-repay-${Date.now()}`,
        remainingMinor: Math.max(0, remaining),
        status: remaining <= 0 ? 'paid' : 'partial',
      };
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  async getBalance(storeId: string): Promise<BalanceResult> {
    const storeResult = await this.pool.query(
      `SELECT bnpl_credit_limit FROM platform.stores WHERE id = $1`,
      [storeId]
    );
    const limit = storeResult.rows[0]?.bnpl_credit_limit || 5000000;

    const drawdownResult = await this.pool.query(
      `SELECT
         COALESCE(SUM(CASE WHEN status IN ('active','overdue','partial') THEN principal_minor - COALESCE(paid_amount_minor, 0) ELSE 0 END), 0) AS outstanding,
         COUNT(CASE WHEN status IN ('active','partial') THEN 1 END) AS active_count,
         COUNT(CASE WHEN status = 'overdue' THEN 1 END) AS overdue_count
       FROM payments.bnpl_drawdowns
       WHERE store_id = $1 AND provider_id = $2`,
      [storeId, this.providerId]
    );

    const row = drawdownResult.rows[0];
    const used = parseInt(row.outstanding, 10) || 0;

    return {
      totalCreditLimitMinor: limit,
      usedMinor: used,
      availableMinor: Math.max(0, limit - used),
      activeDrawdowns: parseInt(row.active_count, 10) || 0,
      overdueDrawdowns: parseInt(row.overdue_count, 10) || 0,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    const start = Date.now();
    try {
      await this.pool.query('SELECT 1');
      return {
        providerId: this.providerId,
        status: 'healthy',
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
      };
    } catch {
      return {
        providerId: this.providerId,
        status: 'down',
        latencyMs: Date.now() - start,
        lastChecked: new Date().toISOString(),
      };
    }
  }
}
