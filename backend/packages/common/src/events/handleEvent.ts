// Handle Event Wrapper - V3.0.9 compliant
// Provides a standardized wrapper for all event consumers with:
// - Inbox deduplication
// - Retry logic
// - Dead letter handling
// - Correlation ID propagation
// - Structured logging

import { getClient } from '../db/pool';
import {
  checkInbox,
  recordInboxEvent,
  markInboxProcessed,
  markInboxFailed,
} from './eventInbox';
import { addToDeadLetter } from './deadLetter';
import type { DomainEvent } from './types';
import type { Job } from 'bullmq';

// =============================================================================
// TYPES
// =============================================================================

export interface EventHandlerConfig {
  schema: string;           // Database schema for inbox table
  sourceQueue: string;      // Queue name this handler consumes from
  maxRetries?: number;      // Max retries before dead letter (default: 3)
  consumer: string;         // Consumer service name for logging
}

export interface EventContext {
  eventId: string;
  eventType: string;
  correlationId?: string;
  attemptNumber: number;
  sourceQueue: string;
  consumer: string;
}

export type EventProcessor<T = unknown> = (
  event: DomainEvent<T>,
  context: EventContext
) => Promise<void>;

export interface HandleEventResult {
  processed: boolean;
  skipped: boolean;
  reason: string;
  eventId: string;
  eventType: string;
}

// =============================================================================
// EVENT HANDLER WRAPPER
// =============================================================================

/**
 * Create an event handler with inbox deduplication and retry logic.
 * This is the main entry point for all event consumers.
 *
 * Usage:
 * ```typescript
 * const handler = createEventHandler({
 *   schema: 'catalog',
 *   sourceQueue: 'inventory-events.catalog',
 *   consumer: 'catalog-service',
 * });
 *
 * const worker = new Worker('inventory-events.catalog', async (job) => {
 *   await handler(job, async (event, context) => {
 *     // Process the event
 *     await updateStockReadModel(event.payload);
 *   });
 * });
 * ```
 */
export function createEventHandler(config: EventHandlerConfig) {
  const { schema, sourceQueue, maxRetries = 3, consumer } = config;

  return async function handleEvent<T = unknown>(
    job: Job<DomainEvent<T>>,
    processor: EventProcessor<T>
  ): Promise<HandleEventResult> {
    const event = job.data;
    const { eventId, eventType, correlationId } = event;

    console.log(
      `[${consumer}] Processing event ${eventId} (${eventType}) from ${sourceQueue}`,
      correlationId ? `correlationId=${correlationId}` : ''
    );

    // Check inbox for deduplication
    const checkResult = await checkInbox(schema, eventId, sourceQueue, maxRetries);

    if (!checkResult.shouldProcess) {
      const reason = checkResult.reason;
      console.log(
        `[${consumer}] Skipping event ${eventId} (${eventType}): ${reason}`
      );

      // If max retries exceeded, move to dead letter
      if (reason === 'max_retries_exceeded' && checkResult.entry) {
        await addToDeadLetter(
          schema,
          event,
          sourceQueue,
          new Error(`Max retries (${maxRetries}) exceeded`),
          checkResult.entry.retryCount
        );
      }

      return {
        processed: false,
        skipped: true,
        reason,
        eventId,
        eventType,
      };
    }

    const client = await getClient();
    const attemptNumber = checkResult.entry?.retryCount ?? 0;

    try {
      await client.query('BEGIN');

      // Record in inbox (or update to processing)
      await recordInboxEvent(client, schema, event, sourceQueue);

      // Create context for processor
      const context: EventContext = {
        eventId,
        eventType,
        correlationId,
        attemptNumber: attemptNumber + 1,
        sourceQueue,
        consumer,
      };

      // Process the event
      await processor(event, context);

      // Mark as processed
      await markInboxProcessed(client, schema, eventId, sourceQueue);

      await client.query('COMMIT');

      console.log(
        `[${consumer}] Successfully processed event ${eventId} (${eventType})`
      );

      return {
        processed: true,
        skipped: false,
        reason: 'success',
        eventId,
        eventType,
      };
    } catch (error) {
      await client.query('ROLLBACK');

      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(
        `[${consumer}] Failed to process event ${eventId} (${eventType}):`,
        errorMessage
      );

      // Mark as failed in inbox
      try {
        const failClient = await getClient();
        await markInboxFailed(failClient, schema, eventId, sourceQueue, errorMessage);
        failClient.release();
      } catch (markError) {
        console.error(
          `[${consumer}] Failed to mark event ${eventId} as failed:`,
          markError
        );
      }

      // Check if this was the last retry
      const newRetryCount = attemptNumber + 1;
      if (newRetryCount >= maxRetries) {
        console.error(
          `[${consumer}] Event ${eventId} exceeded max retries (${maxRetries}), moving to dead letter`
        );
        await addToDeadLetter(
          schema,
          event,
          sourceQueue,
          error instanceof Error ? error : new Error(errorMessage),
          newRetryCount
        );
      }

      // Re-throw to let Bull handle retry
      throw error;
    } finally {
      client.release();
    }
  };
}

/**
 * Simple event handler without inbox (for events that are idempotent by design).
 * Use this only when the event processing is naturally idempotent.
 */
export function createSimpleEventHandler(consumer: string) {
  return async function handleEvent<T = unknown>(
    job: Job<DomainEvent<T>>,
    processor: (event: DomainEvent<T>) => Promise<void>
  ): Promise<void> {
    const event = job.data;
    const { eventId, eventType, correlationId } = event;

    console.log(
      `[${consumer}] Processing event ${eventId} (${eventType})`,
      correlationId ? `correlationId=${correlationId}` : ''
    );

    try {
      await processor(event);
      console.log(`[${consumer}] Successfully processed event ${eventId}`);
    } catch (error) {
      console.error(
        `[${consumer}] Failed to process event ${eventId}:`,
        error instanceof Error ? error.message : error
      );
      throw error;
    }
  };
}

// =============================================================================
// WORKER FACTORY
// =============================================================================

/**
 * Create a Bull worker with standard event handling.
 * This sets up the worker with proper error handling and logging.
 */
export interface WorkerFactoryConfig extends EventHandlerConfig {
  redis: {
    host: string;
    port: number;
    password?: string;
    db?: number;
  };
  concurrency?: number;
}

// Note: Worker creation is done in bullQueue.ts using QueueManager.createWorker()
// This file focuses on the event handling logic
