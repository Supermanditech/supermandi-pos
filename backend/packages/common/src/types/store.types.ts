// Store/Platform types - V3.0.9 compliant

import { UUID, BaseEntity } from './base';

// Store status
export type StoreStatus = 'active' | 'inactive' | 'suspended';

// Store entity (platform.stores)
export interface Store extends BaseEntity {
  name: string;
  code?: string; // Used for order numbers: PO-{code}-{YY}-{seq}
  phone?: string;
  email?: string;
  addressLine1?: string;
  city?: string;
  state?: string;
  pincode?: string;
  timezone: string;
  status: StoreStatus;
}

// Feature flag scope types
export type FlagScopeType = 'global' | 'store' | 'supplier';

// Feature flag entity (platform.feature_flags)
export interface FeatureFlag extends BaseEntity {
  flagKey: string;
  scopeType: FlagScopeType;
  scopeId?: UUID; // NULL for global flags
  enabled: boolean;
  payloadJson?: Record<string, unknown>;
  updatedByUserId?: UUID;
}

// Common feature flag keys
export const FeatureFlagKeys = {
  REORDER_ENABLED: 'reorder_enabled',
  BUY_TAB_ENABLED: 'buy_tab_enabled',
  GRN_ENABLED: 'grn_enabled',
  PUSH_NOTIFICATIONS: 'push_notifications',
} as const;

export type FeatureFlagKey = (typeof FeatureFlagKeys)[keyof typeof FeatureFlagKeys];

// Store with resolved feature flags (for API responses)
export interface StoreWithFlags extends Store {
  features: Record<string, boolean>;
}
