// Stock Monitor Cron Job - V3.0.9 compliant
// Runs every hour to check all products against reorder policies
// Creates pending reorders for low stock items

import cron from 'node-cron';
import { getClient, query, queryOne, createLogger } from '@supermandi/common';

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
  moq: number;
  packSize: number;
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

      // STG-423: Find best supplier with MOQ-aware selection
      const baseQty = Math.max(1, product.targetStock - product.currentStock);
      const supplier = await findBestSupplier(
        storeId,
        product.productId,
        product.preferredSupplierId,
        baseQty
      );

      if (!supplier) {
        logger.info(`[${JOB_NAME}] No supplier found for product, skipping`, { productId: product.productId });
        continue;
      }

      // STG-420: Quantity optimization with EOQ/MOQ
      // Calculate base quantity needed
      let suggestedQuantity = Math.max(1, product.targetStock - product.currentStock);

      // STG-420: Apply EOQ calculation if we have enough data
      const eoqQty = calculateEOQ(suggestedQuantity, supplier.purchasePrice);
      if (eoqQty > 0) {
        suggestedQuantity = eoqQty;
      }

      // STG-420: Clamp to >= MOQ
      if (supplier.moq > 0 && suggestedQuantity < supplier.moq) {
        suggestedQuantity = supplier.moq;
      }

      // STG-420: Round up to nearest pack size
      if (supplier.packSize > 1) {
        suggestedQuantity = Math.ceil(suggestedQuantity / supplier.packSize) * supplier.packSize;
      }

      // T-239: cap at max_reorder_qty if set
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
 * STG-420: Calculate Economic Order Quantity (EOQ).
 * Formula: EOQ = sqrt(2 * annual_demand * ordering_cost / holding_cost)
 * Uses sensible defaults for ordering_cost and holding_cost when not available.
 *
 * @param baseQuantity - The simple deficit-based quantity (target - current)
 * @param unitPrice - Unit purchase price for holding cost estimation
 * @returns EOQ quantity, or 0 if calculation is not applicable
 */
function calculateEOQ(baseQuantity: number, unitPrice: number): number {
  if (baseQuantity <= 0 || unitPrice <= 0) return 0;

  // Estimate annual demand: assume the base quantity represents ~1 month of deficit
  // so annual demand ~ baseQuantity * 12
  const annualDemand = baseQuantity * 12;

  // Default ordering cost (per order): ₹50 — covers admin time, communication
  const ORDERING_COST = parseFloat(process.env.REORDER_ORDERING_COST || '50');

  // Holding cost per unit per year: typically 20-25% of unit price
  const HOLDING_COST_RATE = parseFloat(process.env.REORDER_HOLDING_COST_RATE || '0.25');
  const holdingCost = unitPrice * HOLDING_COST_RATE;

  if (holdingCost <= 0) return 0;

  // EOQ formula: sqrt(2 * D * S / H)
  const eoq = Math.sqrt((2 * annualDemand * ORDERING_COST) / holdingCost);

  // Return at least the base quantity — EOQ is a suggestion, not a reduction
  return Math.max(Math.ceil(eoq), baseQuantity);
}

/**
 * STG-423: Dynamic supplier mapping algorithm with MOQ filtering.
 * Find the best supplier for a product.
 * Priority:
 * 1. Filter suppliers by MOQ (exclude where reorder qty < their MOQ)
 * 2. Sort remaining by price (lowest first)
 * 3. Fall back to preferred supplier if no MOQ-eligible supplier found
 */
async function findBestSupplier(
  storeId: string,
  productId: string,
  preferredSupplierId: string | null,
  reorderQty?: number
): Promise<SupplierOption | null> {
  // Get ALL eligible suppliers for this product in this store
  const allSuppliers = await query<{
    supplier_id: string;
    supplier_name: string;
    supplier_product_id: string;
    purchase_price: number;
    priority: number;
    moq: number;
    pack_size: number;
  }>(
    `SELECT
      s.id as supplier_id,
      COALESCE(s.business_name, s.trade_name, s.name) as supplier_name,
      sp.id as supplier_product_id,
      sp.purchase_price,
      COALESCE(ssl.priority, 999) as priority,
      COALESCE(sp.moq, 1) as moq,
      COALESCE(sp.pack_size, 1) as pack_size
     FROM supplier.suppliers s
     JOIN catalog.supplier_products sp ON sp.supplier_id = s.id
     JOIN catalog.supplier_product_map spm ON spm.supplier_product_id = sp.id
     JOIN supplier.supplier_store_links ssl ON ssl.supplier_id = s.id AND ssl.store_id = $1
     WHERE spm.product_id = $2
       AND ssl.status = 'active'
     ORDER BY sp.purchase_price ASC, ssl.priority ASC NULLS LAST`,
    [storeId, productId]
  );

  if (allSuppliers.length === 0) return null;

  const toOption = (row: typeof allSuppliers[0]): SupplierOption => ({
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    supplierProductId: row.supplier_product_id,
    purchasePrice: row.purchase_price,
    priority: row.priority,
    moq: row.moq,
    packSize: row.pack_size,
  });

  // STG-423 Step 1: Filter by MOQ if we know the reorder quantity
  if (reorderQty && reorderQty > 0) {
    const moqEligible = allSuppliers.filter((s) => reorderQty >= s.moq);

    if (moqEligible.length > 0) {
      // STG-423 Step 2: Already sorted by price ASC — pick the cheapest MOQ-eligible
      return toOption(moqEligible[0]);
    }
  }

  // STG-423 Step 3: Fall back to preferred supplier if set
  if (preferredSupplierId) {
    const preferred = allSuppliers.find((s) => s.supplier_id === preferredSupplierId);
    if (preferred) {
      return toOption(preferred);
    }
  }

  // Final fallback: cheapest supplier regardless of MOQ
  return toOption(allSuppliers[0]);
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
