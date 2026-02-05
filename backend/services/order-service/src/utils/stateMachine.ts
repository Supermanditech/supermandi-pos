// Order Status State Machine - V3.0.9 compliant
// Defines valid status transitions for purchase orders

import { OrderStatus } from '../db/queries';

// =============================================================================
// STATUS TRANSITION RULES
// =============================================================================

/**
 * Status Flow:
 * draft → submitted → confirmed → shipped → delivered
 *                                        → partial_received → delivered
 *      ↓
 *      cancelled (from draft, submitted, confirmed)
 */
const validTransitions: Record<OrderStatus, OrderStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['delivered', 'partial_received'],
  partial_received: ['delivered', 'partial_received'],
  delivered: [],
  cancelled: [],
};

// =============================================================================
// TRANSITION VALIDATION
// =============================================================================

/**
 * Check if a status transition is valid.
 */
export function isValidTransition(
  from: OrderStatus,
  to: OrderStatus
): boolean {
  const allowed = validTransitions[from];
  return allowed?.includes(to) ?? false;
}

/**
 * Get allowed transitions from a status.
 */
export function getAllowedTransitions(from: OrderStatus): OrderStatus[] {
  return validTransitions[from] ?? [];
}

/**
 * Check if an order can be cancelled from its current status.
 */
export function canCancel(status: OrderStatus): boolean {
  return isValidTransition(status, 'cancelled');
}

/**
 * Check if an order can be submitted from its current status.
 */
export function canSubmit(status: OrderStatus): boolean {
  return status === 'draft';
}

/**
 * Check if an order is in a terminal state.
 */
export function isTerminalStatus(status: OrderStatus): boolean {
  return status === 'delivered' || status === 'cancelled';
}

/**
 * Check if an order can receive goods (GRN).
 */
export function canReceive(status: OrderStatus): boolean {
  return status === 'shipped' || status === 'partial_received';
}

// =============================================================================
// TRANSITION ERROR MESSAGES
// =============================================================================

/**
 * Get a human-readable error message for an invalid transition.
 */
export function getTransitionErrorMessage(
  from: OrderStatus,
  to: OrderStatus
): string {
  if (isTerminalStatus(from)) {
    return `Cannot transition from '${from}' status. Order is in a terminal state.`;
  }

  const allowed = getAllowedTransitions(from);
  if (allowed.length === 0) {
    return `No transitions allowed from '${from}' status.`;
  }

  return `Cannot transition from '${from}' to '${to}'. Allowed transitions: ${allowed.join(', ')}.`;
}

// =============================================================================
// VALIDATION HELPERS
// =============================================================================

/**
 * Validate and return the target status or throw an error.
 */
export function validateTransition(
  from: OrderStatus,
  to: OrderStatus
): void {
  if (!isValidTransition(from, to)) {
    throw new Error(getTransitionErrorMessage(from, to));
  }
}

/**
 * Parse and validate status string.
 */
export function parseStatus(status: string): OrderStatus | null {
  const validStatuses: OrderStatus[] = [
    'draft',
    'submitted',
    'confirmed',
    'shipped',
    'partial_received',
    'delivered',
    'cancelled',
  ];

  const normalized = status.toLowerCase() as OrderStatus;
  return validStatuses.includes(normalized) ? normalized : null;
}
