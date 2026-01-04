import { randomUUID } from "crypto";
import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";
import { applyBulkDeductions, ensureSaleAvailability } from "../../../services/inventoryService";

export const posSalesRouter = Router();

type SaleItemInput = {
  productId: string;
  quantity: number;
  priceMinor: number;
  name?: string;
  barcode?: string;
};

type BillPaymentMode = "UPI" | "CASH" | "DUE" | "UNKNOWN";

function buildBillRef(): string {
  const ts = Date.now().toString().slice(-6);
  const rand = Math.floor(100 + Math.random() * 900).toString();
  return `${ts}${rand}`;
}

function resolvePaymentMode(status: string | null | undefined): BillPaymentMode {
  const normalized = (status ?? "").toUpperCase();
  if (normalized.includes("UPI")) return "UPI";
  if (normalized.includes("CASH")) return "CASH";
  if (normalized.includes("DUE")) return "DUE";
  return "UNKNOWN";
}

async function getStore(storeId: string): Promise<{ id: string; name: string; upi_vpa: string | null; active: boolean } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(`SELECT id, name, upi_vpa, active FROM stores WHERE id = $1`, [storeId]);
  return res.rows[0] ?? null;
}

async function getSale(saleId: string): Promise<{ id: string; store_id: string; bill_ref: string; total_minor: number } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `SELECT id, store_id, bill_ref, total_minor FROM sales WHERE id = $1`,
    [saleId]
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
      WHERE store_id = $1 AND status <> 'CREATED'
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
      LEFT JOIN variants v ON v.id = si.variant_id
      LEFT JOIN barcodes b ON b.variant_id = si.variant_id AND b.barcode_type = 'supermandi'
      WHERE si.sale_id = $1
      ORDER BY si.id ASC
      `,
      [saleId]
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

async function getPaymentStoreStatus(paymentId: string): Promise<{ sale_id: string; store_id: string; active: boolean } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `
      SELECT p.sale_id, s.store_id, st.active
      FROM payments p
      JOIN sales s ON s.id = p.sale_id
      JOIN stores st ON st.id = s.store_id
      WHERE p.id = $1
    `,
    [paymentId]
  );
  return res.rows[0] ?? null;
}

async function getCollectionStoreStatus(collectionId: string): Promise<{ store_id: string; active: boolean } | null> {
  const pool = getPool();
  if (!pool) return null;
  const res = await pool.query(
    `
      SELECT c.store_id, st.active
      FROM collections c
      JOIN stores st ON st.id = c.store_id
      WHERE c.id = $1
    `,
    [collectionId]
  );
  return res.rows[0] ?? null;
}

posSalesRouter.post("/sales", requireDeviceToken, async (req, res) => {
  const { items, discountMinor, currency } = req.body as {
    items?: SaleItemInput[];
    discountMinor?: number;
    currency?: string;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items are required" });
  }

  const cleanedItems = items.filter(
    (item) =>
      typeof item.productId === "string" &&
      item.productId.trim().length > 0 &&
      typeof item.quantity === "number" &&
      Number.isFinite(item.quantity) &&
      item.quantity > 0 &&
      typeof item.priceMinor === "number" &&
      Number.isFinite(item.priceMinor) &&
      item.priceMinor > 0
  );

  if (cleanedItems.length !== items.length) {
    return res.status(400).json({ error: "items are invalid" });
  }

  const discount = Math.max(0, Math.round(discountMinor ?? 0));
  const subtotal = cleanedItems.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
  const total = Math.max(0, subtotal - discount);
  const saleCurrency = typeof currency === "string" && currency.trim() ? currency.trim() : "INR";

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

  const saleId = randomUUID();
  let billRef = buildBillRef();

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    await ensureSaleAvailability({
      client,
      storeId,
      items: cleanedItems.map((item) => ({ variantId: item.productId, quantity: item.quantity }))
    });

    const variantRes = await client.query(
      `
      SELECT v.id, v.name, b.barcode AS supermandi_barcode
      FROM variants v
      LEFT JOIN barcodes b
        ON b.variant_id = v.id AND b.barcode_type = 'supermandi'
      WHERE v.id = ANY($1::text[])
      `,
      [cleanedItems.map((item) => item.productId)]
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
        await client.query(
          `
          INSERT INTO sales (id, store_id, device_id, bill_ref, subtotal_minor, discount_minor, total_minor, status, currency)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
          `,
          [saleId, storeId, deviceId, billRef, subtotal, discount, total, "CREATED", saleCurrency]
        );
        break;
      } catch (error) {
        billRef = buildBillRef();
        if (attempt === 2) {
          throw error;
        }
      }
    }

    for (const item of cleanedItems) {
      const fallback = variantMap.get(item.productId);
      const itemName =
        typeof item.name === "string" && item.name.trim()
          ? item.name.trim()
          : fallback?.name
          ? fallback.name
          : `Item ${item.productId.slice(-4)}`;
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
          item.productId,
          item.quantity,
          item.priceMinor,
          lineTotal,
          itemName,
          itemBarcode
        ]
      );
    }

    await applyBulkDeductions({
      client,
      storeId,
      items: cleanedItems.map((item) => ({ variantId: item.productId, quantity: item.quantity }))
    });

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    if (error instanceof Error && error.message === "insufficient_stock") {
      return res.status(409).json({ error: "insufficient_stock" });
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

  const sale = await getSale(saleId);
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

  const paymentStatus = await getPaymentStoreStatus(paymentId);
  if (!paymentStatus) {
    return res.status(404).json({ error: "payment not found" });
  }
  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
  if (paymentStatus.store_id !== storeId) {
    return res.status(404).json({ error: "payment not found" });
  }
  if (!paymentStatus.active) {
    return res.status(403).json({ error: "store_inactive" });
  }

  const paymentRes = await pool.query(
    `
    UPDATE payments
    SET status = 'PAID', confirmed_at = NOW()
    WHERE id = $1
    RETURNING id, sale_id
    `,
    [paymentId]
  );

  const payment = paymentRes.rows[0];
  if (!payment) {
    return res.status(404).json({ error: "payment not found" });
  }

  await pool.query(
    `UPDATE sales SET status = 'PAID_UPI' WHERE id = $1`,
    [payment.sale_id]
  );

  return res.json({ status: "PAID" });
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

  const sale = await getSale(saleId);
  if (!sale || sale.store_id !== storeId) {
    return res.status(404).json({ error: "sale not found" });
  }

  await pool.query(
    `
    INSERT INTO payments (id, sale_id, mode, status, amount_minor)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [randomUUID(), saleId, "CASH", "PAID", sale.total_minor]
  );

  await pool.query(`UPDATE sales SET status = 'PAID_CASH' WHERE id = $1`, [saleId]);

  return res.json({ status: "PAID" });
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

  const sale = await getSale(saleId);
  if (!sale || sale.store_id !== storeId) {
    return res.status(404).json({ error: "sale not found" });
  }

  await pool.query(
    `
    INSERT INTO payments (id, sale_id, mode, status, amount_minor)
    VALUES ($1, $2, $3, $4, $5)
    `,
    [randomUUID(), saleId, "DUE", "DUE", sale.total_minor]
  );

  await pool.query(`UPDATE sales SET status = 'DUE' WHERE id = $1`, [saleId]);

  return res.json({ status: "DUE" });
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

  const collectionStatus = await getCollectionStoreStatus(collectionId);
  if (!collectionStatus) {
    return res.status(404).json({ error: "collection not found" });
  }
  const { storeId, deviceId } = (req as any).posDevice as { storeId: string; deviceId: string };
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
