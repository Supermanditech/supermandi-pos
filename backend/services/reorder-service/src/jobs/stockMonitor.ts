// Stock Monitor Cron Job - V3.0.9 compliant
// Runs every hour to check all products against reorder policies
// Creates pending reorders for low stock items

import cron from 'node-cron';
import { getClient, queryOne, createLogger } from '@supermandi/common';

const logger = createLogger({ service: 'reorder-service', level: process.env.LOG_LEVEL || 'info' });
import {
  getStoresWithReorderEnabled,
  getStoreProductsForReorder,
  getExistingPendingProductIds,
  createPendingReorder,
  createReorderRun,
  updateReorderRun,
} from '../db/queries';
import { config } from '../config';

// =============================================================================
// TYPES
// =============================================================================

interface SupplierOption {
  supplierId: string;
  supplierName: string;
  supplierProductId: string;
  purchasePrice: number;
  priority: number;
}

interface StoreRunStats {
  evaluatedProducts: number;
  createdPending: number;
  skippedExisting: number;
  errors: string[];
}

// =============================================================================
// CRON JOB CONFIGURATION
// =============================================================================

const CRON_SCHEDULE = '0 * * * *'; // Every hour at minute 0
const JOB_NAME = 'stock-monitor';

let cronTask: cron.ScheduledTask | null = null;
let isRunning = false;

// =============================================================================
// STOCK MONITOR LOGIC
// =============================================================================

/**
 * Main stock monitor function.
 * Iterates through all stores with reorder enabled and creates pending reorders.
 */
export async function runStockMonitor(): Promise<void> {
  if (isRunning) {
    logger.info(`[${JOB_NAME}] Already running, skipping this execution`);
    return;
  }

  isRunning = true;
  const startTime = new Date();
  logger.info(`[${JOB_NAME}] Starting stock monitor run`, { startTime: startTime.toISOString() });

  try {
    // Get all stores with reorder enabled
    const storeIds = await getStoresWithReorderEnabled();
    logger.info(`[${JOB_NAME}] Found stores with reorder enabled`, { count: storeIds.length });

    if (storeIds.length === 0) {
      logger.info(`[${JOB_NAME}] No stores with reorder enabled, nothing to do`);
      return;
    }

    // Process each store
    for (const storeId of storeIds) {
      try {
        await processStore(storeId);
      } catch (error) {
        logger.error(
          `[${JOB_NAME}] Error processing store`,
          error instanceof Error ? error : undefined,
          { storeId, detail: error instanceof Error ? undefined : String(error) }
        );
        // Continue with next store
      }
    }

    const endTime = new Date();
    const durationMs = endTime.getTime() - startTime.getTime();
    logger.info(`[${JOB_NAME}] Completed stock monitor run`, { durationMs });
  } catch (error) {
    logger.error(
      `[${JOB_NAME}] Fatal error in stock monitor`,
      error instanceof Error ? error : undefined,
      { detail: error instanceof Error ? undefined : String(error) }
    );
  } finally {
    isRunning = false;
  }
}

/**
 * Process a single store: check all products and create pending reorders.
 */
async function processStore(storeId: string): Promise<void> {
  const startedAt = new Date();
  logger.info(`[${JOB_NAME}] Processing store`, { storeId });

  const client = await getClient();
  let runId: string | null = null;

  try {
    await client.query('BEGIN');

    // Create run record
    const run = await createReorderRun(client, {
      storeId,
      runType: 'cron',
      startedAt,
    });
    runId = run.id;

    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }

  // Get products and existing pending reorders
  const [products, existingPendingIds] = await Promise.all([
    getStoreProductsForReorder(storeId),
    getExistingPendingProductIds(storeId),
  ]);

  const stats: StoreRunStats = {
    evaluatedProducts: products.length,
    createdPending: 0,
    skippedExisting: 0,
    errors: [],
  };

  logger.info(`[${JOB_NAME}] Store evaluation started`, { storeId, productCount: products.length, existingPendingCount: existingPendingIds.size });

  // Calculate expiry time
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + config.reorder.pendingExpiryHours);

  // Process each product
  for (const product of products) {
    try {
      // Skip if pending reorder already exists
      if (existingPendingIds.has(product.productId)) {
        stats.skippedExisting++;
        continue;
      }

      // Skip if stock is above threshold
      if (product.currentStock > product.minStock) {
        continue;
      }

      // Find best supplier
      const supplier = await findBestSupplier(
        storeId,
        product.productId,
        product.preferredSupplierId
      );

      if (!supplier) {
        logger.info(`[${JOB_NAME}] No supplier found for product, skipping`, { productId: product.productId });
        continue;
      }

      // Calculate suggested quantity (T-239: cap at max_reorder_qty if set)
      let suggestedQuantity = Math.max(1, product.targetStock - product.currentStock);
      if (product.maxReorderQty && suggestedQuantity > product.maxReorderQty) {
        suggestedQuantity = product.maxReorderQty;
      }

      // Create pending reorder
      const pendingClient = await getClient();
      try {
        await pendingClient.query('BEGIN');

        const created = await createPendingReorder(pendingClient, {
          storeId,
          productId: product.productId,
          productName: product.productName,
          barcode: product.barcode,
          currentStock: product.currentStock,
          minThreshold: product.minStock,
          targetStock: product.targetStock,
          suggestedQuantity,
          suggestedSupplierId: supplier.supplierId,
          suggestedSupplierName: supplier.supplierName,
          suggestedUnitPrice: supplier.purchasePrice,
          supplierProductId: supplier.supplierProductId,
          expiresAt,
        });

        await pendingClient.query('COMMIT');

        if (created) {
          stats.createdPending++;
          logger.info(`[${JOB_NAME}] Created pending reorder for product`, { productId: product.productId });
        } else {
          // Conflict - another process created it
          stats.skippedExisting++;
        }
      } catch (productError) {
        await pendingClient.query('ROLLBACK');
        const errMsg = productError instanceof Error ? productError.message : String(productError);
        stats.errors.push(`Product ${product.productId}: ${errMsg}`);
        logger.error(
          `[${JOB_NAME}] Error creating pending reorder`,
          productError instanceof Error ? productError : undefined,
          { productId: product.productId, errMsg }
        );
      } finally {
        pendingClient.release();
      }
    } catch (productError) {
      const errMsg = productError instanceof Error ? productError.message : String(productError);
      stats.errors.push(`Product ${product.productId}: ${errMsg}`);
    }
  }

  // Update run record with results
  const finishedAt = new Date();
  const updateClient = await getClient();
  try {
    await updateClient.query('BEGIN');

    await updateReorderRun(updateClient, runId!, {
      finishedAt,
      evaluatedProducts: stats.evaluatedProducts,
      createdPending: stats.createdPending,
      skippedExisting: stats.skippedExisting,
      status: stats.errors.length > 0 ? 'failed' : 'success',
      errorMessage: stats.errors.length > 0 ? stats.errors.join('; ') : null,
    });

    await updateClient.query('COMMIT');
  } catch (error) {
    await updateClient.query('ROLLBACK');
    logger.error(`[${JOB_NAME}] Error updating run record`, error instanceof Error ? error : undefined, { detail: error instanceof Error ? undefined : String(error) });
  } finally {
    updateClient.release();
  }

  logger.info(`[${JOB_NAME}] Store complete`, { storeId, evaluated: stats.evaluatedProducts, created: stats.createdPending, skipped: stats.skippedExisting, errors: stats.errors.length });
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
// CRON JOB CONTROL
// =============================================================================

/**
 * Start the stock monitor cron job.
 */
export function startStockMonitor(): void {
  if (cronTask) {
    logger.info(`[${JOB_NAME}] Stock monitor already running`);
    return;
  }

  cronTask = cron.schedule(CRON_SCHEDULE, () => {
    runStockMonitor().catch((error) => {
      logger.error(`[${JOB_NAME}] Unhandled error in cron job`, error instanceof Error ? error : undefined, { detail: error instanceof Error ? undefined : String(error) });
    });
  });

  logger.info(`[${JOB_NAME}] Stock monitor cron job started`, { schedule: CRON_SCHEDULE });
}

/**
 * Stop the stock monitor cron job.
 */
export function stopStockMonitor(): void {
  if (cronTask) {
    cronTask.stop();
    cronTask = null;
    logger.info(`[${JOB_NAME}] Stock monitor cron job stopped`);
  }
}

/**
 * Check if the stock monitor is running.
 */
export function isStockMonitorRunning(): boolean {
  return cronTask !== null;
}

/**
 * Manually trigger a stock monitor run.
 * Useful for testing or manual runs.
 */
export async function triggerStockMonitor(): Promise<void> {
  logger.info(`[${JOB_NAME}] Manually triggered stock monitor run`);
  await runStockMonitor();
}
