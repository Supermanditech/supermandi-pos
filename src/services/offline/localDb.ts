// GO-LIVE-106: SQLite Security Assessment
// =========================================
// This database stores OPERATIONAL data only (products, prices, sales transactions).
// It does NOT store:
// - Customer PII (names, addresses, phone numbers)
// - Authentication tokens (stored in SecureStore - see GO-LIVE-105)
// - Payment card data (not stored locally)
//
// SECURITY POSTURE: Medium risk (business data exposure if device compromised)
// - Pricing/sales data could benefit competitors if extracted
// - No regulatory compliance issues (no PII)
//
// FUTURE: For full encryption, migrate to SQLCipher or expo-sqlite-encrypted
// when available. This requires native code changes incompatible with Expo Go.
// Ticket: POST-LAUNCH-001

import * as SQLite from "expo-sqlite";
import { getDeviceStoreId } from "../deviceSession";
import { normalizeStoreScope } from "../storeScope";

type Db = SQLite.SQLiteDatabase;

const schemaReady = new Set<string>();
const schemaInFlight = new Map<string, Promise<void>>();

let currentDb: Db | null = null;
let currentScope: string | null = null;

// Current schema version - increment when adding migrations
const SCHEMA_VERSION = 5;

function buildDbName(scope: string): string {
  return `supermandi_offline_${scope}.db`;
}

function log(message: string, ...args: unknown[]): void {
  console.log(`[DB] ${message}`, ...args);
}

async function runOnDb(db: Db, sql: string, params: (string | number | null)[] = []): Promise<void> {
  await db.runAsync(sql, ...params);
}

async function allOnDb<T = any>(db: Db, sql: string, params: (string | number | null)[] = []): Promise<T[]> {
  return (await db.getAllAsync(sql, ...params)) as T[];
}

// Get current schema version from PRAGMA user_version
async function getSchemaVersion(db: Db): Promise<number> {
  const result = await allOnDb<{ user_version: number }>(db, "PRAGMA user_version");
  return result[0]?.user_version ?? 0;
}

// Set schema version
async function setSchemaVersion(db: Db, version: number): Promise<void> {
  await runOnDb(db, `PRAGMA user_version = ${version}`);
}

// Check if a column exists in a table
async function columnExists(db: Db, table: string, column: string): Promise<boolean> {
  const info = await allOnDb<{ name: string }>(db, `PRAGMA table_info(${table})`);
  return info.some(col => col.name === column);
}

// Self-heal: add missing column if it doesn't exist
async function ensureColumn(
  db: Db,
  table: string,
  column: string,
  definition: string
): Promise<boolean> {
  const exists = await columnExists(db, table, column);
  if (exists) return false;

  log(`Self-heal: adding missing column ${table}.${column}`);
  try {
    await runOnDb(db, `ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    return true;
  } catch (e) {
    log(`Self-heal failed for ${table}.${column}:`, e);
    return false;
  }
}

// Migration definitions - each migration runs once based on version number
type Migration = {
  version: number;
  name: string;
  up: (db: Db) => Promise<void>;
};

const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    up: async (db: Db) => {
      // Create all base tables
      await runOnDb(
        db,
        `
        CREATE TABLE IF NOT EXISTS offline_products (
          barcode TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          category TEXT NULL,
          currency TEXT NOT NULL DEFAULT 'INR',
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        `
      );

      await runOnDb(
        db,
        `
        CREATE TABLE IF NOT EXISTS offline_prices (
          barcode TEXT PRIMARY KEY,
          price_minor INTEGER NULL,
          updated_at TEXT NOT NULL
        );
        `
      );

      await runOnDb(
        db,
        `
        CREATE TABLE IF NOT EXISTS offline_sales (
          id TEXT PRIMARY KEY,
          bill_ref TEXT NOT NULL,
          subtotal_minor INTEGER NOT NULL,
          item_discount_minor INTEGER NOT NULL DEFAULT 0,
          cart_discount_minor INTEGER NOT NULL DEFAULT 0,
          cart_discount_type TEXT NULL,
          cart_discount_value REAL NULL,
          discount_minor INTEGER NOT NULL,
          total_minor INTEGER NOT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT '',
          synced_at TEXT NULL,
          server_sale_id TEXT NULL,
          currency TEXT NOT NULL DEFAULT 'INR'
        );
        `
      );

      await runOnDb(
        db,
        `
        CREATE TABLE IF NOT EXISTS offline_sale_items (
          id TEXT PRIMARY KEY,
          sale_id TEXT NOT NULL,
          barcode TEXT NOT NULL,
          name TEXT NOT NULL,
          price_minor INTEGER NOT NULL,
          quantity INTEGER NOT NULL,
          line_subtotal_minor INTEGER NOT NULL DEFAULT 0,
          discount_type TEXT NULL,
          discount_value REAL NULL,
          discount_minor INTEGER NOT NULL DEFAULT 0,
          line_total_minor INTEGER NOT NULL DEFAULT 0
        );
        `
      );

      await runOnDb(
        db,
        `
        CREATE TABLE IF NOT EXISTS offline_collections (
          id TEXT PRIMARY KEY,
          amount_minor INTEGER NOT NULL,
          mode TEXT NOT NULL,
          reference TEXT NULL,
          status TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL DEFAULT '',
          synced_at TEXT NULL,
          server_collection_id TEXT NULL
        );
        `
      );

      await runOnDb(
        db,
        `
        CREATE TABLE IF NOT EXISTS offline_outbox (
          event_id TEXT PRIMARY KEY,
          event_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          created_at TEXT NOT NULL,
          attempts INTEGER NOT NULL DEFAULT 0,
          synced_at TEXT NULL
        );
        `
      );
    }
  },
  {
    version: 2,
    name: "add_currency_column",
    up: async (db: Db) => {
      // Add currency column to offline_sales if missing (for upgraded installs)
      await ensureColumn(db, "offline_sales", "currency", "TEXT NOT NULL DEFAULT 'INR'");
    }
  },
  {
    version: 3,
    name: "add_product_id_and_stock",
    up: async (db: Db) => {
      await ensureColumn(db, "offline_products", "product_id", "TEXT NULL");
      await ensureColumn(db, "offline_products", "current_stock", "INTEGER NULL");
    }
  },
  {
    version: 4,
    name: "add_outbox_error_tracking",
    up: async (db: Db) => {
      // AUD-081-A FIX: Add error tracking columns to offline_outbox
      // error_flag: marks events that failed permanently (e.g., corrupted_json, permanently_rejected)
      // error_at: timestamp when the error was recorded
      await ensureColumn(db, "offline_outbox", "error_flag", "TEXT NULL");
      await ensureColumn(db, "offline_outbox", "error_at", "TEXT NULL");
    }
  },
  {
    version: 5,
    name: "add_image_url_to_products",
    up: async (db: Db) => {
      // SCALE-E2: Store image_url for offline product display.
      // Allows sell tile to show cached product images in offline mode.
      await ensureColumn(db, "offline_products", "image_url", "TEXT NULL");
    }
  }
];

// Run self-heal checks for critical columns (runs every startup)
async function selfHealSchema(db: Db): Promise<void> {
  log("Running self-heal checks...");

  // Critical columns that must exist for app to function
  const criticalColumns = [
    { table: "offline_sales", column: "currency", definition: "TEXT NOT NULL DEFAULT 'INR'" },
    { table: "offline_sales", column: "updated_at", definition: "TEXT NOT NULL DEFAULT ''" },
    { table: "offline_sales", column: "synced_at", definition: "TEXT NULL" },
    { table: "offline_sales", column: "server_sale_id", definition: "TEXT NULL" },
    { table: "offline_sales", column: "item_discount_minor", definition: "INTEGER NOT NULL DEFAULT 0" },
    { table: "offline_sales", column: "cart_discount_minor", definition: "INTEGER NOT NULL DEFAULT 0" },
    { table: "offline_sales", column: "cart_discount_type", definition: "TEXT NULL" },
    { table: "offline_sales", column: "cart_discount_value", definition: "REAL NULL" },
    { table: "offline_collections", column: "updated_at", definition: "TEXT NOT NULL DEFAULT ''" },
    { table: "offline_collections", column: "synced_at", definition: "TEXT NULL" },
    { table: "offline_collections", column: "server_collection_id", definition: "TEXT NULL" },
    { table: "offline_products", column: "category", definition: "TEXT NULL" },
    { table: "offline_products", column: "product_id", definition: "TEXT NULL" },
    { table: "offline_products", column: "store_product_id", definition: "TEXT NULL" },
    { table: "offline_products", column: "current_stock", definition: "INTEGER NULL" },
    { table: "offline_products", column: "image_url", definition: "TEXT NULL" },
    { table: "offline_sale_items", column: "line_subtotal_minor", definition: "INTEGER NOT NULL DEFAULT 0" },
    { table: "offline_sale_items", column: "discount_type", definition: "TEXT NULL" },
    { table: "offline_sale_items", column: "discount_value", definition: "REAL NULL" },
    { table: "offline_sale_items", column: "discount_minor", definition: "INTEGER NOT NULL DEFAULT 0" },
    { table: "offline_sale_items", column: "line_total_minor", definition: "INTEGER NOT NULL DEFAULT 0" },
    // AUD-081-A FIX: Error tracking for corrupted/permanently rejected events
    { table: "offline_outbox", column: "error_flag", definition: "TEXT NULL" },
    { table: "offline_outbox", column: "error_at", definition: "TEXT NULL" }
  ];

  let healed = 0;
  for (const { table, column, definition } of criticalColumns) {
    const wasHealed = await ensureColumn(db, table, column, definition);
    if (wasHealed) healed++;
  }

  if (healed > 0) {
    log(`Self-heal completed: ${healed} column(s) added`);
  }
}

// Run migrations sequentially
async function runMigrations(db: Db): Promise<void> {
  const currentVersion = await getSchemaVersion(db);
  log(`schemaVersion before: ${currentVersion}`);

  if (currentVersion >= SCHEMA_VERSION) {
    log(`Schema is up to date (v${currentVersion})`);
    // Still run self-heal for safety
    await selfHealSchema(db);
    return;
  }

  // Run pending migrations
  const pendingMigrations = migrations.filter(m => m.version > currentVersion);
  pendingMigrations.sort((a, b) => a.version - b.version);

  for (const migration of pendingMigrations) {
    log(`migration ${migration.version} (${migration.name}) start`);
    try {
      await migration.up(db);
      await setSchemaVersion(db, migration.version);
      log(`migration ${migration.version} (${migration.name}) end`);
    } catch (error) {
      log(`migration ${migration.version} (${migration.name}) FAILED:`, error);
      // Don't throw - continue with self-heal which may fix the issue
      break;
    }
  }

  // Always run self-heal after migrations
  await selfHealSchema(db);

  const finalVersion = await getSchemaVersion(db);
  log(`schemaVersion after: ${finalVersion}`);
}

async function ensureSchema(db: Db, scope: string): Promise<void> {
  if (schemaReady.has(scope)) return;
  const inFlight = schemaInFlight.get(scope);
  if (inFlight) return inFlight;

  const initPromise = (async () => {
    try {
      await runMigrations(db);
      schemaReady.add(scope);
    } catch (error) {
      log("Schema initialization failed:", error);
      throw new Error(`Database initialization failed: ${error}`);
    } finally {
      schemaInFlight.delete(scope);
    }
  })();

  schemaInFlight.set(scope, initPromise);
  await initPromise;
}

async function resolveDb(): Promise<Db> {
  const storeId = await getDeviceStoreId();
  const scope = normalizeStoreScope(storeId);
  if (!currentDb || currentScope !== scope) {
    currentDb = SQLite.openDatabaseSync(buildDbName(scope));
    currentScope = scope;
  }

  await ensureSchema(currentDb, scope);
  return currentDb;
}

export async function initOfflineDb(): Promise<void> {
  await resolveDb();
}

async function run(sql: string, params: (string | number | null)[] = []): Promise<void> {
  const db = await resolveDb();
  await runOnDb(db, sql, params);
}

async function all<T = any>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
  const db = await resolveDb();
  return allOnDb<T>(db, sql, params);
}

export const offlineDb = {
  run,
  all
};
