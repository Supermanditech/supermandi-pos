/**
 * V3-HARDEN-133: Inventory Ledger Event Matrix
 *
 * Canonical definition of when stock is credited or debited and how that
 * maps to payment and delivery states.
 *
 * STOCK CREDIT events (positive delta):
 * - OPENING_STOCK: CSV import or manual entry → immediate credit
 * - GRN_RECEIVED: Goods received from supplier → credit on delivery confirmation
 * - SALE_RETURN: Void/refund reverses a previous sale → credit
 * - ADJUSTMENT_POSITIVE: Manual stock correction → immediate credit
 *
 * STOCK DEBIT events (negative delta):
 * - SALE_COMPLETED: Sale payment confirmed → debit on payment (NOT on cart add)
 * - ADJUSTMENT_NEGATIVE: Manual stock correction → immediate debit
 *
 * STOCK NEUTRAL events (no delta):
 * - SALE_CREATED: Sale record created but not yet paid → NO stock movement
 * - SALE_CANCELLED: Unpaid sale cancelled → NO stock movement (nothing to reverse)
 * - CART_ADD/REMOVE: Cart is draft state → NO stock movement
 *
 * PAYMENT MODE has NO effect on stock timing:
 * - CASH: Stock debited on sale completion
 * - UPI: Stock debited on sale completion (after UPI confirm)
 * - UDHAR/DUE: Stock debited on sale completion (credit sale = immediate debit)
 * - The payment mode affects the accounts receivable, not stock movement.
 *
 * KEY INVARIANT: Stock is NEVER debited before sale payment is confirmed.
 * This prevents double-debit scenarios when UPI/DUE sales are later cancelled.
 */

export type LedgerEventType =
  | "OPENING_STOCK"
  | "GRN_RECEIVED"
  | "SALE_COMPLETED"
  | "SALE_RETURN"
  | "ADJUSTMENT_POSITIVE"
  | "ADJUSTMENT_NEGATIVE"
  | "SALE_CREATED"
  | "SALE_CANCELLED"
  | "CART_EVENT";

export type StockEffect = "CREDIT" | "DEBIT" | "NONE";

export interface LedgerEventRule {
  event: LedgerEventType;
  stockEffect: StockEffect;
  movementType: "RECEIVE" | "SELL" | "ADJUSTMENT" | null;
  description: string;
  trigger: string;
}

/**
 * The canonical event matrix — each business event maps to exactly one stock behavior.
 */
export const LEDGER_EVENT_MATRIX: LedgerEventRule[] = [
  // === CREDIT EVENTS ===
  {
    event: "OPENING_STOCK",
    stockEffect: "CREDIT",
    movementType: "RECEIVE",
    description: "Initial stock entry via CSV import or manual entry",
    trigger: "retailer-admin CSV import, retailer-admin inline add, POS opening stock",
  },
  {
    event: "GRN_RECEIVED",
    stockEffect: "CREDIT",
    movementType: "RECEIVE",
    description: "Goods received from supplier delivery",
    trigger: "GRN confirmation in POS or retailer-admin",
  },
  {
    event: "SALE_RETURN",
    stockEffect: "CREDIT",
    movementType: "ADJUSTMENT",
    description: "Void/refund reverses a completed sale, stock returned",
    trigger: "POS void sale, retailer-admin refund",
  },
  {
    event: "ADJUSTMENT_POSITIVE",
    stockEffect: "CREDIT",
    movementType: "ADJUSTMENT",
    description: "Manual stock count correction (stock found higher than system)",
    trigger: "Retailer-admin or POS stock adjustment",
  },

  // === DEBIT EVENTS ===
  {
    event: "SALE_COMPLETED",
    stockEffect: "DEBIT",
    movementType: "SELL",
    description: "Sale payment confirmed — stock debited regardless of payment mode",
    trigger: "Cash sale complete, UPI confirm, Udhar/DUE record",
  },
  {
    event: "ADJUSTMENT_NEGATIVE",
    stockEffect: "DEBIT",
    movementType: "ADJUSTMENT",
    description: "Manual stock count correction (stock found lower than system)",
    trigger: "Retailer-admin or POS stock adjustment",
  },

  // === NEUTRAL EVENTS (no stock movement) ===
  {
    event: "SALE_CREATED",
    stockEffect: "NONE",
    movementType: null,
    description: "Sale record created but not yet paid — NO stock debit",
    trigger: "createSale API call (before payment)",
  },
  {
    event: "SALE_CANCELLED",
    stockEffect: "NONE",
    movementType: null,
    description: "Unpaid sale cancelled — nothing to reverse",
    trigger: "Cancel unpaid sale from POS or timeout",
  },
  {
    event: "CART_EVENT",
    stockEffect: "NONE",
    movementType: null,
    description: "Cart add/remove/edit — draft state only, no stock movement",
    trigger: "POS add to cart, edit quantity, remove item",
  },
];

/**
 * Look up the stock effect for a given ledger event type.
 * Returns the canonical rule or throws if the event is unknown.
 */
export function getLedgerEventRule(event: LedgerEventType): LedgerEventRule {
  const rule = LEDGER_EVENT_MATRIX.find((r) => r.event === event);
  if (!rule) {
    throw new Error(`LEDGER_EVENT_UNKNOWN: No rule defined for event '${event}'`);
  }
  return rule;
}

/**
 * Validate that a movement type is consistent with the expected ledger event.
 * Used as a pre-flight check before applying inventory movements.
 */
export function validateLedgerConsistency(
  event: LedgerEventType,
  movementType: "RECEIVE" | "SELL" | "ADJUSTMENT"
): void {
  const rule = getLedgerEventRule(event);
  if (rule.stockEffect === "NONE") {
    throw new Error(`LEDGER_VIOLATION: Event '${event}' should not produce a stock movement`);
  }
  if (rule.movementType !== movementType) {
    throw new Error(
      `LEDGER_VIOLATION: Event '${event}' expects movement type '${rule.movementType}', got '${movementType}'`
    );
  }
}
