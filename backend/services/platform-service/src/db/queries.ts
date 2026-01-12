// Platform Service Database Queries - V3.0.9 compliant
// CRUD operations for platform.stores and platform.feature_flags

import { query, BaseEntity } from '@supermandi/common';

// =============================================================================
// STORE TYPES
// =============================================================================

export interface Store extends BaseEntity {
  name: string;
  code: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  timezone: string;
  currency: string;
  status: 'active' | 'inactive' | 'suspended';
}

export interface CreateStoreInput {
  name: string;
  code: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  timezone?: string;
  currency?: string;
}

export interface UpdateStoreInput {
  name?: string;
  phone?: string;
  email?: string;
  addressLine1?: string;
  addressLine2?: string;
  city?: string;
  state?: string;
  pincode?: string;
  timezone?: string;
  currency?: string;
  status?: 'active' | 'inactive' | 'suspended';
}

// =============================================================================
// FEATURE FLAG TYPES
// =============================================================================

export type FlagScopeType = 'global' | 'store' | 'supplier';

export interface FeatureFlag extends BaseEntity {
  flagKey: string;
  scopeType: FlagScopeType;
  scopeId?: string;
  enabled: boolean;
  payloadJson?: Record<string, unknown>;
  description?: string;
}

export interface CreateFlagInput {
  flagKey: string;
  scopeType: FlagScopeType;
  scopeId?: string;
  enabled: boolean;
  payloadJson?: Record<string, unknown>;
  description?: string;
}

export interface UpdateFlagInput {
  enabled?: boolean;
  payloadJson?: Record<string, unknown>;
  description?: string;
}

// =============================================================================
// STORE QUERIES
// =============================================================================

export async function getAllStores(): Promise<Store[]> {
  return query<Store>(
    `SELECT
      id, name, code, phone, email,
      address_line1 as "addressLine1",
      address_line2 as "addressLine2",
      city, state, pincode, timezone, currency, status,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM platform.stores
    ORDER BY name`
  );
}

export async function getStoreById(id: string): Promise<Store | null> {
  const rows = await query<Store>(
    `SELECT
      id, name, code, phone, email,
      address_line1 as "addressLine1",
      address_line2 as "addressLine2",
      city, state, pincode, timezone, currency, status,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM platform.stores
    WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function getStoreByCode(code: string): Promise<Store | null> {
  const rows = await query<Store>(
    `SELECT
      id, name, code, phone, email,
      address_line1 as "addressLine1",
      address_line2 as "addressLine2",
      city, state, pincode, timezone, currency, status,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM platform.stores
    WHERE code = $1`,
    [code]
  );
  return rows[0] || null;
}

export async function createStore(input: CreateStoreInput): Promise<Store> {
  const rows = await query<Store>(
    `INSERT INTO platform.stores (
      name, code, phone, email,
      address_line1, address_line2,
      city, state, pincode, timezone, currency
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    RETURNING
      id, name, code, phone, email,
      address_line1 as "addressLine1",
      address_line2 as "addressLine2",
      city, state, pincode, timezone, currency, status,
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      input.name,
      input.code,
      input.phone || null,
      input.email || null,
      input.addressLine1 || null,
      input.addressLine2 || null,
      input.city || null,
      input.state || null,
      input.pincode || null,
      input.timezone || 'Asia/Kolkata',
      input.currency || 'INR',
    ]
  );
  return rows[0];
}

export async function updateStore(id: string, input: UpdateStoreInput): Promise<Store | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.name !== undefined) {
    fields.push(`name = $${paramIndex++}`);
    values.push(input.name);
  }
  if (input.phone !== undefined) {
    fields.push(`phone = $${paramIndex++}`);
    values.push(input.phone);
  }
  if (input.email !== undefined) {
    fields.push(`email = $${paramIndex++}`);
    values.push(input.email);
  }
  if (input.addressLine1 !== undefined) {
    fields.push(`address_line1 = $${paramIndex++}`);
    values.push(input.addressLine1);
  }
  if (input.addressLine2 !== undefined) {
    fields.push(`address_line2 = $${paramIndex++}`);
    values.push(input.addressLine2);
  }
  if (input.city !== undefined) {
    fields.push(`city = $${paramIndex++}`);
    values.push(input.city);
  }
  if (input.state !== undefined) {
    fields.push(`state = $${paramIndex++}`);
    values.push(input.state);
  }
  if (input.pincode !== undefined) {
    fields.push(`pincode = $${paramIndex++}`);
    values.push(input.pincode);
  }
  if (input.timezone !== undefined) {
    fields.push(`timezone = $${paramIndex++}`);
    values.push(input.timezone);
  }
  if (input.currency !== undefined) {
    fields.push(`currency = $${paramIndex++}`);
    values.push(input.currency);
  }
  if (input.status !== undefined) {
    fields.push(`status = $${paramIndex++}`);
    values.push(input.status);
  }

  if (fields.length === 0) return getStoreById(id);

  values.push(id);

  const rows = await query<Store>(
    `UPDATE platform.stores
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING
      id, name, code, phone, email,
      address_line1 as "addressLine1",
      address_line2 as "addressLine2",
      city, state, pincode, timezone, currency, status,
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    values
  );
  return rows[0] || null;
}

export async function deleteStore(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM platform.stores WHERE id = $1 RETURNING id',
    [id]
  );
  return rows.length > 0;
}

// =============================================================================
// FEATURE FLAG QUERIES
// =============================================================================

export async function getAllFlags(): Promise<FeatureFlag[]> {
  return query<FeatureFlag>(
    `SELECT
      id, flag_key as "flagKey",
      scope_type as "scopeType",
      scope_id as "scopeId",
      enabled,
      payload_json as "payloadJson",
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM platform.feature_flags
    ORDER BY flag_key, scope_type`
  );
}

export async function getFlagById(id: string): Promise<FeatureFlag | null> {
  const rows = await query<FeatureFlag>(
    `SELECT
      id, flag_key as "flagKey",
      scope_type as "scopeType",
      scope_id as "scopeId",
      enabled,
      payload_json as "payloadJson",
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM platform.feature_flags
    WHERE id = $1`,
    [id]
  );
  return rows[0] || null;
}

export async function getGlobalFlag(flagKey: string): Promise<FeatureFlag | null> {
  const rows = await query<FeatureFlag>(
    `SELECT
      id, flag_key as "flagKey",
      scope_type as "scopeType",
      scope_id as "scopeId",
      enabled,
      payload_json as "payloadJson",
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM platform.feature_flags
    WHERE flag_key = $1 AND scope_type = 'global'`,
    [flagKey]
  );
  return rows[0] || null;
}

export async function getScopedFlag(
  flagKey: string,
  scopeType: 'store' | 'supplier',
  scopeId: string
): Promise<FeatureFlag | null> {
  const rows = await query<FeatureFlag>(
    `SELECT
      id, flag_key as "flagKey",
      scope_type as "scopeType",
      scope_id as "scopeId",
      enabled,
      payload_json as "payloadJson",
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM platform.feature_flags
    WHERE flag_key = $1 AND scope_type = $2 AND scope_id = $3`,
    [flagKey, scopeType, scopeId]
  );
  return rows[0] || null;
}

export async function getFlagsForScope(
  scopeType: FlagScopeType,
  scopeId?: string
): Promise<FeatureFlag[]> {
  if (scopeType === 'global') {
    return query<FeatureFlag>(
      `SELECT
        id, flag_key as "flagKey",
        scope_type as "scopeType",
        scope_id as "scopeId",
        enabled,
        payload_json as "payloadJson",
        description,
        created_at as "createdAt",
        updated_at as "updatedAt"
      FROM platform.feature_flags
      WHERE scope_type = 'global'
      ORDER BY flag_key`
    );
  }

  return query<FeatureFlag>(
    `SELECT
      id, flag_key as "flagKey",
      scope_type as "scopeType",
      scope_id as "scopeId",
      enabled,
      payload_json as "payloadJson",
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"
    FROM platform.feature_flags
    WHERE scope_type = $1 AND scope_id = $2
    ORDER BY flag_key`,
    [scopeType, scopeId]
  );
}

export async function createFlag(input: CreateFlagInput): Promise<FeatureFlag> {
  const rows = await query<FeatureFlag>(
    `INSERT INTO platform.feature_flags (
      flag_key, scope_type, scope_id, enabled, payload_json, description
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING
      id, flag_key as "flagKey",
      scope_type as "scopeType",
      scope_id as "scopeId",
      enabled,
      payload_json as "payloadJson",
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      input.flagKey,
      input.scopeType,
      input.scopeId || null,
      input.enabled,
      input.payloadJson ? JSON.stringify(input.payloadJson) : null,
      input.description || null,
    ]
  );
  return rows[0];
}

export async function updateFlag(id: string, input: UpdateFlagInput): Promise<FeatureFlag | null> {
  const fields: string[] = [];
  const values: unknown[] = [];
  let paramIndex = 1;

  if (input.enabled !== undefined) {
    fields.push(`enabled = $${paramIndex++}`);
    values.push(input.enabled);
  }
  if (input.payloadJson !== undefined) {
    fields.push(`payload_json = $${paramIndex++}`);
    values.push(JSON.stringify(input.payloadJson));
  }
  if (input.description !== undefined) {
    fields.push(`description = $${paramIndex++}`);
    values.push(input.description);
  }

  if (fields.length === 0) return getFlagById(id);

  values.push(id);

  const rows = await query<FeatureFlag>(
    `UPDATE platform.feature_flags
    SET ${fields.join(', ')}
    WHERE id = $${paramIndex}
    RETURNING
      id, flag_key as "flagKey",
      scope_type as "scopeType",
      scope_id as "scopeId",
      enabled,
      payload_json as "payloadJson",
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    values
  );
  return rows[0] || null;
}

export async function upsertFlag(input: CreateFlagInput): Promise<FeatureFlag> {
  // For global flags
  if (input.scopeType === 'global') {
    const rows = await query<FeatureFlag>(
      `INSERT INTO platform.feature_flags (
        flag_key, scope_type, enabled, payload_json, description
      ) VALUES ($1, 'global', $2, $3, $4)
      ON CONFLICT (flag_key) WHERE scope_type = 'global'
      DO UPDATE SET
        enabled = EXCLUDED.enabled,
        payload_json = EXCLUDED.payload_json,
        description = EXCLUDED.description
      RETURNING
        id, flag_key as "flagKey",
        scope_type as "scopeType",
        scope_id as "scopeId",
        enabled,
        payload_json as "payloadJson",
        description,
        created_at as "createdAt",
        updated_at as "updatedAt"`,
      [
        input.flagKey,
        input.enabled,
        input.payloadJson ? JSON.stringify(input.payloadJson) : null,
        input.description || null,
      ]
    );
    return rows[0];
  }

  // For scoped flags
  const rows = await query<FeatureFlag>(
    `INSERT INTO platform.feature_flags (
      flag_key, scope_type, scope_id, enabled, payload_json, description
    ) VALUES ($1, $2, $3, $4, $5, $6)
    ON CONFLICT (flag_key, scope_type, scope_id) WHERE scope_type != 'global'
    DO UPDATE SET
      enabled = EXCLUDED.enabled,
      payload_json = EXCLUDED.payload_json,
      description = EXCLUDED.description
    RETURNING
      id, flag_key as "flagKey",
      scope_type as "scopeType",
      scope_id as "scopeId",
      enabled,
      payload_json as "payloadJson",
      description,
      created_at as "createdAt",
      updated_at as "updatedAt"`,
    [
      input.flagKey,
      input.scopeType,
      input.scopeId,
      input.enabled,
      input.payloadJson ? JSON.stringify(input.payloadJson) : null,
      input.description || null,
    ]
  );
  return rows[0];
}

export async function deleteFlag(id: string): Promise<boolean> {
  const rows = await query<{ id: string }>(
    'DELETE FROM platform.feature_flags WHERE id = $1 RETURNING id',
    [id]
  );
  return rows.length > 0;
}
