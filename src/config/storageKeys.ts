// GL-CRIT-0093: Centralized storage keys to prevent typos and enable easy refactoring
// All AsyncStorage and SecureStore keys should be defined here

/**
 * AsyncStorage keys for app state
 */
export const STORAGE_KEYS = {
  // Cart state
  CART_STATE: 'supermandi_cart_state',
  CART_ITEMS: 'supermandi_cart_items',

  // User preferences
  THEME: 'supermandi_theme',
  LANGUAGE: 'supermandi_language',

  // Device info
  DEVICE_ID: 'supermandi_device_id',
  DEVICE_FINGERPRINT: 'supermandi_device_fingerprint',

  // Offline data
  OFFLINE_SALES_QUEUE: 'supermandi_offline_queue',
  PENDING_SYNC: 'supermandi_pending_sync',
  LAST_SYNC_TIME: 'supermandi_last_sync',

  // Cache
  PRODUCTS_CACHE: 'supermandi_products_cache',
  CATEGORIES_CACHE: 'supermandi_categories_cache',
  STOCK_CACHE: 'supermandi_stock_cache',

  // Scanner settings
  SCANNER_MODE: 'supermandi_scanner_mode',
  CAMERA_ENABLED: 'supermandi_camera_enabled',

  // Receipt settings
  LAST_BILL_NUMBER: 'supermandi_last_bill_number',
  RECEIPT_PREFIX: 'supermandi_receipt_prefix',

  // Onboarding
  ONBOARDING_COMPLETE: 'supermandi_onboarding_complete',
  TUTORIAL_SHOWN: 'supermandi_tutorial_shown',
} as const;

/**
 * SecureStore keys for sensitive data
 */
export const SECURE_KEYS = {
  // Authentication
  ACCESS_TOKEN: 'supermandi_access_token',
  REFRESH_TOKEN: 'supermandi_refresh_token',
  AUTH_STATE: 'supermandi_auth_state',

  // Store info
  STORE_ID: 'supermandi_store_id',
  STORE_CODE: 'supermandi_store_code',

  // API keys (should not be stored but if needed)
  API_KEY: 'supermandi_api_key',
} as const;

/**
 * Keys that should be cleared on logout
 */
export const LOGOUT_CLEAR_KEYS = [
  STORAGE_KEYS.CART_STATE,
  STORAGE_KEYS.CART_ITEMS,
  STORAGE_KEYS.PENDING_SYNC,
  SECURE_KEYS.ACCESS_TOKEN,
  SECURE_KEYS.REFRESH_TOKEN,
  SECURE_KEYS.AUTH_STATE,
] as const;

/**
 * Keys that should be preserved on logout (device-specific)
 */
export const PRESERVE_ON_LOGOUT = [
  STORAGE_KEYS.DEVICE_ID,
  STORAGE_KEYS.DEVICE_FINGERPRINT,
  STORAGE_KEYS.THEME,
  STORAGE_KEYS.LANGUAGE,
  STORAGE_KEYS.ONBOARDING_COMPLETE,
] as const;

export type StorageKey = typeof STORAGE_KEYS[keyof typeof STORAGE_KEYS];
export type SecureKey = typeof SECURE_KEYS[keyof typeof SECURE_KEYS];
