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
  // T-153: Track partial payments
  paidAmountMinor: number;
  dueDate: string;
  status: "active" | "paid" | "partial" | "overdue" | "defaulted";
  daysRemaining: number;
  isOverdue: boolean;
  // T-158: Interest rate fields
  interestRatePercent: number;
  interestMinor: number;
  totalWithInterestMinor: number;
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

// GL-RJ-008: BNPL payment status polling response
export interface BnplPaymentStatusResponse {
  success: boolean;
  repaymentId: string;
  drawdownId: string;
  status: "pending" | "processing" | "completed" | "failed" | "expired";
  amountMinor: number;
  utr?: string;
  paidAt?: string;
  errorMessage?: string;
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
// GL-RJ-008: BNPL Payment Auto-Polling
// =============================================================================

/**
 * GL-RJ-008: Get BNPL payment status for polling
 * Used to auto-detect when UPI payment completes instead of requiring manual UTR
 */
export async function getBnplPaymentStatus(
  drawdownId: string,
  repaymentId: string
): Promise<BnplPaymentStatusResponse> {
  return apiClient.get<BnplPaymentStatusResponse>(
    `${BNPL_BASE}/${drawdownId}/pay/${repaymentId}/status`
  );
}

/**
 * GL-RJ-008: Poll BNPL payment status until completion or timeout
 * GO-LIVE-192: Added AbortSignal support and fixed timer cleanup
 * @param drawdownId The drawdown being paid
 * @param repaymentId The repayment ID from payBnpl
 * @param options Polling options (including optional AbortSignal for cancellation)
 * @returns Promise that resolves when payment completes or rejects on timeout/failure/abort
 */
export async function pollBnplPaymentStatus(
  drawdownId: string,
  repaymentId: string,
  options: {
    intervalMs?: number;
    maxAttempts?: number;
    onStatusUpdate?: (status: BnplPaymentStatusResponse) => void;
    signal?: AbortSignal; // GO-LIVE-192: Allow external cancellation
  } = {}
): Promise<BnplPaymentStatusResponse> {
  const {
    intervalMs = 3000, // Check every 3 seconds
    maxAttempts = 60, // 3 minutes max
    onStatusUpdate,
    signal,
  } = options;

  return new Promise((resolve, reject) => {
    let attempts = 0;
    let pollTimer: ReturnType<typeof setInterval> | null = null;
    let isSettled = false; // GO-LIVE-192: Track if promise has settled

    // GO-LIVE-192: Helper to clean up timer safely
    const cleanup = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
    };

    // GO-LIVE-192: Handle external abort signal
    const handleAbort = () => {
      if (isSettled) return;
      isSettled = true;
      cleanup();
      reject(new Error("Payment polling cancelled"));
    };

    if (signal?.aborted) {
      reject(new Error("Payment polling cancelled"));
      return;
    }

    signal?.addEventListener("abort", handleAbort);

    const checkStatus = async () => {
      // GO-LIVE-192: Skip if already settled or aborted
      if (isSettled || signal?.aborted) {
        cleanup();
        return;
      }

      try {
        attempts++;
        const status = await getBnplPaymentStatus(drawdownId, repaymentId);

        // GO-LIVE-192: Check again after async operation
        if (isSettled || signal?.aborted) {
          cleanup();
          return;
        }

        onStatusUpdate?.(status);

        if (status.status === "completed") {
          isSettled = true;
          cleanup();
          signal?.removeEventListener("abort", handleAbort);
          resolve(status);
          return;
        }

        if (status.status === "failed" || status.status === "expired") {
          isSettled = true;
          cleanup();
          signal?.removeEventListener("abort", handleAbort);
          reject(new Error(status.errorMessage || `Payment ${status.status}`));
          return;
        }

        if (attempts >= maxAttempts) {
          isSettled = true;
          cleanup();
          signal?.removeEventListener("abort", handleAbort);
          reject(new Error("Payment verification timed out. Please verify manually."));
          return;
        }
      } catch (error) {
        console.warn("[pollBnplPaymentStatus] Check failed:", error);
        // Don't stop polling on network errors, let it retry
        if (attempts >= maxAttempts) {
          isSettled = true;
          cleanup();
          signal?.removeEventListener("abort", handleAbort);
          reject(error);
        }
      }
    };

    // Initial check immediately
    void checkStatus();

    // Then poll at interval
    pollTimer = setInterval(checkStatus, intervalMs);
  });
}

// =============================================================================
// GCP-STG-0411: BNPL Credit Application (SuperMandi as credit provider)
// =============================================================================

export interface BnplApplyInput {
  businessName: string;
  gstin?: string;
  requestedAmountMinor: number;
}

export interface BnplApplyResponse {
  success: boolean;
  applicationId: string;
  status: "pending";
  createdAt: string;
}

export interface BnplCreditLineResponse {
  success: boolean;
  hasCreditLine: boolean;
  creditLine?: {
    id: string;
    approvedLimitMinor: number;
    usedMinor: number;
    availableMinor: number;
    status: string;
    approvedAt: string | null;
  };
  pendingApplication?: {
    id: string;
    status: string;
    createdAt: string;
  } | null;
}

/**
 * GCP-STG-0411: Apply for BNPL credit line
 */
export async function applyForBnpl(input: BnplApplyInput): Promise<BnplApplyResponse> {
  return apiClient.post<BnplApplyResponse>(`${BNPL_BASE}/apply`, input);
}

/**
 * GCP-STG-0411: Get current store's BNPL credit line status
 */
export async function getBnplCreditLine(): Promise<BnplCreditLineResponse> {
  return apiClient.get<BnplCreditLineResponse>(`${BNPL_BASE}/credit-line`);
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

// =============================================================================
// GO-LIVE-240: BNPL Dispute Functions
// =============================================================================

export interface BnplDisputeResponse {
  success: boolean;
  disputeId: string;
  drawdownId: string;
  status: "submitted" | "under_review" | "resolved" | "rejected";
  createdAt: string;
}

// STG-464: Dispute audit trail types
export interface BnplDisputeRecord {
  id: string;
  drawdownId: string;
  reason: string;
  description: string | null;
  status: "submitted" | "under_review" | "resolved" | "rejected";
  createdAt: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
}

export interface BnplDisputeHistoryResponse {
  success: boolean;
  disputes: BnplDisputeRecord[];
}

// STG-465: Per-supplier limit types
export interface BnplSupplierLimitResponse {
  success: boolean;
  supplierId: string;
  supplierLimit: number;
  outstanding: number;
  available: number;
  interestRate: number;
}

/**
 * GO-LIVE-240: Submit a dispute for a BNPL drawdown
 * @param drawdownId The drawdown to dispute
 * @param reason Dispute reason code
 * @param description Additional details provided by user
 */
export async function submitBnplDispute(
  drawdownId: string,
  reason: string,
  description?: string
): Promise<BnplDisputeResponse> {
  return apiClient.post<BnplDisputeResponse>(`${BNPL_BASE}/${drawdownId}/dispute`, {
    reason,
    description,
  });
}

/**
 * STG-464: Get dispute history for a drawdown (audit trail)
 */
export async function getBnplDisputeHistory(
  drawdownId: string
): Promise<BnplDisputeHistoryResponse> {
  return apiClient.get<BnplDisputeHistoryResponse>(`${BNPL_BASE}/${drawdownId}/disputes`);
}

/**
 * STG-465: Get per-supplier drawdown limit
 */
export async function getBnplSupplierLimit(
  supplierId: string
): Promise<BnplSupplierLimitResponse> {
  return apiClient.get<BnplSupplierLimitResponse>(`${BNPL_BASE}/supplier/${supplierId}/limit`);
}
