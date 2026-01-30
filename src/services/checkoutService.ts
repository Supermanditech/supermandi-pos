// Checkout Service - V3.0.9 compliant
// Orchestrates payment completion with inventory deduction

import type { CartItem } from "../stores/cartStore";
import {
  confirmUpiPaymentManual,
  recordCashPayment,
  recordDuePayment,
} from "./api/posApi";
import {
  recordSaleTransaction,
  InventoryTransactionItem,
} from "./api/inventoryApi";
import { enqueueEvent } from "./offline/outbox"; // GL-CRIT-0016: For retry queue

// =============================================================================
// TYPES
// =============================================================================

export type PaymentMode = "UPI" | "CASH" | "DUE";

export interface CheckoutInput {
  saleId: string;
  billRef: string;
  paymentMode: PaymentMode;
  paymentId?: string; // Required for UPI
  items: CartItem[];
  totalMinor: number;
  currency: string;
  transactionId: string;
}

export interface CheckoutResult {
  success: boolean;
  paymentStatus: string;
  inventoryDeducted: boolean;
  error?: string;
}

// =============================================================================
// CHECKOUT FLOW
// =============================================================================

/**
 * Complete checkout flow:
 * 1. Record payment with POS API
 * 2. Deduct inventory via inventory API (using saleId as idempotency key)
 * 3. Log completion events
 *
 * Payment failure fails the entire checkout.
 * Inventory failure logs warning but doesn't fail checkout (backend reconciles).
 */
export async function completeCheckout(
  input: CheckoutInput
): Promise<CheckoutResult> {
  const { saleId, billRef, paymentMode, paymentId, items } = input;

  // Step 1: Record payment
  let paymentStatus: string;
  try {
    if (paymentMode === "UPI") {
      if (!paymentId) {
        throw new Error("Payment ID required for UPI");
      }
      const result = await confirmUpiPaymentManual({ paymentId });
      paymentStatus = result.status;
    } else if (paymentMode === "CASH") {
      const result = await recordCashPayment({ saleId });
      paymentStatus = result.status;
    } else {
      const result = await recordDuePayment({ saleId });
      paymentStatus = result.status;
    }
  } catch (error) {
    // Payment failed - don't proceed with inventory
    console.error(`[Checkout] Payment failed for sale ${saleId}:`, error);
    throw error;
  }

  // Step 2: Record inventory deduction
  let inventoryDeducted = false;
  try {
    const inventoryItems: InventoryTransactionItem[] = items.map((item) => ({
      productId: item.id,
      quantity: item.quantity,
      unitCost: item.priceMinor,
    }));

    await recordSaleTransaction(saleId, inventoryItems, `Sale ${billRef}`);
    inventoryDeducted = true;

    console.log(`[Checkout] Inventory deducted for sale ${saleId}, ${items.length} items`);
  } catch (inventoryError) {
    // GO-LIVE-114: Inventory deduction failed - enqueue for retry
    // Don't fail checkout, but ensure inventory is eventually deducted
    console.warn(
      `[Checkout] GO-LIVE-114: Inventory deduction failed for sale ${saleId}, queueing for retry:`,
      inventoryError
    );

    // GO-LIVE-114: Add to offline outbox for retry
    // IMPORTANT: Format payload to match what sync.ts expects for SALE_CREATED
    // Use barcode/name/priceMinor (sync format) instead of productId/unitCost (inventory format)
    try {
      await enqueueEvent("SALE_CREATED", {
        saleId,
        billRef,
        offlineReceiptRef: billRef, // sync.ts uses offlineReceiptRef or billRef
        items: items.map((item) => ({
          barcode: item.barcode,
          name: item.name,
          quantity: item.quantity,
          priceMinor: item.priceMinor,
          globalProductId: item.metadata?.globalProductId ?? null,
        })),
        currency: input.currency,
        discountMinor: 0, // Discount already applied to sale, don't re-apply
        retryInventoryDeduction: true, // GO-LIVE-114: Flag for sync processor to run inventory only
        originalError: inventoryError instanceof Error ? inventoryError.message : String(inventoryError),
        queuedAt: new Date().toISOString(),
      });
      console.log(`[Checkout] GO-LIVE-114: Queued inventory deduction retry for sale ${saleId}`);
    } catch (queueError) {
      // If even queueing fails, log critical error
      console.error(
        `[Checkout] CRITICAL: Failed to queue inventory retry for sale ${saleId}:`,
        queueError
      );
    }
  }

  // Step 3: Return result
  console.log(`[Checkout] Completed sale ${saleId}, payment: ${paymentStatus}, inventory: ${inventoryDeducted}`);

  return {
    success: true,
    paymentStatus,
    inventoryDeducted,
  };
}

/**
 * Build inventory items from cart items for transaction recording.
 */
export function buildInventoryItems(
  cartItems: CartItem[]
): InventoryTransactionItem[] {
  return cartItems.map((item) => ({
    productId: item.id,
    quantity: item.quantity,
    unitCost: item.priceMinor,
  }));
}

// =============================================================================
// STOCK VALIDATION - GO-LIVE-009
// =============================================================================

export interface StockValidationIssue {
  productId: string;
  productName: string;
  requestedQty: number;
  availableStock: number;
}

export interface StockValidationResult {
  valid: boolean;
  issues: StockValidationIssue[];
}

/**
 * Validate that cart items won't cause negative stock.
 * Returns list of items that would go below 0.
 * GO-LIVE-009: Data consistency rule
 */
export function validateCartStock(
  cartItems: CartItem[],
  stockLevels: Record<string, number>
): StockValidationResult {
  const issues: StockValidationIssue[] = [];

  for (const item of cartItems) {
    const available = stockLevels[item.id] ?? 0;
    if (item.quantity > available) {
      issues.push({
        productId: item.id,
        productName: item.name,
        requestedQty: item.quantity,
        availableStock: available,
      });
    }
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Format stock validation issues for display.
 */
export function formatStockValidationWarning(issues: StockValidationIssue[]): string {
  if (issues.length === 0) return "";

  const lines = issues.map(
    (issue) =>
      `${issue.productName}: need ${issue.requestedQty}, have ${issue.availableStock}`
  );

  return `Low stock warning:\n${lines.join("\n")}`;
}
