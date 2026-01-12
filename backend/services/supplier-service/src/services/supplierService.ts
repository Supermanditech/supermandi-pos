// Supplier Service Business Logic - V3.0.9 compliant
// Handles supplier search, linking, and request operations

import { ApiError, ERROR_CODES } from '@supermandi/common';
import {
  searchSuppliers,
  getSupplierById,
  getSupplierByGstin,
  getLinkedSuppliers,
  getSupplierLink,
  createSupplierLink,
  updateSupplierLink,
  unlinkSupplier,
  reactivateSupplierLink,
  createSupplierRequest,
  getSupplierRequests,
  writeToOutbox,
  getClient,
} from '../db/queries.js';
import type {
  Supplier,
  SupplierStoreLink,
  SupplierRequest,
  SupplierWithLink,
} from '../db/queries.js';
import { validateGstin, isValidGstin } from '../utils/gstin.js';

// =============================================================================
// TYPES
// =============================================================================

export interface SearchSuppliersInput {
  query: string;
  limit?: number;
  offset?: number;
  status?: string;
}

export interface SearchSuppliersResult {
  suppliers: Supplier[];
  total: number;
  limit: number;
  offset: number;
}

export interface LinkSupplierInput {
  supplierId: string;
  storeId: string;
  creditDays?: number;
  minOrderValue?: number;
  expectedDeliveryDays?: number;
  priority?: number;
  isPreferred?: boolean;
  linkedByUserId?: string;
}

export interface RequestSupplierInput {
  storeId: string;
  gstin?: string;
  name?: string;
  phone?: string;
  email?: string;
  createdByUserId?: string;
}

// =============================================================================
// SEARCH SUPPLIERS
// =============================================================================

/**
 * Search suppliers globally by GSTIN or business name
 * - GSTIN search: exact match
 * - Name search: trigram similarity + ILIKE
 */
export async function searchSuppliersService(
  input: SearchSuppliersInput
): Promise<SearchSuppliersResult> {
  const { query, limit = 20, offset = 0, status = 'active' } = input;

  // Validate search query
  if (!query || query.trim().length < 2) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Search query must be at least 2 characters'
    );
  }

  // If searching by GSTIN, validate format
  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 15) {
    const gstinValidation = validateGstin(trimmedQuery);
    if (!gstinValidation.isValid) {
      // Still allow search even if GSTIN is invalid - might be partial
      console.log(`GSTIN validation failed for search: ${gstinValidation.errors.join(', ')}`);
    }
  }

  const result = await searchSuppliers(trimmedQuery, { limit, offset, status });

  return {
    suppliers: result.suppliers,
    total: result.total,
    limit,
    offset,
  };
}

// =============================================================================
// GET LINKED SUPPLIERS
// =============================================================================

/**
 * Get all suppliers linked to a store
 */
export async function getStoreSuppliers(
  storeId: string,
  options: {
    status?: string;
    preferredOnly?: boolean;
  } = {}
): Promise<SupplierWithLink[]> {
  if (!storeId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'storeId is required'
    );
  }

  return getLinkedSuppliers(storeId, options);
}

// =============================================================================
// LINK SUPPLIER TO STORE
// =============================================================================

/**
 * Link an existing supplier to a store
 * Creates a new supplier_store_link record
 */
export async function linkSupplierToStore(
  input: LinkSupplierInput
): Promise<{ supplier: Supplier; link: SupplierStoreLink }> {
  const { supplierId, storeId } = input;

  // Validate required fields
  if (!supplierId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'supplierId is required'
    );
  }
  if (!storeId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'storeId is required'
    );
  }

  // Check if supplier exists
  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier not found: ${supplierId}`
    );
  }

  // Check if supplier is active
  if (supplier.status !== 'active') {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Cannot link inactive supplier: ${supplier.businessName}`
    );
  }

  // Check if link already exists
  const existingLink = await getSupplierLink(storeId, supplierId);
  if (existingLink) {
    if (existingLink.status === 'active') {
      throw new ApiError(
        409,
        'LINK_EXISTS',
        `Supplier ${supplier.businessName} is already linked to this store`
      );
    }
    // If link exists but inactive, we should reactivate it
    // For now, throw error - DEV-023 will handle this
    throw new ApiError(
      409,
      'LINK_EXISTS',
      `Supplier ${supplier.businessName} was previously linked. Use update to reactivate.`
    );
  }

  // Create the link in a transaction
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Create the link
    const link = await createSupplierLink(client, {
      supplierId: input.supplierId,
      storeId: input.storeId,
      creditDays: input.creditDays,
      minOrderValue: input.minOrderValue,
      expectedDeliveryDays: input.expectedDeliveryDays,
      priority: input.priority,
      isPreferred: input.isPreferred,
      linkedByUserId: input.linkedByUserId,
    });

    // Write to outbox
    await writeToOutbox(client, {
      eventType: 'supplier.linked.v1',
      aggregateType: 'SupplierStoreLink',
      aggregateId: link.id,
      payload: {
        linkId: link.id,
        supplierId: supplier.id,
        storeId: input.storeId,
        supplierName: supplier.businessName,
        supplierGstin: supplier.gstin,
        creditDays: link.creditDays,
        minOrderValue: link.minOrderValue,
        expectedDeliveryDays: link.expectedDeliveryDays,
        isPreferred: link.isPreferred,
        linkedByUserId: input.linkedByUserId,
        linkedAt: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');

    return { supplier, link };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// REQUEST NEW SUPPLIER
// =============================================================================

/**
 * Request a new supplier to be added to the system
 * Creates a supplier_request record for admin review
 */
export async function requestNewSupplier(
  input: RequestSupplierInput
): Promise<SupplierRequest> {
  const { storeId, gstin, name, phone, email, createdByUserId } = input;

  // Validate required fields
  if (!storeId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'storeId is required'
    );
  }

  // At least one identifier must be provided
  if (!gstin && !name && !phone) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'At least one of gstin, name, or phone must be provided'
    );
  }

  // Validate GSTIN if provided
  if (gstin) {
    const gstinValidation = validateGstin(gstin);
    if (!gstinValidation.isValid) {
      throw new ApiError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Invalid GSTIN: ${gstinValidation.errors.join(', ')}`
      );
    }

    // Check if supplier with this GSTIN already exists
    const existingSupplier = await getSupplierByGstin(gstin);
    if (existingSupplier) {
      throw new ApiError(
        409,
        'SUPPLIER_EXISTS',
        `Supplier with GSTIN ${gstin} already exists: ${existingSupplier.businessName}. Use link endpoint instead.`
      );
    }
  }

  // Create the request in a transaction
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const request = await createSupplierRequest(client, {
      storeId,
      requestedGstin: gstin,
      requestedName: name,
      requestedPhone: phone,
      requestedEmail: email,
      createdByUserId,
    });

    // Write to outbox
    await writeToOutbox(client, {
      eventType: 'supplier.request.created.v1',
      aggregateType: 'SupplierRequest',
      aggregateId: request.id,
      payload: {
        requestId: request.id,
        storeId,
        requestedGstin: gstin,
        requestedName: name,
        requestedPhone: phone,
        requestedEmail: email,
        createdByUserId,
        createdAt: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');

    return request;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// GET SUPPLIER REQUESTS
// =============================================================================

/**
 * Get supplier requests for a store
 */
export async function getStoreSupplierRequests(
  storeId: string,
  options: { status?: string } = {}
): Promise<SupplierRequest[]> {
  if (!storeId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'storeId is required'
    );
  }

  return getSupplierRequests(storeId, options);
}

// =============================================================================
// GSTIN VALIDATION ENDPOINT SUPPORT
// =============================================================================

/**
 * Validate GSTIN and return structured result
 */
export function validateGstinService(gstin: string): {
  isValid: boolean;
  errors: string[];
  stateCode?: string;
  stateName?: string;
  pan?: string;
} {
  if (!gstin) {
    return {
      isValid: false,
      errors: ['GSTIN is required'],
    };
  }

  return validateGstin(gstin);
}

// =============================================================================
// UPDATE SUPPLIER LINK
// =============================================================================

export interface UpdateSupplierLinkInput {
  storeId: string;
  supplierId: string;
  creditDays?: number;
  minOrderValue?: number;
  expectedDeliveryDays?: number;
  priority?: number;
  isPreferred?: boolean;
  updatedByUserId?: string;
}

/**
 * Update a supplier-store link settings
 * Can update: priority, is_preferred, credit_days, min_order_value, expected_delivery_days
 */
export async function updateSupplierLinkService(
  input: UpdateSupplierLinkInput
): Promise<{ supplier: Supplier; link: SupplierStoreLink }> {
  const { storeId, supplierId } = input;

  // Validate required fields
  if (!storeId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'storeId is required'
    );
  }
  if (!supplierId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'supplierId is required'
    );
  }

  // Check if supplier exists
  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier not found: ${supplierId}`
    );
  }

  // Check if link exists
  const existingLink = await getSupplierLink(storeId, supplierId);
  if (!existingLink) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier ${supplier.businessName} is not linked to this store`
    );
  }

  // Update the link in a transaction
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const link = await updateSupplierLink(client, storeId, supplierId, {
      creditDays: input.creditDays,
      minOrderValue: input.minOrderValue,
      expectedDeliveryDays: input.expectedDeliveryDays,
      priority: input.priority,
      isPreferred: input.isPreferred,
    });

    // Write to outbox
    await writeToOutbox(client, {
      eventType: 'supplier.link.updated.v1',
      aggregateType: 'SupplierStoreLink',
      aggregateId: link.id,
      payload: {
        linkId: link.id,
        supplierId: supplier.id,
        storeId,
        supplierName: supplier.businessName,
        previousValues: {
          creditDays: existingLink.creditDays,
          minOrderValue: existingLink.minOrderValue,
          expectedDeliveryDays: existingLink.expectedDeliveryDays,
          priority: existingLink.priority,
          isPreferred: existingLink.isPreferred,
        },
        newValues: {
          creditDays: link.creditDays,
          minOrderValue: link.minOrderValue,
          expectedDeliveryDays: link.expectedDeliveryDays,
          priority: link.priority,
          isPreferred: link.isPreferred,
        },
        updatedByUserId: input.updatedByUserId,
        updatedAt: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');

    return { supplier, link };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// UNLINK SUPPLIER
// =============================================================================

export interface UnlinkSupplierInput {
  storeId: string;
  supplierId: string;
  unlinkedByUserId?: string;
  reason?: string;
}

/**
 * Unlink a supplier from a store (soft delete)
 * Sets the link status to 'inactive'
 */
export async function unlinkSupplierService(
  input: UnlinkSupplierInput
): Promise<{ supplier: Supplier; link: SupplierStoreLink }> {
  const { storeId, supplierId } = input;

  // Validate required fields
  if (!storeId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'storeId is required'
    );
  }
  if (!supplierId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'supplierId is required'
    );
  }

  // Check if supplier exists
  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier not found: ${supplierId}`
    );
  }

  // Check if link exists and is active
  const existingLink = await getSupplierLink(storeId, supplierId);
  if (!existingLink) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier ${supplier.businessName} is not linked to this store`
    );
  }

  if (existingLink.status === 'inactive') {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Supplier ${supplier.businessName} is already unlinked from this store`
    );
  }

  // Unlink in a transaction
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const link = await unlinkSupplier(client, storeId, supplierId);

    // Write to outbox
    await writeToOutbox(client, {
      eventType: 'supplier.unlinked.v1',
      aggregateType: 'SupplierStoreLink',
      aggregateId: link.id,
      payload: {
        linkId: link.id,
        supplierId: supplier.id,
        storeId,
        supplierName: supplier.businessName,
        supplierGstin: supplier.gstin,
        reason: input.reason,
        unlinkedByUserId: input.unlinkedByUserId,
        unlinkedAt: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');

    return { supplier, link };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

// =============================================================================
// REACTIVATE SUPPLIER LINK
// =============================================================================

/**
 * Reactivate a previously unlinked supplier
 */
export async function reactivateSupplierLinkService(
  storeId: string,
  supplierId: string,
  reactivatedByUserId?: string
): Promise<{ supplier: Supplier; link: SupplierStoreLink }> {
  // Validate required fields
  if (!storeId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'storeId is required'
    );
  }
  if (!supplierId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'supplierId is required'
    );
  }

  // Check if supplier exists
  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier not found: ${supplierId}`
    );
  }

  // Check if supplier is active
  if (supplier.status !== 'active') {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Cannot reactivate link to inactive supplier: ${supplier.businessName}`
    );
  }

  // Check if link exists
  const existingLink = await getSupplierLink(storeId, supplierId);
  if (!existingLink) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `No previous link exists for supplier ${supplier.businessName}`
    );
  }

  if (existingLink.status === 'active') {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Supplier ${supplier.businessName} is already linked to this store`
    );
  }

  // Reactivate in a transaction
  const client = await getClient();

  try {
    await client.query('BEGIN');

    const link = await reactivateSupplierLink(client, storeId, supplierId);

    // Write to outbox
    await writeToOutbox(client, {
      eventType: 'supplier.linked.v1',
      aggregateType: 'SupplierStoreLink',
      aggregateId: link.id,
      payload: {
        linkId: link.id,
        supplierId: supplier.id,
        storeId,
        supplierName: supplier.businessName,
        supplierGstin: supplier.gstin,
        creditDays: link.creditDays,
        minOrderValue: link.minOrderValue,
        expectedDeliveryDays: link.expectedDeliveryDays,
        isPreferred: link.isPreferred,
        reactivated: true,
        reactivatedByUserId,
        linkedAt: new Date().toISOString(),
      },
    });

    await client.query('COMMIT');

    return { supplier, link };
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
