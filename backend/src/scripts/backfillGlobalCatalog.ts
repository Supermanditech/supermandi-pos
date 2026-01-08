import "dotenv/config";
import { randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { getPool } from "../db/client";
import { normalizeScan } from "../services/scanNormalization";

type BackfillOptions = {
  dryRun: boolean;
  batchSize: number;
  reportPath: string;
};

type IdentifierCandidate = {
  codeType: string;
  normalizedValue: string;
};

type ConflictEntry = {
  code_type: string;
  normalized_value: string;
  barcode: string;
  barcode_type: string | null;
  existing: {
    global_product_id: string;
    product_name: string;
  };
  incoming: {
    global_product_id: string;
    product_name: string;
  };
};

type ReportSummary = {
  global_products_inserted: number;
  identifiers_processed: number;
  identifiers_inserted: number;
  store_products_changed: number;
  store_inventory_inserted: number;
  conflicts: number;
};

const DEFAULT_BATCH_SIZE = 500;

function formatTimestamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}_${pad(
    date.getHours()
  )}${pad(date.getMinutes())}${pad(date.getSeconds())}`;
}

function parseArgs(argv: string[]): BackfillOptions {
  const options: BackfillOptions = {
    dryRun: false,
    batchSize: DEFAULT_BATCH_SIZE,
    reportPath: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg.startsWith("--batch-size=")) {
      const value = Number(arg.split("=")[1]);
      if (Number.isFinite(value)) {
        options.batchSize = Math.round(value);
      }
      continue;
    }
    if (arg === "--batch-size") {
      const value = Number(argv[index + 1]);
      if (Number.isFinite(value)) {
        options.batchSize = Math.round(value);
      }
      index += 1;
      continue;
    }
    if (arg.startsWith("--report-path=")) {
      options.reportPath = arg.split("=")[1] || "";
      continue;
    }
    if (arg === "--report-path") {
      options.reportPath = argv[index + 1] || "";
      index += 1;
    }
  }

  if (!Number.isFinite(options.batchSize) || options.batchSize <= 0) {
    options.batchSize = DEFAULT_BATCH_SIZE;
  }
  if (options.batchSize > 5000) {
    options.batchSize = 5000;
  }
  if (!options.reportPath) {
    options.reportPath = path.join(
      process.cwd(),
      "reports",
      `backfill_global_catalog_${formatTimestamp()}.json`
    );
  }

  return options;
}

function printHelp(): void {
  console.log("Usage: ts-node src/scripts/backfillGlobalCatalog.ts [options]");
  console.log("");
  console.log("Options:");
  console.log("  --dry-run            Log actions without writing to the database.");
  console.log("  --batch-size <n>     Batch size for processing (default 500).");
  console.log("  --report-path <path> Output path for the JSON report.");
}

function deriveIdentifierCandidates(barcode: string): IdentifierCandidate[] {
  const trimmed = barcode.trim();
  if (!trimmed) return [];

  const digitsOnly = trimmed.replace(/\D/g, "");
  const isNumeric = digitsOnly.length === trimmed.length;

  if (isNumeric && digitsOnly.length >= 8 && digitsOnly.length <= 14) {
    const candidates: IdentifierCandidate[] = [];
    const addCandidate = (formatHint: string) => {
      const normalized = normalizeScan(formatHint, trimmed);
      if (!normalized) return;
      candidates.push({
        codeType: normalized.code_type,
        normalizedValue: normalized.normalized_value
      });
    };

    if (digitsOnly.length === 12) {
      addCandidate("upc");
      addCandidate("ean");
    } else {
      addCandidate("ean");
    }

    if (candidates.length > 0) {
      const seen = new Set<string>();
      return candidates.filter((item) => {
        const key = `${item.codeType}::${item.normalizedValue}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }
  }

  const normalized = normalizeScan("code128", trimmed);
  if (!normalized) return [];

  return [
    {
      codeType: normalized.code_type,
      normalizedValue: normalized.normalized_value
    }
  ];
}

function shouldReportNameConflict(existingName: string, incomingName: string): boolean {
  const left = existingName.trim().toLowerCase();
  const right = incomingName.trim().toLowerCase();
  if (!left || !right) {
    return left !== right;
  }
  return left !== right;
}

async function assertSchemaReady(client: { query: (text: string, params?: any[]) => Promise<{ rows: any[] }> }) {
  const check = await client.query(
    `
    SELECT
      to_regclass('public.global_products') AS global_products,
      to_regclass('public.global_product_identifiers') AS global_product_identifiers,
      to_regclass('public.store_products') AS store_products,
      to_regclass('public.store_inventory') AS store_inventory
    `
  );
  const row = check.rows[0] ?? {};
  const missing: string[] = [];
  if (!row.global_products) missing.push("global_products");
  if (!row.global_product_identifiers) missing.push("global_product_identifiers");
  if (!row.store_products) missing.push("store_products");
  if (!row.store_inventory) missing.push("store_inventory");

  if (missing.length > 0) {
    throw new Error(`Missing tables: ${missing.join(", ")}. Run the additive migration first.`);
  }
}

async function insertGlobalProducts(client: {
  query: (text: string, params?: any[]) => Promise<{ rowCount?: number; rows: any[] }>;
}, dryRun: boolean): Promise<number> {
  if (dryRun) {
    const res = await client.query(
      `
      SELECT COUNT(*)::int AS count
      FROM products p
      LEFT JOIN global_products gp ON gp.id = p.id
      WHERE gp.id IS NULL
      `
    );
    return Number(res.rows[0]?.count ?? 0);
  }

  const res = await client.query(
    `
    INSERT INTO global_products (id, global_name, category, created_at, updated_at)
    SELECT p.id, p.name, p.category, COALESCE(p.created_at, NOW()), COALESCE(p.updated_at, NOW())
    FROM products p
    ON CONFLICT (id) DO NOTHING
    `
  );

  return Number(res.rowCount ?? 0);
}

async function backfillIdentifiers(params: {
  client: { query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }> };
  batchSize: number;
  dryRun: boolean;
}): Promise<{ processed: number; inserted: number; conflicts: ConflictEntry[] }> {
  const { client, batchSize, dryRun } = params;
  const conflicts: ConflictEntry[] = [];
  const conflictKeys = new Set<string>();
  const cache = new Map<string, { globalProductId: string; productName: string }>();
  let processed = 0;
  let inserted = 0;
  let lastBarcode = "";

  const totalRes = await client.query(`SELECT COUNT(*)::int AS count FROM barcodes`);
  const total = Number(totalRes.rows[0]?.count ?? 0);

  while (true) {
    const res = await client.query(
      `
      SELECT b.barcode,
             b.barcode_type,
             v.product_id,
             COALESCE(p.name, v.name) AS product_name
      FROM barcodes b
      JOIN variants v ON v.id = b.variant_id
      LEFT JOIN products p ON p.id = v.product_id
      WHERE b.barcode > $1
      ORDER BY b.barcode ASC
      LIMIT $2
      `,
      [lastBarcode, batchSize]
    );

    if (!res.rows.length) break;

    for (const row of res.rows) {
      const barcode = String(row.barcode ?? "").trim();
      if (!barcode) continue;
      lastBarcode = barcode;

      const productId = row.product_id ? String(row.product_id) : "";
      const productName = row.product_name ? String(row.product_name) : "";
      if (!productId) continue;

      const candidates = deriveIdentifierCandidates(barcode);
      for (const candidate of candidates) {
        const key = `${candidate.codeType}::${candidate.normalizedValue}`;
        const incoming = { globalProductId: productId, productName };

        const cached = cache.get(key);
        if (cached) {
          if (
            cached.globalProductId !== incoming.globalProductId &&
            shouldReportNameConflict(cached.productName, incoming.productName)
          ) {
            const conflictKey = `${key}::${cached.globalProductId}::${incoming.globalProductId}`;
            if (!conflictKeys.has(conflictKey)) {
              conflictKeys.add(conflictKey);
              conflicts.push({
                code_type: candidate.codeType,
                normalized_value: candidate.normalizedValue,
                barcode,
                barcode_type: row.barcode_type ? String(row.barcode_type) : null,
                existing: {
                  global_product_id: cached.globalProductId,
                  product_name: cached.productName
                },
                incoming: {
                  global_product_id: incoming.globalProductId,
                  product_name: incoming.productName
                }
              });
            }
          }
          continue;
        }

        const existingRes = await client.query(
          `
          SELECT gpi.global_product_id, gp.global_name
          FROM global_product_identifiers gpi
          JOIN global_products gp ON gp.id = gpi.global_product_id
          WHERE gpi.code_type = $1 AND gpi.normalized_value = $2
          LIMIT 1
          `,
          [candidate.codeType, candidate.normalizedValue]
        );

        const existingRow = existingRes.rows[0];
        if (existingRow?.global_product_id) {
          const existing = {
            globalProductId: String(existingRow.global_product_id),
            productName: String(existingRow.global_name ?? "")
          };
          cache.set(key, existing);
          if (
            existing.globalProductId !== incoming.globalProductId &&
            shouldReportNameConflict(existing.productName, incoming.productName)
          ) {
            const conflictKey = `${key}::${existing.globalProductId}::${incoming.globalProductId}`;
            if (!conflictKeys.has(conflictKey)) {
              conflictKeys.add(conflictKey);
              conflicts.push({
                code_type: candidate.codeType,
                normalized_value: candidate.normalizedValue,
                barcode,
                barcode_type: row.barcode_type ? String(row.barcode_type) : null,
                existing: {
                  global_product_id: existing.globalProductId,
                  product_name: existing.productName
                },
                incoming: {
                  global_product_id: incoming.globalProductId,
                  product_name: incoming.productName
                }
              });
            }
          }
          continue;
        }

        if (!dryRun) {
          await client.query(
            `
            INSERT INTO global_product_identifiers (
              id,
              global_product_id,
              code_type,
              raw_value,
              normalized_value
            )
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (code_type, normalized_value) DO NOTHING
            `,
            [randomUUID(), incoming.globalProductId, candidate.codeType, barcode, candidate.normalizedValue]
          );
        }

        cache.set(key, incoming);
        inserted += 1;
      }

      processed += 1;
    }

    console.log(
      `[Identifiers] ${processed}/${total} barcodes processed, ${inserted} identifiers inserted, ${conflicts.length} conflicts`
    );
  }

  return { processed, inserted, conflicts };
}

async function seedStoreProductsFromRetailerVariants(params: {
  client: { query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }> };
  batchSize: number;
  dryRun: boolean;
}): Promise<number> {
  const { client, batchSize, dryRun } = params;
  let lastStore = "";
  let lastProduct = "";
  let changed = 0;

  while (true) {
    const res = await client.query(
      `
      SELECT rv.store_id,
             v.product_id,
             COALESCE(p.name, v.name) AS product_name,
             rv.selling_price_minor
      FROM retailer_variants rv
      JOIN variants v ON v.id = rv.variant_id
      LEFT JOIN products p ON p.id = v.product_id
      WHERE (rv.store_id > $1) OR (rv.store_id = $1 AND v.product_id > $2)
      ORDER BY rv.store_id, v.product_id
      LIMIT $3
      `,
      [lastStore, lastProduct, batchSize]
    );

    if (!res.rows.length) break;

    const values: Array<string | number | null> = [];
    const rows: string[] = [];
    let paramIndex = 1;

    for (const row of res.rows) {
      const storeId = row.store_id ? String(row.store_id) : "";
      const productId = row.product_id ? String(row.product_id) : "";
      if (!storeId || !productId) continue;
      lastStore = storeId;
      lastProduct = productId;

      const displayName = row.product_name ? String(row.product_name) : null;
      const sellPriceMinor =
        typeof row.selling_price_minor === "number" ? Math.round(row.selling_price_minor) : null;

      values.push(randomUUID(), storeId, productId, displayName, sellPriceMinor);
      rows.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
      paramIndex += 5;
    }

    if (rows.length === 0) continue;

    if (dryRun) {
      changed += rows.length;
      continue;
    }

    const result = await client.query(
      `
      INSERT INTO store_products (
        id,
        store_id,
        global_product_id,
        store_display_name,
        sell_price_minor
      )
      VALUES ${rows.join(", ")}
      ON CONFLICT (store_id, global_product_id) DO UPDATE
      SET sell_price_minor = CASE
            WHEN store_products.sell_price_minor IS NULL AND EXCLUDED.sell_price_minor IS NOT NULL
            THEN EXCLUDED.sell_price_minor
            ELSE store_products.sell_price_minor
          END,
          store_display_name = CASE
            WHEN (store_products.store_display_name IS NULL OR store_products.store_display_name = '')
              AND EXCLUDED.store_display_name IS NOT NULL
            THEN EXCLUDED.store_display_name
            ELSE store_products.store_display_name
          END,
          updated_at = NOW()
      WHERE (store_products.sell_price_minor IS NULL AND EXCLUDED.sell_price_minor IS NOT NULL)
         OR ((store_products.store_display_name IS NULL OR store_products.store_display_name = '')
             AND EXCLUDED.store_display_name IS NOT NULL)
      `,
      values
    );

    changed += Number(result.rowCount ?? 0);
  }

  return changed;
}

async function seedStoreProductsFromBulkInventory(params: {
  client: { query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }> };
  batchSize: number;
  dryRun: boolean;
}): Promise<number> {
  const { client, batchSize, dryRun } = params;
  let lastStore = "";
  let lastProduct = "";
  let changed = 0;

  while (true) {
    const res = await client.query(
      `
      SELECT bi.store_id,
             bi.product_id,
             COALESCE(p.name, v.name) AS product_name
      FROM bulk_inventory bi
      LEFT JOIN products p ON p.id = bi.product_id
      LEFT JOIN variants v ON v.product_id = bi.product_id
      WHERE (bi.store_id > $1) OR (bi.store_id = $1 AND bi.product_id > $2)
      ORDER BY bi.store_id, bi.product_id
      LIMIT $3
      `,
      [lastStore, lastProduct, batchSize]
    );

    if (!res.rows.length) break;

    const values: Array<string | number | null> = [];
    const rows: string[] = [];
    let paramIndex = 1;

    for (const row of res.rows) {
      const storeId = row.store_id ? String(row.store_id) : "";
      const productId = row.product_id ? String(row.product_id) : "";
      if (!storeId || !productId) continue;
      lastStore = storeId;
      lastProduct = productId;

      const displayName = row.product_name ? String(row.product_name) : null;

      values.push(randomUUID(), storeId, productId, displayName, null);
      rows.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2}, $${paramIndex + 3}, $${paramIndex + 4})`);
      paramIndex += 5;
    }

    if (rows.length === 0) continue;

    if (dryRun) {
      changed += rows.length;
      continue;
    }

    const result = await client.query(
      `
      INSERT INTO store_products (
        id,
        store_id,
        global_product_id,
        store_display_name,
        sell_price_minor
      )
      VALUES ${rows.join(", ")}
      ON CONFLICT (store_id, global_product_id) DO UPDATE
      SET store_display_name = CASE
            WHEN (store_products.store_display_name IS NULL OR store_products.store_display_name = '')
              AND EXCLUDED.store_display_name IS NOT NULL
            THEN EXCLUDED.store_display_name
            ELSE store_products.store_display_name
          END,
          updated_at = NOW()
      WHERE (store_products.store_display_name IS NULL OR store_products.store_display_name = '')
        AND EXCLUDED.store_display_name IS NOT NULL
      `,
      values
    );

    changed += Number(result.rowCount ?? 0);
  }

  return changed;
}

async function seedStoreInventory(params: {
  client: { query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }> };
  batchSize: number;
  dryRun: boolean;
}): Promise<number> {
  const { client, batchSize, dryRun } = params;
  let lastStore = "";
  let lastProduct = "";
  let inserted = 0;

  while (true) {
    const res = await client.query(
      `
      SELECT store_id, product_id
      FROM (
        SELECT rv.store_id, v.product_id
        FROM retailer_variants rv
        JOIN variants v ON v.id = rv.variant_id
        UNION
        SELECT store_id, product_id FROM bulk_inventory
      ) pairs
      WHERE (store_id > $1) OR (store_id = $1 AND product_id > $2)
      ORDER BY store_id, product_id
      LIMIT $3
      `,
      [lastStore, lastProduct, batchSize]
    );

    if (!res.rows.length) break;

    const values: Array<string | number> = [];
    const rows: string[] = [];
    let paramIndex = 1;

    for (const row of res.rows) {
      const storeId = row.store_id ? String(row.store_id) : "";
      const productId = row.product_id ? String(row.product_id) : "";
      if (!storeId || !productId) continue;
      lastStore = storeId;
      lastProduct = productId;

      values.push(storeId, productId, 0);
      rows.push(`($${paramIndex}, $${paramIndex + 1}, $${paramIndex + 2})`);
      paramIndex += 3;
    }

    if (rows.length === 0) continue;

    if (dryRun) {
      inserted += rows.length;
      continue;
    }

    const result = await client.query(
      `
      INSERT INTO store_inventory (
        store_id,
        global_product_id,
        available_qty
      )
      VALUES ${rows.join(", ")}
      ON CONFLICT (store_id, global_product_id) DO NOTHING
      `,
      values
    );

    inserted += Number(result.rowCount ?? 0);
  }

  return inserted;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const pool = getPool();
  if (!pool) {
    console.error("DATABASE_URL is required to run the backfill.");
    process.exit(1);
  }

  const client = await pool.connect();
  const startedAt = new Date().toISOString();
  const report: {
    started_at: string;
    finished_at?: string;
    dry_run: boolean;
    batch_size: number;
    summary?: ReportSummary;
    conflicts: ConflictEntry[];
  } = {
    started_at: startedAt,
    dry_run: options.dryRun,
    batch_size: options.batchSize,
    conflicts: []
  };

  try {
    await assertSchemaReady(client);

    console.log(`[Backfill] Starting (dryRun=${options.dryRun}) batchSize=${options.batchSize}`);

    const globalInserted = await insertGlobalProducts(client, options.dryRun);
    console.log(`[GlobalProducts] ${options.dryRun ? "Missing" : "Inserted"} ${globalInserted}`);

    const identifierSummary = await backfillIdentifiers({
      client,
      batchSize: options.batchSize,
      dryRun: options.dryRun
    });
    report.conflicts = identifierSummary.conflicts;

    const storeProductsChanged = await seedStoreProductsFromRetailerVariants({
      client,
      batchSize: options.batchSize,
      dryRun: options.dryRun
    });
    console.log(`[StoreProducts] retailer_variants changed ${storeProductsChanged}`);

    const bulkStoreProductsChanged = await seedStoreProductsFromBulkInventory({
      client,
      batchSize: options.batchSize,
      dryRun: options.dryRun
    });
    console.log(`[StoreProducts] bulk_inventory changed ${bulkStoreProductsChanged}`);

    const storeInventoryInserted = await seedStoreInventory({
      client,
      batchSize: options.batchSize,
      dryRun: options.dryRun
    });
    console.log(`[StoreInventory] ${options.dryRun ? "Missing" : "Inserted"} ${storeInventoryInserted}`);

    report.summary = {
      global_products_inserted: globalInserted,
      identifiers_processed: identifierSummary.processed,
      identifiers_inserted: identifierSummary.inserted,
      store_products_changed: storeProductsChanged + bulkStoreProductsChanged,
      store_inventory_inserted: storeInventoryInserted,
      conflicts: report.conflicts.length
    };
    report.finished_at = new Date().toISOString();

    fs.mkdirSync(path.dirname(options.reportPath), { recursive: true });
    fs.writeFileSync(options.reportPath, JSON.stringify(report, null, 2), "utf8");
    console.log(`[Backfill] Report written to ${options.reportPath}`);
  } finally {
    client.release();
  }
}

main().catch((error) => {
  console.error("[Backfill] Failed", error);
  process.exit(1);
});
