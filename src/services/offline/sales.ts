import { offlineDb } from "./localDb";
import { enqueueEvent } from "./outbox";
import { nextOfflineBillRef } from "./receipt";
import { uuidv4 } from "../../utils/uuid";

export type OfflineSaleItem = {
  id: string;
  barcode: string;
  name: string;
  priceMinor: number;
  quantity: number;
  itemDiscount?: DiscountInput | null;
  globalProductId?: string | null;
};

export type OfflineSaleInput = {
  items: OfflineSaleItem[];
  discountMinor?: number;
  cartDiscount?: DiscountInput | null;
  currency: string;
};

export type DiscountInput = {
  type: "percentage" | "fixed";
  value: number;
  reason?: string;
};

type CartDiscountState = {
  type: "percentage" | "fixed";
  value: number;
  reason?: string;
};

const normalizeDiscount = (discount: DiscountInput | null | undefined): CartDiscountState | null => {
  if (!discount) return null;
  if (discount.type !== "percentage" && discount.type !== "fixed") return null;
  const value = Number(discount.value);
  if (!Number.isFinite(value) || value <= 0) return null;
  return { type: discount.type, value, reason: discount.reason };
};

const calculateDiscountAmount = (
  baseAmount: number,
  discount: CartDiscountState | null
): number => {
  if (!discount) return 0;
  const safeBase = Math.max(0, Math.round(baseAmount));
  const safeValue = Math.max(0, Number.isFinite(discount.value) ? discount.value : 0);

  if (discount.type === "percentage") {
    return Math.min(Math.round(safeBase * (safeValue / 100)), safeBase);
  }
  return Math.min(Math.round(safeValue), safeBase);
};

export async function createOfflineSale(input: OfflineSaleInput): Promise<{
  saleId: string;
  billRef: string;
  totals: { subtotalMinor: number; discountMinor: number; totalMinor: number };
}> {
  const saleId = uuidv4();
  const billRef = await nextOfflineBillRef();
  const createdAt = new Date().toISOString();

  let subtotalMinor = 0;
  let itemDiscountMinor = 0;

  const itemRows = input.items.map((item) => {
    const lineSubtotalMinor = Math.round(item.priceMinor) * Math.round(item.quantity);
    const discount = normalizeDiscount(item.itemDiscount ?? null);
    const lineDiscountMinor = calculateDiscountAmount(lineSubtotalMinor, discount);
    const lineTotalMinor = Math.max(0, lineSubtotalMinor - lineDiscountMinor);

    subtotalMinor += lineSubtotalMinor;
    itemDiscountMinor += lineDiscountMinor;

    return {
      ...item,
      discount,
      lineSubtotalMinor,
      lineDiscountMinor,
      lineTotalMinor
    };
  });

  const normalizedCartDiscount = normalizeDiscount(input.cartDiscount ?? null);
  const fallbackCartDiscount =
    normalizedCartDiscount ??
    (input.discountMinor && input.discountMinor > 0
      ? { type: "fixed", value: Math.round(input.discountMinor) }
      : null);

  const cartDiscountMinor = calculateDiscountAmount(
    Math.max(0, subtotalMinor - itemDiscountMinor),
    fallbackCartDiscount
  );
  const discountMinor = itemDiscountMinor + cartDiscountMinor;
  const totalMinor = Math.max(0, subtotalMinor - discountMinor);
  const cartDiscountType = fallbackCartDiscount?.type ?? null;
  const cartDiscountValue = fallbackCartDiscount?.value ?? null;

  await offlineDb.run(
    `
    INSERT INTO offline_sales (
      id,
      bill_ref,
      subtotal_minor,
      item_discount_minor,
      cart_discount_minor,
      cart_discount_type,
      cart_discount_value,
      discount_minor,
      total_minor,
      status,
      created_at,
      updated_at
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [
      saleId,
      billRef,
      subtotalMinor,
      itemDiscountMinor,
      cartDiscountMinor,
      cartDiscountType,
      cartDiscountValue,
      discountMinor,
      totalMinor,
      "CREATED",
      createdAt,
      createdAt
    ]
  );

  for (const item of itemRows) {
    await offlineDb.run(
      `
      INSERT INTO offline_sale_items (
        id,
        sale_id,
        barcode,
        name,
        price_minor,
        quantity,
        line_subtotal_minor,
        discount_type,
        discount_value,
        discount_minor,
        line_total_minor
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        uuidv4(),
        saleId,
        item.barcode,
        item.name,
        item.priceMinor,
        item.quantity,
        item.lineSubtotalMinor,
        item.discount?.type ?? null,
        item.discount?.value ?? null,
        item.lineDiscountMinor,
        item.lineTotalMinor
      ]
    );
  }

  await enqueueEvent("SALE_CREATED", {
    saleId,
    offlineReceiptRef: billRef,
    items: itemRows.map((item) => ({
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity,
      priceMinor: item.priceMinor,
      itemDiscount: item.discount ? { ...item.discount } : null,
      global_product_id: item.globalProductId ?? undefined
    })),
    cartDiscount: fallbackCartDiscount ? { ...fallbackCartDiscount } : null,
    itemDiscountMinor,
    cartDiscountMinor,
    discountMinor,
    subtotalMinor,
    totalMinor,
    currency: input.currency,
    createdAt
  });

  return {
    saleId,
    billRef,
    totals: { subtotalMinor, discountMinor, totalMinor }
  };
}

export async function recordOfflineCashPayment(input: {
  saleId: string;
  billRef: string;
  amountMinor: number;
}): Promise<void> {
  const now = new Date().toISOString();
  await offlineDb.run(`UPDATE offline_sales SET status = ?, updated_at = ? WHERE id = ?`, [
    "PAID_CASH",
    now,
    input.saleId
  ]);

  await enqueueEvent("PAYMENT_CASH", {
    saleId: input.saleId,
    billRef: input.billRef,
    amountMinor: input.amountMinor,
    createdAt: now
  });
}

export async function fetchOfflineSale(saleId: string): Promise<{
  id: string;
  billRef: string;
  totalMinor: number;
} | null> {
  const rows = await offlineDb.all<{ id: string; bill_ref: string; total_minor: number }>(
    `SELECT id, bill_ref, total_minor FROM offline_sales WHERE id = ? LIMIT 1`,
    [saleId]
  );
  if (!rows[0]) return null;
  return {
    id: rows[0].id,
    billRef: rows[0].bill_ref,
    totalMinor: rows[0].total_minor
  };
}

export async function recordOfflineDuePayment(input: {
  saleId: string;
  billRef: string;
  amountMinor: number;
}): Promise<void> {
  const now = new Date().toISOString();
  await offlineDb.run(`UPDATE offline_sales SET status = ?, updated_at = ? WHERE id = ?`, [
    "DUE",
    now,
    input.saleId
  ]);

  await enqueueEvent("PAYMENT_DUE", {
    saleId: input.saleId,
    billRef: input.billRef,
    amountMinor: input.amountMinor,
    createdAt: now
  });
}
