// Store Service - V3.0.9 compliant
// Business logic for store operations

import { ApiError } from '@supermandi/common';
import {
  Store,
  CreateStoreInput,
  UpdateStoreInput,
  getAllStores,
  getStoreById,
  getStoreByCode,
  createStore,
  updateStore,
  deleteStore,
} from '../db/queries';

// =============================================================================
// STORE OPERATIONS
// =============================================================================

export async function listStores(): Promise<Store[]> {
  return getAllStores();
}

export async function getStore(id: string): Promise<Store> {
  const store = await getStoreById(id);
  if (!store) {
    throw ApiError.notFound(`Store not found: ${id}`);
  }
  return store;
}

export async function findStoreByCode(code: string): Promise<Store | null> {
  return getStoreByCode(code);
}

export async function createNewStore(input: CreateStoreInput): Promise<Store> {
  // Check for duplicate code
  const existing = await getStoreByCode(input.code);
  if (existing) {
    throw ApiError.conflict('STORE_CODE_EXISTS', `Store with code '${input.code}' already exists`);
  }

  // Validate required fields
  if (!input.name || input.name.trim().length === 0) {
    throw ApiError.badRequest('Store name is required');
  }
  if (!input.code || input.code.trim().length === 0) {
    throw ApiError.badRequest('Store code is required');
  }

  return createStore(input);
}

export async function updateExistingStore(
  id: string,
  input: UpdateStoreInput
): Promise<Store> {
  // Verify store exists
  const existing = await getStoreById(id);
  if (!existing) {
    throw ApiError.notFound(`Store not found: ${id}`);
  }

  // Validate name if provided
  if (input.name !== undefined && input.name.trim().length === 0) {
    throw ApiError.badRequest('Store name cannot be empty');
  }

  const updated = await updateStore(id, input);
  if (!updated) {
    throw ApiError.notFound(`Store not found: ${id}`);
  }
  return updated;
}

export async function removeStore(id: string): Promise<void> {
  const deleted = await deleteStore(id);
  if (!deleted) {
    throw ApiError.notFound(`Store not found: ${id}`);
  }
}

// Re-export types
export type { Store, CreateStoreInput, UpdateStoreInput };
