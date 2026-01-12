// Reorder Service Database Queries - V3.0.9 compliant

import type { PoolClient } from 'pg';
import { query, queryOne } from '@supermandi/common';

// =============================================================================
// TYPES
// =============================================================================

export interface StoreReorderSettings {
  storeId: string;
  reorderEnabled: boolean;
  requireApproval: boolean;
  notifyOnLowStock: boolean;
  updatedAt: Date;
}

export interface ReorderPolicy {
  id: string;
  storeId: string;
  productId: string;
  minStock: number;
  targetStock: number;
  preferredSupplierId: string | null;
  isEnabled: boolean;
  createdByUserId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface SettingsRow {
  store_id: string;
  reorder_enabled: boolean;
  require_approval: boolean;
  notify_on_low_stock: boolean;
  updated_at: Date;
}

interface PolicyRow {
  id: string;
  store_id: string;
  product_id: string;
  min_stock: number;
  target_stock: number;
  preferred_supplier_id: string | null;
  is_enabled: boolean;
  created_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// SETTINGS QUERIES
// =============================================================================

export async function getStoreSettings(
  storeId: string
): Promise<StoreReorderSettings | null> {
  const row = await queryOne<SettingsRow>(
    `SELECT * FROM reorder.store_reorder_settings WHERE store_id = $1`,
    [storeId]
  );

  return row ? mapSettingsRow(row) : null;
}

export async function upsertStoreSettings(
  client: PoolClient,
  storeId: string,
  settings: {
    reorderEnabled?: boolean;
    requireApproval?: boolean;
    notifyOnLowStock?: boolean;
  }
): Promise<StoreReorderSettings> {
  const result = await client.query<SettingsRow>(
    `INSERT INTO reorder.store_reorder_settings (
      store_id, reorder_enabled, require_approval, notify_on_low_stock
    ) VALUES ($1, $2, $3, $4)
    ON CONFLICT (store_id) DO UPDATE SET
      reorder_enabled = COALESCE($2, reorder.store_reorder_settings.reorder_enabled),
      require_approval = COALESCE($3, reorder.store_reorder_settings.require_approval),
      notify_on_low_stock = COALESCE($4, reorder.store_reorder_settings.notify_on_low_stock),
      updated_at = NOW()
    RETURNING *`,
    [
      storeId,
      settings.reorderEnabled ?? true,
      settings.requireApproval ?? true,
      settings.notifyOnLowStock ?? true,
    ]
  );

  return mapSettingsRow(result.rows[0]!);
}

// =============================================================================
// POLICY QUERIES
// =============================================================================

export async function getPolicy(
  storeId: string,
  productId: string
): Promise<ReorderPolicy | null> {
  const row = await queryOne<PolicyRow>(
    `SELECT * FROM reorder.reorder_policies
     WHERE store_id = $1 AND product_id = $2`,
    [storeId, productId]
  );

  return row ? mapPolicyRow(row) : null;
}

export async function getPolicyById(
  policyId: string
): Promise<ReorderPolicy | null> {
  const row = await queryOne<PolicyRow>(
    `SELECT * FROM reorder.reorder_policies WHERE id = $1`,
    [policyId]
  );

  return row ? mapPolicyRow(row) : null;
}

export async function listPolicies(
  storeId: string,
  options: {
    limit?: number;
    offset?: number;
    enabledOnly?: boolean;
  } = {}
): Promise<{ policies: ReorderPolicy[]; total: number }> {
  const { limit = 50, offset = 0, enabledOnly = false } = options;

  const whereClauses: string[] = ['store_id = $1'];
  const params: unknown[] = [storeId];
  let paramIndex = 2;

  if (enabledOnly) {
    whereClauses.push('is_enabled = true');
  }

  const whereClause = whereClauses.join(' AND ');

  // Count
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM reorder.reorder_policies WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRow?.count ?? '0', 10);

  // Fetch
  const rows = await query<PolicyRow>(
    `SELECT * FROM reorder.reorder_policies
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return {
    policies: rows.map(mapPolicyRow),
    total,
  };
}

export async function createPolicy(
  client: PoolClient,
  data: {
    storeId: string;
    productId: string;
    minStock: number;
    targetStock: number;
    preferredSupplierId?: string | null;
    isEnabled?: boolean;
    createdByUserId?: string | null;
  }
): Promise<ReorderPolicy> {
  const result = await client.query<PolicyRow>(
    `INSERT INTO reorder.reorder_policies (
      store_id, product_id, min_stock, target_stock,
      preferred_supplier_id, is_enabled, created_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7)
    RETURNING *`,
    [
      data.storeId,
      data.productId,
      data.minStock,
      data.targetStock,
      data.preferredSupplierId ?? null,
      data.isEnabled ?? true,
      data.createdByUserId ?? null,
    ]
  );

  return mapPolicyRow(result.rows[0]!);
}

export async function updatePolicy(
  client: PoolClient,
  policyId: string,
  data: {
    minStock?: number;
    targetStock?: number;
    preferredSupplierId?: string | null;
    isEnabled?: boolean;
  }
): Promise<ReorderPolicy | null> {
  const setClauses: string[] = ['updated_at = NOW()'];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (data.minStock !== undefined) {
    setClauses.push(`min_stock = $${paramIndex++}`);
    params.push(data.minStock);
  }

  if (data.targetStock !== undefined) {
    setClauses.push(`target_stock = $${paramIndex++}`);
    params.push(data.targetStock);
  }

  if (data.preferredSupplierId !== undefined) {
    setClauses.push(`preferred_supplier_id = $${paramIndex++}`);
    params.push(data.preferredSupplierId);
  }

  if (data.isEnabled !== undefined) {
    setClauses.push(`is_enabled = $${paramIndex++}`);
    params.push(data.isEnabled);
  }

  params.push(policyId);

  const result = await client.query<PolicyRow>(
    `UPDATE reorder.reorder_policies
     SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    params
  );

  return result.rows[0] ? mapPolicyRow(result.rows[0]) : null;
}

export async function deletePolicy(
  client: PoolClient,
  policyId: string
): Promise<boolean> {
  const result = await client.query(
    `DELETE FROM reorder.reorder_policies WHERE id = $1`,
    [policyId]
  );

  return (result.rowCount ?? 0) > 0;
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

function mapSettingsRow(row: SettingsRow): StoreReorderSettings {
  return {
    storeId: row.store_id,
    reorderEnabled: row.reorder_enabled,
    requireApproval: row.require_approval,
    notifyOnLowStock: row.notify_on_low_stock,
    updatedAt: row.updated_at,
  };
}

function mapPolicyRow(row: PolicyRow): ReorderPolicy {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id,
    minStock: row.min_stock,
    targetStock: row.target_stock,
    preferredSupplierId: row.preferred_supplier_id,
    isEnabled: row.is_enabled,
    createdByUserId: row.created_by_user_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// PENDING REORDER TYPES
// =============================================================================

export type PendingReorderStatus = 'pending' | 'approved' | 'dismissed' | 'expired';

export interface PendingReorder {
  id: string;
  storeId: string;
  productId: string;
  productName: string;
  barcode: string | null;
  currentStock: number;
  minThreshold: number;
  targetStock: number;
  suggestedQuantity: number;
  suggestedSupplierId: string | null;
  suggestedSupplierName: string | null;
  suggestedUnitPrice: number | null;
  supplierProductId: string | null;
  status: PendingReorderStatus;
  dismissedReason: string | null;
  purchaseOrderId: string | null;
  expiresAt: Date;
  createdAt: Date;
  updatedAt: Date;
}

interface PendingReorderRow {
  id: string;
  store_id: string;
  product_id: string;
  product_name: string;
  barcode: string | null;
  current_stock: number;
  min_threshold: number;
  target_stock: number;
  suggested_quantity: number;
  suggested_supplier_id: string | null;
  suggested_supplier_name: string | null;
  suggested_unit_price: number | null;
  supplier_product_id: string | null;
  status: string;
  dismissed_reason: string | null;
  purchase_order_id: string | null;
  expires_at: Date;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// PENDING REORDER QUERIES
// =============================================================================

export async function getPendingReorderById(
  pendingId: string
): Promise<PendingReorder | null> {
  const row = await queryOne<PendingReorderRow>(
    `SELECT * FROM reorder.pending_reorders WHERE id = $1`,
    [pendingId]
  );

  return row ? mapPendingReorderRow(row) : null;
}

export async function listPendingReorders(
  storeId: string,
  options: {
    status?: PendingReorderStatus;
    limit?: number;
    offset?: number;
  } = {}
): Promise<{ pendingReorders: PendingReorder[]; total: number }> {
  const { status = 'pending', limit = 50, offset = 0 } = options;

  const whereClauses: string[] = ['store_id = $1', 'status = $2'];
  const params: unknown[] = [storeId, status];
  let paramIndex = 3;

  const whereClause = whereClauses.join(' AND ');

  // Count
  const countRow = await queryOne<{ count: string }>(
    `SELECT COUNT(*) as count FROM reorder.pending_reorders WHERE ${whereClause}`,
    params
  );
  const total = parseInt(countRow?.count ?? '0', 10);

  // Fetch
  const rows = await query<PendingReorderRow>(
    `SELECT * FROM reorder.pending_reorders
     WHERE ${whereClause}
     ORDER BY created_at DESC
     LIMIT $${paramIndex++} OFFSET $${paramIndex}`,
    [...params, limit, offset]
  );

  return {
    pendingReorders: rows.map(mapPendingReorderRow),
    total,
  };
}

export async function getPendingReordersByIds(
  ids: string[]
): Promise<PendingReorder[]> {
  if (ids.length === 0) return [];

  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await query<PendingReorderRow>(
    `SELECT * FROM reorder.pending_reorders WHERE id IN (${placeholders})`,
    ids
  );

  return rows.map(mapPendingReorderRow);
}

export async function updatePendingReorderStatus(
  client: PoolClient,
  pendingId: string,
  status: PendingReorderStatus,
  data: {
    dismissedReason?: string;
    purchaseOrderId?: string;
  } = {}
): Promise<PendingReorder | null> {
  const setClauses: string[] = ['status = $1', 'updated_at = NOW()'];
  const params: unknown[] = [status];
  let paramIndex = 2;

  if (data.dismissedReason !== undefined) {
    setClauses.push(`dismissed_reason = $${paramIndex++}`);
    params.push(data.dismissedReason);
  }

  if (data.purchaseOrderId !== undefined) {
    setClauses.push(`purchase_order_id = $${paramIndex++}`);
    params.push(data.purchaseOrderId);
  }

  params.push(pendingId);

  const result = await client.query<PendingReorderRow>(
    `UPDATE reorder.pending_reorders
     SET ${setClauses.join(', ')}
     WHERE id = $${paramIndex}
     RETURNING *`,
    params
  );

  return result.rows[0] ? mapPendingReorderRow(result.rows[0]) : null;
}

export async function bulkUpdatePendingReorderStatus(
  client: PoolClient,
  ids: string[],
  status: PendingReorderStatus,
  data: {
    purchaseOrderId?: string;
  } = {}
): Promise<number> {
  if (ids.length === 0) return 0;

  const setClauses: string[] = ['status = $1', 'updated_at = NOW()'];
  const params: unknown[] = [status];
  let paramIndex = 2;

  if (data.purchaseOrderId !== undefined) {
    setClauses.push(`purchase_order_id = $${paramIndex++}`);
    params.push(data.purchaseOrderId);
  }

  const placeholders = ids.map((_, i) => `$${paramIndex + i}`).join(', ');
  params.push(...ids);

  const result = await client.query(
    `UPDATE reorder.pending_reorders
     SET ${setClauses.join(', ')}
     WHERE id IN (${placeholders})`,
    params
  );

  return result.rowCount ?? 0;
}

// =============================================================================
// EVENT OUTBOX QUERIES
// =============================================================================

export async function insertEventOutbox(
  client: PoolClient,
  event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: object;
  }
): Promise<string> {
  const result = await client.query<{ id: string }>(
    `INSERT INTO reorder.event_outbox (
      event_type, aggregate_type, aggregate_id, payload
    ) VALUES ($1, $2, $3, $4)
    RETURNING id`,
    [event.eventType, event.aggregateType, event.aggregateId, JSON.stringify(event.payload)]
  );

  return result.rows[0]!.id;
}

// =============================================================================
// PENDING REORDER CREATION (for event consumer)
// =============================================================================

export interface CreatePendingReorderInput {
  storeId: string;
  productId: string;
  productName: string;
  barcode: string | null;
  currentStock: number;
  minThreshold: number;
  targetStock: number;
  suggestedQuantity: number;
  suggestedSupplierId: string | null;
  suggestedSupplierName: string | null;
  suggestedUnitPrice: number | null;
  supplierProductId: string | null;
  expiresAt: Date;
}

/**
 * Create a pending reorder.
 * Uses INSERT ... ON CONFLICT DO NOTHING to handle the partial unique index
 * (ux_pending_reorders_active) which prevents duplicate pending reorders
 * for the same store+product.
 */
export async function createPendingReorder(
  client: PoolClient,
  input: CreatePendingReorderInput
): Promise<PendingReorder | null> {
  const result = await client.query<PendingReorderRow>(
    `INSERT INTO reorder.pending_reorders (
      store_id, product_id, product_name, barcode,
      current_stock, min_threshold, target_stock,
      suggested_quantity, suggested_supplier_id, suggested_supplier_name,
      suggested_unit_price, supplier_product_id, expires_at
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
    ON CONFLICT DO NOTHING
    RETURNING *`,
    [
      input.storeId,
      input.productId,
      input.productName,
      input.barcode,
      input.currentStock,
      input.minThreshold,
      input.targetStock,
      input.suggestedQuantity,
      input.suggestedSupplierId,
      input.suggestedSupplierName,
      input.suggestedUnitPrice,
      input.supplierProductId,
      input.expiresAt,
    ]
  );

  // Returns null if conflict (pending already exists)
  return result.rows[0] ? mapPendingReorderRow(result.rows[0]) : null;
}

/**
 * Check if a pending reorder already exists for a store+product.
 */
export async function hasPendingReorder(
  storeId: string,
  productId: string
): Promise<boolean> {
  const row = await queryOne<{ exists: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM reorder.pending_reorders
      WHERE store_id = $1 AND product_id = $2 AND status = 'pending'
    ) as exists`,
    [storeId, productId]
  );

  return row?.exists ?? false;
}

/**
 * Get reorder policy for a store+product.
 * Used by the event consumer to check thresholds.
 */
export async function getReorderPolicy(
  storeId: string,
  productId: string
): Promise<ReorderPolicy | null> {
  return getPolicy(storeId, productId);
}

// =============================================================================
// PENDING REORDER HELPER
// =============================================================================

function mapPendingReorderRow(row: PendingReorderRow): PendingReorder {
  return {
    id: row.id,
    storeId: row.store_id,
    productId: row.product_id,
    productName: row.product_name,
    barcode: row.barcode,
    currentStock: row.current_stock,
    minThreshold: row.min_threshold,
    targetStock: row.target_stock,
    suggestedQuantity: row.suggested_quantity,
    suggestedSupplierId: row.suggested_supplier_id,
    suggestedSupplierName: row.suggested_supplier_name,
    suggestedUnitPrice: row.suggested_unit_price,
    supplierProductId: row.supplier_product_id,
    status: row.status as PendingReorderStatus,
    dismissedReason: row.dismissed_reason,
    purchaseOrderId: row.purchase_order_id,
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// REORDER RUNS TYPES
// =============================================================================

export type ReorderRunType = 'cron' | 'event';
export type ReorderRunStatus = 'success' | 'failed';

export interface ReorderRun {
  id: string;
  storeId: string;
  runType: ReorderRunType;
  startedAt: Date;
  finishedAt: Date | null;
  evaluatedProducts: number;
  createdPending: number;
  skippedExisting: number;
  status: ReorderRunStatus;
  errorMessage: string | null;
  createdAt: Date;
}

interface ReorderRunRow {
  id: string;
  store_id: string;
  run_type: string;
  started_at: Date;
  finished_at: Date | null;
  evaluated_products: number;
  created_pending: number;
  skipped_existing: number;
  status: string;
  error_message: string | null;
  created_at: Date;
}

// =============================================================================
// REORDER RUNS QUERIES
// =============================================================================

/**
 * Create a new reorder run record.
 */
export async function createReorderRun(
  client: PoolClient,
  data: {
    storeId: string;
    runType: ReorderRunType;
    startedAt: Date;
  }
): Promise<ReorderRun> {
  const result = await client.query<ReorderRunRow>(
    `INSERT INTO reorder.reorder_runs (store_id, run_type, started_at)
     VALUES ($1, $2, $3)
     RETURNING *`,
    [data.storeId, data.runType, data.startedAt]
  );

  return mapReorderRunRow(result.rows[0]!);
}

/**
 * Update a reorder run with results.
 */
export async function updateReorderRun(
  client: PoolClient,
  runId: string,
  data: {
    finishedAt: Date;
    evaluatedProducts: number;
    createdPending: number;
    skippedExisting: number;
    status: ReorderRunStatus;
    errorMessage?: string | null;
  }
): Promise<ReorderRun | null> {
  const result = await client.query<ReorderRunRow>(
    `UPDATE reorder.reorder_runs
     SET finished_at = $1,
         evaluated_products = $2,
         created_pending = $3,
         skipped_existing = $4,
         status = $5,
         error_message = $6
     WHERE id = $7
     RETURNING *`,
    [
      data.finishedAt,
      data.evaluatedProducts,
      data.createdPending,
      data.skippedExisting,
      data.status,
      data.errorMessage ?? null,
      runId,
    ]
  );

  return result.rows[0] ? mapReorderRunRow(result.rows[0]) : null;
}

/**
 * Get recent reorder runs for a store.
 */
export async function getRecentReorderRuns(
  storeId: string,
  limit: number = 10
): Promise<ReorderRun[]> {
  const rows = await query<ReorderRunRow>(
    `SELECT * FROM reorder.reorder_runs
     WHERE store_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [storeId, limit]
  );

  return rows.map(mapReorderRunRow);
}

function mapReorderRunRow(row: ReorderRunRow): ReorderRun {
  return {
    id: row.id,
    storeId: row.store_id,
    runType: row.run_type as ReorderRunType,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    evaluatedProducts: row.evaluated_products,
    createdPending: row.created_pending,
    skippedExisting: row.skipped_existing,
    status: row.status as ReorderRunStatus,
    errorMessage: row.error_message,
    createdAt: row.created_at,
  };
}

// =============================================================================
// STOCK MONITOR QUERIES
// =============================================================================

/**
 * Get all stores with reorder enabled.
 */
export async function getStoresWithReorderEnabled(): Promise<string[]> {
  const rows = await query<{ store_id: string }>(
    `SELECT store_id FROM reorder.store_reorder_settings
     WHERE reorder_enabled = true`
  );

  return rows.map((r) => r.store_id);
}

/**
 * Get all enabled policies for a store with current stock levels.
 * Returns products that need evaluation for reorder.
 */
export async function getStoreProductsForReorder(
  storeId: string
): Promise<Array<{
  productId: string;
  productName: string;
  barcode: string | null;
  minStock: number;
  targetStock: number;
  preferredSupplierId: string | null;
  currentStock: number;
}>> {
  const rows = await query<{
    product_id: string;
    product_name: string;
    primary_barcode: string | null;
    min_stock: number;
    target_stock: number;
    preferred_supplier_id: string | null;
    current_stock: number;
  }>(
    `SELECT
      rp.product_id,
      p.name as product_name,
      p.primary_barcode,
      rp.min_stock,
      rp.target_stock,
      rp.preferred_supplier_id,
      COALESCE(sb.qty, 0) as current_stock
     FROM reorder.reorder_policies rp
     JOIN catalog.products p ON p.id = rp.product_id
     LEFT JOIN inventory.stock_balances sb
       ON sb.store_id = rp.store_id AND sb.product_id = rp.product_id
     WHERE rp.store_id = $1 AND rp.is_enabled = true`,
    [storeId]
  );

  return rows.map((r) => ({
    productId: r.product_id,
    productName: r.product_name,
    barcode: r.primary_barcode,
    minStock: r.min_stock,
    targetStock: r.target_stock,
    preferredSupplierId: r.preferred_supplier_id,
    currentStock: r.current_stock,
  }));
}

/**
 * Get existing pending reorder product IDs for a store.
 * Used to skip products that already have pending reorders.
 */
export async function getExistingPendingProductIds(
  storeId: string
): Promise<Set<string>> {
  const rows = await query<{ product_id: string }>(
    `SELECT product_id FROM reorder.pending_reorders
     WHERE store_id = $1 AND status = 'pending'`,
    [storeId]
  );

  return new Set(rows.map((r) => r.product_id));
}
