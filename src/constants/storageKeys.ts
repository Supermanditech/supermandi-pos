/**
 * Centralized AsyncStorage key constants.
 *
 * Every key used with AsyncStorage across the POS app MUST be defined here.
 * This prevents accidental key collisions and makes auditing trivial.
 *
 * Naming convention: supermandi.<domain>.<purpose>[.version]
 *
 * GCP-STG-0544
 */

// ── Auth & Session ──────────────────────────────────────────────────────────
export const SK_AUTH_TOKEN = "supermandi.auth.token";
export const SK_DEVICE_SESSION = "supermandi.device.session.v1";
export const SK_DEVICE_ID = "supermandi.deviceId.v1";
export const SK_DEVICE_FINGERPRINT = "supermandi.device_fingerprint";
export const SK_DEVICE_INFO = "supermandi.pos.device.info.v1";
export const SK_PIN_CACHE = "supermandi.pin_cache";

// ── Product & Catalog Cache ─────────────────────────────────────────────────
export const SK_PRODUCTS_CACHE = "supermandi.cache.products.v1";
export const SK_PRODUCTS_CHUNK_PREFIX = "supermandi.cache.products.chunk";
export const SK_PRODUCTS_META = "supermandi.cache.products.meta";
export const SK_CATALOG_CACHE = "supermandi.catalog.cache.v1";
export const SK_CATEGORIES_CACHE = "supermandi.catalog.categories.v1";
export const SK_STOCK_CACHE = "supermandi.stock.cache.v1";

// ── Cart & Sales ────────────────────────────────────────────────────────────
export const SK_CART_SELL = "supermandi.cart.sell.v1";
export const SK_PARTIAL_SALE_STATE = "supermandi.partial_sale.v1";
export const SK_PURCHASE_CART = "supermandi.purchase.cart.v1";
export const SK_PURCHASE_DRAFT = "supermandi.purchase.draft.v1";
export const SK_PURCHASE_DRAFT_LEGACY = "supermandi.purchase.draft";

// ── Offline & Queues ────────────────────────────────────────────────────────
export const SK_OFFLINE_QUEUE = "supermandi.offline.queue.v1";
export const SK_OFFLINE_SCAN_QUEUE = "offline_scan_queue";
export const SK_OFFLINE_SEQ_PREFIX = "supermandi.offline.seq";
export const SK_DEADLETTER_QUEUE = "supermandi.deadletter.queue.v1";
export const SK_CLOUD_EVENT_QUEUE = "supermandi.queue.posEvents.v1";

// ── Search & History ────────────────────────────────────────────────────────
export const SK_SEARCH_HISTORY = "supermandi.sell.searchHistory.v1";
export const SK_SEARCH_HISTORY_V2 = "supermandi.sell.searchHistory.v2";

// ── Settings & Preferences ──────────────────────────────────────────────────
export const SK_LANGUAGE = "supermandi.language";
export const SK_POS_MODE = "supermandi.pos.lastMode.v1";
export const SK_TTS_ENABLED = "tts_enabled";
export const SK_TTS_LANGUAGE = "tts_language";
export const SK_BARCODE_PRINT_SETTINGS = "supermandi.barcode.printSettings";
export const SK_AUTO_SYNC_INTERVAL = "supermandi.autoSync.intervalMs";

// ── Health & Diagnostics ────────────────────────────────────────────────────
export const SK_DB_HEALTH = "supermandi.db.health.v1";
export const SK_EVENT_LOGS = "@pos_event_logs";

// ── Dynamic key builders (store-scoped) ─────────────────────────────────────
export const skPaymentPrompted = (storeId: string) =>
  `supermandi.payment_setup_prompted.${storeId}`;
export const skGuide = (storeId: string, version: string) =>
  `supermandi.guide.${storeId}.v${version}`;
export const skPaymentOnce = (transactionId: string, eventType: string) =>
  `supermandi.payment.once.${transactionId}.${eventType}`;
// GCP-STG-0568: Voice hint dismissal key
export const SK_VOICE_HINT_DISMISSED = "supermandi.voice_hint_dismissed";
