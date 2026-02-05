// Supplier Service Database Queries - V3.0.9 compliant
// Queries for suppliers, store links, and requests

import { query, queryOne, getClient } from '@supermandi/common';
import type { PoolClient } from 'pg';
import type {
  Supplier,
  SupplierStoreLink,
  SupplierRequest,
  SupplierWithLink,
} from '@supermandi/common';

// =============================================================================
// TYPES
// =============================================================================

// Re-export types for convenience
export type {
  Supplier,
  SupplierStoreLink,
  SupplierRequest,
  SupplierWithLink,
} from '@supermandi/common';

// Database row types (snake_case)
interface SupplierRow {
  id: string;
  gstin: string;
  pan: string | null;
  business_name: string;
  trade_name: string | null;
  business_type: string | null;
  primary_contact_name: string | null;
  primary_phone: string | null;
  primary_email: string | null;
  address_line1: string | null;
  address_line2: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
  verification_status: string;
  verified_by_user_id: string | null;
  verified_at: Date | null;
  rating: string;
  status: string;
  created_at: Date;
  updated_at: Date;
}

interface SupplierStoreLinkRow {
  id: string;
  supplier_id: string;
  store_id: string;
  credit_days: number;
  min_order_value: number;
  expected_delivery_days: number;
  priority: number;
  is_preferred: boolean;
  status: string;
  linked_by_user_id: string | null;
  created_at: Date;
  updated_at: Date;
}

interface SupplierRequestRow {
  id: string;
  store_id: string;
  requested_gstin: string | null;
  requested_name: string | null;
  requested_phone: string | null;
  requested_email: string | null;
  status: string;
  created_by_user_id: string | null;
  reviewed_by_user_id: string | null;
  reviewed_at: Date | null;
  review_notes: string | null;
  approved_supplier_id: string | null;
  created_at: Date;
  updated_at: Date;
}

// =============================================================================
// ROW MAPPERS
// =============================================================================

function mapSupplierRow(row: SupplierRow): Supplier {
  return {
    id: row.id,
    gstin: row.gstin,
    pan: row.pan ?? undefined,
    businessName: row.business_name,
    tradeName: row.trade_name ?? undefined,
    businessType: row.business_type ?? undefined,
    primaryContactName: row.primary_contact_name ?? undefined,
    primaryPhone: row.primary_phone ?? undefined,
    primaryEmail: row.primary_email ?? undefined,
    addressLine1: row.address_line1 ?? undefined,
    city: row.city ?? undefined,
    state: row.state ?? undefined,
    pincode: row.pincode ?? undefined,
    verificationStatus: row.verification_status as Supplier['verificationStatus'],
    verifiedByUserId: row.verified_by_user_id ?? undefined,
    verifiedAt: row.verified_at ?? undefined,
    rating: parseFloat(row.rating),
    status: row.status as Supplier['status'],
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSupplierStoreLinkRow(row: SupplierStoreLinkRow): SupplierStoreLink {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    storeId: row.store_id,
    creditDays: row.credit_days,
    minOrderValue: row.min_order_value,
    expectedDeliveryDays: row.expected_delivery_days,
    priority: row.priority,
    isPreferred: row.is_preferred,
    status: row.status as SupplierStoreLink['status'],
    linkedByUserId: row.linked_by_user_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapSupplierRequestRow(row: SupplierRequestRow): SupplierRequest {
  return {
    id: row.id,
    storeId: row.store_id,
    requestedGstin: row.requested_gstin ?? undefined,
    requestedName: row.requested_name ?? undefined,
    requestedPhone: row.requested_phone ?? undefined,
    requestedEmail: row.requested_email ?? undefined,
    status: row.status as SupplierRequest['status'],
    createdByUserId: row.created_by_user_id ?? undefined,
    reviewedByUserId: row.reviewed_by_user_id ?? undefined,
    reviewedAt: row.reviewed_at ?? undefined,
    reviewNotes: row.review_notes ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// =============================================================================
// SUPPLIER QUERIES
// =============================================================================

/**
 * Get supplier by ID
 */
export async function getSupplierById(id: string): Promise<Supplier | null> {
  const row = await queryOne<SupplierRow>(
    `SELECT * FROM supplier.suppliers WHERE id = $1`,
    [id]
  );
  return row ? mapSupplierRow(row) : null;
}

/**
 * Get supplier by GSTIN
 */
export async function getSupplierByGstin(gstin: string): Promise<Supplier | null> {
  const row = await queryOne<SupplierRow>(
    `SELECT * FROM supplier.suppliers WHERE gstin = $1`,
    [gstin]
  );
  return row ? mapSupplierRow(row) : null;
}

/**
 * Search suppliers by GSTIN or business name
 * Uses trigram similarity for fuzzy name matching
 */
export async function searchSuppliers(
  searchQuery: string,
  options: {
    limit?: number;
    offset?: number;
    status?: string;
  } = {}
): Promise<{ suppliers: Supplier[]; total: number }> {
  const { limit = 20, offset = 0, status = 'active' } = options;

  // Check if search looks like GSTIN (15 chars, alphanumeric)
  const isGstinSearch = /^[0-9A-Z]{15}$/i.test(searchQuery.trim());

  let countSql: string;
  let searchSql: string;
  let params: unknown[];

  if (isGstinSearch) {
    // Exact GSTIN match
    countSql = `
      SELECT COUNT(*) as count
      FROM supplier.suppliers
      WHERE gstin = $1 AND status = $2
    `;
    searchSql = `
      SELECT *
      FROM supplier.suppliers
      WHERE gstin = $1 AND status = $2
      LIMIT $3 OFFSET $4
    `;
    params = [searchQuery.toUpperCase(), status, limit, offset];
  } else {
    // Trigram similarity search on business name
    countSql = `
      SELECT COUNT(*) as count
      FROM supplier.suppliers
      WHERE (
        business_name ILIKE $1
        OR trade_name ILIKE $1
        OR similarity(business_name, $2) > 0.3
      )
      AND status = $3
    `;
    searchSql = `
      SELECT *,
        GREATEST(
          similarity(business_name, $2),
          similarity(COALESCE(trade_name, ''), $2)
        ) as score
      FROM supplier.suppliers
      WHERE (
        business_name ILIKE $1
        OR trade_name ILIKE $1
        OR similarity(business_name, $2) > 0.3
      )
      AND status = $3
      ORDER BY score DESC, business_name ASC
      LIMIT $4 OFFSET $5
    `;
    const likePattern = `%${searchQuery}%`;
    params = [likePattern, searchQuery, status, limit, offset];
  }

  // Get count
  const countRow = await queryOne<{ count: string }>(
    countSql,
    isGstinSearch ? [searchQuery.toUpperCase(), status] : [`%${searchQuery}%`, searchQuery, status]
  );
  const total = parseInt(countRow?.count ?? '0', 10);

  // Get results
  const rows = await query<SupplierRow & { score?: number }>(searchSql, params);

  return {
    suppliers: rows.map(mapSupplierRow),
    total,
  };
}

// =============================================================================
// STORE LINK QUERIES
// =============================================================================

/**
 * Get suppliers linked to a store
 */
export async function getLinkedSuppliers(
  storeId: string,
  options: {
    status?: string;
    preferredOnly?: boolean;
  } = {}
): Promise<SupplierWithLink[]> {
  const { status = 'active', preferredOnly = false } = options;

  let sql = `
    SELECT
      s.*,
      l.id as link_id,
      l.supplier_id as link_supplier_id,
      l.store_id as link_store_id,
      l.credit_days as link_credit_days,
      l.min_order_value as link_min_order_value,
      l.expected_delivery_days as link_expected_delivery_days,
      l.priority as link_priority,
      l.is_preferred as link_is_preferred,
      l.status as link_status,
      l.linked_by_user_id as link_linked_by_user_id,
      l.created_at as link_created_at,
      l.updated_at as link_updated_at
    FROM supplier.suppliers s
    INNER JOIN supplier.supplier_store_links l
      ON s.id = l.supplier_id
    WHERE l.store_id = $1
      AND l.status = $2
      AND s.status = 'active'
  `;

  const params: unknown[] = [storeId, status];

  if (preferredOnly) {
    sql += ` AND l.is_preferred = true`;
  }

  sql += ` ORDER BY l.priority ASC, s.business_name ASC`;

  interface JoinedRow extends SupplierRow {
    link_id: string;
    link_supplier_id: string;
    link_store_id: string;
    link_credit_days: number;
    link_min_order_value: number;
    link_expected_delivery_days: number;
    link_priority: number;
    link_is_preferred: boolean;
    link_status: string;
    link_linked_by_user_id: string | null;
    link_created_at: Date;
    link_updated_at: Date;
  }

  const rows = await query<JoinedRow>(sql, params);

  return rows.map((row) => ({
    ...mapSupplierRow(row),
    link: {
      id: row.link_id,
      supplierId: row.link_supplier_id,
      storeId: row.link_store_id,
      creditDays: row.link_credit_days,
      minOrderValue: row.link_min_order_value,
      expectedDeliveryDays: row.link_expected_delivery_days,
      priority: row.link_priority,
      isPreferred: row.link_is_preferred,
      status: row.link_status as SupplierStoreLink['status'],
      linkedByUserId: row.link_linked_by_user_id ?? undefined,
      createdAt: row.link_created_at,
      updatedAt: row.link_updated_at,
    },
  }));
}

/**
 * Get a specific supplier link
 */
export async function getSupplierLink(
  storeId: string,
  supplierId: string
): Promise<SupplierStoreLink | null> {
  const row = await queryOne<SupplierStoreLinkRow>(
    `SELECT * FROM supplier.supplier_store_links
     WHERE store_id = $1 AND supplier_id = $2`,
    [storeId, supplierId]
  );
  return row ? mapSupplierStoreLinkRow(row) : null;
}

/**
 * Create a supplier-store link
 */
export async function createSupplierLink(
  client: PoolClient,
  input: {
    supplierId: string;
    storeId: string;
    creditDays?: number;
    minOrderValue?: number;
    expectedDeliveryDays?: number;
    priority?: number;
    isPreferred?: boolean;
    linkedByUserId?: string;
  }
): Promise<SupplierStoreLink> {
  const {
    supplierId,
    storeId,
    creditDays = 0,
    minOrderValue = 0,
    expectedDeliveryDays = 2,
    priority = 100,
    isPreferred = false,
    linkedByUserId,
  } = input;

  const result = await client.query<SupplierStoreLinkRow>(
    `INSERT INTO supplier.supplier_store_links (
      supplier_id, store_id, credit_days, min_order_value,
      expected_delivery_days, priority, is_preferred, linked_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    RETURNING *`,
    [supplierId, storeId, creditDays, minOrderValue, expectedDeliveryDays, priority, isPreferred, linkedByUserId]
  );

  return mapSupplierStoreLinkRow(result.rows[0]!);
}

/**
 * Update a supplier-store link
 */
export async function updateSupplierLink(
  client: PoolClient,
  storeId: string,
  supplierId: string,
  updates: {
    creditDays?: number;
    minOrderValue?: number;
    expectedDeliveryDays?: number;
    priority?: number;
    isPreferred?: boolean;
    status?: string;
  }
): Promise<SupplierStoreLink> {
  // Build dynamic UPDATE query
  const setClauses: string[] = [];
  const params: unknown[] = [];
  let paramIndex = 1;

  if (updates.creditDays !== undefined) {
    setClauses.push(`credit_days = $${paramIndex++}`);
    params.push(updates.creditDays);
  }
  if (updates.minOrderValue !== undefined) {
    setClauses.push(`min_order_value = $${paramIndex++}`);
    params.push(updates.minOrderValue);
  }
  if (updates.expectedDeliveryDays !== undefined) {
    setClauses.push(`expected_delivery_days = $${paramIndex++}`);
    params.push(updates.expectedDeliveryDays);
  }
  if (updates.priority !== undefined) {
    setClauses.push(`priority = $${paramIndex++}`);
    params.push(updates.priority);
  }
  if (updates.isPreferred !== undefined) {
    setClauses.push(`is_preferred = $${paramIndex++}`);
    params.push(updates.isPreferred);
  }
  if (updates.status !== undefined) {
    setClauses.push(`status = $${paramIndex++}`);
    params.push(updates.status);
  }

  if (setClauses.length === 0) {
    // No updates provided, just return current link
    const current = await queryOne<SupplierStoreLinkRow>(
      `SELECT * FROM supplier.supplier_store_links
       WHERE store_id = $1 AND supplier_id = $2`,
      [storeId, supplierId]
    );
    if (!current) {
      throw new Error(`Supplier link not found: ${supplierId} for store ${storeId}`);
    }
    return mapSupplierStoreLinkRow(current);
  }

  // Add store_id and supplier_id to params
  params.push(storeId);
  params.push(supplierId);

  const sql = `
    UPDATE supplier.supplier_store_links
    SET ${setClauses.join(', ')}
    WHERE store_id = $${paramIndex++} AND supplier_id = $${paramIndex}
    RETURNING *
  `;

  const result = await client.query<SupplierStoreLinkRow>(sql, params);

  if (result.rows.length === 0) {
    throw new Error(`Supplier link not found: ${supplierId} for store ${storeId}`);
  }

  return mapSupplierStoreLinkRow(result.rows[0]!);
}

/**
 * Soft-delete (unlink) a supplier from a store
 * Sets status to 'inactive'
 */
export async function unlinkSupplier(
  client: PoolClient,
  storeId: string,
  supplierId: string
): Promise<SupplierStoreLink> {
  const result = await client.query<SupplierStoreLinkRow>(
    `UPDATE supplier.supplier_store_links
     SET status = 'inactive'
     WHERE store_id = $1 AND supplier_id = $2
     RETURNING *`,
    [storeId, supplierId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Supplier link not found: ${supplierId} for store ${storeId}`);
  }

  return mapSupplierStoreLinkRow(result.rows[0]!);
}

/**
 * Reactivate a previously unlinked supplier
 */
export async function reactivateSupplierLink(
  client: PoolClient,
  storeId: string,
  supplierId: string
): Promise<SupplierStoreLink> {
  const result = await client.query<SupplierStoreLinkRow>(
    `UPDATE supplier.supplier_store_links
     SET status = 'active'
     WHERE store_id = $1 AND supplier_id = $2
     RETURNING *`,
    [storeId, supplierId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Supplier link not found: ${supplierId} for store ${storeId}`);
  }

  return mapSupplierStoreLinkRow(result.rows[0]!);
}

/**
 * Get supplier link by ID (link record ID)
 */
export async function getSupplierLinkById(
  linkId: string
): Promise<SupplierStoreLink | null> {
  const row = await queryOne<SupplierStoreLinkRow>(
    `SELECT * FROM supplier.supplier_store_links WHERE id = $1`,
    [linkId]
  );
  return row ? mapSupplierStoreLinkRow(row) : null;
}

// =============================================================================
// SUPPLIER REQUEST QUERIES
// =============================================================================

/**
 * Create a supplier request
 */
export async function createSupplierRequest(
  client: PoolClient,
  input: {
    storeId: string;
    requestedGstin?: string;
    requestedName?: string;
    requestedPhone?: string;
    requestedEmail?: string;
    createdByUserId?: string;
  }
): Promise<SupplierRequest> {
  const {
    storeId,
    requestedGstin,
    requestedName,
    requestedPhone,
    requestedEmail,
    createdByUserId,
  } = input;

  const result = await client.query<SupplierRequestRow>(
    `INSERT INTO supplier.supplier_requests (
      store_id, requested_gstin, requested_name, requested_phone,
      requested_email, created_by_user_id
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [storeId, requestedGstin, requestedName, requestedPhone, requestedEmail, createdByUserId]
  );

  return mapSupplierRequestRow(result.rows[0]!);
}

/**
 * Get pending supplier requests for a store
 */
export async function getSupplierRequests(
  storeId: string,
  options: { status?: string } = {}
): Promise<SupplierRequest[]> {
  const { status } = options;

  let sql = `SELECT * FROM supplier.supplier_requests WHERE store_id = $1`;
  const params: unknown[] = [storeId];

  if (status) {
    sql += ` AND status = $2`;
    params.push(status);
  }

  sql += ` ORDER BY created_at DESC`;

  const rows = await query<SupplierRequestRow>(sql, params);
  return rows.map(mapSupplierRequestRow);
}

// =============================================================================
// EVENT OUTBOX
// =============================================================================

/**
 * Write to event outbox within a transaction
 */
export async function writeToOutbox(
  client: PoolClient,
  event: {
    eventType: string;
    aggregateType: string;
    aggregateId: string;
    payload: Record<string, unknown>;
  }
): Promise<void> {
  await client.query(
    `INSERT INTO supplier.event_outbox (event_type, aggregate_type, aggregate_id, payload)
     VALUES ($1, $2, $3, $4::jsonb)`,
    [event.eventType, event.aggregateType, event.aggregateId, JSON.stringify(event.payload)]
  );
}

// Re-export getClient for transaction support
export { getClient };
