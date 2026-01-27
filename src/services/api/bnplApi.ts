// SM-020: BNPL API Service
// Frontend API client for BNPL (Buy Now Pay Later) operations

import { apiClient } from "./apiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface BnplDrawdown {
  id: string;
  supplierId: string;
  supplierName: string;
  orderNumber: string | null;
  purchaseOrderId: string | null;
  principalMinor: number;
  dueDate: string;
  status: "active" | "paid" | "overdue" | "defaulted";
  daysRemaining: number;
  isOverdue: boolean;
}

export interface BnplActiveResponse {
  success: boolean;
  drawdowns: BnplDrawdown[];
  totalOutstanding: number;
  creditLimit: number;
  availableCredit: number;
  bnplEnabled: boolean;
  maxDays: number;
}

export interface BnplSummaryResponse {
  success: boolean;
  activeCount: number;
  overdueCount: number;
  totalOutstanding: number;
  creditLimit: number;
  availableCredit: number;
  bnplEnabled: boolean;
}

export interface BnplPayInitResponse {
  success: boolean;
  repaymentId: string;
  drawdownId: string;
  amountMinor: number;
  mode: "UPI" | "CASH";
  upiCollect?: {
    vpa: string;
    amount: number;
    deepLink: string;
  };
  expiresAt?: string;
  status?: string;
  paidAt?: string;
}

export interface BnplPayConfirmResponse {
  success: boolean;
  status: string;
  drawdownId: string;
  repaymentId: string;
  paidAt: string;
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

const BNPL_BASE = "/api/v1/pos/bnpl";

/**
 * SM-020: Get active BNPL drawdowns for the store
 * Returns list of pending BNPL payments with due dates
 */
export async function getActiveBnpl(): Promise<BnplActiveResponse> {
  return apiClient.get<BnplActiveResponse>(`${BNPL_BASE}/active`);
}

/**
 * SM-020: Get BNPL summary for the store
 * Quick overview without full drawdown details
 */
export async function getBnplSummary(): Promise<BnplSummaryResponse> {
  return apiClient.get<BnplSummaryResponse>(`${BNPL_BASE}/summary`);
}

/**
 * SM-020: Initiate payment for a BNPL drawdown
 * @param drawdownId The drawdown to pay
 * @param mode Payment mode (UPI or CASH)
 * @param amountMinor Optional partial payment amount (defaults to full principal)
 */
export async function payBnpl(
  drawdownId: string,
  mode: "UPI" | "CASH",
  amountMinor?: number
): Promise<BnplPayInitResponse> {
  return apiClient.post<BnplPayInitResponse>(`${BNPL_BASE}/${drawdownId}/pay`, {
    mode,
    amountMinor,
  });
}

/**
 * SM-020: Confirm UPI repayment with UTR
 * @param drawdownId The drawdown being paid
 * @param repaymentId The repayment ID from payBnpl
 * @param upiTxnRef The UPI transaction reference (UTR)
 */
export async function confirmBnplPayment(
  drawdownId: string,
  repaymentId: string,
  upiTxnRef: string
): Promise<BnplPayConfirmResponse> {
  return apiClient.post<BnplPayConfirmResponse>(
    `${BNPL_BASE}/${drawdownId}/pay/confirm`,
    {
      repaymentId,
      upiTxnRef,
    }
  );
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format due date for display
 */
export function formatDueDate(dueDate: string): string {
  const date = new Date(dueDate);
  const options: Intl.DateTimeFormatOptions = {
    month: "short",
    day: "numeric",
  };
  return date.toLocaleDateString("en-IN", options);
}

/**
 * Get status color for BNPL drawdown
 */
export function getBnplStatusColor(
  status: BnplDrawdown["status"],
  isOverdue: boolean
): string {
  if (isOverdue || status === "overdue" || status === "defaulted") {
    return "#DC2626"; // error/red
  }
  if (status === "paid") {
    return "#16A34A"; // success/green
  }
  return "#F59E0B"; // warning/amber for active
}

/**
 * Get status label for BNPL drawdown
 */
export function getBnplStatusLabel(
  status: BnplDrawdown["status"],
  daysRemaining: number
): string {
  if (status === "paid") return "Paid";
  if (status === "defaulted") return "Defaulted";
  if (status === "overdue" || daysRemaining < 0) return "Overdue";
  if (daysRemaining === 0) return "Due Today";
  if (daysRemaining === 1) return "Due Tomorrow";
  return `${daysRemaining} days left`;
}

/**
 * Check if a supplier is BNPL eligible based on store settings
 * This is a client-side check; actual eligibility is determined server-side
 */
export function isSupplierBnplEligible(
  bnplEnabled: boolean,
  availableCredit: number,
  purchaseAmount: number
): boolean {
  return bnplEnabled && availableCredit >= purchaseAmount;
}
