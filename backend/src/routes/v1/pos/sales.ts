import { randomUUID } from "crypto";
import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireDeviceToken } from "../../../middleware/deviceToken";

export const posSalesRouter = Router();

type SaleItemInput = {
  productId: string;
  quantity: number;
  priceMinor: number;
  itemDiscount?: DiscountInput | null;
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

const normalizeDiscount = (discount: DiscountInput | null | undefined): NormalizedDiscount | null => {
  if (!discount) return null;
  if (discount.type !== "percentage" && discount.type !== "fixed") return null;
  const value = Number(discount.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { type: discount.type, value, reason: discount.reason };
};

const calculateDiscountAmount = (baseAmount: number, discount: NormalizedDiscount | null): number => {
  if (!discount) return 0;
  const safeBase = Math.max(0, Math.round(baseAmount));
  const safeValue = Math.max(0, Number.isFinite(discount.value) ? discount.value : 0);

  if (discount.type === "percentage") {
    return Math.min(Math.round(safeBase * (safeValue / 100)), safeBase);
  }
  return Math.min(Math.round(safeValue), safeBase);
};

function buildBillRef(): string {
  const ts = Date.now().toString().slice(-6);
  const rand = Math.floor(100 + Math.random() * 900).toString();
  return `${ts}${rand}`;
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
  const { items, discountMinor, cartDiscount } = req.body as {
    items?: SaleItemInput[];
    discountMinor?: number;
    cartDiscount?: DiscountInput | null;
  };

  if (!Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items are required" });
  }

  const normalizedCartDiscount = normalizeDiscount(cartDiscount ?? null);
  if (cartDiscount && !normalizedCartDiscount) {
    return res.status(400).json({ error: "cart discount is invalid" });
  }

  const cleanedItems: Array<SaleItemInput & { itemDiscount: NormalizedDiscount | null }> = [];

  for (const item of items) {
    if (
      typeof item.productId !== "string" ||
      item.productId.trim().length === 0 ||
      typeof item.quantity !== "number" ||
      !Number.isFinite(item.quantity) ||
      item.quantity <= 0 ||
      typeof item.priceMinor !== "number" ||
      !Number.isFinite(item.priceMinor) ||
      item.priceMinor <= 0
    ) {
      return res.status(400).json({ error: "items are invalid" });
    }

    const normalizedItemDiscount = normalizeDiscount(item.itemDiscount ?? null);
    if (item.itemDiscount && !normalizedItemDiscount) {
      return res.status(400).json({ error: "item discount is invalid" });
    }

    cleanedItems.push({
      ...item,
      itemDiscount: normalizedItemDiscount
    });
  }

  let subtotal = 0;
  let itemDiscountTotal = 0;
  const computedItems = cleanedItems.map((item) => {
    const quantity = Math.round(item.quantity);
    const priceMinor = Math.round(item.priceMinor);
    const lineSubtotal = priceMinor * quantity;
    const lineDiscount = calculateDiscountAmount(lineSubtotal, item.itemDiscount);
    const lineTotal = Math.max(0, lineSubtotal - lineDiscount);
    subtotal += lineSubtotal;
    itemDiscountTotal += lineDiscount;
    return { ...item, quantity, priceMinor, lineSubtotal, lineDiscount, lineTotal };
  });

  const fallbackCartDiscount =
    normalizedCartDiscount ??
    (typeof discountMinor === "number" && Number.isFinite(discountMinor) && discountMinor > 0
      ? { type: "fixed", value: Math.round(discountMinor) }
      : null);

  const cartDiscountAmount = calculateDiscountAmount(
    Math.max(0, subtotal - itemDiscountTotal),
    fallbackCartDiscount
  );
  const discount = itemDiscountTotal + cartDiscountAmount;
  const total = Math.max(0, subtotal - discount);

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

  try {
    await pool.query("BEGIN");

    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await pool.query(
          `
          INSERT INTO sales (
            id,
            store_id,
            device_id,
            bill_ref,
            subtotal_minor,
            item_discount_minor,
            cart_discount_minor,
            cart_discount_type,
            cart_discount_value,
            discount_minor,
            total_minor,
            status
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
          `,
          [
            saleId,
            storeId,
            deviceId,
            billRef,
            subtotal,
            itemDiscountTotal,
            cartDiscountAmount,
            fallbackCartDiscount?.type ?? null,
            fallbackCartDiscount?.value ?? null,
            discount,
            total,
            "CREATED"
          ]
        );
        break;
      } catch (error) {
        billRef = buildBillRef();
        if (attempt === 2) {
          throw error;
        }
      }
    }

    for (const item of computedItems) {
      await pool.query(
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
          item.productId,
          item.quantity,
          item.priceMinor,
          item.lineSubtotal,
          item.itemDiscount?.type ?? null,
          item.itemDiscount?.value ?? null,
          item.lineDiscount,
          item.lineTotal
        ]
      );
    }

    await pool.query("COMMIT");
  } catch (error) {
    await pool.query("ROLLBACK");
    return res.status(500).json({ error: "failed to create sale" });
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
