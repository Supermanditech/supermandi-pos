/**
 * T-231: Overdue Payment Reminders Service
 *
 * Checks for overdue DUE/BNPL payments and sends reminders via SMS + push.
 * Designed to be called by a scheduled job (Cloud Scheduler or cron).
 *
 * Reminder escalation:
 * - 1st reminder: 1 day after due date → SMS
 * - 2nd reminder: 3 days after due date → SMS + Push
 * - 3rd reminder: 7 days after due date → SMS + Push + Email to retailer
 */

import { getPool } from '../db/client';
import { sendSms, isSmsServiceEnabled } from './smsService';
import { sendAndPersistNotification } from './fcmService';

export interface OverduePaymentSummary {
  storeId: string;
  storeName: string;
  customerPhone: string;
  customerName: string | null;
  totalOverdue: number;          // paise
  overdueCount: number;
  oldestDueDate: string;
  daysPastDue: number;
}

export interface ReminderResult {
  processed: number;
  smsSent: number;
  pushSent: number;
  errors: string[];
}

/**
 * Process all overdue payments and send reminders.
 * Called by the scheduled job endpoint.
 */
export async function processOverdueReminders(): Promise<ReminderResult> {
  const pool = getPool();
  if (!pool) throw new Error('Database unavailable');

  const result: ReminderResult = { processed: 0, smsSent: 0, pushSent: 0, errors: [] };

  try {
    // Find all overdue DUE/BNPL payments grouped by customer+store
    const overdueResult = await pool.query(`
      SELECT
        p.store_id,
        s.name AS store_name,
        COALESCE(co.phone, p.customer_phone) AS customer_phone,
        COALESCE(co.name, p.customer_name) AS customer_name,
        SUM(p.amount - COALESCE(p.paid_amount, 0))::int AS total_overdue,
        COUNT(*)::int AS overdue_count,
        MIN(p.due_date) AS oldest_due_date,
        EXTRACT(DAY FROM NOW() - MIN(p.due_date))::int AS days_past_due
      FROM orders.payments p
      LEFT JOIN platform.stores s ON s.id = p.store_id
      LEFT JOIN platform.consumer_orders co ON co.id = p.consumer_order_id
      WHERE p.status = 'due'
        AND p.due_date < CURRENT_DATE
        AND p.amount > COALESCE(p.paid_amount, 0)
      GROUP BY p.store_id, s.name, COALESCE(co.phone, p.customer_phone), COALESCE(co.name, p.customer_name)
      ORDER BY total_overdue DESC
    `);

    for (const row of overdueResult.rows) {
      const summary: OverduePaymentSummary = {
        storeId: row.store_id,
        storeName: row.store_name || 'Store',
        customerPhone: row.customer_phone,
        customerName: row.customer_name,
        totalOverdue: row.total_overdue,
        overdueCount: row.overdue_count,
        oldestDueDate: row.oldest_due_date,
        daysPastDue: row.days_past_due,
      };

      if (!summary.customerPhone) continue;

      // Check what reminders we've already sent
      const lastReminder = await pool.query(
        `SELECT reminder_number, sent_at
         FROM orders.payment_reminders
         WHERE store_id = $1 AND customer_phone = $2
         ORDER BY sent_at DESC LIMIT 1`,
        [summary.storeId, summary.customerPhone]
      );

      const lastReminderNum = lastReminder.rows[0]?.reminder_number || 0;
      const lastSentAt = lastReminder.rows[0]?.sent_at;

      // Determine which reminder to send
      let reminderNumber = 0;
      if (summary.daysPastDue >= 7 && lastReminderNum < 3) {
        reminderNumber = 3;
      } else if (summary.daysPastDue >= 3 && lastReminderNum < 2) {
        reminderNumber = 2;
      } else if (summary.daysPastDue >= 1 && lastReminderNum < 1) {
        reminderNumber = 1;
      }

      // Skip if no new reminder needed or too soon since last
      if (reminderNumber === 0) continue;
      if (lastSentAt) {
        const hoursSinceLastReminder = (Date.now() - new Date(lastSentAt).getTime()) / (1000 * 60 * 60);
        if (hoursSinceLastReminder < 24) continue;  // At least 24h between reminders
      }

      result.processed++;

      const amountStr = `₹${(summary.totalOverdue / 100).toLocaleString('en-IN')}`;
      const smsText = `SuperMandi: You have ${amountStr} overdue from ${summary.storeName}. Please pay at your earliest convenience.`;

      // Send SMS (1st, 2nd, 3rd reminders)
      if (isSmsServiceEnabled()) {
        try {
          const smsResult = await sendSms(summary.customerPhone, smsText);
          if (smsResult.sent) result.smsSent++;

          await pool.query(
            `INSERT INTO orders.payment_reminders
               (store_id, customer_phone, customer_name, total_overdue_amount, overdue_count,
                oldest_due_date, reminder_number, channel, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, 'sms', $8)`,
            [
              summary.storeId, summary.customerPhone, summary.customerName,
              summary.totalOverdue, summary.overdueCount,
              summary.oldestDueDate, reminderNumber,
              smsResult.sent ? 'sent' : 'failed',
            ]
          );
        } catch (err) {
          result.errors.push(`SMS failed for ${summary.customerPhone}: ${err}`);
        }
      }

      // Send push notification (2nd and 3rd reminders)
      if (reminderNumber >= 2) {
        try {
          await sendAndPersistNotification({
            recipientId: summary.storeId,
            recipientType: 'store',
            title: 'Overdue Payment Reminder',
            body: `${summary.customerName || summary.customerPhone} has ${amountStr} overdue (${summary.overdueCount} payment${summary.overdueCount > 1 ? 's' : ''})`,
            data: {
              type: 'payment_reminder',
              storeId: summary.storeId,
              customerPhone: summary.customerPhone,
              amount: String(summary.totalOverdue),
            },
            notificationType: 'payment_reminder',
            priority: reminderNumber >= 3 ? 'high' : 'normal',
          });
          result.pushSent++;
        } catch (err) {
          result.errors.push(`Push failed for store ${summary.storeId}: ${err}`);
        }
      }
    }

    console.log(`[T-231] Payment reminders processed: ${result.processed}, SMS: ${result.smsSent}, Push: ${result.pushSent}`);
    return result;
  } catch (err) {
    console.error('[T-231] Payment reminder processing error:', err);
    throw err;
  }
}
