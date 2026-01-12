// Inventory Event Consumer - V3.0.9 compliant
// Listens on reorder-service's OWN queue: inventory-events.reorder
// Creates pending reorders when stock falls below threshold
//
// V3.0.9: Each consumer has its own queue (fanout pattern)
// This ensures reorder-service receives ALL inventory events

import { Worker } from 'bullmq';
import {
  createEventHandler,
  initQueueManager,
  type DomainEvent,
  type EventContext,
} from '@supermandi/common';
import { getClient, query, queryOne } from '@supermandi/common';
import { config } from '../config.js';
import {
  getReorderPolicy,
  hasPendingReorder,
  createPendingReorder,
  getStoreSettings,
} from '../db/queries.js';

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
  referenceSubId?: string;
  ledgerCreatedAt: string;
}

interface ProductInfo {
  productId: string;
  productName: string;
  barcode: string | null;
}

interface SupplierOption {
  supplierId: string;
  supplierName: string;
  supplierProductId: string;
  purchasePrice: number;
  priority: number;
}

// =============================================================================
// CONSUMER CONFIGURATION
// =============================================================================

const QUEUE_NAME = 'inventory-events.reorder';
const CONSUMER_NAME = 'reorder-service';
const SCHEMA = 'reorder';

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
 * Creates a pending reorder if:
 * 1. Store has reorder enabled
 * 2. Product has a reorder policy
 * 3. Stock is at or below min_threshold
 * 4. No pending reorder already exists
 */
async function processStockChangedEvent(
  event: DomainEvent<StockChangedPayload>,
  context: EventContext
): Promise<void> {
  const { storeId, productId, newQty } = event.payload;

  console.log(
    `[${CONSUMER_NAME}] Processing stock change for store=${storeId} product=${productId}`,
    `newQty=${newQty} attempt=${context.attemptNumber}`
  );

  // 1. Check if store has reorder enabled
  const settings = await getStoreSettings(storeId);
  if (!settings || !settings.reorderEnabled) {
    console.log(
      `[${CONSUMER_NAME}] Reorder disabled for store=${storeId}, skipping`
    );
    return;
  }

  // 2. Get reorder policy for this product
  const policy = await getReorderPolicy(storeId, productId);
  if (!policy || !policy.isEnabled) {
    console.log(
      `[${CONSUMER_NAME}] No active policy for store=${storeId} product=${productId}, skipping`
    );
    return;
  }

  // 3. Check if stock is at or below threshold
  if (newQty > policy.minStock) {
    console.log(
      `[${CONSUMER_NAME}] Stock ${newQty} > threshold ${policy.minStock}, skipping`
    );
    return;
  }

  // 4. Check if pending reorder already exists
  const hasPending = await hasPendingReorder(storeId, productId);
  if (hasPending) {
    console.log(
      `[${CONSUMER_NAME}] Pending reorder already exists for store=${storeId} product=${productId}, skipping`
    );
    return;
  }

  // 5. Get product info
  const productInfo = await getProductInfo(productId);
  if (!productInfo) {
    console.log(
      `[${CONSUMER_NAME}] Product ${productId} not found, skipping`
    );
    return;
  }

  // 6. Find best supplier
  const supplier = await findBestSupplier(storeId, productId, policy.preferredSupplierId);
  if (!supplier) {
    console.log(
      `[${CONSUMER_NAME}] No supplier found for store=${storeId} product=${productId}, skipping`
    );
    return;
  }

  // 7. Calculate suggested quantity (target - current)
  const suggestedQuantity = Math.max(1, policy.targetStock - newQty);

  // 8. Calculate expiry (default 72 hours)
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + config.reorder.pendingExpiryHours);

  // 9. Create pending reorder
  const client = await getClient();
  try {
    await client.query('BEGIN');

    const pending = await createPendingReorder(client, {
      storeId,
      productId,
      productName: productInfo.productName,
      barcode: productInfo.barcode,
      currentStock: newQty,
      minThreshold: policy.minStock,
      targetStock: policy.targetStock,
      suggestedQuantity,
      suggestedSupplierId: supplier.supplierId,
      suggestedSupplierName: supplier.supplierName,
      suggestedUnitPrice: supplier.purchasePrice,
      supplierProductId: supplier.supplierProductId,
      expiresAt,
    });

    await client.query('COMMIT');

    if (pending) {
      console.log(
        `[${CONSUMER_NAME}] Created pending reorder ${pending.id}`,
        `store=${storeId} product=${productId} qty=${suggestedQuantity}`
      );
    } else {
      // Conflict - another process created it first
      console.log(
        `[${CONSUMER_NAME}] Pending reorder already exists (conflict), skipping`
      );
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Get product info from catalog.
 */
async function getProductInfo(productId: string): Promise<ProductInfo | null> {
  const row = await queryOne<{
    id: string;
    name: string;
    primary_barcode: string | null;
  }>(
    `SELECT id, name, primary_barcode
     FROM catalog.products
     WHERE id = $1`,
    [productId]
  );

  if (!row) return null;

  return {
    productId: row.id,
    productName: row.name,
    barcode: row.primary_barcode,
  };
}

/**
 * Find the best supplier for a product.
 * Priority:
 * 1. Preferred supplier (if set in policy and linked)
 * 2. Highest priority supplier linked to store
 * 3. Lowest price supplier linked to store
 */
async function findBestSupplier(
  storeId: string,
  productId: string,
  preferredSupplierId: string | null
): Promise<SupplierOption | null> {
  // Try preferred supplier first
  if (preferredSupplierId) {
    const preferred = await queryOne<{
      supplier_id: string;
      supplier_name: string;
      supplier_product_id: string;
      purchase_price: number;
      priority: number;
    }>(
      `SELECT
        s.id as supplier_id,
        s.name as supplier_name,
        sp.id as supplier_product_id,
        sp.purchase_price,
        COALESCE(ssl.priority, 999) as priority
       FROM supplier.suppliers s
       JOIN catalog.supplier_products sp ON sp.supplier_id = s.id
       JOIN catalog.supplier_product_map spm ON spm.supplier_product_id = sp.id
       JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id AND ssl.store_id = $1
       WHERE spm.product_id = $2
         AND s.id = $3
         AND ssl.status = 'active'
       LIMIT 1`,
      [storeId, productId, preferredSupplierId]
    );

    if (preferred) {
      return {
        supplierId: preferred.supplier_id,
        supplierName: preferred.supplier_name,
        supplierProductId: preferred.supplier_product_id,
        purchasePrice: preferred.purchase_price,
        priority: preferred.priority,
      };
    }
  }

  // Find best by priority, then price
  const best = await queryOne<{
    supplier_id: string;
    supplier_name: string;
    supplier_product_id: string;
    purchase_price: number;
    priority: number;
  }>(
    `SELECT
      s.id as supplier_id,
      s.name as supplier_name,
      sp.id as supplier_product_id,
      sp.purchase_price,
      COALESCE(ssl.priority, 999) as priority
     FROM supplier.suppliers s
     JOIN catalog.supplier_products sp ON sp.supplier_id = s.id
     JOIN catalog.supplier_product_map spm ON spm.supplier_product_id = sp.id
     JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id AND ssl.store_id = $1
     WHERE spm.product_id = $2
       AND ssl.status = 'active'
     ORDER BY ssl.priority ASC NULLS LAST, sp.purchase_price ASC
     LIMIT 1`,
    [storeId, productId]
  );

  if (!best) return null;

  return {
    supplierId: best.supplier_id,
    supplierName: best.supplier_name,
    supplierProductId: best.supplier_product_id,
    purchasePrice: best.purchase_price,
    priority: best.priority,
  };
}

// =============================================================================
// WORKER SETUP
// =============================================================================

let worker: Worker | null = null;

/**
 * Start the inventory event consumer worker.
 * Listens on the reorder-service's dedicated queue.
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
