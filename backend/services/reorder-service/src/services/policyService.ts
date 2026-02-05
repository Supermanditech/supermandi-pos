// Policy Service - V3.0.9 compliant
// Manages per-product reorder policies with bounds validation

import { getClient, ApiError } from '@supermandi/common';
import {
  getPolicy,
  getPolicyById,
  listPolicies,
  createPolicy,
  updatePolicy,
  deletePolicy,
  type ReorderPolicy,
} from '../db/queries';
import { config } from '../config';

// =============================================================================
// TYPES
// =============================================================================

export interface CreatePolicyInput {
  storeId: string;
  productId: string;
  minStock: number;
  targetStock: number;
  preferredSupplierId?: string | null;
  isEnabled?: boolean;
  createdByUserId?: string | null;
}

export interface UpdatePolicyInput {
  minStock?: number;
  targetStock?: number;
  preferredSupplierId?: string | null;
  isEnabled?: boolean;
}

export interface ListPoliciesOptions {
  limit?: number;
  offset?: number;
  enabledOnly?: boolean;
}

// =============================================================================
// VALIDATION
// =============================================================================

/**
 * Validate policy bounds constraints.
 * Enforces: min_stock >= 0 AND target_stock >= min_stock
 */
function validateBounds(minStock: number, targetStock: number): void {
  if (minStock < 0) {
    throw new ApiError(400, 'INVALID_MIN_STOCK', 'min_stock must be >= 0');
  }

  if (targetStock < minStock) {
    throw new ApiError(
      400,
      'INVALID_TARGET_STOCK',
      'target_stock must be >= min_stock'
    );
  }
}

/**
 * Validate bounds for update, considering existing values.
 */
function validateUpdateBounds(
  existing: ReorderPolicy,
  input: UpdatePolicyInput
): void {
  const minStock = input.minStock ?? existing.minStock;
  const targetStock = input.targetStock ?? existing.targetStock;

  validateBounds(minStock, targetStock);
}

// =============================================================================
// SERVICE FUNCTIONS
// =============================================================================

/**
 * Get a policy by store and product ID.
 */
export async function getPolicyByProduct(
  storeId: string,
  productId: string
): Promise<ReorderPolicy | null> {
  return getPolicy(storeId, productId);
}

/**
 * Get a policy by ID.
 */
export async function getPolicyByIdService(
  policyId: string
): Promise<ReorderPolicy | null> {
  return getPolicyById(policyId);
}

/**
 * List policies for a store.
 */
export async function listStorePolicies(
  storeId: string,
  options: ListPoliciesOptions = {}
): Promise<{ policies: ReorderPolicy[]; total: number }> {
  const { limit = config.reorder.defaultLimit, offset = 0, enabledOnly = false } = options;

  // Enforce max limit
  const effectiveLimit = Math.min(limit, config.reorder.maxLimit);

  return listPolicies(storeId, {
    limit: effectiveLimit,
    offset,
    enabledOnly,
  });
}

/**
 * Create a new policy.
 * Validates bounds constraints before creation.
 */
export async function createPolicyService(
  input: CreatePolicyInput
): Promise<ReorderPolicy> {
  // Validate bounds
  validateBounds(input.minStock, input.targetStock);

  // Check for existing policy
  const existing = await getPolicy(input.storeId, input.productId);
  if (existing) {
    throw new ApiError(
      409,
      'POLICY_EXISTS',
      `Policy already exists for product ${input.productId} in store ${input.storeId}`
    );
  }

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const policy = await createPolicy(client, input);
    await client.query('COMMIT');
    return policy;
  } catch (error) {
    await client.query('ROLLBACK');
    // Check for unique constraint violation (race condition)
    if ((error as { code?: string }).code === '23505') {
      throw new ApiError(
        409,
        'POLICY_EXISTS',
        `Policy already exists for product ${input.productId} in store ${input.storeId}`
      );
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Update an existing policy.
 * Validates bounds constraints considering both new and existing values.
 */
export async function updatePolicyService(
  policyId: string,
  input: UpdatePolicyInput
): Promise<ReorderPolicy> {
  // Validate input
  if (Object.keys(input).length === 0) {
    throw new ApiError(400, 'INVALID_INPUT', 'At least one field must be provided');
  }

  // Get existing policy
  const existing = await getPolicyById(policyId);
  if (!existing) {
    throw new ApiError(404, 'POLICY_NOT_FOUND', `Policy ${policyId} not found`);
  }

  // Validate bounds with combined values
  validateUpdateBounds(existing, input);

  const client = await getClient();
  try {
    await client.query('BEGIN');
    const updated = await updatePolicy(client, policyId, input);
    await client.query('COMMIT');

    if (!updated) {
      throw new ApiError(404, 'POLICY_NOT_FOUND', `Policy ${policyId} not found`);
    }

    return updated;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Delete a policy.
 */
export async function deletePolicyService(policyId: string): Promise<void> {
  const client = await getClient();
  try {
    await client.query('BEGIN');
    const deleted = await deletePolicy(client, policyId);
    await client.query('COMMIT');

    if (!deleted) {
      throw new ApiError(404, 'POLICY_NOT_FOUND', `Policy ${policyId} not found`);
    }
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
