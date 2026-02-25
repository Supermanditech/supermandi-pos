// Supplier Link Lifecycle Service - extracted from supplierService.ts
// Isolates link/update/unlink/reactivate mutation flows to reduce module coupling.

import { ApiError, ERROR_CODES } from '@supermandi/common';
import {
  getSupplierById,
  getSupplierLink,
  createSupplierLink,
  updateSupplierLink,
  unlinkSupplier,
  reactivateSupplierLink,
  writeToOutbox,
  getClient,
} from '../db/queries';
import type {
  Supplier,
  SupplierStoreLink,
} from '../db/queries';

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

export interface UnlinkSupplierInput {
  storeId: string;
  supplierId: string;
  unlinkedByUserId?: string;
  reason?: string;
}

/**
 * Link an existing supplier to a store
 * Creates a new supplier_store_link record
 */
export async function linkSupplierToStore(
  input: LinkSupplierInput
): Promise<{ supplier: Supplier; link: SupplierStoreLink }> {
  const { supplierId, storeId } = input;

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

  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier not found: ${supplierId}`
    );
  }

  if (supplier.status !== 'active') {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Cannot link inactive supplier: ${supplier.businessName}`
    );
  }

  const existingLink = await getSupplierLink(storeId, supplierId);
  if (existingLink) {
    if (existingLink.status === 'active') {
      throw new ApiError(
        409,
        'LINK_EXISTS',
        `Supplier ${supplier.businessName} is already linked to this store`
      );
    }
    throw new ApiError(
      409,
      'LINK_EXISTS',
      `Supplier ${supplier.businessName} was previously linked. Use update to reactivate.`
    );
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');

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

/**
 * Update a supplier-store link settings
 * Can update: priority, is_preferred, credit_days, min_order_value, expected_delivery_days
 */
export async function updateSupplierLinkService(
  input: UpdateSupplierLinkInput
): Promise<{ supplier: Supplier; link: SupplierStoreLink }> {
  const { storeId, supplierId } = input;

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

  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier not found: ${supplierId}`
    );
  }

  const existingLink = await getSupplierLink(storeId, supplierId);
  if (!existingLink) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier ${supplier.businessName} is not linked to this store`
    );
  }

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

/**
 * Unlink a supplier from a store (soft delete)
 * Sets the link status to 'inactive'
 */
export async function unlinkSupplierService(
  input: UnlinkSupplierInput
): Promise<{ supplier: Supplier; link: SupplierStoreLink }> {
  const { storeId, supplierId } = input;

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

  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier not found: ${supplierId}`
    );
  }

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

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const link = await unlinkSupplier(client, storeId, supplierId);

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

/**
 * Reactivate a previously unlinked supplier
 */
export async function reactivateSupplierLinkService(
  storeId: string,
  supplierId: string,
  reactivatedByUserId?: string
): Promise<{ supplier: Supplier; link: SupplierStoreLink }> {
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

  const supplier = await getSupplierById(supplierId);
  if (!supplier) {
    throw new ApiError(
      404,
      ERROR_CODES.NOT_FOUND,
      `Supplier not found: ${supplierId}`
    );
  }

  if (supplier.status !== 'active') {
    throw new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      `Cannot reactivate link to inactive supplier: ${supplier.businessName}`
    );
  }

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

  const client = await getClient();
  try {
    await client.query('BEGIN');

    const link = await reactivateSupplierLink(client, storeId, supplierId);

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
