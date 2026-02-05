// Inventory Event Consumer - V3.0.9 compliant
// Listens on catalog-service's OWN queue: inventory-events.catalog
// Updates store_products read model with stock changes
//
// V3.0.9: Each consumer has its own queue (fanout pattern)
// This ensures catalog-service receives ALL inventory events

import { Worker } from 'bullmq';
import {
  createEventHandler,
  initQueueManager,
  type DomainEvent,
  type EventContext,
} from '@supermandi/common';
import { getClient } from '@supermandi/common';
import { config } from '../config';
import { updateStoreProductStock } from '../db/queries';

// =============================================================================
// TYPES
// =============================================================================

/**
 * Payload for inventory.stock.changed.v1 events
 */
export interface StockChangedPayload {
  storeId: string;
  productId: string;
  previousQty: number;
  newQty: number;
  changeQty: number;
  changeType: 'sale' | 'grn' | 'adjustment' | 'return' | 'transfer';
  referenceType: 'sale' | 'purchase_order' | 'adjustment' | 'transfer';
  referenceId: string;
  referenceSubId?: string; // For partial GRN
  ledgerCreatedAt: string; // ISO timestamp - use this for ordering!
}

// =============================================================================
// CONSUMER CONFIGURATION
// =============================================================================

const QUEUE_NAME = 'inventory-events.catalog';
const CONSUMER_NAME = 'catalog-service';
const SCHEMA = 'catalog';

// =============================================================================
// EVENT HANDLER
// =============================================================================

/**
 * Create the event handler with inbox deduplication
 */
const handleEvent = createEventHandler({
  schema: SCHEMA,
  sourceQueue: QUEUE_NAME,
  consumer: CONSUMER_NAME,
  maxRetries: 3,
});

/**
 * Process a stock changed event.
 * Updates the store_products read model with the new stock quantity.
 *
 * Ordering Rule (V3.0.9):
 * Only update if event's ledgerCreatedAt > store_products.stock_last_event_at
 * This ensures out-of-order events are ignored (last-write-wins).
 */
async function processStockChangedEvent(
  event: DomainEvent<StockChangedPayload>,
  context: EventContext
): Promise<void> {
  const { storeId, productId, newQty, ledgerCreatedAt } = event.payload;

  console.log(
    `[${CONSUMER_NAME}] Processing stock change for store=${storeId} product=${productId}`,
    `newQty=${newQty} ledgerCreatedAt=${ledgerCreatedAt}`,
    `attempt=${context.attemptNumber}`
  );

  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Convert ledgerCreatedAt to Date for comparison
    const eventTimestamp = new Date(ledgerCreatedAt);

    // Update stock with last-write-wins ordering
    // The updateStoreProductStock function already handles the timestamp comparison
    const updated = await updateStoreProductStock(
      client,
      storeId,
      productId,
      newQty,
      eventTimestamp
    );

    if (updated) {
      console.log(
        `[${CONSUMER_NAME}] Updated stock for store=${storeId} product=${productId}`,
        `newStock=${updated.currentStock}`
      );
    } else {
      // Either the store_product doesn't exist, or the event is out of order
      console.log(
        `[${CONSUMER_NAME}] Skipped stock update for store=${storeId} product=${productId}`,
        `(out of order or product not found)`
      );
    }

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// WORKER SETUP
// =============================================================================

let worker: Worker | null = null;

/**
 * Start the inventory event consumer worker.
 * Listens on the catalog-service's dedicated queue.
 */
export function startInventoryConsumer(): Worker {
  if (worker) {
    console.log(`[${CONSUMER_NAME}] Inventory consumer already running`);
    return worker;
  }

  // Initialize queue manager with Redis config
  initQueueManager({
    redis: {
      host: config.redis.host,
      port: config.redis.port,
      password: config.redis.password || undefined,
      db: config.redis.db,
    },
  });

  // Create the worker
  worker = new Worker<DomainEvent<StockChangedPayload>>(
    QUEUE_NAME,
    async (job) => {
      const event = job.data;

      // Only process stock.changed events
      if (event.eventType !== 'inventory.stock.changed.v1') {
        console.log(
          `[${CONSUMER_NAME}] Ignoring unknown event type: ${event.eventType}`
        );
        return;
      }

      // Use the event handler with inbox deduplication
      await handleEvent(job, processStockChangedEvent);
    },
    {
      connection: {
        host: config.redis.host,
        port: config.redis.port,
        password: config.redis.password || undefined,
        db: config.redis.db,
      },
      concurrency: 5, // Process up to 5 events concurrently
    }
  );

  // Error handling
  worker.on('failed', (job, error) => {
    console.error(
      `[${CONSUMER_NAME}] Job ${job?.id} failed:`,
      error.message
    );
  });

  worker.on('error', (error) => {
    console.error(`[${CONSUMER_NAME}] Worker error:`, error.message);
  });

  worker.on('completed', (job) => {
    console.log(
      `[${CONSUMER_NAME}] Job ${job.id} completed for event ${job.data.eventId}`
    );
  });

  console.log(
    `[${CONSUMER_NAME}] Started inventory consumer on queue: ${QUEUE_NAME}`
  );

  return worker;
}

/**
 * Stop the inventory event consumer worker.
 */
export async function stopInventoryConsumer(): Promise<void> {
  if (worker) {
    await worker.close();
    worker = null;
    console.log(`[${CONSUMER_NAME}] Inventory consumer stopped`);
  }
}

/**
 * Check if the inventory consumer is running.
 */
export function isInventoryConsumerRunning(): boolean {
  return worker !== null && !worker.closing;
}
