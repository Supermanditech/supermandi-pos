// Settings Service - V3.0.9 compliant
// Manages store-level reorder configuration

import { getClient, ApiError } from '@supermandi/common';
import {
  getStoreSettings,
  upsertStoreSettings,
  type StoreReorderSettings,
} from '../db/queries';

// =============================================================================
// TYPES
// =============================================================================

export interface UpdateSettingsInput {
  reorderEnabled?: boolean;
  requireApproval?: boolean;
  notifyOnLowStock?: boolean;
}

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Get store reorder settings.
 * Returns null if settings don't exist (store hasn't configured reorder yet).
 */
export async function getSettings(
  storeId: string
): Promise<StoreReorderSettings | null> {
  return getStoreSettings(storeId);
}

/**
 * Get store reorder settings, creating defaults if they don't exist.
 */
export async function getOrCreateSettings(
  storeId: string
): Promise<StoreReorderSettings> {
  const existing = await getStoreSettings(storeId);
  if (existing) {
    return existing;
  }

  // Create with defaults
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const settings = await upsertStoreSettings(client, storeId, {
      reorderEnabled: true,
      requireApproval: true,
      notifyOnLowStock: true,
    });
    await client.query('COMMIT');
    return settings;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update store reorder settings.
 * Creates settings with defaults if they don't exist.
 */
export async function updateSettings(
  storeId: string,
  input: UpdateSettingsInput
): Promise<StoreReorderSettings> {
  // Validate input
  if (Object.keys(input).length === 0) {
    throw new ApiError(400, 'INVALID_INPUT', 'At least one setting must be provided');
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const settings = await upsertStoreSettings(client, storeId, input);
    await client.query('COMMIT');
    return settings;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
