// Flag Service - V3.0.9 compliant
// Business logic for feature flag operations with scope resolution

import { ApiError } from '@supermandi/common';
import {
  FeatureFlag,
  FlagScopeType,
  CreateFlagInput,
  UpdateFlagInput,
  getAllFlags,
  getFlagById,
  getGlobalFlag,
  getScopedFlag,
  getFlagsForScope,
  createFlag,
  updateFlag,
  upsertFlag,
  deleteFlag,
} from '../db/queries.js';

// =============================================================================
// RESOLVED FLAG (with scope resolution applied)
// =============================================================================

export interface ResolvedFlag {
  flagKey: string;
  enabled: boolean;
  payload?: Record<string, unknown>;
  resolvedFrom: FlagScopeType; // Which scope the value came from
}

// =============================================================================
// FLAG OPERATIONS
// =============================================================================

export async function listAllFlags(): Promise<FeatureFlag[]> {
  return getAllFlags();
}

export async function getFlag(id: string): Promise<FeatureFlag> {
  const flag = await getFlagById(id);
  if (!flag) {
    throw ApiError.notFound(`Feature flag not found: ${id}`);
  }
  return flag;
}

export async function getFlagsForStore(storeId: string): Promise<ResolvedFlag[]> {
  // Get all global flags and store-specific flags
  const [globalFlags, storeFlags] = await Promise.all([
    getFlagsForScope('global'),
    getFlagsForScope('store', storeId),
  ]);

  // Create a map of store flags for quick lookup
  const storeFlagMap = new Map<string, FeatureFlag>();
  for (const flag of storeFlags) {
    storeFlagMap.set(flag.flagKey, flag);
  }

  // Resolve flags: store-scoped overrides global
  const resolved: ResolvedFlag[] = [];

  // Process all global flags
  for (const globalFlag of globalFlags) {
    const storeOverride = storeFlagMap.get(globalFlag.flagKey);

    if (storeOverride) {
      // Store override exists - use store value
      resolved.push({
        flagKey: storeOverride.flagKey,
        enabled: storeOverride.enabled,
        payload: storeOverride.payloadJson,
        resolvedFrom: 'store',
      });
      // Remove from map so we don't process it again
      storeFlagMap.delete(globalFlag.flagKey);
    } else {
      // No override - use global value
      resolved.push({
        flagKey: globalFlag.flagKey,
        enabled: globalFlag.enabled,
        payload: globalFlag.payloadJson,
        resolvedFrom: 'global',
      });
    }
  }

  // Add any store-only flags (flags that exist only at store level)
  for (const storeFlag of storeFlagMap.values()) {
    resolved.push({
      flagKey: storeFlag.flagKey,
      enabled: storeFlag.enabled,
      payload: storeFlag.payloadJson,
      resolvedFrom: 'store',
    });
  }

  return resolved;
}

export async function getFlagsForSupplier(supplierId: string): Promise<ResolvedFlag[]> {
  // Get all global flags and supplier-specific flags
  const [globalFlags, supplierFlags] = await Promise.all([
    getFlagsForScope('global'),
    getFlagsForScope('supplier', supplierId),
  ]);

  // Create a map of supplier flags for quick lookup
  const supplierFlagMap = new Map<string, FeatureFlag>();
  for (const flag of supplierFlags) {
    supplierFlagMap.set(flag.flagKey, flag);
  }

  // Resolve flags: supplier-scoped overrides global
  const resolved: ResolvedFlag[] = [];

  for (const globalFlag of globalFlags) {
    const supplierOverride = supplierFlagMap.get(globalFlag.flagKey);

    if (supplierOverride) {
      resolved.push({
        flagKey: supplierOverride.flagKey,
        enabled: supplierOverride.enabled,
        payload: supplierOverride.payloadJson,
        resolvedFrom: 'supplier',
      });
      supplierFlagMap.delete(globalFlag.flagKey);
    } else {
      resolved.push({
        flagKey: globalFlag.flagKey,
        enabled: globalFlag.enabled,
        payload: globalFlag.payloadJson,
        resolvedFrom: 'global',
      });
    }
  }

  // Add supplier-only flags
  for (const supplierFlag of supplierFlagMap.values()) {
    resolved.push({
      flagKey: supplierFlag.flagKey,
      enabled: supplierFlag.enabled,
      payload: supplierFlag.payloadJson,
      resolvedFrom: 'supplier',
    });
  }

  return resolved;
}

export async function isFlagEnabled(
  flagKey: string,
  scopeType?: 'store' | 'supplier',
  scopeId?: string
): Promise<boolean> {
  // Check scoped flag first if scope provided
  if (scopeType && scopeId) {
    const scopedFlag = await getScopedFlag(flagKey, scopeType, scopeId);
    if (scopedFlag) {
      return scopedFlag.enabled;
    }
  }

  // Fall back to global flag
  const globalFlag = await getGlobalFlag(flagKey);
  return globalFlag?.enabled ?? false;
}

export async function createNewFlag(input: CreateFlagInput): Promise<FeatureFlag> {
  // Validate flag key
  if (!input.flagKey || input.flagKey.trim().length === 0) {
    throw ApiError.badRequest('Flag key is required');
  }

  // Validate scope
  if (input.scopeType !== 'global' && !input.scopeId) {
    throw ApiError.badRequest('Scope ID is required for non-global flags');
  }
  if (input.scopeType === 'global' && input.scopeId) {
    throw ApiError.badRequest('Scope ID must be null for global flags');
  }

  return createFlag(input);
}

export async function setFlag(input: CreateFlagInput): Promise<FeatureFlag> {
  // Validate flag key
  if (!input.flagKey || input.flagKey.trim().length === 0) {
    throw ApiError.badRequest('Flag key is required');
  }

  // Validate scope
  if (input.scopeType !== 'global' && !input.scopeId) {
    throw ApiError.badRequest('Scope ID is required for non-global flags');
  }
  if (input.scopeType === 'global' && input.scopeId) {
    throw ApiError.badRequest('Scope ID must be null for global flags');
  }

  // Upsert - create or update
  return upsertFlag(input);
}

export async function updateExistingFlag(
  id: string,
  input: UpdateFlagInput
): Promise<FeatureFlag> {
  const existing = await getFlagById(id);
  if (!existing) {
    throw ApiError.notFound(`Feature flag not found: ${id}`);
  }

  const updated = await updateFlag(id, input);
  if (!updated) {
    throw ApiError.notFound(`Feature flag not found: ${id}`);
  }
  return updated;
}

export async function removeFlag(id: string): Promise<void> {
  const deleted = await deleteFlag(id);
  if (!deleted) {
    throw ApiError.notFound(`Feature flag not found: ${id}`);
  }
}

// Re-export types
export type { FeatureFlag, FlagScopeType, CreateFlagInput, UpdateFlagInput };
