import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import {
  applyBulkDeductions,
  ensureSaleAvailability,
  ensureStandardVariants,
  ensureSupermandiBarcode,
  normalizeUnit,
  type BaseUnit
} from "../../../services/inventoryService";
import {
  recordSaleInventoryMovements,
  ensureStoreInventoryAvailability,
  InsufficientStockError
} from "../../../services/inventoryLedgerService";

export const posSalesRouter = Router();

type SaleItemInput = {
  productId?: string;
  retailerVariantId?: string;
  retailer_variant_id?: string;
  variantId?: string;
  globalProductId?: string;
  global_product_id?: string;
  quantity?: number;
  priceMinor?: number;
  name?: string;
  barcode?: string;
};

type BillPaymentMode = "UPI" | "CASH" | "DUE" | "UNKNOWN";

function buildBillRef(): string {
  // Use full timestamp + cryptographically secure random bytes to avoid collisions
  const ts = Date.now().toString();
  const randomBytes = require("crypto").randomBytes(3); // 3 bytes = 24 bits
  const rand = randomBytes.readUIntBE(0, 3).toString(36).toUpperCase().padStart(5, '0');
  return `${ts.slice(-8)}${rand}`; // 8-digit timestamp + 5-char random = 13 chars
}

function resolvePaymentMode(status: string | null | undefined): BillPaymentMode {
  const normalized = (status ?? "").toUpperCase();
  if (normalized.includes("UPI")) return "UPI";
  if (normalized.includes("CASH")) return "CASH";
  if (normalized.includes("DUE")) return "DUE";
  return "UNKNOWN";
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function parseVariantSize(variantRaw: string | null | undefined): { baseUnit: BaseUnit; sizeBase: number } | null {
  if (!variantRaw) return null;
  const trimmed = variantRaw.trim().toLowerCase();
  if (!trimmed) return null;
  const match = trimmed.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
  if (!match) return null;
  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const unitInfo = normalizeUnit(match[2]);
  if (!unitInfo) return null;
  const sizeBase = Math.round(amount * unitInfo.multiplier);
  if (sizeBase <= 0) return null;
  return { baseUnit: unitInfo.baseUnit, sizeBase };
}

async function ensureRetailerVariantLink(
  client: PoolClient,
  storeId: string,
  variantId: string
): Promise<void> {
  await client.query(
    `
    INSERT INTO retailer_variants (store_id, variant_id, digitised_by_retailer)
    VALUES ($1, $2, TRUE)
    ON CONFLICT (store_id, variant_id) DO NOTHING
    `,
    [storeId, variantId]
  );
}

async function findVariantForProduct(params: {
  client: PoolClient;
  storeId: string;
  productId: string;
  baseUnit: BaseUnit;
  preferredSizeBase: number | null;
}): Promise<string | null> {
  const { client, storeId, productId, baseUnit, preferredSizeBase } = params;

  if (preferredSizeBase !== null) {
    const preferred = await client.query(
      `
      SELECT id
      FROM variants
      WHERE product_id = $1 AND unit_base = $2 AND size_base = $3
      LIMIT 1
      `,
      [productId, baseUnit, preferredSizeBase]
    );
    if (preferred.rows[0]?.id) {
      const variantId = String(preferred.rows[0].id);
      await ensureRetailerVariantLink(client, storeId, variantId);
      return variantId;
    }
  }

  const standard = await client.query(
    `
    SELECT id
    FROM variants
    WHERE product_id = $1 AND unit_base = $2 AND size_base = 1000
    LIMIT 1
    `,
    [productId, baseUnit]
  );
  if (standard.rows[0]?.id) {
    const variantId = String(standard.rows[0].id);
    await ensureRetailerVariantLink(client, storeId, variantId);
    return variantId;
  }

  const fallback = await client.query(
    `
    SELECT id
    FROM variants
    WHERE product_id = $1 AND unit_base = $2
    ORDER BY size_base ASC, created_at ASC
    LIMIT 1
    `,
    [productId, baseUnit]
  );
  if (fallback.rows[0]?.id) {
    const variantId = String(fallback.rows[0].id);
    await ensureRetailerVariantLink(client, storeId, variantId);
    return variantId;
  }

  return null;
}

async function resolveVariantForGlobalProduct(params: {
  client: PoolClient;
  storeId: string;
  globalProductId: string;
  fallbackName?: string | null;
  currency: string;
}): Promise<string | null> {
  const { client, storeId, globalProductId, fallbackName, currency } = params;
  const productRes = await client.query(
    `
    SELECT gp.global_name, sp.store_display_name, sp.unit, sp.variant
    FROM global_products gp
    LEFT JOIN store_products sp
      ON sp.global_product_id = gp.id AND sp.store_id = $2
    WHERE gp.id = $1
    LIMIT 1
    `,
    [globalProductId, storeId]
  );

  const productRow = productRes.rows[0];
  if (!productRow) return null;

  const globalName = productRow.global_name ? String(productRow.global_name) : "";
  const storeName = productRow.store_display_name ? String(productRow.store_display_name) : null;
  const unitRaw = productRow.unit ? String(productRow.unit) : null;
  const variantRaw = productRow.variant ? String(productRow.variant) : null;
  const productName =
    storeName ||
    globalName ||
    (fallbackName ? fallbackName.trim() : "") ||
    `Item ${globalProductId.slice(-4)}`;

  const linkedRes = await client.query(
    `
    SELECT v.id
    FROM variants v
    JOIN retailer_variants rv
      ON rv.variant_id = v.id AND rv.store_id = $1
    WHERE v.product_id = $2
    ORDER BY v.size_base NULLS LAST, v.created_at ASC
    LIMIT 1
    `,
    [storeId, globalProductId]
  );
  if (linkedRes.rows[0]?.id) {
    return String(linkedRes.rows[0].id);
  }

  const existingVariant = await client.query(
    `
    SELECT v.id
    FROM variants v
    WHERE v.product_id = $1
    ORDER BY v.size_base NULLS LAST, v.created_at ASC
    LIMIT 1
    `,
    [globalProductId]
  );
  if (existingVariant.rows[0]?.id) {
    const variantId = String(existingVariant.rows[0].id);
    await ensureRetailerVariantLink(client, storeId, variantId);
    return variantId;
  }

  await client.query(
    `
    INSERT INTO products (id, name, category, retailer_status, enrichment_status)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO NOTHING
    `,
    [globalProductId, productName, null, "retailer_created", "pending_enrichment"]
  );

  const unitInfo = normalizeUnit(unitRaw);
  const variantSize = parseVariantSize(variantRaw);
  const baseUnit = unitInfo?.baseUnit ?? variantSize?.baseUnit ?? null;
  const preferredSizeBase =
    variantSize && (!baseUnit || variantSize.baseUnit === baseUnit) ? variantSize.sizeBase : null;

  if (baseUnit) {
    await ensureStandardVariants({
      client,
      productId: globalProductId,
      productName,
      currency,
      baseUnit,
      storeId
    });

    const variantId = await findVariantForProduct({
      client,
      storeId,
      productId: globalProductId,
      baseUnit,
      preferredSizeBase
    });
    if (variantId) return variantId;
  }

  const variantId = randomUUID();
  await client.query(
    `
    INSERT INTO variants (id, product_id, name, currency)
    VALUES ($1, $2, $3, $4)
    `,
    [variantId, globalProductId, productName, currency]
  );
  await ensureSupermandiBarcode(client, variantId);
  await ensureRetailerVariantLink(client, storeId, variantId);
  return variantId;
}

async function variantExists(client: PoolClient, variantId: string): Promise<boolean> {
  const res = await client.query(
    `
    SELECT 1
    FROM variants
    WHERE id = $1
    LIMIT 1
    `,
    [variantId]
  );
  return (res.rowCount ?? 0) > 0;
}

async function getStore(storeId: string): Promise<{ id: string; name: string; upi_vpa: string | null; active: boolean } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(`SELECT id, name, upi_vpa, active FROM stores WHERE id = $1`, [storeId]);
  return res.rows[0] ?? null;
}

async function getSale(
  storeId: string,
  saleId: string
): Promise<{ id: string; store_id: string; bill_ref: string; total_minor: number } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `SELECT id, store_id, bill_ref, total_minor FROM sales WHERE id = $1 AND store_id = $2`,
    [saleId, storeId]
  );
  return res.rows[0] ?? null;
}

posSalesRouter.get("/bills", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
  const offsetRaw = typeof req.query.offset === "string" ? Number(req.query.offset) : 0;
  const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;
  const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;

  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    const rows = await pool.query(
      `
      SELECT id, bill_ref, total_minor, status, created_at, currency
      FROM sales
      WHERE store_id = $1 AND status NOT IN ('CREATED', 'PENDING', 'CANCELLED')
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `,
      [storeId, limit, offset]
    );

    const bills = rows.rows.map((row) => ({
      saleId: String(row.id),
      billRef: String(row.bill_ref),
      totalMinor: Number(row.total_minor ?? 0),
      status: String(row.status ?? ""),
      paymentMode: resolvePaymentMode(row.status),
      createdAt: row.created_at ? new Date(row.created_at).toISOString() : new Date().toISOString(),
      currency: row.currency ? String(row.currency) : "INR"
    }));

    return res.json({ bills });
  } catch (error) {
    return res.status(500).json({ error: "failed to load bills" });
  }
});

posSalesRouter.get("/bills/:saleId", requireDeviceToken, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    const saleRes = await pool.query(
      `
      SELECT id, store_id, bill_ref, subtotal_minor, discount_minor, total_minor, status, created_at, currency
      FROM sales
      WHERE id = $1 AND store_id = $2
      `,
      [saleId, storeId]
    );
    const sale = saleRes.rows[0];
    if (!sale) {
      return res.status(404).json({ error: "bill_not_found" });
    }

    const itemRes = await pool.query(
      `
      SELECT
        si.variant_id,
        si.quantity,
        si.price_minor,
        si.line_total_minor,
        COALESCE(si.item_name, v.name) AS item_name,
        COALESCE(si.barcode, b.barcode) AS barcode
      FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      LEFT JOIN variants v ON v.id = si.variant_id
      LEFT JOIN barcodes b ON b.variant_id = si.variant_id AND b.barcode_type = 'supermandi'
      WHERE si.sale_id = $1 AND s.store_id = $2
      ORDER BY si.id ASC
      `,
      [saleId, storeId]
    );

    const bill = {
      saleId: String(sale.id),
      billRef: String(sale.bill_ref),
      status: String(sale.status ?? ""),
      paymentMode: resolvePaymentMode(sale.status),
      currency: sale.currency ? String(sale.currency) : "INR",
      createdAt: sale.created_at ? new Date(sale.created_at).toISOString() : new Date().toISOString(),
      totals: {
        subtotalMinor: Number(sale.subtotal_minor ?? 0),
        discountMinor: Number(sale.discount_minor ?? 0),
        totalMinor: Number(sale.total_minor ?? 0)
      },
      items: itemRes.rows.map((row) => ({
        variantId: String(row.variant_id),
        name: String(row.item_name ?? ""),
        barcode: row.barcode ? String(row.barcode) : null,
        quantity: Number(row.quantity ?? 0),
        priceMinor: Number(row.price_minor ?? 0),
        lineTotalMinor: Number(row.line_total_minor ?? 0)
      }))
    };

    return res.json({ bill });
  } catch (error) {
    return res.status(500).json({ error: "failed to load bill" });
  }
});

async function getPaymentStoreStatus(
  storeId: string,
  paymentId: string
): Promise<{ sale_id: string; store_id: string; active: boolean } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `
      SELECT p.sale_id, s.store_id, st.active
      FROM payments p
      JOIN sales s ON s.id = p.sale_id
      JOIN stores st ON st.id = s.store_id
      WHERE p.id = $1 AND s.store_id = $2
    `,
    [paymentId, storeId]
  );
  return res.rows[0] ?? null;
}

async function getCollectionStoreStatus(
  storeId: string,
  collectionId: string
): Promise<{ store_id: string; active: boolean } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `
      SELECT c.store_id, st.active
      FROM collections c
      JOIN stores st ON st.id = c.store_id
      WHERE c.id = $1 AND c.store_id = $2
    `,
    [collectionId, storeId]
  );
  return res.rows[0] ?? null;
}

posSalesRouter.post("/sales", requireDeviceToken, async (req, res) => {
  const { items, discountMinor, currency, saleId: requestedSaleIdRaw } = req.body as {
    items?: SaleItemInput[];
    discountMinor?: number;
    currency?: string;
    saleId?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items are required" });
  }

  const cleanedItems = items.map((item) => {
    const explicitVariantId =
      asTrimmedString(item.retailerVariantId) ??
      asTrimmedString(item.retailer_variant_id) ??
      asTrimmedString(item.variantId);
    const productId = asTrimmedString(item.productId);
    const globalProductId =
      asTrimmedString(item.globalProductId) ?? asTrimmedString(item.global_product_id);
    const quantity =
      typeof item.quantity === "number" && Number.isFinite(item.quantity)
        ? Math.round(item.quantity)
        : NaN;
    const priceMinor =
      typeof item.priceMinor === "number" && Number.isFinite(item.priceMinor)
        ? Math.round(item.priceMinor)
        : NaN;
    return {
      explicitVariantId,
      productId,
      globalProductId,
      name: asTrimmedString(item.name) ?? undefined,
      barcode: asTrimmedString(item.barcode) ?? undefined,
      quantity,
      priceMinor
    };
  });

  // Validation constants to prevent overflow and abuse
  const MAX_QUANTITY = 100000; // Maximum 100k items per line
  const MAX_PRICE_MINOR = 100000000; // Maximum 1 million INR per item

  const invalidItem = cleanedItems.find(
    (item) =>
      (!item.explicitVariantId && !item.productId && !item.globalProductId) ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      item.quantity > MAX_QUANTITY ||
      !Number.isFinite(item.priceMinor) ||
      item.priceMinor <= 0 ||
      item.priceMinor > MAX_PRICE_MINOR
  );

  if (invalidItem) {
    return res.status(400).json({
      error: "items are invalid",
      message: "Item quantity must be between 1 and 100,000. Price must be between 1 and 1,000,000 INR."
    });
  }

  const discount = Math.max(0, Math.round(discountMinor ?? 0));
  const subtotal = cleanedItems.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
  const total = Math.max(0, subtotal - discount);
  const saleCurrency = typeof currency === "string" && currency.trim() ? currency.trim() : "INR";
  const requestedSaleId = asTrimmedString(requestedSaleIdRaw);

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }
  if (requestedSaleId) {
    const existing = await pool.query(
      `
      SELECT id, bill_ref, subtotal_minor, discount_minor, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      LIMIT 1
      `,
      [requestedSaleId, storeId]
    );
    const row = existing.rows[0];
    if (row) {
      return res.json({
        saleId: String(row.id),
        billRef: String(row.bill_ref),
        totals: {
          subtotalMinor: Number(row.subtotal_minor ?? 0),
          discountMinor: Number(row.discount_minor ?? 0),
          totalMinor: Number(row.total_minor ?? 0)
        }
      });
    }
  }
  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  const saleId = requestedSaleId ?? randomUUID();
  let billRef = buildBillRef();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // Set SERIALIZABLE isolation to prevent race conditions in inventory deduction
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    const resolvedItems: Array<{
      variantId: string;
      quantity: number;
      priceMinor: number;
      name?: string;
      barcode?: string;
      globalProductId?: string;
    }> = [];

    for (const item of cleanedItems) {
      let variantId: string | null = null;
      if (item.explicitVariantId) {
        variantId = item.explicitVariantId;
      } else if (item.globalProductId) {
        variantId = await resolveVariantForGlobalProduct({
          client,
          storeId,
          globalProductId: item.globalProductId,
          fallbackName: item.name ?? null,
          currency: saleCurrency
        });
      } else if (item.productId) {
        if (await variantExists(client, item.productId)) {
          variantId = item.productId;
        } else {
          variantId = await resolveVariantForGlobalProduct({
            client,
            storeId,
            globalProductId: item.productId,
            fallbackName: item.name ?? null,
            currency: saleCurrency
          });
        }
      }

      if (!variantId) {
        throw new Error("product_not_found");
      }

      resolvedItems.push({
        variantId,
        quantity: item.quantity,
        priceMinor: item.priceMinor,
        name: item.name,
        barcode: item.barcode,
        globalProductId: item.globalProductId ?? undefined
      });
    }

    await ensureStoreInventoryAvailability({
      client,
      storeId,
      items: resolvedItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        globalProductId: item.globalProductId ?? undefined,
        name: item.name ?? null
      }))
    });

    await ensureSaleAvailability({
      client,
      storeId,
      items: resolvedItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity }))
    });

    const variantRes = await client.query(
      `
      SELECT v.id, v.name, b.barcode AS supermandi_barcode
      FROM variants v
      LEFT JOIN barcodes b
        ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
      WHERE v.id = ANY($1::text[])
      `,
      [resolvedItems.map((item) => item.variantId)]
    );

    const variantMap = new Map<string, { name: string; barcode: string | null }>();
    for (const row of variantRes.rows) {
      variantMap.set(String(row.id), {
        name: String(row.name ?? ""),
        barcode: row.supermandi_barcode ? String(row.supermandi_barcode) : null
      });
    }

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const inserted = await client.query(
          `
          INSERT INTO sales (id, store_id, device_id, bill_ref, subtotal_minor, discount_minor, total_minor, status, currency)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
          RETURNING id
          `,
          [saleId, storeId, deviceId, billRef, subtotal, discount, total, "PENDING", saleCurrency]
        );
        if ((inserted.rowCount ?? 0) > 0) {
          break;
        }
        const existing = await client.query(
          `
          SELECT id, bill_ref, subtotal_minor, discount_minor, total_minor
          FROM sales
          WHERE id = $1 AND store_id = $2
          LIMIT 1
          `,
          [saleId, storeId]
        );
        const row = existing.rows[0];
        if (row) {
          await client.query("COMMIT");
          return res.json({
            saleId: String(row.id),
            billRef: String(row.bill_ref),
            totals: {
              subtotalMinor: Number(row.subtotal_minor ?? 0),
              discountMinor: Number(row.discount_minor ?? 0),
              totalMinor: Number(row.total_minor ?? 0)
            }
          });
        }
        throw new Error("sale_id_conflict");
      } catch (error) {
        billRef = buildBillRef();
        if (attempt === 2) {
          throw error;
        }
      }
    }

    for (const item of resolvedItems) {
      const fallback = variantMap.get(item.variantId);
      const itemName =
        typeof item.name === "string" && item.name.trim()
          ? item.name.trim()
          : fallback?.name
          ? fallback.name
          : `Item ${item.variantId.slice(-4)}`;
      const itemBarcode =
        typeof item.barcode === "string" && item.barcode.trim()
          ? item.barcode.trim()
          : fallback?.barcode ?? null;
      const lineTotal = item.priceMinor * item.quantity;
      await client.query(
        `
        INSERT INTO sale_items (id, sale_id, variant_id, quantity, price_minor, line_total_minor, item_name, barcode)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
        [
          randomUUID(),
          saleId,
          item.variantId,
          item.quantity,
          item.priceMinor,
          lineTotal,
          itemName,
          itemBarcode
        ]
      );
    }

    await recordSaleInventoryMovements({
      client,
      storeId,
      saleId,
      items: resolvedItems.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        unitSellMinor: item.priceMinor,
        name: item.name ?? null,
        globalProductId: item.globalProductId ?? null
      }))
    });

    // Stock deduction moved to confirmPayment endpoint
    // Sale status is PENDING until payment is confirmed
    // If payment fails, sale can be cancelled via cancelSale endpoint

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InsufficientStockError) {
      const message =
        error.details.length === 1
          ? error.details[0].message
          : "Stock changed.";
      return res.status(409).json({
        error: "insufficient_stock",
        message,
        details: error.details
      });
    }
    if (error instanceof Error && error.message === "insufficient_stock") {
      return res.status(409).json({
        error: "insufficient_stock",
        message: "Stock changed."
      });
    }
    if (error instanceof Error && error.message === "product_not_found") {
      return res.status(404).json({ error: "product_not_found" });
    }
    if (error instanceof Error && error.message === "sale_id_conflict") {
      return res.status(409).json({ error: "sale_id_conflict" });
    }
    return res.status(500).json({ error: "failed to create sale" });
  } finally {
    client.release();
  }

  return res.json({
    saleId,
    billRef,
    totals: {
      subtotalMinor: subtotal,
      discountMinor: discount,
      totalMinor: total,
    }
  });
});

// Confirm payment and deduct stock (two-phase commit)
// This endpoint is called AFTER payment is confirmed
// Stock is only deducted when payment is successful
posSalesRouter.post("/sales/:saleId/confirm", requireDeviceToken, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const { paymentMode } = req.body as { paymentMode?: "CASH" | "UPI" | "DUE" };
  if (!paymentMode || !["CASH", "UPI", "DUE"].includes(paymentMode)) {
    return res.status(400).json({ error: "paymentMode is required (CASH, UPI, or DUE)" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    // Get sale and verify it's in PENDING status
    const saleRes = await client.query(
      `
      SELECT id, store_id, status, subtotal_minor, discount_minor, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale_not_found" });
    }

    if (sale.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "sale_already_confirmed",
        message: `Sale is in ${sale.status} status and cannot be confirmed again`
      });
    }

    // Get sale items
    const itemsRes = await client.query(
      `
      SELECT variant_id, quantity
      FROM sale_items
      WHERE sale_id = $1
      `,
      [saleId]
    );

    const items = itemsRes.rows.map((row) => ({
      variantId: String(row.variant_id),
      quantity: Number(row.quantity ?? 0)
    }));

    // Re-verify stock availability (critical - stock might have changed)
    await ensureStoreInventoryAvailability({
      client,
      storeId,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        globalProductId: null,
        name: null
      }))
    });

    // Deduct stock NOW (only after payment is confirmed)
    await applyBulkDeductions({
      client,
      storeId,
      items
    });

    // Update sale status based on payment mode
    const newStatus = paymentMode === "CASH" ? "PAID_CASH" : paymentMode === "UPI" ? "PAID_UPI" : "DUE";
    await client.query(
      `UPDATE sales SET status = $1 WHERE id = $2`,
      [newStatus, saleId]
    );

    await client.query("COMMIT");

    return res.json({
      saleId,
      status: newStatus,
      message: "Payment confirmed and stock deducted"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InsufficientStockError) {
      const message =
        error.details.length === 1
          ? error.details[0].message
          : "Stock changed since sale was created.";
      return res.status(409).json({
        error: "insufficient_stock",
        message,
        details: error.details
      });
    }
    return res.status(500).json({ error: "failed to confirm payment" });
  } finally {
    client.release();
  }
});

// Cancel a pending sale (cleanup abandoned carts)
// This endpoint restocks items if needed
posSalesRouter.post("/sales/:saleId/cancel", requireDeviceToken, async (req, res) => {
  const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
  if (!saleId) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Get sale and verify it exists
    const saleRes = await client.query(
      `
      SELECT id, store_id, status
      FROM sales
      WHERE id = $1 AND store_id = $2
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale_not_found" });
    }

    // Only allow cancelling PENDING sales
    if (sale.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "cannot_cancel",
        message: `Cannot cancel sale in ${sale.status} status`
      });
    }

    // Update status to CANCELLED
    await client.query(
      `UPDATE sales SET status = 'CANCELLED' WHERE id = $1`,
      [saleId]
    );

    await client.query("COMMIT");

    return res.json({
      saleId,
      status: "CANCELLED",
      message: "Sale cancelled successfully"
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "failed to cancel sale" });
  } finally {
    client.release();
  }
});

// IMPORTANT:
// UPI intent / QR must NEVER be generated on backend.
// POS generates intent locally using upiVpa.
// Do not add payment gateway logic here.
posSalesRouter.post("/payments/upi/init", requireDeviceToken, async (req, res) => {
  const { saleId, transactionId, upiIntent } = req.body as {
    saleId?: string;
    transactionId?: string;
    upiIntent?: string;
  };

  if (typeof saleId !== "string" || saleId.trim().length === 0) {
    return res.status(400).json({ error: "saleId is required" });
  }
  if (typeof upiIntent === "string" && upiIntent.trim().length > 0) {
    return res.status(400).json({ error: "upi_intent_not_allowed" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  if (!store.upi_vpa) {
    return res.status(400).json({ error: "upi_vpa_missing" });
  }

  const sale = await getSale(storeId, saleId);
  if (!sale || sale.store_id !== storeId) {
    return res.status(404).json({ error: "sale not found" });
  }

  const providerRef =
    typeof transactionId === "string" && transactionId.trim().length > 0
      ? transactionId.trim()
      : null;

  const paymentId = randomUUID();
  await pool.query(
    `
    INSERT INTO payments (id, sale_id, mode, status, amount_minor, provider_ref)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [paymentId, saleId, "UPI", "PENDING", sale.total_minor, providerRef]
  );

  return res.json({
    paymentId,
    saleId,
    billRef: sale.bill_ref,
    amountMinor: sale.total_minor,
    storeName: store.name,
    upiVpa: store.upi_vpa
  });
});

posSalesRouter.post("/payments/upi/confirm-manual", requireDeviceToken, async (req, res) => {
  const { paymentId } = req.body as { paymentId?: string };

  if (typeof paymentId !== "string" || paymentId.trim().length === 0) {
    return res.status(400).json({ error: "paymentId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const paymentStatus = await getPaymentStoreStatus(storeId, paymentId);
  if (!paymentStatus) {
    return res.status(404).json({ error: "payment not found" });
  }
  if (paymentStatus.store_id !== storeId) {
    return res.status(404).json({ error: "payment not found" });
  }
  if (!paymentStatus.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  // Use transaction to ensure atomicity: payment + stock deduction + status update
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    const paymentRes = await client.query(
      `
      SELECT id, sale_id
      FROM payments
      WHERE id = $1
      `,
      [paymentId]
    );

    const payment = paymentRes.rows[0];
    if (!payment) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "payment not found" });
    }

    const saleId = String(payment.sale_id);

    // Get sale and verify it's in PENDING status
    const saleRes = await client.query(
      `
      SELECT id, store_id, status, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale not found" });
    }

    if (sale.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "sale_not_pending",
        message: `Sale is in ${sale.status} status and cannot accept payment`
      });
    }

    // Get sale items for stock deduction
    const itemsRes = await client.query(
      `
      SELECT variant_id, quantity
      FROM sale_items
      WHERE sale_id = $1
      `,
      [saleId]
    );

    const items = itemsRes.rows.map((row) => ({
      variantId: String(row.variant_id),
      quantity: Number(row.quantity ?? 0)
    }));

    // Re-verify stock availability (critical - stock might have changed)
    await ensureStoreInventoryAvailability({
      client,
      storeId,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        globalProductId: null,
        name: null
      }))
    });

    // Deduct stock NOW (only after payment is being processed)
    await applyBulkDeductions({
      client,
      storeId,
      items
    });

    // Update payment status
    await client.query(
      `
      UPDATE payments
      SET status = 'PAID', confirmed_at = NOW()
      WHERE id = $1
      `,
      [paymentId]
    );

    // Update sale status
    await client.query(
      `UPDATE sales SET status = 'PAID_UPI' WHERE id = $1`,
      [saleId]
    );

    await client.query("COMMIT");
    return res.json({ status: "PAID" });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InsufficientStockError) {
      const message =
        error.details.length === 1
          ? error.details[0].message
          : "Stock changed since sale was created.";
      return res.status(409).json({
        error: "insufficient_stock",
        message,
        details: error.details
      });
    }
    return res.status(500).json({ error: "failed to confirm payment" });
  } finally {
    client.release();
  }
});

posSalesRouter.post("/payments/cash", requireDeviceToken, async (req, res) => {
  const { saleId } = req.body as { saleId?: string };

  if (typeof saleId !== "string" || saleId.trim().length === 0) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }
  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  // Use transaction to ensure atomicity: payment + stock deduction + status update
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    // Get sale and verify it's in PENDING status
    const saleRes = await client.query(
      `
      SELECT id, store_id, status, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale not found" });
    }

    if (sale.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "sale_not_pending",
        message: `Sale is in ${sale.status} status and cannot accept payment`
      });
    }

    // Get sale items for stock deduction
    const itemsRes = await client.query(
      `
      SELECT variant_id, quantity
      FROM sale_items
      WHERE sale_id = $1
      `,
      [saleId]
    );

    const items = itemsRes.rows.map((row) => ({
      variantId: String(row.variant_id),
      quantity: Number(row.quantity ?? 0)
    }));

    // Re-verify stock availability (critical - stock might have changed)
    await ensureStoreInventoryAvailability({
      client,
      storeId,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        globalProductId: null,
        name: null
      }))
    });

    // Deduct stock NOW (only after payment is being processed)
    await applyBulkDeductions({
      client,
      storeId,
      items
    });

    const paymentId = randomUUID();
    await client.query(
      `
      INSERT INTO payments (id, sale_id, mode, status, amount_minor)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [paymentId, saleId, "CASH", "PAID", sale.total_minor]
    );

    // Verify payment was created for correct store (defense in depth)
    const paymentVerify = await client.query(
      `
      SELECT p.id FROM payments p
      JOIN sales s ON s.id = p.sale_id
      WHERE p.id = $1 AND s.store_id = $2
      `,
      [paymentId, storeId]
    );

    if (!paymentVerify.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "payment_store_mismatch" });
    }

    await client.query(`UPDATE sales SET status = 'PAID_CASH' WHERE id = $1`, [saleId]);

    await client.query("COMMIT");
    return res.json({ status: "PAID" });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InsufficientStockError) {
      const message =
        error.details.length === 1
          ? error.details[0].message
          : "Stock changed since sale was created.";
      return res.status(409).json({
        error: "insufficient_stock",
        message,
        details: error.details
      });
    }
    return res.status(500).json({ error: "failed to process payment" });
  } finally {
    client.release();
  }
});

posSalesRouter.post("/payments/due", requireDeviceToken, async (req, res) => {
  const { saleId } = req.body as { saleId?: string };

  if (typeof saleId !== "string" || saleId.trim().length === 0) {
    return res.status(400).json({ error: "saleId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }
  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  // Use transaction to ensure atomicity: payment + stock deduction + status update
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");

    // Get sale and verify it's in PENDING status
    const saleRes = await client.query(
      `
      SELECT id, store_id, status, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      `,
      [saleId, storeId]
    );

    const sale = saleRes.rows[0];
    if (!sale) {
      await client.query("ROLLBACK");
      return res.status(404).json({ error: "sale not found" });
    }

    if (sale.status !== "PENDING") {
      await client.query("ROLLBACK");
      return res.status(409).json({
        error: "sale_not_pending",
        message: `Sale is in ${sale.status} status and cannot accept payment`
      });
    }

    // Get sale items for stock deduction
    const itemsRes = await client.query(
      `
      SELECT variant_id, quantity
      FROM sale_items
      WHERE sale_id = $1
      `,
      [saleId]
    );

    const items = itemsRes.rows.map((row) => ({
      variantId: String(row.variant_id),
      quantity: Number(row.quantity ?? 0)
    }));

    // Re-verify stock availability (critical - stock might have changed)
    await ensureStoreInventoryAvailability({
      client,
      storeId,
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
        globalProductId: null,
        name: null
      }))
    });

    // Deduct stock NOW (only after payment is being processed)
    await applyBulkDeductions({
      client,
      storeId,
      items
    });

    const paymentId = randomUUID();
    await client.query(
      `
      INSERT INTO payments (id, sale_id, mode, status, amount_minor)
      VALUES ($1, $2, $3, $4, $5)
      `,
      [paymentId, saleId, "DUE", "DUE", sale.total_minor]
    );

    // Verify payment was created for correct store (defense in depth)
    const paymentVerify = await client.query(
      `
      SELECT p.id FROM payments p
      JOIN sales s ON s.id = p.sale_id
      WHERE p.id = $1 AND s.store_id = $2
      `,
      [paymentId, storeId]
    );

    if (!paymentVerify.rows[0]) {
      await client.query("ROLLBACK");
      return res.status(500).json({ error: "payment_store_mismatch" });
    }

    await client.query(`UPDATE sales SET status = 'DUE' WHERE id = $1`, [saleId]);

    await client.query("COMMIT");
    return res.json({ status: "DUE" });
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof InsufficientStockError) {
      const message =
        error.details.length === 1
          ? error.details[0].message
          : "Stock changed since sale was created.";
      return res.status(409).json({
        error: "insufficient_stock",
        message,
        details: error.details
      });
    }
    return res.status(500).json({ error: "failed to process payment" });
  } finally {
    client.release();
  }
});

posSalesRouter.post("/collections/upi/init", requireDeviceToken, async (req, res) => {
  const { amountMinor, reference, transactionId, upiIntent } = req.body as {
    amountMinor?: number;
    reference?: string | null;
    transactionId?: string;
    upiIntent?: string;
  };

  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor is required" });
  }
  if (typeof upiIntent === "string" && upiIntent.trim().length > 0) {
    return res.status(400).json({ error: "upi_intent_not_allowed" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }

  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  if (!store.upi_vpa) {
    return res.status(400).json({ error: "upi_vpa_missing" });
  }

  const normalizedReference =
    reference && reference.trim().length > 0
      ? reference.trim()
      : typeof transactionId === "string" && transactionId.trim().length > 0
      ? transactionId.trim()
      : null;

  const collectionId = randomUUID();
  await pool.query(
    `
    INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [collectionId, storeId, deviceId, Math.round(amountMinor), "UPI", normalizedReference, "PENDING"]
  );

  return res.json({
    collectionId,
    amountMinor,
    storeName: store.name,
    upiVpa: store.upi_vpa
  });
});

posSalesRouter.post("/collections/upi/confirm-manual", requireDeviceToken, async (req, res) => {
  const { collectionId } = req.body as { collectionId?: string };

  if (typeof collectionId !== "string" || collectionId.trim().length === 0) {
    return res.status(400).json({ error: "collectionId is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const collectionStatus = await getCollectionStoreStatus(storeId, collectionId);
  if (!collectionStatus) {
    return res.status(404).json({ error: "collection not found" });
  }
  if (collectionStatus.store_id !== storeId) {
    return res.status(404).json({ error: "collection not found" });
  }
  if (!collectionStatus.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  const updated = await pool.query(
    `
    UPDATE collections
    SET status = 'PAID'
    WHERE id = $1
    RETURNING id
    `,
    [collectionId]
  );

  if (updated.rowCount === 0) {
    return res.status(404).json({ error: "collection not found" });
  }

  return res.json({ status: "PAID" });
});

posSalesRouter.post("/collections/cash", requireDeviceToken, async (req, res) => {
  const { amountMinor, reference } = req.body as {
    amountMinor?: number;
    reference?: string | null;
  };

  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }
  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  const collectionId = randomUUID();
  await pool.query(
    `
    INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [collectionId, storeId, deviceId, Math.round(amountMinor), "CASH", reference ?? null, "PAID"]
  );

  return res.json({ status: "PAID", collectionId });
});

posSalesRouter.post("/collections/due", requireDeviceToken, async (req, res) => {
  const { amountMinor, reference } = req.body as {
    amountMinor?: number;
    reference?: string | null;
  };

  if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor) || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const store = await getStore(storeId);
  if (!store) {
    return res.status(404).json({ error: "store not found" });
  }
  if (!store.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  const collectionId = randomUUID();
  await pool.query(
    `
    INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `,
    [collectionId, storeId, deviceId, Math.round(amountMinor), "DUE", reference ?? null, "DUE"]
  );

  return res.json({ status: "DUE", collectionId });
});
