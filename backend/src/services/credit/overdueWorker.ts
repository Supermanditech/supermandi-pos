// T-279: Auto-Overdue Maturation Job
// Runs periodically to check drawdowns past due_date, marks overdue, sends FCM push
// Uses existing fcmService.ts for notifications

import type { Pool } from 'pg';

interface OverdueDrawdown {
  id: string;
  storeId: string;
  supplierId: string;
  principalMinor: number;
  paidAmountMinor: number;
  dueDate: string;
  daysOverdue: number;
  providerId: string;
}

/**
 * Process all overdue drawdowns:
 * 1. Mark active drawdowns past due_date as 'overdue'
 * 2. Return list for notification dispatch
 */
export async function processOverdueDrawdowns(pool: Pool): Promise<{
  newlyOverdue: OverdueDrawdown[];
  totalOverdue: number;
}> {
  // Mark active drawdowns past due date as overdue
  const result = await pool.query(
    `UPDATE payments.bnpl_drawdowns
     SET status = 'overdue', updated_at = NOW()
     WHERE status IN ('active', 'partial')
       AND due_date < CURRENT_DATE
     RETURNING id, store_id, supplier_id, principal_minor, COALESCE(paid_amount_minor, 0) AS paid_amount_minor,
               due_date, (CURRENT_DATE - due_date) AS days_overdue, COALESCE(provider_id, 'supermandi_internal') AS provider_id`
  );

  const newlyOverdue: OverdueDrawdown[] = result.rows.map(row => ({
    id: row.id,
    storeId: row.store_id,
    supplierId: row.supplier_id,
    principalMinor: row.principal_minor,
    paidAmountMinor: row.paid_amount_minor,
    dueDate: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date),
    daysOverdue: parseInt(row.days_overdue, 10),
    providerId: row.provider_id,
  }));

  // Count total overdue
  const countResult = await pool.query(
    `SELECT COUNT(*) AS total FROM payments.bnpl_drawdowns WHERE status = 'overdue'`
  );

  return {
    newlyOverdue,
    totalOverdue: parseInt(countResult.rows[0].total, 10),
  };
}

/**
 * Get overdue drawdowns that need reminder notifications
 * Rules: 1-day, 3-day, 7-day reminders
 */
export async function getOverdueForReminders(pool: Pool): Promise<{
  dayOne: OverdueDrawdown[];
  dayThree: OverdueDrawdown[];
  daySeven: OverdueDrawdown[];
  critical: OverdueDrawdown[];
}> {
  const result = await pool.query(
    `SELECT id, store_id, supplier_id, principal_minor, COALESCE(paid_amount_minor, 0) AS paid_amount_minor,
            due_date, (CURRENT_DATE - due_date) AS days_overdue, COALESCE(provider_id, 'supermandi_internal') AS provider_id
     FROM payments.bnpl_drawdowns
     WHERE status = 'overdue'
     ORDER BY due_date ASC`
  );

  const all: OverdueDrawdown[] = result.rows.map(row => ({
    id: row.id,
    storeId: row.store_id,
    supplierId: row.supplier_id,
    principalMinor: row.principal_minor,
    paidAmountMinor: row.paid_amount_minor,
    dueDate: row.due_date instanceof Date ? row.due_date.toISOString().split('T')[0] : String(row.due_date),
    daysOverdue: parseInt(row.days_overdue, 10),
    providerId: row.provider_id,
  }));

  return {
    dayOne: all.filter(d => d.daysOverdue === 1),
    dayThree: all.filter(d => d.daysOverdue === 3),
    daySeven: all.filter(d => d.daysOverdue === 7),
    critical: all.filter(d => d.daysOverdue > 7),
  };
}

/**
 * Build FCM notification payloads for overdue drawdowns
 */
export function buildOverdueNotification(dd: OverdueDrawdown): {
  title: string;
  body: string;
  data: Record<string, string>;
} {
  const outstanding = dd.principalMinor - dd.paidAmountMinor;
  const amountRs = (outstanding / 100).toFixed(2);

  if (dd.daysOverdue <= 1) {
    return {
      title: 'Payment Due Today',
      body: `Rs ${amountRs} BNPL payment is due. Tap to pay now.`,
      data: { type: 'bnpl_overdue', drawdownId: dd.id, storeId: dd.storeId },
    };
  }
  if (dd.daysOverdue <= 3) {
    return {
      title: 'Payment Overdue',
      body: `Rs ${amountRs} BNPL payment is ${dd.daysOverdue} days overdue. Pay now to avoid penalties.`,
      data: { type: 'bnpl_overdue', drawdownId: dd.id, storeId: dd.storeId },
    };
  }
  return {
    title: 'Urgent: Payment Overdue',
    body: `Rs ${amountRs} BNPL payment is ${dd.daysOverdue} days overdue. Credit may be suspended.`,
    data: { type: 'bnpl_overdue_critical', drawdownId: dd.id, storeId: dd.storeId },
  };
}
