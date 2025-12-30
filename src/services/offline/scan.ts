import { offlineDb } from "./localDb";
import { enqueueEvent } from "./outbox";

type OfflineScanMode = "SELL" | "DIGITISE";

export type OfflineScanProduct = {
  barcode: string;
  name: string;
  currency: string;
  priceMinor: number | null;
};

export type OfflineScanResult =
  | { action: "IGNORED" }
  | { action: "ADD_TO_CART" | "PROMPT_PRICE" | "DIGITISED" | "ALREADY_DIGITISED"; product: OfflineScanProduct };

function buildProductName(barcode: string): string {
  const suffix = barcode.slice(-4);
  return `Item ${suffix || barcode}`;
}

export async function fetchLocalProduct(barcode: string): Promise<OfflineScanProduct | null> {
  const rows = await offlineDb.all<{
    barcode: string;
    name: string;
    currency: string;
  }>(
    `SELECT barcode, name, currency FROM offline_products WHERE barcode = ? LIMIT 1`,
    [barcode]
  );

  if (!rows[0]) return null;

  const priceRows = await offlineDb.all<{ price_minor: number | null }>(
    `SELECT price_minor FROM offline_prices WHERE barcode = ? LIMIT 1`,
    [barcode]
  );

  return {
    barcode: rows[0].barcode,
    name: rows[0].name,
    currency: rows[0].currency,
    priceMinor: priceRows[0]?.price_minor ?? null
  };
}

async function upsertLocalProduct(barcode: string, name: string, currency = "INR"): Promise<OfflineScanProduct> {
  const now = new Date().toISOString();
  await offlineDb.run(
    `
    INSERT INTO offline_products (barcode, name, currency, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
    ON CONFLICT(barcode) DO UPDATE SET
      name = excluded.name,
      currency = excluded.currency,
      updated_at = excluded.updated_at
    `,
    [barcode, name, currency, now, now]
  );

  return {
    barcode,
    name,
    currency,
    priceMinor: null
  };
}

export async function setLocalPrice(barcode: string, priceMinor: number): Promise<void> {
  const now = new Date().toISOString();
  await offlineDb.run(
    `
    INSERT INTO offline_prices (barcode, price_minor, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(barcode) DO UPDATE SET
      price_minor = excluded.price_minor,
      updated_at = excluded.updated_at
    `,
    [barcode, priceMinor, now]
  );
}

export async function resolveOfflineScan(scanValue: string, mode: OfflineScanMode): Promise<OfflineScanResult> {
  const barcode = scanValue.trim();
  if (!barcode) return { action: "IGNORED" };

  const existing = await fetchLocalProduct(barcode);

  if (mode === "DIGITISE") {
    if (existing) {
      return { action: "ALREADY_DIGITISED", product: existing };
    }

    const created = await upsertLocalProduct(barcode, buildProductName(barcode));
    await enqueueEvent("PRODUCT_UPSERT", {
      barcode,
      name: created.name,
      currency: created.currency,
      origin: "DIGITISE"
    });
    return { action: "DIGITISED", product: created };
  }

  if (!existing) {
    const created = await upsertLocalProduct(barcode, buildProductName(barcode));
    await enqueueEvent("PRODUCT_UPSERT", {
      barcode,
      name: created.name,
      currency: created.currency,
      origin: "SELL"
    });
    return { action: "PROMPT_PRICE", product: created };
  }

  if (existing.priceMinor === null) {
    return { action: "PROMPT_PRICE", product: existing };
  }

  return { action: "ADD_TO_CART", product: existing };
}
