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
};

export type OfflineSaleInput = {
  items: OfflineSaleItem[];
  discountMinor: number;
  currency: string;
};

export async function createOfflineSale(input: OfflineSaleInput): Promise<{
  saleId: string;
  billRef: string;
  totals: { subtotalMinor: number; discountMinor: number; totalMinor: number };
}> {
  const saleId = uuidv4();
  const billRef = await nextOfflineBillRef();
  const createdAt = new Date().toISOString();
  const subtotalMinor = input.items.reduce((sum, item) => sum + item.priceMinor * item.quantity, 0);
  const discountMinor = Math.max(0, Math.round(input.discountMinor));
  const totalMinor = Math.max(0, subtotalMinor - discountMinor);

  await offlineDb.run(
    `
    INSERT INTO offline_sales (id, bill_ref, subtotal_minor, discount_minor, total_minor, status, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `,
    [saleId, billRef, subtotalMinor, discountMinor, totalMinor, "CREATED", createdAt, createdAt]
  );

  for (const item of input.items) {
    await offlineDb.run(
      `
      INSERT INTO offline_sale_items (id, sale_id, barcode, name, price_minor, quantity)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [uuidv4(), saleId, item.barcode, item.name, item.priceMinor, item.quantity]
    );
  }

  await enqueueEvent("SALE_CREATED", {
    saleId,
    offlineReceiptRef: billRef,
    items: input.items.map((item) => ({
      barcode: item.barcode,
      name: item.name,
      quantity: item.quantity,
      priceMinor: item.priceMinor
    })),
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
