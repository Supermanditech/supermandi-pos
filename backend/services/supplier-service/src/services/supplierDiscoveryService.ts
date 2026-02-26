// Supplier Discovery/Request Service - extracted from supplierService.ts
// Keeps search and supplier request workflows isolated from link lifecycle mutations.

import { ApiError, ERROR_CODES } from '@supermandi/common';
import {
  searchSuppliers,
  getSupplierByGstin,
  getLinkedSuppliers,
  createSupplierRequest,
  getSupplierRequests,
  writeToOutbox,
  getClient,
} from '../db/queries';
import type {
  Supplier,
  SupplierRequest,
  SupplierWithLink,
} from '../db/queries';
import { validateGstin } from '../utils/gstin';

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

export interface RequestSupplierInput {
  storeId: string;
  gstin?: string;
  name?: string;
  phone?: string;
  email?: string;
  createdByUserId?: string;
}

/**
 * Search suppliers globally by GSTIN or business name
 * - GSTIN search: exact match
 * - Name search: trigram similarity + ILIKE
 */
export async function searchSuppliersService(
  input: SearchSuppliersInput
): Promise<SearchSuppliersResult> {
  const { query, limit = 20, offset = 0, status = 'active' } = input;

  if (!query || query.trim().length < 2) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'Search query must be at least 2 characters'
    );
  }

  const trimmedQuery = query.trim();
  if (trimmedQuery.length === 15) {
    const gstinValidation = validateGstin(trimmedQuery);
    if (!gstinValidation.isValid) {
      // Not a valid GSTIN — fall through to name/keyword search
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

/**
 * Request a new supplier to be added to the system
 * Creates a supplier_request record for admin review
 */
export async function requestNewSupplier(
  input: RequestSupplierInput
): Promise<SupplierRequest> {
  const { storeId, gstin, name, phone, email, createdByUserId } = input;

  if (!storeId) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'storeId is required'
    );
  }

  if (!gstin && !name && !phone) {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'At least one of gstin, name, or phone must be provided'
    );
  }

  if (gstin) {
    const gstinValidation = validateGstin(gstin);
    if (!gstinValidation.isValid) {
      throw new ApiError(
        400,
        ERROR_CODES.VALIDATION_ERROR,
        `Invalid GSTIN: ${gstinValidation.errors.join(', ')}`
      );
    }

    const existingSupplier = await getSupplierByGstin(gstin);
    if (existingSupplier) {
      throw new ApiError(
        409,
        'SUPPLIER_EXISTS',
        `Supplier with GSTIN ${gstin} already exists: ${existingSupplier.businessName}. Use link endpoint instead.`
      );
    }
  }

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
