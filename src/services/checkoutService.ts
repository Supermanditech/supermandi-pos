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
    // Inventory deduction failed - log warning but don't fail checkout
    // Backend will reconcile via event outbox or manual reconciliation
    console.warn(
      `[Checkout] Inventory deduction failed for sale ${saleId}:`,
      inventoryError
    );
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
