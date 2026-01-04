import * as SQLite from "expo-sqlite";

const db = SQLite.openDatabaseSync("supermandi_offline.db");

async function run(sql: string, params: (string | number | null)[] = []): Promise<void> {
  await db.runAsync(sql, ...params);
}

async function all<T = any>(sql: string, params: (string | number | null)[] = []): Promise<T[]> {
  return (await db.getAllAsync(sql, ...params)) as T[];
}

export async function initOfflineDb(): Promise<void> {
  await run(
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

  await run(
    `
    CREATE TABLE IF NOT EXISTS offline_prices (
      barcode TEXT PRIMARY KEY,
      price_minor INTEGER NULL,
      updated_at TEXT NOT NULL
    );
    `
  );

  await run(
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
      server_sale_id TEXT NULL
    );
    `
  );

  await run(
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

  await run(
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

  await run(
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

  // Best-effort migrations for existing local DBs.
  const alterStatements = [
    `ALTER TABLE offline_sales ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE offline_sales ADD COLUMN synced_at TEXT NULL`,
    `ALTER TABLE offline_sales ADD COLUMN server_sale_id TEXT NULL`,
    `ALTER TABLE offline_sales ADD COLUMN item_discount_minor INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE offline_sales ADD COLUMN cart_discount_minor INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE offline_sales ADD COLUMN cart_discount_type TEXT NULL`,
    `ALTER TABLE offline_sales ADD COLUMN cart_discount_value REAL NULL`,
    `ALTER TABLE offline_collections ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''`,
    `ALTER TABLE offline_collections ADD COLUMN synced_at TEXT NULL`,
    `ALTER TABLE offline_collections ADD COLUMN server_collection_id TEXT NULL`,
    `ALTER TABLE offline_products ADD COLUMN category TEXT NULL`,
    `ALTER TABLE offline_sale_items ADD COLUMN line_subtotal_minor INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE offline_sale_items ADD COLUMN discount_type TEXT NULL`,
    `ALTER TABLE offline_sale_items ADD COLUMN discount_value REAL NULL`,
    `ALTER TABLE offline_sale_items ADD COLUMN discount_minor INTEGER NOT NULL DEFAULT 0`,
    `ALTER TABLE offline_sale_items ADD COLUMN line_total_minor INTEGER NOT NULL DEFAULT 0`
  ];

  for (const stmt of alterStatements) {
    try {
      await run(stmt);
    } catch {
      // Ignore if column already exists.
    }
  }
}

export const offlineDb = {
  run,
  all
};
