import { apiClient, ApiError } from "./apiClient";
import { isOnline } from "../networkStatus";
import { createOfflineSale, fetchOfflineSale, recordOfflineCashPayment, recordOfflineDuePayment } from "../offline/sales";
import { createOfflineCollection } from "../offline/collections";

export type DiscountInput = {
  type: "percentage" | "fixed";
  value: number;
  reason?: string;
};

export type SaleItemInput = {
  productId: string;
  globalProductId?: string;
  global_product_id?: string;
  store_product_id?: string;
  retail_variant_id?: string;
  barcode?: string;
  name?: string;
  quantity: number;
  priceMinor: number;
  itemDiscount?: DiscountInput | null;
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
  cartDiscount?: DiscountInput | null;
  saleId?: string;
  currency?: string;
}): Promise<SaleCreateResponse> {
  if (await isOnline()) {
    return apiClient.post<SaleCreateResponse>("/api/v1/pos/sales", input);
  }

  const offlineItems = input.items.map((item) => {
    const rawGlobalProductId =
      typeof item.global_product_id === "string"
        ? item.global_product_id.trim()
        : typeof item.globalProductId === "string"
          ? item.globalProductId.trim()
          : "";
    const globalProductId = rawGlobalProductId ? rawGlobalProductId : null;

    return {
      id: item.productId,
      barcode: item.barcode ?? item.productId,
      name: item.name ?? item.productId,
      priceMinor: item.priceMinor,
      quantity: item.quantity,
      itemDiscount: item.itemDiscount ?? null,
      globalProductId
    };
  });

  const offline = await createOfflineSale({
    saleId: input.saleId,
    items: offlineItems,
    discountMinor: input.discountMinor ?? 0,
    cartDiscount: input.cartDiscount ?? null,
    currency: input.currency ?? "INR"
  });

  return offline;
}

export async function initUpiPayment(input: {
  saleId: string;
  transactionId?: string;
}): Promise<{ paymentId: string; billRef: string; amountMinor: number; storeName: string | null; upiVpa: string; expiresAt?: string }> {
  if (!(await isOnline())) {
    // GL-CRIT-0041: Clear error message explaining why UPI is unavailable offline
    throw new ApiError(
      0,
      "upi_offline_blocked",
      "UPI payments require internet connection. Please use Cash or Credit payment instead, or connect to the internet to process UPI."
    );
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

export async function cancelSale(input: {
  saleId: string;
}): Promise<{ status: string; message: string }> {
  // Only cancel online sales - offline sales don't need cancellation
  if (await isOnline()) {
    return apiClient.post(`/api/v1/pos/sales/${input.saleId}/cancel`, {});
  }
  // Offline sales are not persisted until payment, so no cancellation needed
  return { status: "CANCELLED", message: "Offline sale not persisted" };
}

export async function initCollectionUpi(input: {
  amountMinor: number;
  reference?: string | null;
  transactionId?: string;
}): Promise<{ collectionId: string; amountMinor: number; storeName: string | null; upiVpa: string }> {
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

// =============================================================================
// SM-015: Split Payment APIs
// =============================================================================

export type SplitPaymentItem = {
  mode: "UPI" | "CASH" | "DUE";
  amountMinor: number;
};

export type SplitPaymentResponse = {
  paymentIds: string[];
  upiPayment?: {
    paymentId: string;
    qrData: string;
    expiresAt: string;
  };
  cashPayment?: {
    paymentId: string;
    status: string;
  };
  totalAmount: number;
};

/**
 * SM-015: Create a split payment for a sale (part UPI + part Cash)
 */
export async function createSplitPayment(input: {
  saleId: string;
  payments: SplitPaymentItem[];
}): Promise<SplitPaymentResponse> {
  if (!(await isOnline())) {
    throw new ApiError(0, "split_offline_blocked");
  }
  return apiClient.post<SplitPaymentResponse>("/api/v1/pos/payments/split", input);
}

/**
 * SM-015: Confirm cash portion of split payment after UPI completes
 */
export async function confirmSplitCash(input: {
  paymentId: string;
}): Promise<{ status: string; saleCompleted: boolean }> {
  return apiClient.post(`/api/v1/pos/payments/split/${input.paymentId}/confirm-cash`, {});
}

/**
 * SM-015: Poll split payment status
 */
export async function getSplitPaymentStatus(input: {
  saleId: string;
}): Promise<{
  upiStatus: string;
  cashStatus: string;
  saleStatus: string;
  awaitingCash: boolean;
  cashAmount?: number;
}> {
  return apiClient.get(`/api/v1/pos/payments/split/${input.saleId}/status`);
}

// =============================================================================
// GL-RJ-004: UTR Verification APIs
// =============================================================================

export type UtrVerificationResponse = {
  verified: boolean;
  status: "SUCCESS" | "PENDING" | "FAILED" | "NOT_FOUND";
  transactionId?: string;
  verifiedAt?: string;
  payerVpa?: string;
  amountMinor?: number;
  errorMessage?: string;
};

/**
 * GL-RJ-004: Verify a UPI UTR (Unique Transaction Reference)
 * This verifies with the payment gateway that the UTR is valid
 */
export async function verifyUtr(input: {
  utr: string;
  amountMinor: number;
  paymentId?: string;
}): Promise<UtrVerificationResponse> {
  if (!(await isOnline())) {
    throw new ApiError(0, "verification_offline_blocked");
  }
  return apiClient.post<UtrVerificationResponse>("/api/v1/pos/payments/upi/verify-utr", input);
}

/**
 * GL-RJ-004: Poll UTR verification status (for async verification)
 */
export async function getUtrVerificationStatus(input: {
  verificationId: string;
}): Promise<UtrVerificationResponse> {
  return apiClient.get(`/api/v1/pos/payments/upi/verify-utr/${input.verificationId}/status`);
}
