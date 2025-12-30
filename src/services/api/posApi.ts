import { apiClient, ApiError } from "./apiClient";
import { isOnline } from "../networkStatus";
import { createOfflineSale, fetchOfflineSale, recordOfflineCashPayment, recordOfflineDuePayment } from "../offline/sales";
import { createOfflineCollection } from "../offline/collections";

export type SaleItemInput = {
  productId: string;
  barcode?: string;
  name?: string;
  quantity: number;
  priceMinor: number;
};

export type SaleCreateResponse = {
  saleId: string;
  billRef: string;
  totals: {
    subtotalMinor: number;
    discountMinor: number;
    totalMinor: number;
  };
};

export async function createSale(input: {
  items: SaleItemInput[];
  discountMinor?: number;
}): Promise<SaleCreateResponse> {
  if (await isOnline()) {
    return apiClient.post<SaleCreateResponse>("/api/v1/pos/sales", input);
  }

  const offline = await createOfflineSale({
    items: input.items.map((item) => ({
      id: item.productId,
      barcode: item.barcode ?? item.productId,
      name: item.name ?? item.productId,
      priceMinor: item.priceMinor,
      quantity: item.quantity
    })),
    discountMinor: input.discountMinor ?? 0,
    currency: "INR"
  });

  return offline;
}

export async function initUpiPayment(input: {
  saleId: string;
}): Promise<{ paymentId: string; billRef: string; amountMinor: number; upiIntent: string }> {
  if (!(await isOnline())) {
    throw new ApiError(0, "upi_offline_blocked");
  }
  return apiClient.post("/api/v1/pos/payments/upi/init", input);
}

export async function confirmUpiPaymentManual(input: {
  paymentId: string;
}): Promise<{ status: string }> {
  return apiClient.post("/api/v1/pos/payments/upi/confirm-manual", input);
}

export async function recordCashPayment(input: {
  saleId: string;
}): Promise<{ status: string }> {
  if (await isOnline()) {
    return apiClient.post("/api/v1/pos/payments/cash", input);
  }

  const sale = await fetchOfflineSale(input.saleId);
  if (!sale) {
    throw new Error("sale not found");
  }

  await recordOfflineCashPayment({
    saleId: sale.id,
    billRef: sale.billRef,
    amountMinor: sale.totalMinor
  });
  return { status: "PAID" };
}

export async function recordDuePayment(input: {
  saleId: string;
}): Promise<{ status: string }> {
  if (await isOnline()) {
    return apiClient.post("/api/v1/pos/payments/due", input);
  }

  const sale = await fetchOfflineSale(input.saleId);
  if (!sale) {
    throw new Error("sale not found");
  }

  await recordOfflineDuePayment({
    saleId: sale.id,
    billRef: sale.billRef,
    amountMinor: sale.totalMinor
  });
  return { status: "DUE" };
}

export async function initCollectionUpi(input: {
  amountMinor: number;
  reference?: string | null;
}): Promise<{ collectionId: string; amountMinor: number; upiIntent: string }> {
  if (!(await isOnline())) {
    throw new ApiError(0, "upi_offline_blocked");
  }
  return apiClient.post("/api/v1/pos/collections/upi/init", input);
}

export async function confirmCollectionUpiManual(input: {
  collectionId: string;
}): Promise<{ status: string }> {
  return apiClient.post("/api/v1/pos/collections/upi/confirm-manual", input);
}

export async function recordCollectionCash(input: {
  amountMinor: number;
  reference?: string | null;
}): Promise<{ status: string; collectionId: string }> {
  if (await isOnline()) {
    return apiClient.post("/api/v1/pos/collections/cash", input);
  }

  const offline = await createOfflineCollection({
    amountMinor: input.amountMinor,
    mode: "CASH",
    reference: input.reference ?? null
  });
  return { status: "PAID", collectionId: offline.collectionId };
}

export async function recordCollectionDue(input: {
  amountMinor: number;
  reference?: string | null;
}): Promise<{ status: string; collectionId: string }> {
  if (await isOnline()) {
    return apiClient.post("/api/v1/pos/collections/due", input);
  }

  const offline = await createOfflineCollection({
    amountMinor: input.amountMinor,
    mode: "DUE",
    reference: input.reference ?? null
  });
  return { status: "DUE", collectionId: offline.collectionId };
}
