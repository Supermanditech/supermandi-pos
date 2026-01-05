import { offlineDb } from "../offline/localDb";
import { uuidv4 } from "../../utils/uuid";
import type { BillSnapshot, BillSummary } from "./billTypes";
import { paymentModeFromStatus } from "./billTypes";

type OfflineSaleRow = {
  id: string;
  bill_ref: string;
  subtotal_minor: number;
  discount_minor: number;
  total_minor: number;
  status: string;
  created_at: string;
  currency?: string | null;
  synced_at?: string | null;
  server_sale_id?: string | null;
};

type OfflineSaleItemRow = {
  barcode: string;
  name: string;
  price_minor: number;
  quantity: number;
};

export async function upsertLocalBillSnapshot(
  snapshot: BillSnapshot,
  options?: { synced?: boolean }
): Promise<void> {
  const now = new Date().toISOString();
  const existing = await offlineDb.all<{ id: string }>(
    `SELECT id FROM offline_sales WHERE id = ? LIMIT 1`,
    [snapshot.saleId]
  );

  if (existing[0]) {
    await offlineDb.run(
      `
      UPDATE offline_sales
      SET bill_ref = ?,
          subtotal_minor = ?,
          discount_minor = ?,
          total_minor = ?,
          status = ?,
          updated_at = ?,
          currency = COALESCE(?, currency)
      WHERE id = ?
      `,
      [
        snapshot.billRef,
        snapshot.subtotalMinor,
        snapshot.discountMinor,
        snapshot.totalMinor,
        snapshot.status,
        now,
        snapshot.currency,
        snapshot.saleId
      ]
    );
  } else {
    await offlineDb.run(
      `
      INSERT INTO offline_sales (
        id,
        bill_ref,
        subtotal_minor,
        discount_minor,
        total_minor,
        status,
        created_at,
        updated_at,
        synced_at,
        server_sale_id,
        currency
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      [
        snapshot.saleId,
        snapshot.billRef,
        snapshot.subtotalMinor,
        snapshot.discountMinor,
        snapshot.totalMinor,
        snapshot.status,
        snapshot.createdAt,
        now,
        options?.synced ? now : null,
        options?.synced ? snapshot.saleId : null,
        snapshot.currency
      ]
    );
  }

  const itemRows = await offlineDb.all<{ id: string }>(
    `SELECT id FROM offline_sale_items WHERE sale_id = ? LIMIT 1`,
    [snapshot.saleId]
  );
  if (itemRows[0]) return;

  for (const item of snapshot.items) {
    await offlineDb.run(
      `
      INSERT INTO offline_sale_items (id, sale_id, barcode, name, price_minor, quantity)
      VALUES (?, ?, ?, ?, ?, ?)
      `,
      [
        uuidv4(),
        snapshot.saleId,
        item.barcode ?? "",
        item.name,
        item.priceMinor,
        item.quantity
      ]
    );
  }
}

export async function listLocalBills(limit = 100): Promise<BillSummary[]> {
  const rows = await offlineDb.all<OfflineSaleRow>(
    `
    SELECT id, bill_ref, total_minor, status, created_at, currency, synced_at, server_sale_id
    FROM offline_sales
    WHERE status <> 'CREATED'
    ORDER BY datetime(created_at) DESC
    LIMIT ?
    `,
    [limit]
  );

  return rows.map((row) => ({
    saleId: row.server_sale_id ?? row.id,
    billRef: row.bill_ref,
    totalMinor: row.total_minor,
    status: row.status,
    paymentMode: paymentModeFromStatus(row.status),
    createdAt: row.created_at,
    currency: row.currency ?? "INR",
    source: row.server_sale_id ? "remote" : "local",
    syncedAt: row.synced_at ?? null
  }));
}

export async function fetchLocalBillSnapshot(saleId: string): Promise<BillSnapshot | null> {
  const rows = await offlineDb.all<OfflineSaleRow>(
    `
    SELECT id, bill_ref, subtotal_minor, discount_minor, total_minor, status, created_at, currency, synced_at, server_sale_id
    FROM offline_sales
    WHERE id = ? OR server_sale_id = ?
    LIMIT 1
    `,
    [saleId, saleId]
  );

  const sale = rows[0];
  if (!sale) return null;

  const items = await offlineDb.all<OfflineSaleItemRow>(
    `SELECT barcode, name, price_minor, quantity FROM offline_sale_items WHERE sale_id = ?`,
    [sale.id]
  );

  return {
    saleId: sale.server_sale_id ?? sale.id,
    billRef: sale.bill_ref,
    status: sale.status,
    paymentMode: paymentModeFromStatus(sale.status),
    currency: sale.currency ?? "INR",
    createdAt: sale.created_at,
    subtotalMinor: sale.subtotal_minor,
    discountMinor: sale.discount_minor,
    totalMinor: sale.total_minor,
    items: items.map((item) => ({
      name: item.name,
      barcode: item.barcode,
      quantity: item.quantity,
      priceMinor: item.price_minor,
      lineTotalMinor: item.price_minor * item.quantity
    }))
  };
}
