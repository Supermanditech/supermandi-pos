// Outbox Worker - V3.0.9 compliant
// Polls event outbox tables and fans out to subscriber-specific queues
//
// V3.0.9 CRITICAL: Uses FANOUT pattern - each event goes to ALL subscriber queues,
// not a single shared queue. This ensures each consumer gets every relevant event.

import { getClient } from '../db/pool';
import { getQueueManager, enqueueEvent } from './bullQueue';
import { getSubscriberQueues } from './subscriberRegistry';
import { addToDeadLetter } from './deadLetter';
import type { DomainEvent } from './types';
import type { PoolClient } from 'pg';

// =============================================================================
// TYPES
// =============================================================================

export interface OutboxWorkerConfig {
  schema: string;              // Database schema (e.g., 'inventory', 'orders')
  tableName?: string;          // Outbox table name (default: 'event_outbox')
  pollIntervalMs?: number;     // Polling interval (default: 1000ms)
  batchSize?: number;          // Events per batch (default: 100)
  maxRetries?: number;         // Max publish retries (default: 3)
  producer: string;            // Service name for correlation
}

export interface OutboxEvent {
  id: string;
  eventId: string;
  eventType: string;
  payload: DomainEvent;
  status: 'pending' | 'published' | 'failed';
  retryCount: number;
  createdAt: Date;
  publishedAt?: Date;
  errorMessage?: string;
}

interface OutboxRow {
  id: string;
  event_id: string;
  event_type: string;
  payload: string;
  status: string;
  retry_count: number;
  created_at: Date;
  published_at: Date | null;
  error_message: string | null;
}

// =============================================================================
// OUTBOX WORKER
// =============================================================================

export class OutboxWorker {
  private config: Required<OutboxWorkerConfig>;
  private running: boolean = false;
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(config: OutboxWorkerConfig) {
    this.config = {
      schema: config.schema,
      tableName: config.tableName ?? 'event_outbox',
      pollIntervalMs: config.pollIntervalMs ?? 1000,
      batchSize: config.batchSize ?? 100,
      maxRetries: config.maxRetries ?? 3,
      producer: config.producer,
    };
  }

  /**
   * Start the outbox worker
   */
  start(): void {
    if (this.running) {
      console.log(`[OutboxWorker:${this.config.schema}] Already running`);
      return;
    }

    this.running = true;
    console.log(
      `[OutboxWorker:${this.config.schema}] Starting with ${this.config.pollIntervalMs}ms interval`
    );

    this.poll();
  }

  /**
   * Stop the outbox worker
   */
  stop(): void {
    this.running = false;
    if (this.pollTimer) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    console.log(`[OutboxWorker:${this.config.schema}] Stopped`);
  }

  /**
   * Poll for pending events and process them
   */
  private async poll(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      await this.processBatch();
    } catch (error) {
      console.error(
        `[OutboxWorker:${this.config.schema}] Poll error:`,
        error instanceof Error ? error.message : error
      );
    }

    // Schedule next poll
    this.pollTimer = setTimeout(() => this.poll(), this.config.pollIntervalMs);
  }

  /**
   * Process a batch of pending events
   */
  private async processBatch(): Promise<number> {
    const client = await getClient();
    let processed = 0;

    try {
      await client.query('BEGIN');

      // Fetch pending events using FOR UPDATE SKIP LOCKED
      // This allows multiple workers to process concurrently without conflicts
      const { schema, tableName, batchSize } = this.config;
      const result = await client.query<OutboxRow>(
        `SELECT * FROM ${schema}.${tableName}
         WHERE status = 'pending'
         ORDER BY created_at ASC
         LIMIT $1
         FOR UPDATE SKIP LOCKED`,
        [batchSize]
      );

      const events = result.rows;

      if (events.length === 0) {
        await client.query('COMMIT');
        return 0;
      }

      console.log(
        `[OutboxWorker:${schema}] Processing ${events.length} pending events`
      );

      for (const row of events) {
        try {
          await this.publishEvent(client, row);
          processed++;
        } catch (error) {
          console.error(
            `[OutboxWorker:${schema}] Failed to publish event ${row.event_id}:`,
            error instanceof Error ? error.message : error
          );
          await this.handlePublishError(client, row, error as Error);
        }
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }

    return processed;
  }

  /**
   * Publish a single event to all subscriber queues (FANOUT)
   */
  private async publishEvent(client: PoolClient, row: OutboxRow): Promise<void> {
    // LIVE.BE.EVENTS_JSON_PARSE_GUARD.001: Guard against malformed payload
    let event: DomainEvent;
    try { event = JSON.parse(row.payload); } catch (e) {
      console.error(`[OutboxWorker] Malformed JSON payload in outbox row ${row.id}:`, e);
      await this.markAsPublished(client, row.id); // skip corrupt row
      return;
    }
    const { schema } = this.config;

    // Get subscriber queues for this event type
    const subscriberQueueNames = getSubscriberQueues(event.eventType);

    if (subscriberQueueNames.length === 0) {
      console.log(
        `[OutboxWorker:${schema}] No subscribers for ${event.eventType}, marking as published`
      );
      await this.markAsPublished(client, row.id);
      return;
    }

    // FANOUT: Publish to ALL subscriber queues
    const queueManager = getQueueManager();
    const publishResults: { queue: string; success: boolean; error?: Error }[] = [];

    for (const queueName of subscriberQueueNames) {
      try {
        const queue = queueManager.getQueue(queueName);
        await enqueueEvent(queue, event);
        publishResults.push({ queue: queueName, success: true });
      } catch (error) {
        publishResults.push({
          queue: queueName,
          success: false,
          error: error as Error,
        });
      }
    }

    // Check if all publishes succeeded
    const failedQueues = publishResults.filter((r) => !r.success);

    if (failedQueues.length === 0) {
      // All queues received the event
      await this.markAsPublished(client, row.id);
      console.log(
        `[OutboxWorker:${schema}] Published ${event.eventType} to ${subscriberQueueNames.length} queues`
      );
    } else if (failedQueues.length === publishResults.length) {
      // All queues failed - this is a complete failure
      throw failedQueues[0]!.error;
    } else {
      // Partial failure - log but mark as published
      // The successful queues have the event, failed queues will need manual intervention
      console.warn(
        `[OutboxWorker:${schema}] Partial publish failure for ${event.eventType}:`,
        failedQueues.map((f) => f.queue).join(', ')
      );
      await this.markAsPublished(client, row.id);
    }
  }

  /**
   * Mark an event as published
   */
  private async markAsPublished(client: PoolClient, outboxId: string): Promise<void> {
    const { schema, tableName } = this.config;
    await client.query(
      `UPDATE ${schema}.${tableName}
       SET status = 'published', published_at = NOW()
       WHERE id = $1`,
      [outboxId]
    );
  }

  /**
   * Handle a publish error (retry or dead letter)
   */
  private async handlePublishError(
    client: PoolClient,
    row: OutboxRow,
    error: Error
  ): Promise<void> {
    const { schema, tableName, maxRetries } = this.config;
    const newRetryCount = row.retry_count + 1;

    if (newRetryCount >= maxRetries) {
      // Max retries exceeded - move to dead letter
      // LIVE.BE.EVENTS_JSON_PARSE_GUARD.001: Guard against malformed payload
      let event: DomainEvent;
      try { event = JSON.parse(row.payload); } catch {
        console.error(`[OutboxWorker] Malformed JSON in dead-letter path for row ${row.id}`);
        event = { eventType: 'PARSE_ERROR', payload: row.payload } as unknown as DomainEvent;
      }
      await addToDeadLetter(schema, event, 'outbox', error, newRetryCount);

      // Mark as failed in outbox
      await client.query(
        `UPDATE ${schema}.${tableName}
         SET status = 'failed', retry_count = $2, error_message = $3
         WHERE id = $1`,
        [row.id, newRetryCount, error.message]
      );

      console.error(
        `[OutboxWorker:${schema}] Event ${row.event_id} moved to dead letter after ${maxRetries} retries`
      );
    } else {
      // Increment retry count (will be picked up on next poll)
      await client.query(
        `UPDATE ${schema}.${tableName}
         SET retry_count = $2, error_message = $3
         WHERE id = $1`,
        [row.id, newRetryCount, error.message]
      );
    }
  }
}

// =============================================================================
// FACTORY FUNCTION
// =============================================================================

/**
 * Create and start an outbox worker for a service schema
 */
export function createOutboxWorker(config: OutboxWorkerConfig): OutboxWorker {
  const worker = new OutboxWorker(config);
  return worker;
}

// =============================================================================
// WRITE TO OUTBOX (for producers)
// =============================================================================

/**
 * Write an event to the outbox table (within a transaction).
 * This should be called as part of the same transaction that modifies the domain state.
 */
export async function writeToOutbox(
  client: PoolClient,
  schema: string,
  event: DomainEvent,
  tableName: string = 'event_outbox'
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO ${schema}.${tableName} (
      event_id, event_type, payload, status, retry_count
    ) VALUES ($1, $2, $3, 'pending', 0)
    RETURNING id`,
    [event.eventId, event.eventType, JSON.stringify(event)]
  );

  return result.rows[0]!.id;
}

/**
 * Create a domain event with standard envelope
 */
export function createDomainEvent<T>(
  eventType: string,
  payload: T,
  producer: string,
  correlationId?: string
): DomainEvent<T> {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    occurredAt: new Date().toISOString(),
    correlationId,
    producer,
    payload,
  };
}
