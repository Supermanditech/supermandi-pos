export type BillPaymentMode = "UPI" | "CASH" | "DUE" | "UNKNOWN";

export type BillItemSnapshot = {
  variantId?: string;
  name: string;
  barcode?: string | null;
  quantity: number;
  priceMinor: number;
  lineTotalMinor: number;
};

export type BillSnapshot = {
  saleId: string;
  billRef: string;
  status: string;
  paymentMode: BillPaymentMode;
  currency: string;
  createdAt: string;
  subtotalMinor: number;
  discountMinor: number;
  totalMinor: number;
  items: BillItemSnapshot[];
};

export type BillSummary = {
  saleId: string;
  billRef: string;
  totalMinor: number;
  status: string;
  paymentMode: BillPaymentMode;
  createdAt: string;
  currency: string;
  source: "remote" | "local";
  syncedAt?: string | null;
};

export function paymentModeFromStatus(status: string | null | undefined): BillPaymentMode {
  const normalized = (status ?? "").toUpperCase();
  if (normalized.includes("UPI")) return "UPI";
  if (normalized.includes("CASH")) return "CASH";
  if (normalized.includes("DUE")) return "DUE";
  return "UNKNOWN";
}
