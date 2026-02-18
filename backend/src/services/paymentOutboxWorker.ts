// T-262: Payment Event Outbox Processor
// Polls payments.event_outbox for pending events and publishes them
// Pattern matches common/events/outboxWorker.ts but adapted for payments schema

import { Pool, PoolClient } from "pg";
import { log } from "../lib/logger";

// =============================================================================
// TYPES
// =============================================================================

interface PaymentOutboxEvent {
  id: string;
  event_type: string;
  aggregate_type: string;
  aggregate_id: string;
  payload: Record<string, unknown>;
  status: string;
  retry_count: number;
  created_at: Date;
  idempotency_key: string | null;
}

type PaymentEventHandler = (event: PaymentOutboxEvent) => Promise<void>;

// =============================================================================
// PAYMENT OUTBOX WORKER
// =============================================================================

const MAX_RETRIES = 3;
const BATCH_SIZE = 50;
const POLL_INTERVAL_MS = 2000;

export class PaymentOutboxWorker {
  private pool: Pool;
  private running = false;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private handlers: Map<string, PaymentEventHandler[]> = new Map();

  constructor(pool: Pool) {
    this.pool = pool;
  }

  /**
   * Register a handler for a specific event type
   */
  on(eventType: string, handler: PaymentEventHandler): void {
    const existing = this.handlers.get(eventType) || [];
    existing.push(handler);
    this.handlers.set(eventType, existing);
  }

  /**
   * Start polling the outbox
   */
  start(): void {
    if (this.running) return;
    this.running = true;
    log.info("[T-262] Payment outbox worker started");
    this.poll();
  }

  /**
   * Stop polling
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    log.info("[T-262] Payment outbox worker stopped");
  }

  private async poll(): Promise<void> {
    if (!this.running) return;

    try {
      const processed = await this.processBatch();
      if (processed > 0) {
        log.info(`[T-262] Processed ${processed} payment events`);
      }
    } catch (error) {
      log.error("[T-262] Poll error:", error instanceof Error ? error.message : error);
    }

    this.pollTimer = setTimeout(() => this.poll(), POLL_INTERVAL_MS);
  }

  private async processBatch(): Promise<number> {
    const client = await this.pool.connect();
    let processed = 0;

    try {
      await client.query("BEGIN");

      // FOR UPDATE SKIP LOCKED — safe for concurrent workers
      const result = await client.query<PaymentOutboxEvent>(
        `SELECT id, event_type, aggregate_type, aggregate_id, payload,
                status, retry_count, created_at, idempotency_key
         FROM payments.event_outbox
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [BATCH_SIZE]
      );

      if (result.rows.length === 0) {
        await client.query("COMMIT");
        return 0;
      }

      for (const event of result.rows) {
        try {
          await this.processEvent(client, event);
          processed++;
        } catch (error) {
          await this.handleError(client, event, error as Error);
        }
      }

      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }

    return processed;
  }

  private async processEvent(client: PoolClient, event: PaymentOutboxEvent): Promise<void> {
    const handlers = this.handlers.get(event.event_type) || [];

    // Execute all registered handlers
    for (const handler of handlers) {
      await handler(event);
    }

    // Mark as published
    await client.query(
      `UPDATE payments.event_outbox
       SET status = 'published', published_at = NOW()
       WHERE id = $1`,
      [event.id]
    );
  }

  private async handleError(client: PoolClient, event: PaymentOutboxEvent, error: Error): Promise<void> {
    const newRetryCount = event.retry_count + 1;

    if (newRetryCount >= MAX_RETRIES) {
      await client.query(
        `UPDATE payments.event_outbox
         SET status = 'failed', retry_count = $2, last_error = $3
         WHERE id = $1`,
        [event.id, newRetryCount, error.message]
      );
      log.error(`[T-262] Event ${event.id} (${event.event_type}) failed after ${MAX_RETRIES} retries: ${error.message}`);
    } else {
      await client.query(
        `UPDATE payments.event_outbox
         SET retry_count = $2, last_error = $3
         WHERE id = $1`,
        [event.id, newRetryCount, error.message]
      );
    }
  }
}

// =============================================================================
// WRITE HELPERS (for use in transaction contexts)
// =============================================================================

/**
 * T-262: Write a payment event to the outbox (call within your existing transaction)
 */
export async function writePaymentEvent(
  client: PoolClient,
  eventType: string,
  aggregateId: string,
  payload: Record<string, unknown>,
  idempotencyKey?: string
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO payments.event_outbox
       (event_type, aggregate_id, payload, idempotency_key)
     VALUES ($1, $2, $3::jsonb, $4)
     RETURNING id`,
    [eventType, aggregateId, JSON.stringify(payload), idempotencyKey || null]
  );
  return result.rows[0]!.id;
}

// =============================================================================
// STANDARD PAYMENT EVENT TYPES
// =============================================================================

export const PaymentEventTypes = {
  // SELL payments
  PAYMENT_INITIATED: "payment.initiated",
  PAYMENT_COMPLETED: "payment.completed",
  PAYMENT_FAILED: "payment.failed",
  PAYMENT_EXPIRED: "payment.expired",

  // Refunds
  REFUND_REQUESTED: "refund.requested",
  REFUND_APPROVED: "refund.approved",
  REFUND_COMPLETED: "refund.completed",
  REFUND_FAILED: "refund.failed",

  // Payouts
  PAYOUT_SCHEDULED: "payout.scheduled",
  PAYOUT_COMPLETED: "payout.completed",
  PAYOUT_FAILED: "payout.failed",
  PAYOUT_RETRY_SCHEDULED: "payout.retry_scheduled",
  PAYOUT_EXHAUSTED: "payout.exhausted",
} as const;
