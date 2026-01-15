"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.posSalesRouter = void 0;
const crypto_1 = require("crypto");
const express_1 = require("express");
const client_1 = require("../../../db/client");
const deviceToken_1 = require("../../../middleware/deviceToken");
const inventoryService_1 = require("../../../services/inventoryService");
const inventoryLedgerService_1 = require("../../../services/inventoryLedgerService");
exports.posSalesRouter = (0, express_1.Router)();
function buildBillRef() {
    const ts = Date.now().toString();
    const randomBytes = require("crypto").randomBytes(3);
    const rand = randomBytes.readUIntBE(0, 3).toString(36).toUpperCase().padStart(5, '0');
    return `${ts.slice(-8)}${rand}`;
}
function resolvePaymentMode(status) {
    const normalized = (status ?? "").toUpperCase();
    if (normalized.includes("UPI"))
        return "UPI";
    if (normalized.includes("CASH"))
        return "CASH";
    if (normalized.includes("DUE"))
        return "DUE";
    return "UNKNOWN";
}
function asTrimmedString(value) {
    if (typeof value !== "string")
        return null;
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
}
// PATCH: Add UUID validation to prevent PostgreSQL cast errors
function isValidUUID(value) {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
}
function parseVariantSize(variantRaw) {
    if (!variantRaw)
        return null;
    const trimmed = variantRaw.trim().toLowerCase();
    if (!trimmed)
        return null;
    const match = trimmed.match(/(\d+(?:\.\d+)?)\s*(kg|g|ml|l)\b/);
    if (!match)
        return null;
    const amount = Number(match[1]);
    if (!Number.isFinite(amount) || amount <= 0)
        return null;
    const unitInfo = (0, inventoryService_1.normalizeUnit)(match[2]);
    if (!unitInfo)
        return null;
    const sizeBase = Math.round(amount * unitInfo.multiplier);
    if (sizeBase <= 0)
        return null;
    return { baseUnit: unitInfo.baseUnit, sizeBase };
}
async function ensureRetailerVariantLink(client, storeId, variantId) {
    await client.query(`
    INSERT INTO retailer_variants (store_id, variant_id, digitised_by_retailer)
    VALUES ($1, $2, TRUE)
    ON CONFLICT (store_id, variant_id) DO NOTHING
    `, [storeId, variantId]);
}
async function findVariantForProduct(params) {
    const { client, storeId, productId, baseUnit, preferredSizeBase } = params;
    if (preferredSizeBase !== null) {
        const preferred = await client.query(`
      SELECT id
      FROM variants
      WHERE product_id = $1 AND unit_base = $2 AND size_base = $3
      LIMIT 1
      `, [productId, baseUnit, preferredSizeBase]);
        if (preferred.rows[0]?.id) {
            const variantId = String(preferred.rows[0].id);
            await ensureRetailerVariantLink(client, storeId, variantId);
            return variantId;
        }
    }
    const standard = await client.query(`
    SELECT id
    FROM variants
    WHERE product_id = $1 AND unit_base = $2 AND size_base = 1000
    LIMIT 1
    `, [productId, baseUnit]);
    if (standard.rows[0]?.id) {
        const variantId = String(standard.rows[0].id);
        await ensureRetailerVariantLink(client, storeId, variantId);
        return variantId;
    }
    const fallback = await client.query(`
    SELECT id
    FROM variants
    WHERE product_id = $1 AND unit_base = $2
    ORDER BY size_base ASC, created_at ASC
    LIMIT 1
    `, [productId, baseUnit]);
    if (fallback.rows[0]?.id) {
        const variantId = String(fallback.rows[0].id);
        await ensureRetailerVariantLink(client, storeId, variantId);
        return variantId;
    }
    return null;
}
async function resolveVariantForGlobalProduct(params) {
    const { client, storeId, globalProductId, fallbackName, currency } = params;
    const productRes = await client.query(`
    SELECT gp.global_name, sp.store_display_name, sp.unit, sp.variant
    FROM global_products gp
    LEFT JOIN store_products sp
      ON sp.global_product_id = gp.id AND sp.store_id = $2
    WHERE gp.id = $1
    LIMIT 1
    `, [globalProductId, storeId]);
    const productRow = productRes.rows[0];
    if (!productRow)
        return null;
    const globalName = productRow.global_name ? String(productRow.global_name) : "";
    const storeName = productRow.store_display_name ? String(productRow.store_display_name) : null;
    const unitRaw = productRow.unit ? String(productRow.unit) : null;
    const variantRaw = productRow.variant ? String(productRow.variant) : null;
    const productName = storeName ||
        globalName ||
        (fallbackName ? fallbackName.trim() : "") ||
        `Item ${globalProductId.slice(-4)}`;
    const linkedRes = await client.query(`
    SELECT v.id
    FROM variants v
    JOIN retailer_variants rv
      ON rv.variant_id = v.id AND rv.store_id = $1
    WHERE v.product_id = $2
    ORDER BY v.size_base NULLS LAST, v.created_at ASC
    LIMIT 1
    `, [storeId, globalProductId]);
    if (linkedRes.rows[0]?.id) {
        return String(linkedRes.rows[0].id);
    }
    const existingVariant = await client.query(`
    SELECT v.id
    FROM variants v
    WHERE v.product_id = $1
    ORDER BY v.size_base NULLS LAST, v.created_at ASC
    LIMIT 1
    `, [globalProductId]);
    if (existingVariant.rows[0]?.id) {
        const variantId = String(existingVariant.rows[0].id);
        await ensureRetailerVariantLink(client, storeId, variantId);
        return variantId;
    }
    await client.query(`
    INSERT INTO products (id, name, category, retailer_status, enrichment_status)
    VALUES ($1, $2, $3, $4, $5)
    ON CONFLICT (id) DO NOTHING
    `, [globalProductId, productName, null, "retailer_created", "pending_enrichment"]);
    const unitInfo = (0, inventoryService_1.normalizeUnit)(unitRaw);
    const variantSize = parseVariantSize(variantRaw);
    const baseUnit = unitInfo?.baseUnit ?? variantSize?.baseUnit ?? null;
    const preferredSizeBase = variantSize && (!baseUnit || variantSize.baseUnit === baseUnit) ? variantSize.sizeBase : null;
    if (baseUnit) {
        await (0, inventoryService_1.ensureStandardVariants)({
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
        if (variantId)
            return variantId;
    }
    const variantId = (0, crypto_1.randomUUID)();
    await client.query(`
    INSERT INTO variants (id, product_id, name, currency)
    VALUES ($1, $2, $3, $4)
    `, [variantId, globalProductId, productName, currency]);
    await (0, inventoryService_1.ensureSupermandiBarcode)(client, variantId);
    await ensureRetailerVariantLink(client, storeId, variantId);
    return variantId;
}
async function variantExists(client, variantId) {
    const res = await client.query(`
    SELECT 1
    FROM variants
    WHERE id = $1
    LIMIT 1
    `, [variantId]);
    return (res.rowCount ?? 0) > 0;
}
// PATCH: Add barcode resolution for offline sales
async function resolveVariantByBarcode(client, storeId, barcode, fallbackName, currency) {
    const trimmed = barcode.trim();
    if (!trimmed) return null;

    // First try to find existing variant by barcode
    const barcodeRes = await client.query(
        `SELECT v.id FROM barcodes b JOIN variants v ON v.id = b.variant_id WHERE b.barcode = $1 LIMIT 1`,
        [trimmed]
    );

    if (barcodeRes.rows[0]?.id) {
        const variantId = String(barcodeRes.rows[0].id);
        await ensureRetailerVariantLink(client, storeId, variantId);
        return variantId;
    }

    // Try to find global product by barcode identifier
    const globalRes = await client.query(
        `SELECT gpi.global_product_id FROM global_product_identifiers gpi WHERE gpi.normalized_value = $1 OR gpi.raw_value = $1 LIMIT 1`,
        [trimmed]
    );

    if (globalRes.rows[0]?.global_product_id) {
        const globalProductId = String(globalRes.rows[0].global_product_id);
        return resolveVariantForGlobalProduct({
            client,
            storeId,
            globalProductId,
            fallbackName,
            currency
        });
    }

    return null;
}
async function getStore(storeId) {
    const pool = (0, client_1.getPool)();
    if (!pool)
        return null;
    const res = await pool.query(`SELECT id, name, upi_vpa, active FROM stores WHERE id = $1`, [storeId]);
    return res.rows[0] ?? null;
}
async function getSale(storeId, saleId) {
    const pool = (0, client_1.getPool)();
    if (!pool)
        return null;
    const res = await pool.query(`SELECT id, store_id, bill_ref, total_minor FROM sales WHERE id = $1 AND store_id = $2`, [saleId, storeId]);
    return res.rows[0] ?? null;
}
exports.posSalesRouter.get("/bills", deviceToken_1.requireDeviceToken, async (req, res) => {
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const limitRaw = typeof req.query.limit === "string" ? Number(req.query.limit) : 50;
    const offsetRaw = typeof req.query.offset === "string" ? Number(req.query.offset) : 0;
    const limit = Number.isFinite(limitRaw) ? Math.min(200, Math.max(1, Math.floor(limitRaw))) : 50;
    const offset = Number.isFinite(offsetRaw) ? Math.max(0, Math.floor(offsetRaw)) : 0;
    const { storeId } = req.posDevice;
    try {
        const rows = await pool.query(`
      SELECT id, bill_ref, total_minor, status, created_at, currency
      FROM sales
      WHERE store_id = $1 AND status NOT IN ('CREATED', 'PENDING', 'CANCELLED')
      ORDER BY created_at DESC
      LIMIT $2 OFFSET $3
      `, [storeId, limit, offset]);
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
    }
    catch (error) {
        return res.status(500).json({ error: "failed to load bills" });
    }
});
exports.posSalesRouter.get("/bills/:saleId", deviceToken_1.requireDeviceToken, async (req, res) => {
    const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
    if (!saleId) {
        return res.status(400).json({ error: "saleId is required" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId } = req.posDevice;
    try {
        const saleRes = await pool.query(`
      SELECT id, store_id, bill_ref, subtotal_minor, discount_minor, total_minor, status, created_at, currency
      FROM sales
      WHERE id = $1 AND store_id = $2
      `, [saleId, storeId]);
        const sale = saleRes.rows[0];
        if (!sale) {
            return res.status(404).json({ error: "bill_not_found" });
        }
        const itemRes = await pool.query(`
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
      `, [saleId, storeId]);
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
    }
    catch (error) {
        return res.status(500).json({ error: "failed to load bill" });
    }
});
async function getPaymentStoreStatus(storeId, paymentId) {
    const pool = (0, client_1.getPool)();
    if (!pool)
        return null;
    const res = await pool.query(`
      SELECT p.sale_id, s.store_id, st.active
      FROM payments p
      JOIN sales s ON s.id = p.sale_id
      JOIN stores st ON st.id = s.store_id
      WHERE p.id = $1 AND s.store_id = $2
    `, [paymentId, storeId]);
    return res.rows[0] ?? null;
}
async function getCollectionStoreStatus(storeId, collectionId) {
    const pool = (0, client_1.getPool)();
    if (!pool)
        return null;
    const res = await pool.query(`
      SELECT c.store_id, st.active
      FROM collections c
      JOIN stores st ON st.id = c.store_id
      WHERE c.id = $1 AND c.store_id = $2
    `, [collectionId, storeId]);
    return res.rows[0] ?? null;
}
exports.posSalesRouter.post("/sales", deviceToken_1.requireDeviceToken, async (req, res) => {
    const { items, discountMinor, currency, saleId: requestedSaleIdRaw } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: "items are required" });
    }
    const cleanedItems = items.map((item) => {
        const explicitVariantId = asTrimmedString(item.retailerVariantId) ??
            asTrimmedString(item.retailer_variant_id) ??
            asTrimmedString(item.variantId);
        const productId = asTrimmedString(item.productId);
        const globalProductId = asTrimmedString(item.globalProductId) ?? asTrimmedString(item.global_product_id);
        const quantity = typeof item.quantity === "number" && Number.isFinite(item.quantity)
            ? Math.round(item.quantity)
            : NaN;
        const priceMinor = typeof item.priceMinor === "number" && Number.isFinite(item.priceMinor)
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
    const MAX_QUANTITY = 100000;
    const MAX_PRICE_MINOR = 100000000;
    const invalidItem = cleanedItems.find((item) => (!item.explicitVariantId && !item.productId && !item.globalProductId) ||
        !Number.isFinite(item.quantity) ||
        item.quantity <= 0 ||
        item.quantity > MAX_QUANTITY ||
        !Number.isFinite(item.priceMinor) ||
        item.priceMinor <= 0 ||
        item.priceMinor > MAX_PRICE_MINOR);
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
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId, deviceId } = req.posDevice;
    const store = await getStore(storeId);
    if (!store) {
        return res.status(404).json({ error: "store not found" });
    }
    if (requestedSaleId) {
        const existing = await pool.query(`
      SELECT id, bill_ref, subtotal_minor, discount_minor, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      LIMIT 1
      `, [requestedSaleId, storeId]);
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
    const saleId = requestedSaleId ?? (0, crypto_1.randomUUID)();
    let billRef = buildBillRef();
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
        const resolvedItems = [];
        // PATCHED: UUID validation + barcode fallback
        for (const item of cleanedItems) {
            let variantId = null;
            if (item.explicitVariantId) {
                variantId = item.explicitVariantId;
            }
            else if (item.globalProductId && isValidUUID(item.globalProductId)) {
                variantId = await resolveVariantForGlobalProduct({
                    client,
                    storeId,
                    globalProductId: item.globalProductId,
                    fallbackName: item.name ?? null,
                    currency: saleCurrency
                });
            }
            else if (item.productId && isValidUUID(item.productId)) {
                if (await variantExists(client, item.productId)) {
                    variantId = item.productId;
                }
                else {
                    variantId = await resolveVariantForGlobalProduct({
                        client,
                        storeId,
                        globalProductId: item.productId,
                        fallbackName: item.name ?? null,
                        currency: saleCurrency
                    });
                }
            }
            else if (item.barcode) {
                // productId is not a valid UUID - try barcode resolution
                variantId = await resolveVariantByBarcode(
                    client,
                    storeId,
                    item.barcode,
                    item.name ?? null,
                    saleCurrency
                );
            }
            else if (item.productId) {
                // Last resort: productId might be a barcode (offline items)
                variantId = await resolveVariantByBarcode(
                    client,
                    storeId,
                    item.productId,
                    item.name ?? null,
                    saleCurrency
                );
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
        await (0, inventoryLedgerService_1.ensureStoreInventoryAvailability)({
            client,
            storeId,
            items: resolvedItems.map((item) => ({
                variantId: item.variantId,
                quantity: item.quantity,
                globalProductId: item.globalProductId ?? undefined,
                name: item.name ?? null
            }))
        });
        await (0, inventoryService_1.ensureSaleAvailability)({
            client,
            storeId,
            items: resolvedItems.map((item) => ({ variantId: item.variantId, quantity: item.quantity }))
        });
        const variantRes = await client.query(`
      SELECT v.id, v.name, b.barcode AS supermandi_barcode
      FROM variants v
      LEFT JOIN barcodes b
        ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
      WHERE v.id = ANY($1::text[])
      `, [resolvedItems.map((item) => item.variantId)]);
        const variantMap = new Map();
        for (const row of variantRes.rows) {
            variantMap.set(String(row.id), {
                name: String(row.name ?? ""),
                barcode: row.supermandi_barcode ? String(row.supermandi_barcode) : null
            });
        }
        for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
                const inserted = await client.query(`
          INSERT INTO sales (id, store_id, device_id, bill_ref, subtotal_minor, discount_minor, total_minor, status, currency)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          ON CONFLICT (id) DO NOTHING
          RETURNING id
          `, [saleId, storeId, deviceId, billRef, subtotal, discount, total, "PENDING", saleCurrency]);
                if ((inserted.rowCount ?? 0) > 0) {
                    break;
                }
                const existing = await client.query(`
          SELECT id, bill_ref, subtotal_minor, discount_minor, total_minor
          FROM sales
          WHERE id = $1 AND store_id = $2
          LIMIT 1
          `, [saleId, storeId]);
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
            }
            catch (error) {
                billRef = buildBillRef();
                if (attempt === 2) {
                    throw error;
                }
            }
        }
        for (const item of resolvedItems) {
            const fallback = variantMap.get(item.variantId);
            const itemName = typeof item.name === "string" && item.name.trim()
                ? item.name.trim()
                : fallback?.name
                    ? fallback.name
                    : `Item ${item.variantId.slice(-4)}`;
            const itemBarcode = typeof item.barcode === "string" && item.barcode.trim()
                ? item.barcode.trim()
                : fallback?.barcode ?? null;
            const lineTotal = item.priceMinor * item.quantity;
            await client.query(`
        INSERT INTO sale_items (id, sale_id, variant_id, quantity, price_minor, line_total_minor, item_name, barcode)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `, [
                (0, crypto_1.randomUUID)(),
                saleId,
                item.variantId,
                item.quantity,
                item.priceMinor,
                lineTotal,
                itemName,
                itemBarcode
            ]);
        }
        await (0, inventoryLedgerService_1.recordSaleInventoryMovements)({
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
        await client.query("COMMIT");
    }
    catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof inventoryLedgerService_1.InsufficientStockError) {
            const message = error.details.length === 1
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
    }
    finally {
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
exports.posSalesRouter.post("/sales/:saleId/confirm", deviceToken_1.requireDeviceToken, async (req, res) => {
    const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
    if (!saleId) {
        return res.status(400).json({ error: "saleId is required" });
    }
    const { paymentMode } = req.body;
    if (!paymentMode || !["CASH", "UPI", "DUE"].includes(paymentMode)) {
        return res.status(400).json({ error: "paymentMode is required (CASH, UPI, or DUE)" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId } = req.posDevice;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
        const saleRes = await client.query(`
      SELECT id, store_id, status, subtotal_minor, discount_minor, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      `, [saleId, storeId]);
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
        const itemsRes = await client.query(`
      SELECT variant_id, quantity
      FROM sale_items
      WHERE sale_id = $1
      `, [saleId]);
        const items = itemsRes.rows.map((row) => ({
            variantId: String(row.variant_id),
            quantity: Number(row.quantity ?? 0)
        }));
        await (0, inventoryLedgerService_1.ensureStoreInventoryAvailability)({
            client,
            storeId,
            items: items.map((item) => ({
                variantId: item.variantId,
                quantity: item.quantity,
                globalProductId: null,
                name: null
            }))
        });
        await (0, inventoryService_1.applyBulkDeductions)({
            client,
            storeId,
            items
        });
        const newStatus = paymentMode === "CASH" ? "PAID_CASH" : paymentMode === "UPI" ? "PAID_UPI" : "DUE";
        await client.query(`UPDATE sales SET status = $1 WHERE id = $2`, [newStatus, saleId]);
        await client.query("COMMIT");
        return res.json({
            saleId,
            status: newStatus,
            message: "Payment confirmed and stock deducted"
        });
    }
    catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof inventoryLedgerService_1.InsufficientStockError) {
            const message = error.details.length === 1
                ? error.details[0].message
                : "Stock changed since sale was created.";
            return res.status(409).json({
                error: "insufficient_stock",
                message,
                details: error.details
            });
        }
        return res.status(500).json({ error: "failed to confirm payment" });
    }
    finally {
        client.release();
    }
});
exports.posSalesRouter.post("/sales/:saleId/cancel", deviceToken_1.requireDeviceToken, async (req, res) => {
    const saleId = typeof req.params.saleId === "string" ? req.params.saleId.trim() : "";
    if (!saleId) {
        return res.status(400).json({ error: "saleId is required" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId } = req.posDevice;
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        const saleRes = await client.query(`
      SELECT id, store_id, status
      FROM sales
      WHERE id = $1 AND store_id = $2
      `, [saleId, storeId]);
        const sale = saleRes.rows[0];
        if (!sale) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "sale_not_found" });
        }
        if (sale.status !== "PENDING") {
            await client.query("ROLLBACK");
            return res.status(409).json({
                error: "cannot_cancel",
                message: `Cannot cancel sale in ${sale.status} status`
            });
        }
        await client.query(`UPDATE sales SET status = 'CANCELLED' WHERE id = $1`, [saleId]);
        await client.query("COMMIT");
        return res.json({
            saleId,
            status: "CANCELLED",
            message: "Sale cancelled successfully"
        });
    }
    catch (error) {
        await client.query("ROLLBACK");
        return res.status(500).json({ error: "failed to cancel sale" });
    }
    finally {
        client.release();
    }
});
exports.posSalesRouter.post("/payments/upi/init", deviceToken_1.requireDeviceToken, async (req, res) => {
    const { saleId, transactionId, upiIntent } = req.body;
    if (typeof saleId !== "string" || saleId.trim().length === 0) {
        return res.status(400).json({ error: "saleId is required" });
    }
    if (typeof upiIntent === "string" && upiIntent.trim().length > 0) {
        return res.status(400).json({ error: "upi_intent_not_allowed" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId, deviceId } = req.posDevice;
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
    const providerRef = typeof transactionId === "string" && transactionId.trim().length > 0
        ? transactionId.trim()
        : null;
    const paymentId = (0, crypto_1.randomUUID)();
    await pool.query(`
    INSERT INTO payments (id, sale_id, mode, status, amount_minor, provider_ref)
    VALUES ($1, $2, $3, $4, $5, $6)
    `, [paymentId, saleId, "UPI", "PENDING", sale.total_minor, providerRef]);
    return res.json({
        paymentId,
        saleId,
        billRef: sale.bill_ref,
        amountMinor: sale.total_minor,
        storeName: store.name,
        upiVpa: store.upi_vpa
    });
});
exports.posSalesRouter.post("/payments/upi/confirm-manual", deviceToken_1.requireDeviceToken, async (req, res) => {
    const { paymentId } = req.body;
    if (typeof paymentId !== "string" || paymentId.trim().length === 0) {
        return res.status(400).json({ error: "paymentId is required" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId, deviceId } = req.posDevice;
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
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
        const paymentRes = await client.query(`
      SELECT id, sale_id
      FROM payments
      WHERE id = $1
      `, [paymentId]);
        const payment = paymentRes.rows[0];
        if (!payment) {
            await client.query("ROLLBACK");
            return res.status(404).json({ error: "payment not found" });
        }
        const saleId = String(payment.sale_id);
        const saleRes = await client.query(`
      SELECT id, store_id, status, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      `, [saleId, storeId]);
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
        const itemsRes = await client.query(`
      SELECT variant_id, quantity
      FROM sale_items
      WHERE sale_id = $1
      `, [saleId]);
        const items = itemsRes.rows.map((row) => ({
            variantId: String(row.variant_id),
            quantity: Number(row.quantity ?? 0)
        }));
        await (0, inventoryLedgerService_1.ensureStoreInventoryAvailability)({
            client,
            storeId,
            items: items.map((item) => ({
                variantId: item.variantId,
                quantity: item.quantity,
                globalProductId: null,
                name: null
            }))
        });
        await (0, inventoryService_1.applyBulkDeductions)({
            client,
            storeId,
            items
        });
        await client.query(`
      UPDATE payments
      SET status = 'PAID', confirmed_at = NOW()
      WHERE id = $1
      `, [paymentId]);
        await client.query(`UPDATE sales SET status = 'PAID_UPI' WHERE id = $1`, [saleId]);
        await client.query("COMMIT");
        return res.json({ status: "PAID" });
    }
    catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof inventoryLedgerService_1.InsufficientStockError) {
            const message = error.details.length === 1
                ? error.details[0].message
                : "Stock changed since sale was created.";
            return res.status(409).json({
                error: "insufficient_stock",
                message,
                details: error.details
            });
        }
        return res.status(500).json({ error: "failed to confirm payment" });
    }
    finally {
        client.release();
    }
});
exports.posSalesRouter.post("/payments/cash", deviceToken_1.requireDeviceToken, async (req, res) => {
    const { saleId } = req.body;
    if (typeof saleId !== "string" || saleId.trim().length === 0) {
        return res.status(400).json({ error: "saleId is required" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId, deviceId } = req.posDevice;
    const store = await getStore(storeId);
    if (!store) {
        return res.status(404).json({ error: "store not found" });
    }
    if (!store.active) {
        return res.status(403).json({ error: "store_inactive" });
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
        const saleRes = await client.query(`
      SELECT id, store_id, status, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      `, [saleId, storeId]);
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
        const itemsRes = await client.query(`
      SELECT variant_id, quantity
      FROM sale_items
      WHERE sale_id = $1
      `, [saleId]);
        const items = itemsRes.rows.map((row) => ({
            variantId: String(row.variant_id),
            quantity: Number(row.quantity ?? 0)
        }));
        await (0, inventoryLedgerService_1.ensureStoreInventoryAvailability)({
            client,
            storeId,
            items: items.map((item) => ({
                variantId: item.variantId,
                quantity: item.quantity,
                globalProductId: null,
                name: null
            }))
        });
        await (0, inventoryService_1.applyBulkDeductions)({
            client,
            storeId,
            items
        });
        const paymentId = (0, crypto_1.randomUUID)();
        await client.query(`
      INSERT INTO payments (id, sale_id, mode, status, amount_minor)
      VALUES ($1, $2, $3, $4, $5)
      `, [paymentId, saleId, "CASH", "PAID", sale.total_minor]);
        const paymentVerify = await client.query(`
      SELECT p.id FROM payments p
      JOIN sales s ON s.id = p.sale_id
      WHERE p.id = $1 AND s.store_id = $2
      `, [paymentId, storeId]);
        if (!paymentVerify.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(500).json({ error: "payment_store_mismatch" });
        }
        await client.query(`UPDATE sales SET status = 'PAID_CASH' WHERE id = $1`, [saleId]);
        await client.query("COMMIT");
        return res.json({ status: "PAID" });
    }
    catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof inventoryLedgerService_1.InsufficientStockError) {
            const message = error.details.length === 1
                ? error.details[0].message
                : "Stock changed since sale was created.";
            return res.status(409).json({
                error: "insufficient_stock",
                message,
                details: error.details
            });
        }
        return res.status(500).json({ error: "failed to process payment" });
    }
    finally {
        client.release();
    }
});
exports.posSalesRouter.post("/payments/due", deviceToken_1.requireDeviceToken, async (req, res) => {
    const { saleId } = req.body;
    if (typeof saleId !== "string" || saleId.trim().length === 0) {
        return res.status(400).json({ error: "saleId is required" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId, deviceId } = req.posDevice;
    const store = await getStore(storeId);
    if (!store) {
        return res.status(404).json({ error: "store not found" });
    }
    if (!store.active) {
        return res.status(403).json({ error: "store_inactive" });
    }
    const client = await pool.connect();
    try {
        await client.query("BEGIN");
        await client.query("SET TRANSACTION ISOLATION LEVEL SERIALIZABLE");
        const saleRes = await client.query(`
      SELECT id, store_id, status, total_minor
      FROM sales
      WHERE id = $1 AND store_id = $2
      `, [saleId, storeId]);
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
        const itemsRes = await client.query(`
      SELECT variant_id, quantity
      FROM sale_items
      WHERE sale_id = $1
      `, [saleId]);
        const items = itemsRes.rows.map((row) => ({
            variantId: String(row.variant_id),
            quantity: Number(row.quantity ?? 0)
        }));
        await (0, inventoryLedgerService_1.ensureStoreInventoryAvailability)({
            client,
            storeId,
            items: items.map((item) => ({
                variantId: item.variantId,
                quantity: item.quantity,
                globalProductId: null,
                name: null
            }))
        });
        await (0, inventoryService_1.applyBulkDeductions)({
            client,
            storeId,
            items
        });
        const paymentId = (0, crypto_1.randomUUID)();
        await client.query(`
      INSERT INTO payments (id, sale_id, mode, status, amount_minor)
      VALUES ($1, $2, $3, $4, $5)
      `, [paymentId, saleId, "DUE", "DUE", sale.total_minor]);
        const paymentVerify = await client.query(`
      SELECT p.id FROM payments p
      JOIN sales s ON s.id = p.sale_id
      WHERE p.id = $1 AND s.store_id = $2
      `, [paymentId, storeId]);
        if (!paymentVerify.rows[0]) {
            await client.query("ROLLBACK");
            return res.status(500).json({ error: "payment_store_mismatch" });
        }
        await client.query(`UPDATE sales SET status = 'DUE' WHERE id = $1`, [saleId]);
        await client.query("COMMIT");
        return res.json({ status: "DUE" });
    }
    catch (error) {
        await client.query("ROLLBACK");
        if (error instanceof inventoryLedgerService_1.InsufficientStockError) {
            const message = error.details.length === 1
                ? error.details[0].message
                : "Stock changed since sale was created.";
            return res.status(409).json({
                error: "insufficient_stock",
                message,
                details: error.details
            });
        }
        return res.status(500).json({ error: "failed to process payment" });
    }
    finally {
        client.release();
    }
});
exports.posSalesRouter.post("/collections/upi/init", deviceToken_1.requireDeviceToken, async (req, res) => {
    const { amountMinor, reference, transactionId, upiIntent } = req.body;
    if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor) || amountMinor <= 0) {
        return res.status(400).json({ error: "amountMinor is required" });
    }
    if (typeof upiIntent === "string" && upiIntent.trim().length > 0) {
        return res.status(400).json({ error: "upi_intent_not_allowed" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId, deviceId } = req.posDevice;
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
    const normalizedReference = reference && reference.trim().length > 0
        ? reference.trim()
        : typeof transactionId === "string" && transactionId.trim().length > 0
            ? transactionId.trim()
            : null;
    const collectionId = (0, crypto_1.randomUUID)();
    await pool.query(`
    INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [collectionId, storeId, deviceId, Math.round(amountMinor), "UPI", normalizedReference, "PENDING"]);
    return res.json({
        collectionId,
        amountMinor,
        storeName: store.name,
        upiVpa: store.upi_vpa
    });
});
exports.posSalesRouter.post("/collections/upi/confirm-manual", deviceToken_1.requireDeviceToken, async (req, res) => {
    const { collectionId } = req.body;
    if (typeof collectionId !== "string" || collectionId.trim().length === 0) {
        return res.status(400).json({ error: "collectionId is required" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId, deviceId } = req.posDevice;
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
    const updated = await pool.query(`
    UPDATE collections
    SET status = 'PAID'
    WHERE id = $1
    RETURNING id
    `, [collectionId]);
    if (updated.rowCount === 0) {
        return res.status(404).json({ error: "collection not found" });
    }
    return res.json({ status: "PAID" });
});
exports.posSalesRouter.post("/collections/cash", deviceToken_1.requireDeviceToken, async (req, res) => {
    const { amountMinor, reference } = req.body;
    if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor) || amountMinor <= 0) {
        return res.status(400).json({ error: "amountMinor is required" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId, deviceId } = req.posDevice;
    const store = await getStore(storeId);
    if (!store) {
        return res.status(404).json({ error: "store not found" });
    }
    if (!store.active) {
        return res.status(403).json({ error: "store_inactive" });
    }
    const collectionId = (0, crypto_1.randomUUID)();
    await pool.query(`
    INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [collectionId, storeId, deviceId, Math.round(amountMinor), "CASH", reference ?? null, "PAID"]);
    return res.json({ status: "PAID", collectionId });
});
exports.posSalesRouter.post("/collections/due", deviceToken_1.requireDeviceToken, async (req, res) => {
    const { amountMinor, reference } = req.body;
    if (typeof amountMinor !== "number" || !Number.isFinite(amountMinor) || amountMinor <= 0) {
        return res.status(400).json({ error: "amountMinor is required" });
    }
    const pool = (0, client_1.getPool)();
    if (!pool)
        return res.status(503).json({ error: "database unavailable" });
    const { storeId, deviceId } = req.posDevice;
    const store = await getStore(storeId);
    if (!store) {
        return res.status(404).json({ error: "store not found" });
    }
    if (!store.active) {
        return res.status(403).json({ error: "store_inactive" });
    }
    const collectionId = (0, crypto_1.randomUUID)();
    await pool.query(`
    INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    `, [collectionId, storeId, deviceId, Math.round(amountMinor), "DUE", reference ?? null, "DUE"]);
    return res.json({ status: "DUE", collectionId });
});
