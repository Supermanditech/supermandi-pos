import { randomUUID } from "crypto";
import { Router } from "express";
import type { PoolClient } from "pg";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";

export const posSyncRouter = Router();

type SyncEvent = {
  eventId?: unknown;
  type?: unknown;
  payload?: unknown;
  createdAt?: unknown;
};

type SyncResult = {
  eventId: string;
  status: "applied" | "duplicate_ignored" | "rejected";
  error?: string;
};

type DiscountInput = {
  type: "percentage" | "fixed";
  value: number;
  reason?: string;
};

type NormalizedDiscount = {
  type: "percentage" | "fixed";
  value: number;
  reason?: string;
};

function asTrimmedString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function buildBillRef(): string {
  const ts = Date.now().toString().slice(-6);
  const rand = Math.floor(100 + Math.random() * 900).toString();
  return `${ts}${rand}`;
}

function normalizeDiscount(discount: DiscountInput | null | undefined): NormalizedDiscount | null {
  if (!discount) return null;
  if (discount.type !== "percentage" && discount.type !== "fixed") return null;
  const value = Number(discount.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { type: discount.type, value, reason: discount.reason };
}

function calculateDiscountAmount(baseAmount: number, discount: NormalizedDiscount | null): number {
  if (!discount) return 0;
  const safeBase = Math.max(0, Math.round(baseAmount));
  const safeValue = Math.max(0, Number.isFinite(discount.value) ? discount.value : 0);

  if (discount.type === "percentage") {
    return Math.min(Math.round(safeBase * (safeValue / 100)), safeBase);
  }
  return Math.min(Math.round(safeValue), safeBase);
}

async function ensureProductByBarcode(
  client: PoolClient,
  params: {
    barcode: string;
    name?: string | null;
    currency?: string | null;
  }
): Promise<string> {
  const existing = await client.query(`SELECT id FROM products WHERE barcode = $1`, [params.barcode]);
  if (existing.rows[0]?.id) return existing.rows[0].id as string;

  const id = randomUUID();
  const suffix = params.barcode.slice(-4);
  const name = params.name?.trim() || `Item ${suffix || params.barcode}`;
  const currency = params.currency?.trim() || "INR";

  await client.query(
    `
    INSERT INTO products (id, barcode, name, currency, retailer_status, enrichment_status)
    VALUES ($1, $2, $3, $4, $5, $6)
    `,
    [id, params.barcode, name, currency, "retailer_created", "pending_enrichment"]
  );

  return id;
}

async function ensureRetailerProduct(
  client: PoolClient,
  params: {
    storeId: string;
    productId: string;
  }
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
  params: {
    storeId: string;
    productId: string;
    priceMinor: number;
  }
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
  params: {
    storeId: string;
    productId: string;
    quantity: number;
  }
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

async function upsertDeviceHeartbeat(params: {
  deviceId: string;
  storeId: string;
  pendingOutboxCount?: number | null;
}): Promise<void> {
  const pool = getPool();
  if (!pool) return;
  await pool.query(
    `
    INSERT INTO pos_devices (id, store_id, last_seen_online, pending_outbox_count, updated_at)
    VALUES ($1, $2, NOW(), COALESCE($3, 0), NOW())
    ON CONFLICT (id) DO UPDATE SET
      store_id = EXCLUDED.store_id,
      last_seen_online = EXCLUDED.last_seen_online,
      pending_outbox_count = CASE
        WHEN $3 IS NULL THEN pos_devices.pending_outbox_count
        ELSE EXCLUDED.pending_outbox_count
      END,
      updated_at = NOW()
    `,
    [params.deviceId, params.storeId, params.pendingOutboxCount ?? null]
  );
}

// POST /api/v1/pos/sync
posSyncRouter.post("/sync", requireDeviceToken, async (req, res) => {
  const pendingRaw = asNumber(req.body?.pendingOutboxCount);
  const pendingOutboxCount = pendingRaw !== null && pendingRaw >= 0 ? Math.round(pendingRaw) : null;

  const rawEvents = req.body?.events;
  if (!Array.isArray(rawEvents)) {
    return res.status(400).json({ error: "events must be an array" });
  }
  const events = rawEvents as SyncEvent[];

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const { deviceId, storeId } = (req as any).posDevice as { deviceId: string; storeId: string };

  await upsertDeviceHeartbeat({ deviceId, storeId, pendingOutboxCount });

  const results: SyncResult[] = [];
  const saleMappings: Array<{
    saleId: string;
    localSaleId: string;
    serverSaleId: string;
    billRef: string;
    offlineReceiptRef?: string | null;
  }> = [];
  const collectionMappings: Array<{ collectionId: string; serverCollectionId: string }> = [];

  const client = await pool.connect();
  try {
    for (const raw of events) {
      const eventId = asTrimmedString(raw?.eventId);
      const type = asTrimmedString(raw?.type);
      const payload = raw?.payload ?? {};

      if (!eventId || !type) {
        results.push({ eventId: eventId ?? "unknown", status: "rejected", error: "invalid event" });
        continue;
      }

      try {
        await client.query("BEGIN");
        const inserted = await client.query(
          `
          INSERT INTO processed_events (event_id, device_id, store_id, event_type)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (event_id) DO NOTHING
          RETURNING event_id
          `,
          [eventId, deviceId, storeId, type]
        );

        if (inserted.rowCount === 0) {
          await client.query("ROLLBACK");
          results.push({ eventId, status: "duplicate_ignored" });

          if (type === "SALE_CREATED") {
            const saleId = asTrimmedString((payload as any)?.saleId);
            if (saleId) {
              const saleRow = await client.query(
                `SELECT id, bill_ref, offline_receipt_ref FROM sales WHERE id = $1`,
                [saleId]
              );
              const sale = saleRow.rows[0];
              if (sale) {
                saleMappings.push({
                  saleId,
                  localSaleId: saleId,
                  serverSaleId: sale.id,
                  billRef: sale.bill_ref,
                  offlineReceiptRef: sale.offline_receipt_ref ?? null
                });
              }
            }
          }
          if (type === "COLLECTION_CREATED") {
            const collectionId = asTrimmedString((payload as any)?.collectionId);
            if (collectionId) {
              const collectionRow = await client.query(`SELECT id FROM collections WHERE id = $1`, [collectionId]);
              if (collectionRow.rows[0]) {
                collectionMappings.push({ collectionId, serverCollectionId: collectionId });
              }
            }
          }
          continue;
        }

        if (type === "PRODUCT_UPSERT") {
          const barcode = asTrimmedString((payload as any)?.barcode);
          const name = asTrimmedString((payload as any)?.name);
          const currency = asTrimmedString((payload as any)?.currency) ?? "INR";
          if (!barcode) {
            throw new Error("barcode is required");
          }
          const productId = await ensureProductByBarcode(client, { barcode, name, currency });
          await ensureRetailerProduct(client, { storeId, productId });
        } else if (type === "PRODUCT_PRICE_SET") {
          const barcode = asTrimmedString((payload as any)?.barcode);
          const priceMinorRaw = asNumber((payload as any)?.priceMinor);
          const priceMinor = priceMinorRaw === null ? null : Math.round(priceMinorRaw);
          if (!barcode || priceMinor === null || priceMinor <= 0) {
            throw new Error("invalid price");
          }
          const productId = await ensureProductByBarcode(client, { barcode, name: null, currency: "INR" });
          await upsertRetailerPrice(client, { storeId, productId, priceMinor });
        } else if (type === "SALE_CREATED") {
          const saleId = asTrimmedString((payload as any)?.saleId);
          const offlineReceiptRef =
            asTrimmedString((payload as any)?.offlineReceiptRef) ??
            asTrimmedString((payload as any)?.billRef);
          const items = Array.isArray((payload as any)?.items) ? (payload as any).items : [];
          const discountMinorRaw = asNumber((payload as any)?.discountMinor);
          const cartDiscountRaw = (payload as any)?.cartDiscount as DiscountInput | null | undefined;
          const normalizedCartDiscount = normalizeDiscount(cartDiscountRaw ?? null);
          if (cartDiscountRaw && !normalizedCartDiscount) {
            throw new Error("invalid cart discount");
          }
          const createdAt = asTrimmedString((payload as any)?.createdAt);

          if (!saleId || !offlineReceiptRef || items.length === 0) {
            throw new Error("invalid sale payload");
          }

          const existingSale = await client.query(
            `SELECT id, store_id, bill_ref, offline_receipt_ref FROM sales WHERE id = $1`,
            [saleId]
          );
          if ((existingSale.rowCount ?? 0) > 0) {
            const existing = existingSale.rows[0];
            if (existing.store_id !== storeId) {
              throw new Error("sale not found");
            }
            await client.query("COMMIT");
            results.push({ eventId, status: "duplicate_ignored" });
            saleMappings.push({
              saleId,
              localSaleId: saleId,
              serverSaleId: existing.id,
              billRef: existing.bill_ref,
              offlineReceiptRef: existing.offline_receipt_ref ?? offlineReceiptRef
            });
            continue;
          }

          let computedSubtotal = 0;
          let itemDiscountMinor = 0;
          const computedItems = items.map((item: any) => {
            const qtyRaw = asNumber(item?.quantity);
            const priceRaw = asNumber(item?.priceMinor);
            const qty = qtyRaw === null ? 0 : Math.round(qtyRaw);
            const price = priceRaw === null ? 0 : Math.round(priceRaw);
            const discount = normalizeDiscount(item?.itemDiscount ?? null);
            if (item?.itemDiscount && !discount) {
              throw new Error("invalid item discount");
            }
            const lineSubtotal = qty * price;
            const lineDiscount = calculateDiscountAmount(lineSubtotal, discount);
            const lineTotal = Math.max(0, lineSubtotal - lineDiscount);
            computedSubtotal += lineSubtotal;
            itemDiscountMinor += lineDiscount;
            return {
              ...item,
              quantity: qty,
              priceMinor: price,
              lineSubtotal,
              lineDiscount,
              lineTotal,
              discount
            };
          });

          const fallbackCartDiscount =
            normalizedCartDiscount ??
            (discountMinorRaw !== null && discountMinorRaw > 0
              ? { type: "fixed", value: Math.round(discountMinorRaw) }
              : null);
          const cartDiscountMinor = calculateDiscountAmount(
            Math.max(0, computedSubtotal - itemDiscountMinor),
            fallbackCartDiscount
          );
          const discountMinor = itemDiscountMinor + cartDiscountMinor;
          const computedTotal = Math.max(0, computedSubtotal - discountMinor);

          let billRef = buildBillRef();
          let insertedSale = false;
          for (let attempt = 0; attempt < 3; attempt += 1) {
            try {
              await client.query(
                `
                INSERT INTO sales (
                  id,
                  store_id,
                  device_id,
                  bill_ref,
                  offline_receipt_ref,
                  subtotal_minor,
                  item_discount_minor,
                  cart_discount_minor,
                  cart_discount_type,
                  cart_discount_value,
                  discount_minor,
                  total_minor,
                  status,
                  created_at
                )
                VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, COALESCE($14, NOW()))
                `,
                [
                  saleId,
                  storeId,
                  deviceId,
                  billRef,
                  offlineReceiptRef,
                  computedSubtotal,
                  itemDiscountMinor,
                  cartDiscountMinor,
                  fallbackCartDiscount?.type ?? null,
                  fallbackCartDiscount?.value ?? null,
                  discountMinor,
                  computedTotal,
                  "CREATED",
                  createdAt
                ]
              );
              insertedSale = true;
              break;
            } catch (error) {
              billRef = buildBillRef();
              if (attempt === 2) {
                throw error;
              }
            }
          }

          if (!insertedSale) {
            throw new Error("failed to insert sale");
          }

          for (const item of computedItems) {
            const barcode = asTrimmedString(item?.barcode);
            const name = asTrimmedString(item?.name);
            const quantityRaw = asNumber(item?.quantity);
            const priceMinorRaw = asNumber(item?.priceMinor);
            const quantity = quantityRaw === null ? null : Math.round(quantityRaw);
            const priceMinor = priceMinorRaw === null ? null : Math.round(priceMinorRaw);

            if (!barcode || quantity === null || quantity <= 0 || priceMinor === null || priceMinor <= 0) {
              throw new Error("invalid sale item");
            }

            const productId = await ensureProductByBarcode(client, { barcode, name, currency: "INR" });
            await ensureRetailerProduct(client, { storeId, productId });

            await client.query(
              `
              INSERT INTO sale_items (
                id,
                sale_id,
                product_id,
                quantity,
                price_minor,
                line_subtotal_minor,
                discount_type,
                discount_value,
                discount_minor,
                line_total_minor
              )
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
              `,
              [
                randomUUID(),
                saleId,
                productId,
                quantity,
                priceMinor,
                item.lineSubtotal,
                item.discount?.type ?? null,
                item.discount?.value ?? null,
                item.lineDiscount,
                item.lineTotal
              ]
            );
          }

          const saleRow = await client.query(
            `SELECT bill_ref, offline_receipt_ref FROM sales WHERE id = $1`,
            [saleId]
          );
          const saleInfo = saleRow.rows[0];
          saleMappings.push({
            saleId,
            localSaleId: saleId,
            serverSaleId: saleId,
            billRef: saleInfo?.bill_ref ?? "",
            offlineReceiptRef: saleInfo?.offline_receipt_ref ?? offlineReceiptRef
          });
        } else if (type === "PAYMENT_CASH" || type === "PAYMENT_DUE") {
          const saleId = asTrimmedString((payload as any)?.saleId);
          const amountRaw = asNumber((payload as any)?.amountMinor);
          const amountMinor = amountRaw === null ? null : Math.round(amountRaw);
          if (!saleId || amountMinor === null || amountMinor <= 0) {
            throw new Error("invalid payment payload");
          }

          const saleRes = await client.query(`SELECT id, store_id FROM sales WHERE id = $1`, [saleId]);
          const sale = saleRes.rows[0];
          if (!sale || sale.store_id !== storeId) {
            throw new Error("sale not found");
          }

          const mode = type === "PAYMENT_CASH" ? "CASH" : "DUE";
          const status = mode === "CASH" ? "PAID" : "DUE";

          const existingPayment = await client.query(
            `SELECT id FROM payments WHERE sale_id = $1 AND mode = $2 AND status = $3 LIMIT 1`,
            [saleId, mode, status]
          );
          if ((existingPayment.rowCount ?? 0) === 0) {
            await client.query(
              `
              INSERT INTO payments (id, sale_id, mode, status, amount_minor)
              VALUES ($1, $2, $3, $4, $5)
              `,
              [randomUUID(), saleId, mode, status, amountMinor]
            );

            await client.query(`UPDATE sales SET status = $1 WHERE id = $2`, [
              mode === "CASH" ? "PAID_CASH" : "DUE",
              saleId
            ]);
          }
        } else if (type === "COLLECTION_CREATED") {
          const collectionId = asTrimmedString((payload as any)?.collectionId);
          const amountRaw = asNumber((payload as any)?.amountMinor);
          const amountMinor = amountRaw === null ? null : Math.round(amountRaw);
          const mode = asTrimmedString((payload as any)?.mode);
          const status = asTrimmedString((payload as any)?.status);
          const reference = asTrimmedString((payload as any)?.reference);
          const createdAt = asTrimmedString((payload as any)?.createdAt);

          if (!collectionId || amountMinor === null || amountMinor <= 0 || !mode || !status) {
            throw new Error("invalid collection payload");
          }

          const existing = await client.query(`SELECT id FROM collections WHERE id = $1`, [collectionId]);
          if ((existing.rowCount ?? 0) === 0) {
            await client.query(
              `
              INSERT INTO collections (id, store_id, device_id, amount_minor, mode, reference, status, created_at)
              VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE($8, NOW()))
              `,
              [collectionId, storeId, deviceId, amountMinor, mode, reference, status, createdAt]
            );
          }

          collectionMappings.push({ collectionId, serverCollectionId: collectionId });
        } else if (type === "PURCHASE_SUBMIT") {
          const purchaseId = asTrimmedString((payload as any)?.purchaseId);
          const supplierName = asTrimmedString((payload as any)?.supplierName);
          const items = Array.isArray((payload as any)?.items) ? (payload as any).items : [];
          const createdAt = asTrimmedString((payload as any)?.createdAt);

          if (!purchaseId || items.length === 0) {
            throw new Error("invalid purchase payload");
          }

          const existingPurchase = await client.query(
            `SELECT id, store_id FROM purchases WHERE id = $1`,
            [purchaseId]
          );
          if ((existingPurchase.rowCount ?? 0) > 0) {
            const existing = existingPurchase.rows[0];
            if (existing.store_id !== storeId) {
              throw new Error("purchase not found");
            }
            await client.query("COMMIT");
            results.push({ eventId, status: "duplicate_ignored" });
            continue;
          }

          const parsedItems: Array<{
            barcode: string;
            name: string;
            quantity: number;
            purchasePriceMinor: number;
            sellingPriceMinor: number;
            currency: string;
          }> = [];

          for (const item of items) {
            const barcode = asTrimmedString(item?.barcode);
            const name = asTrimmedString(item?.name);
            const quantityRaw = asNumber(item?.quantity);
            const purchasePriceRaw = asNumber(item?.purchasePriceMinor);
            const sellingPriceRaw = asNumber(item?.sellingPriceMinor);
            const currency = asTrimmedString(item?.currency) ?? "INR";

            const quantity = quantityRaw === null ? null : Math.round(quantityRaw);
            const purchasePriceMinor = purchasePriceRaw === null ? null : Math.round(purchasePriceRaw);
            const sellingPriceMinor = sellingPriceRaw === null ? null : Math.round(sellingPriceRaw);

            if (!barcode || !name || !name.trim()) {
              throw new Error("invalid purchase item");
            }
            if (!quantity || quantity <= 0) {
              throw new Error("invalid purchase item");
            }
            if (!purchasePriceMinor || purchasePriceMinor <= 0) {
              throw new Error("invalid purchase item");
            }
            if (!sellingPriceMinor || sellingPriceMinor <= 0) {
              throw new Error("invalid purchase item");
            }

            parsedItems.push({
              barcode,
              name,
              quantity,
              purchasePriceMinor,
              sellingPriceMinor,
              currency
            });
          }

          const currency = parsedItems[0]?.currency ?? "INR";
          if (parsedItems.some((item) => item.currency !== currency)) {
            throw new Error("mixed currencies are not supported");
          }

          const totalMinor = parsedItems.reduce(
            (sum, item) => sum + item.purchasePriceMinor * item.quantity,
            0
          );

          await client.query(
            `
            INSERT INTO purchases (id, store_id, supplier_name, total_minor, currency, created_at)
            VALUES ($1, $2, $3, $4, $5, COALESCE($6, NOW()))
            `,
            [purchaseId, storeId, supplierName ?? null, totalMinor, currency, createdAt]
          );

          for (const item of parsedItems) {
            const productId = await ensureProductByBarcode(client, {
              barcode: item.barcode,
              name: item.name,
              currency: item.currency
            });

            await ensureRetailerProduct(client, { storeId, productId });
            await upsertRetailerPrice(client, { storeId, productId, priceMinor: item.sellingPriceMinor });

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
        } else {
          throw new Error("unknown event type");
        }

        await client.query("COMMIT");
        results.push({ eventId, status: "applied" });
      } catch (error: any) {
        await client.query("ROLLBACK");
        results.push({ eventId, status: "rejected", error: error?.message ? String(error.message) : "rejected" });
      }
    }
  } finally {
    client.release();
  }

  await pool.query(
    `
    UPDATE pos_devices
    SET last_sync_at = NOW(),
        pending_outbox_count = COALESCE($2, pending_outbox_count),
        updated_at = NOW()
    WHERE id = $1
    `,
    [deviceId, pendingOutboxCount]
  );

  return res.json({ results, saleMappings, collectionMappings });
});
