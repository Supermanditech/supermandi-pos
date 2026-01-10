import { randomUUID } from "crypto";
import { Router } from "express";
import { getPool } from "../db/client";
import { requireDeviceToken } from "../middleware/deviceToken";
import { listInventoryVariants } from "../services/inventoryService";
import { createPurchase, type PurchaseItemInput } from "../services/purchaseService";
import { normalizeScan } from "../services/scanNormalization";

export const productsRouter = Router();

type Queryable = {
  query: (text: string, params?: any[]) => Promise<{ rows: any[]; rowCount?: number }>;
};

function normalizeName(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function asPositiveInt(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const rounded = Math.round(value);
  if (rounded <= 0) return null;
  return rounded;
}

function resolveIdentifierCodeTypes(codeType: string): string[] {
  if (!codeType.endsWith("_TEXT")) return [codeType];
  const baseType = codeType.slice(0, -5);
  if (!baseType || baseType === codeType) return [codeType];
  return [codeType, baseType];
}

async function fetchGlobalByIdentifier(
  client: Queryable,
  codeType: string,
  normalizedValue: string
): Promise<{ globalProductId: string; globalName: string } | null> {
  const codeTypes = resolveIdentifierCodeTypes(codeType);
  for (const candidateType of codeTypes) {
    const identifierRes = await client.query(
      `
      SELECT gpi.global_product_id, gp.global_name
      FROM global_product_identifiers gpi
      JOIN global_products gp ON gp.id = gpi.global_product_id
      WHERE gpi.code_type = $1 AND gpi.normalized_value = $2
      LIMIT 1
      `,
      [candidateType, normalizedValue]
    );

    const match = identifierRes.rows[0];
    if (match) {
      return {
        globalProductId: String(match.global_product_id),
        globalName: String(match.global_name ?? "")
      };
    }
  }

  return null;
}

async function fetchGlobalById(
  client: Queryable,
  globalProductId: string
): Promise<{ globalProductId: string; globalName: string } | null> {
  const res = await client.query(
    `
    SELECT id, global_name
    FROM global_products
    WHERE id = $1
    LIMIT 1
    `,
    [globalProductId]
  );

  const row = res.rows[0];
  if (!row) return null;

  return {
    globalProductId: String(row.id),
    globalName: String(row.global_name ?? "")
  };
}

async function buildStoreProductPayload(
  client: Queryable,
  storeId: string,
  globalProductId: string,
  globalName: string,
  storeDisplayName?: string | null
): Promise<{
  global_product_id: string;
  global_name: string;
  store_display_name: string;
  sell_price: number | null;
  purchase_price: number | null;
  unit: string | null;
  variant: string | null;
  available_qty: number;
  is_first_time_in_store: boolean;
}> {
  const shouldUpdateDisplayName = storeDisplayName !== undefined;
  const insertColumns = ["id", "store_id", "global_product_id"];
  const insertValues = ["$1", "$2", "$3"];
  const insertArgs: Array<string | null> = [randomUUID(), storeId, globalProductId];

  if (shouldUpdateDisplayName) {
    insertColumns.push("store_display_name");
    insertArgs.push(storeDisplayName ?? null);
    insertValues.push(`$${insertArgs.length}`);
  }

  const insertRes = await client.query(
    `
    INSERT INTO store_products (${insertColumns.join(", ")})
    VALUES (${insertValues.join(", ")})
    ON CONFLICT (store_id, global_product_id) DO NOTHING
    RETURNING id
    `,
    insertArgs
  );

  const isFirstTimeInStore = (insertRes.rowCount ?? 0) > 0;
  if (shouldUpdateDisplayName && !isFirstTimeInStore) {
    await client.query(
      `
      UPDATE store_products
      SET store_display_name = $1,
          updated_at = NOW()
      WHERE store_id = $2 AND global_product_id = $3
      `,
      [storeDisplayName ?? null, storeId, globalProductId]
    );
  }
  const storeRes = await client.query(
    `
    SELECT store_display_name, sell_price_minor, purchase_price_minor, unit, variant
    FROM store_products
    WHERE store_id = $1 AND global_product_id = $2
    LIMIT 1
    `,
    [storeId, globalProductId]
  );

  const inventoryRes = await client.query(
    `
    SELECT available_qty
    FROM store_inventory
    WHERE store_id = $1 AND global_product_id = $2
    LIMIT 1
    `,
    [storeId, globalProductId]
  );

  const storeRow = storeRes.rows[0] ?? {};
  const qtyRaw = inventoryRes.rows[0]?.available_qty;
  const availableQty = Number.isFinite(Number(qtyRaw)) ? Math.max(0, Number(qtyRaw)) : 0;

  return {
    global_product_id: globalProductId,
    global_name: globalName,
    store_display_name: storeRow.store_display_name
      ? String(storeRow.store_display_name)
      : globalName,
    sell_price:
      storeRow.sell_price_minor === null || storeRow.sell_price_minor === undefined
        ? null
        : Number(storeRow.sell_price_minor),
    purchase_price:
      storeRow.purchase_price_minor === null || storeRow.purchase_price_minor === undefined
        ? null
        : Number(storeRow.purchase_price_minor),
    unit: storeRow.unit ? String(storeRow.unit) : null,
    variant: storeRow.variant ? String(storeRow.variant) : null,
    available_qty: availableQty,
    is_first_time_in_store: isFirstTimeInStore
  };
}

async function buildStoreProductPreviewPayload(
  client: Queryable,
  storeId: string,
  globalProductId: string,
  globalName: string
): Promise<{
  global_product_id: string;
  global_name: string;
  store_display_name: string;
  sell_price: number | null;
  purchase_price: number | null;
  unit: string | null;
  variant: string | null;
  available_qty: number;
  is_first_time_in_store: boolean;
}> {
  const storeRes = await client.query(
    `
    SELECT store_display_name, sell_price_minor, purchase_price_minor, unit, variant
    FROM store_products
    WHERE store_id = $1 AND global_product_id = $2
    LIMIT 1
    `,
    [storeId, globalProductId]
  );

  const inventoryRes = await client.query(
    `
    SELECT available_qty
    FROM store_inventory
    WHERE store_id = $1 AND global_product_id = $2
    LIMIT 1
    `,
    [storeId, globalProductId]
  );

  const storeRow = storeRes.rows[0] ?? null;
  const qtyRaw = inventoryRes.rows[0]?.available_qty;
  const availableQty = Number.isFinite(Number(qtyRaw)) ? Math.max(0, Number(qtyRaw)) : 0;

  return {
    global_product_id: globalProductId,
    global_name: globalName,
    store_display_name: storeRow?.store_display_name
      ? String(storeRow.store_display_name)
      : globalName,
    sell_price:
      storeRow?.sell_price_minor === null || storeRow?.sell_price_minor === undefined
        ? null
        : Number(storeRow.sell_price_minor),
    purchase_price:
      storeRow?.purchase_price_minor === null || storeRow?.purchase_price_minor === undefined
        ? null
        : Number(storeRow.purchase_price_minor),
    unit: storeRow?.unit ? String(storeRow.unit) : null,
    variant: storeRow?.variant ? String(storeRow.variant) : null,
    available_qty: availableQty,
    is_first_time_in_store: !storeRow
  };
}

// GET /api/products/lookup?format=...&scanned=...
productsRouter.get("/lookup", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const scanned = typeof req.query.scanned === "string" ? req.query.scanned : "";
  const format = typeof req.query.format === "string" ? req.query.format : undefined;
  const previewParam = typeof req.query.preview === "string" ? req.query.preview : "";
  const preview = previewParam === "1" || previewParam === "true";

  if (!scanned.trim()) {
    return res.status(400).json({ error: "scanned is required" });
  }

  const normalized = normalizeScan(format, scanned);
  if (!normalized) {
    return res.status(400).json({ error: "invalid_scan" });
  }

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };

  try {
    const globalMatch = await fetchGlobalByIdentifier(
      pool,
      normalized.code_type,
      normalized.normalized_value
    );
    if (!globalMatch) {
      console.info("lookup_miss", {
        deviceId,
        storeId,
        codeType: normalized.code_type,
        normalizedValue: normalized.normalized_value
      });
      return res.status(404).json({ error: "product_not_found" });
    }

    if (preview) {
      const payload = await buildStoreProductPreviewPayload(
        pool,
        storeId,
        globalMatch.globalProductId,
        globalMatch.globalName
      );
      return res.json({ product: payload });
    }

    const payload = await buildStoreProductPayload(
      pool,
      storeId,
      globalMatch.globalProductId,
      globalMatch.globalName
    );

    console.info("lookup_hit", {
      deviceId,
      storeId,
      codeType: normalized.code_type,
      normalizedValue: normalized.normalized_value,
      globalProductId: globalMatch.globalProductId
    });

    if (payload.is_first_time_in_store) {
      console.info("store_mapping_auto_created", {
        deviceId,
        storeId,
        globalProductId: globalMatch.globalProductId,
        codeType: normalized.code_type,
        normalizedValue: normalized.normalized_value,
        source: "lookup"
      });
    }

    return res.json({ product: payload });
  } catch (error) {
    return res.status(500).json({ error: "failed to lookup product" });
  }
});

// POST /api/products/create-from-scan
productsRouter.post("/create-from-scan", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : null;
  const scanned = typeof body?.scanned === "string" ? body.scanned : "";
  const format = typeof body?.format === "string" ? body.format : undefined;

  if (!scanned.trim()) {
    return res.status(400).json({ error: "scanned is required" });
  }

  const normalized = normalizeScan(format, scanned);
  if (!normalized) {
    return res.status(400).json({ error: "invalid_scan" });
  }

  const nameCandidate =
    normalizeName(body?.global_name) ??
    normalizeName(body?.globalName) ??
    normalizeName(body?.name);
  const storeDisplayNameCandidate =
    normalizeName(body?.store_display_name) ??
    normalizeName(body?.storeDisplayName);
  const globalNameFallback = nameCandidate ?? normalized.normalized_value;
  const storeDisplayName = (storeDisplayNameCandidate ?? nameCandidate) ?? undefined;

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await fetchGlobalByIdentifier(
      client,
      normalized.code_type,
      normalized.normalized_value
    );

    let globalProductId = existing?.globalProductId ?? "";
    let globalName = existing?.globalName ?? globalNameFallback;

    if (!existing) {
      globalProductId = randomUUID();
      globalName = globalNameFallback;
      await client.query(
        `
        INSERT INTO global_products (id, global_name, category)
        VALUES ($1, $2, $3)
        `,
        [globalProductId, globalName, null]
      );

      const identifierRes = await client.query(
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
        RETURNING global_product_id
        `,
        [randomUUID(), globalProductId, normalized.code_type, scanned.trim(), normalized.normalized_value]
      );

      if ((identifierRes.rowCount ?? 0) === 0) {
        await client.query("ROLLBACK");
        const conflict = await fetchGlobalByIdentifier(
          pool,
          normalized.code_type,
          normalized.normalized_value
        );
        if (!conflict) {
          return res.status(409).json({ error: "global_identifier_conflict" });
        }

        const payload = await buildStoreProductPayload(
          pool,
          storeId,
          conflict.globalProductId,
          conflict.globalName,
          storeDisplayName
        );

        if (payload.is_first_time_in_store) {
          console.info("store_mapping_auto_created", {
            deviceId,
            storeId,
            globalProductId: conflict.globalProductId,
            codeType: normalized.code_type,
            normalizedValue: normalized.normalized_value,
            source: "create_from_scan"
          });
        }

        return res.json({ product: payload });
      }
    }

    const payload = await buildStoreProductPayload(
      client,
      storeId,
      globalProductId,
      globalName,
      storeDisplayName
    );
    await client.query("COMMIT");

    if (payload.is_first_time_in_store) {
      console.info("store_mapping_auto_created", {
        deviceId,
        storeId,
        globalProductId,
        codeType: normalized.code_type,
        normalizedValue: normalized.normalized_value,
        source: "create_from_scan"
      });
    }

    return res.json({ product: payload });
  } catch (error) {
    await client.query("ROLLBACK");
    return res.status(500).json({ error: "failed to create product" });
  } finally {
    client.release();
  }
});

// POST /api/products/receive
productsRouter.post("/receive", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : null;
  if (!body) {
    return res.status(400).json({ error: "request body is required" });
  }

  const scanned = asTrimmedString(body.scanned);
  const format = typeof body.format === "string" ? body.format : undefined;
  if (!scanned) {
    return res.status(400).json({ error: "scanned is required" });
  }

  const rawSellPrice =
    (body.sell_price_minor as unknown) ??
    (body.sellPriceMinor as unknown) ??
    (body.sell_price as unknown) ??
    (body.price_minor as unknown) ??
    (body.priceMinor as unknown) ??
    (body.price as unknown) ??
    null;
  const sellPriceMinor = asPositiveInt(rawSellPrice);
  if (!sellPriceMinor) {
    return res.status(400).json({ error: "sell_price_minor must be a positive number" });
  }

  const rawInitialStock =
    (body.initial_stock as unknown) ??
    (body.initialStock as unknown) ??
    (body.stock as unknown) ??
    null;
  const initialStock = asPositiveInt(rawInitialStock);
  if (!initialStock) {
    return res.status(400).json({ error: "initial_stock must be a positive number" });
  }

  const hasPurchasePrice =
    Object.prototype.hasOwnProperty.call(body, "purchase_price_minor") ||
    Object.prototype.hasOwnProperty.call(body, "purchasePriceMinor") ||
    Object.prototype.hasOwnProperty.call(body, "purchase_price") ||
    Object.prototype.hasOwnProperty.call(body, "purchasePrice") ||
    Object.prototype.hasOwnProperty.call(body, "unit_cost_minor") ||
    Object.prototype.hasOwnProperty.call(body, "unitCostMinor") ||
    Object.prototype.hasOwnProperty.call(body, "unit_cost") ||
    Object.prototype.hasOwnProperty.call(body, "unitCost");
  const rawPurchasePrice =
    (body.purchase_price_minor as unknown) ??
    (body.purchasePriceMinor as unknown) ??
    (body.purchase_price as unknown) ??
    (body.purchasePrice as unknown) ??
    (body.unit_cost_minor as unknown) ??
    (body.unitCostMinor as unknown) ??
    (body.unit_cost as unknown) ??
    (body.unitCost as unknown) ??
    null;
  const purchasePriceMinor = hasPurchasePrice ? asPositiveInt(rawPurchasePrice) : null;
  if (hasPurchasePrice && !purchasePriceMinor) {
    return res.status(400).json({ error: "purchase_price_minor must be a positive number" });
  }

  const normalized = normalizeScan(format, scanned);
  if (!normalized) {
    return res.status(400).json({ error: "invalid_scan" });
  }

  const nameCandidate =
    normalizeName(body.global_name) ??
    normalizeName(body.globalName) ??
    normalizeName(body.name);
  const storeDisplayNameCandidate =
    normalizeName(body.store_display_name) ??
    normalizeName(body.storeDisplayName);
  const globalNameFallback = nameCandidate ?? normalized.normalized_value;
  const storeDisplayName = (storeDisplayNameCandidate ?? nameCandidate) ?? undefined;

  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const existing = await fetchGlobalByIdentifier(
      client,
      normalized.code_type,
      normalized.normalized_value
    );

    let globalProductId = existing?.globalProductId ?? "";
    let globalName = existing?.globalName ?? globalNameFallback;

    if (!existing) {
      globalProductId = randomUUID();
      globalName = globalNameFallback;
      await client.query(
        `
        INSERT INTO global_products (id, global_name, category)
        VALUES ($1, $2, $3)
        `,
        [globalProductId, globalName, null]
      );

      const identifierRes = await client.query(
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
        RETURNING global_product_id
        `,
        [randomUUID(), globalProductId, normalized.code_type, scanned.trim(), normalized.normalized_value]
      );

      if ((identifierRes.rowCount ?? 0) === 0) {
        await client.query(`DELETE FROM global_products WHERE id = $1`, [globalProductId]);
        const conflict = await fetchGlobalByIdentifier(
          client,
          normalized.code_type,
          normalized.normalized_value
        );
        if (!conflict) {
          throw new Error("global_identifier_conflict");
        }
        globalProductId = conflict.globalProductId;
        globalName = conflict.globalName ?? globalNameFallback;
      }
    }

    const insertColumns = ["id", "store_id", "global_product_id", "sell_price_minor"];
    const insertValues = ["$1", "$2", "$3", "$4"];
    const insertArgs: Array<string | number | null> = [
      randomUUID(),
      storeId,
      globalProductId,
      sellPriceMinor
    ];

    if (storeDisplayName !== undefined) {
      insertColumns.push("store_display_name");
      insertArgs.push(storeDisplayName ?? null);
      insertValues.push(`$${insertArgs.length}`);
    }

    const updateDisplayName =
      storeDisplayName !== undefined
        ? "store_display_name = COALESCE(EXCLUDED.store_display_name, store_products.store_display_name),"
        : "";

    await client.query(
      `
      INSERT INTO store_products (${insertColumns.join(", ")})
      VALUES (${insertValues.join(", ")})
      ON CONFLICT (store_id, global_product_id) DO UPDATE
      SET sell_price_minor = EXCLUDED.sell_price_minor,
          ${updateDisplayName}
          updated_at = NOW()
      `,
      insertArgs
    );

    const purchaseItem: PurchaseItemInput = {
      barcode: scanned,
      productName: storeDisplayName ?? globalName ?? globalNameFallback,
      globalProductId,
      scanFormat: format ?? null,
      quantity: initialStock,
      unitCostMinor: purchasePriceMinor ?? sellPriceMinor,
      currency: "INR"
    };

    await createPurchase({
      client,
      storeId,
      input: {
        supplierName: null,
        currency: "INR",
        items: [purchaseItem]
      }
    });

    const payload = await buildStoreProductPayload(
      client,
      storeId,
      globalProductId,
      globalName ?? globalNameFallback,
      storeDisplayName
    );

    await client.query("COMMIT");

    console.info("store_product_received", {
      deviceId,
      storeId,
      globalProductId,
      codeType: normalized.code_type,
      normalizedValue: normalized.normalized_value
    });

    return res.status(201).json({ product: payload });
  } catch (error: any) {
    await client.query("ROLLBACK");
    const message = error?.message ? String(error.message) : "";
    if (message === "global_identifier_conflict") {
      return res.status(409).json({ error: message });
    }
    return res.status(500).json({ error: "failed to receive product" });
  } finally {
    client.release();
  }
});

// PATCH /api/products/store-price
productsRouter.patch("/store-price", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : null;
  if (!body) {
    return res.status(400).json({ error: "request body is required" });
  }

  const hasPrice =
    Object.prototype.hasOwnProperty.call(body, "sell_price_minor") ||
    Object.prototype.hasOwnProperty.call(body, "sell_price") ||
    Object.prototype.hasOwnProperty.call(body, "price_minor") ||
    Object.prototype.hasOwnProperty.call(body, "priceMinor");
  if (!hasPrice) {
    return res.status(400).json({ error: "sell_price_minor is required" });
  }

  const rawPrice =
    (body.sell_price_minor as unknown) ??
    (body.sell_price as unknown) ??
    (body.price_minor as unknown) ??
    (body.priceMinor as unknown) ??
    null;

  let sellPriceMinor: number | null;
  if (rawPrice === null) {
    sellPriceMinor = null;
  } else if (typeof rawPrice === "number" && Number.isFinite(rawPrice)) {
    const rounded = Math.round(rawPrice);
    if (rounded <= 0) {
      return res.status(400).json({ error: "sell_price_minor must be positive" });
    }
    sellPriceMinor = rounded;
  } else {
    return res.status(400).json({ error: "sell_price_minor must be a number or null" });
  }

  const { storeId } = (req as any).posDevice as { storeId: string };
  const globalProductId =
    asTrimmedString(body.globalProductId) ?? asTrimmedString(body.global_product_id);

  try {
    let globalMatch: { globalProductId: string; globalName: string } | null = null;

    if (globalProductId) {
      globalMatch = await fetchGlobalById(pool, globalProductId);
      if (!globalMatch) {
        return res.status(404).json({ error: "product_not_found" });
      }
    } else {
      const scanned = asTrimmedString(body.scanned);
      const format = typeof body.format === "string" ? body.format : undefined;
      if (!scanned) {
        return res.status(400).json({ error: "scanned is required" });
      }

      const normalized = normalizeScan(format, scanned);
      if (!normalized) {
        return res.status(400).json({ error: "invalid_scan" });
      }

      globalMatch = await fetchGlobalByIdentifier(
        pool,
        normalized.code_type,
        normalized.normalized_value
      );
      if (!globalMatch) {
        return res.status(404).json({ error: "product_not_found" });
      }
    }

    await pool.query(
      `
      INSERT INTO store_products (id, store_id, global_product_id)
      VALUES ($1, $2, $3)
      ON CONFLICT (store_id, global_product_id) DO NOTHING
      `,
      [randomUUID(), storeId, globalMatch.globalProductId]
    );

    await pool.query(
      `
      UPDATE store_products
      SET sell_price_minor = $1,
          updated_at = NOW()
      WHERE store_id = $2 AND global_product_id = $3
      `,
      [sellPriceMinor, storeId, globalMatch.globalProductId]
    );

    const payload = await buildStoreProductPayload(
      pool,
      storeId,
      globalMatch.globalProductId,
      globalMatch.globalName
    );

    return res.json({ product: payload });
  } catch (error) {
    return res.status(500).json({ error: "failed to update store product price" });
  }
});

// PATCH /api/products/store-name
productsRouter.patch("/store-name", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const body =
    req.body && typeof req.body === "object"
      ? (req.body as Record<string, unknown>)
      : null;
  if (!body) {
    return res.status(400).json({ error: "request body is required" });
  }

  const hasDisplayName =
    Object.prototype.hasOwnProperty.call(body, "store_display_name") ||
    Object.prototype.hasOwnProperty.call(body, "storeDisplayName") ||
    Object.prototype.hasOwnProperty.call(body, "name");
  if (!hasDisplayName) {
    return res.status(400).json({ error: "store_display_name is required" });
  }

  const rawDisplayName =
    (body.store_display_name as unknown) ??
    (body.storeDisplayName as unknown) ??
    (body.name as unknown) ??
    null;

  let storeDisplayName: string | null;
  if (rawDisplayName === null) {
    storeDisplayName = null;
  } else if (typeof rawDisplayName === "string") {
    const trimmed = rawDisplayName.trim();
    storeDisplayName = trimmed ? trimmed : null;
  } else {
    return res.status(400).json({ error: "store_display_name must be a string or null" });
  }

  const { storeId } = (req as any).posDevice as { storeId: string };
  const globalProductId =
    asTrimmedString(body.globalProductId) ?? asTrimmedString(body.global_product_id);

  try {
    let globalMatch: { globalProductId: string; globalName: string } | null = null;

    if (globalProductId) {
      globalMatch = await fetchGlobalById(pool, globalProductId);
      if (!globalMatch) {
        return res.status(404).json({ error: "product_not_found" });
      }
    } else {
      const scanned = asTrimmedString(body.scanned);
      const format = typeof body.format === "string" ? body.format : undefined;
      if (!scanned) {
        return res.status(400).json({ error: "scanned is required" });
      }

      const normalized = normalizeScan(format, scanned);
      if (!normalized) {
        return res.status(400).json({ error: "invalid_scan" });
      }

      globalMatch = await fetchGlobalByIdentifier(
        pool,
        normalized.code_type,
        normalized.normalized_value
      );
      if (!globalMatch) {
        return res.status(404).json({ error: "product_not_found" });
      }
    }

    const payload = await buildStoreProductPayload(
      pool,
      storeId,
      globalMatch.globalProductId,
      globalMatch.globalName,
      storeDisplayName
    );

    return res.json({ product: payload });
  } catch (error) {
    return res.status(500).json({ error: "failed to update store product name" });
  }
});

// GET /api/products?barcode=...&q=...
productsRouter.get("/", requireDeviceToken, async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const barcode = typeof req.query.barcode === "string" ? req.query.barcode : undefined;
  const query = typeof req.query.q === "string" ? req.query.q : undefined;
  const { storeId } = (req as any).posDevice as { storeId: string };

  try {
    const products = await listInventoryVariants({
      client: pool,
      storeId,
      barcode,
      query
    });
    return res.json({ products });
  } catch (error) {
    return res.status(500).json({ error: "failed to load products" });
  }
});
