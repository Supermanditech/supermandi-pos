import { randomUUID } from "crypto";
import { Router } from "express";
import type { PoolClient } from "pg";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";

export const posPurchasesRouter = Router();

type PurchaseItemInput = {
  barcode?: unknown;
  name?: unknown;
  quantity?: unknown;
  purchasePriceMinor?: unknown;
  sellingPriceMinor?: unknown;
  currency?: unknown;
};

type ParsedPurchaseItem = {
  barcode: string;
  name: string;
  quantity: number;
  purchasePriceMinor: number;
  sellingPriceMinor: number;
  currency: string;
};

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function buildDefaultName(barcode: string): string {
  const suffix = barcode.slice(-4);
  return `Item ${suffix || barcode}`;
}

async function ensureProductByBarcode(
  client: PoolClient,
  params: { barcode: string; name: string; currency: string }
): Promise<string> {
  const existing = await client.query(`SELECT id FROM products WHERE barcode = $1`, [params.barcode]);
  if (existing.rows[0]?.id) {
    return existing.rows[0].id as string;
  }

  const id = randomUUID();
  await client.query(
    `
    INSERT INTO products (id, barcode, name, currency, retailer_status, enrichment_status)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [id, params.barcode, params.name, params.currency, "retailer_created", "pending_enrichment"]
  );
  return id;
}

async function ensureRetailerProduct(
  client: PoolClient,
  params: { storeId: string; productId: string }
): Promise<void> {
  await client.query(
    `
    INSERT INTO retailer_products (store_id, product_id, digitised_by_retailer)
    VALUES ($1, $2, TRUE)
    ON CONFLICT (store_id, product_id) DO NOTHING
    `,
    [params.storeId, params.productId]
  );
}

async function upsertRetailerPrice(
  client: PoolClient,
  params: { storeId: string; productId: string; priceMinor: number }
): Promise<void> {
  await client.query(
    `
    INSERT INTO retailer_products (store_id, product_id, selling_price_minor, digitised_by_retailer, price_updated_at)
    VALUES ($1, $2, $3, TRUE, NOW())
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET selling_price_minor = EXCLUDED.selling_price_minor, price_updated_at = NOW()
    `,
    [params.storeId, params.productId, params.priceMinor]
  );
}

async function upsertInventory(
  client: PoolClient,
  params: { storeId: string; productId: string; quantity: number }
): Promise<void> {
  await client.query(
    `
    INSERT INTO inventory (store_id, product_id, quantity, updated_at)
    VALUES ($1, $2, $3, NOW())
    ON CONFLICT (store_id, product_id)
    DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity, updated_at = NOW()
    `,
    [params.storeId, params.productId, params.quantity]
  );
}

// POST /api/v1/pos/purchases
posPurchasesRouter.post("/purchases", requireDeviceToken, async (req, res) => {
  const rawItems = req.body?.items;
  const supplierName = asTrimmedString(req.body?.supplierName);

  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return res.status(400).json({ error: "items must be a non-empty array" });
  }

  const parsed: ParsedPurchaseItem[] = [];
  for (const raw of rawItems as PurchaseItemInput[]) {
    const barcode = asTrimmedString(raw?.barcode);
    if (!barcode) {
      return res.status(400).json({ error: "barcode is required" });
    }

    const name = asTrimmedString(raw?.name) ?? buildDefaultName(barcode);
    const quantityRaw = asNumber(raw?.quantity);
    const purchasePriceRaw = asNumber(raw?.purchasePriceMinor);
    const sellingPriceRaw = asNumber(raw?.sellingPriceMinor);
    const currency = asTrimmedString(raw?.currency) ?? "INR";

    const quantity = quantityRaw === null ? null : Math.round(quantityRaw);
    const purchasePriceMinor = purchasePriceRaw === null ? null : Math.round(purchasePriceRaw);
    const sellingPriceMinor = sellingPriceRaw === null ? null : Math.round(sellingPriceRaw);

    if (!name.trim()) {
      return res.status(400).json({ error: "name is required" });
    }
    if (!quantity || quantity <= 0) {
      return res.status(400).json({ error: "quantity must be positive" });
    }
    if (!purchasePriceMinor || purchasePriceMinor <= 0) {
      return res.status(400).json({ error: "purchasePriceMinor must be positive" });
    }
    if (!sellingPriceMinor || sellingPriceMinor <= 0) {
      return res.status(400).json({ error: "sellingPriceMinor must be positive" });
    }

    parsed.push({
      barcode,
      name,
      quantity,
      purchasePriceMinor,
      sellingPriceMinor,
      currency
    });
  }

  const currency = parsed[0]?.currency ?? "INR";
  if (parsed.some((item) => item.currency !== currency)) {
    return res.status(400).json({ error: "mixed currencies are not supported" });
  }

  const totalMinor = parsed.reduce(
    (sum, item) => sum + item.purchasePriceMinor * item.quantity,
    0
  );

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { storeId } = (req as any).posDevice as { storeId: string };
  const purchaseId = randomUUID();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await client.query(
      `
      INSERT INTO purchases (id, store_id, supplier_name, total_minor, currency, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW())
      `,
      [purchaseId, storeId, supplierName ?? null, totalMinor, currency]
    );

    for (const item of parsed) {
      const productId = await ensureProductByBarcode(client, {
        barcode: item.barcode,
        name: item.name,
        currency: item.currency
      });

      await ensureRetailerProduct(client, { storeId, productId });
      await upsertRetailerPrice(client, {
        storeId,
        productId,
        priceMinor: item.sellingPriceMinor
      });

      await client.query(
        `
        INSERT INTO purchase_items (id, purchase_id, product_id, quantity, unit_cost_minor, line_total_minor)
        VALUES ($1, $2, $3, $4, $5, $6)
        `,
        [
          randomUUID(),
          purchaseId,
          productId,
          item.quantity,
          item.purchasePriceMinor,
          item.purchasePriceMinor * item.quantity
        ]
      );

      await upsertInventory(client, {
        storeId,
        productId,
        quantity: item.quantity
      });
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(503).json({ error: "database unavailable" });
  } finally {
    client.release();
  }

  return res.json({ purchaseId, totalMinor });
});
