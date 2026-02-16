// SM-022: Credit API Service
// Frontend API client for Credit (term loans) operations

import { apiClient } from "./apiClient";

// =============================================================================
// TYPES
// =============================================================================

export type CreditScore = "EXCELLENT" | "GOOD" | "FAIR" | "POOR";

export interface CreditOffer {
  id: string;
  source: string;
  amountMinor: number;
  tenureMonths: number;
  interestRateAnnual: number;
  emiMinor: number;
  validUntil: string | null;
}

export interface ScoringFactors {
  monthlyGmv: number;
  transactionCount: number;
  bnplRepaymentRate: number;
  accountAge: number;
}

export interface ActiveApplication {
  id: string;
  status: string;
  kycStatus: string;
  requestedAmountMinor: number;
}

export interface CreditOffersResponse {
  success: boolean;
  offers: CreditOffer[];
  creditScore: CreditScore;
  eligibleAmount: number;
  scoringFactors: ScoringFactors;
  activeApplication: ActiveApplication | null;
}

export interface CreditApplication {
  id: string;
  offerId: string;
  offerSource: string;
  requestedAmountMinor: number;
  status: "submitted" | "processing" | "approved" | "disbursed" | "rejected";
  kycStatus: "pending" | "submitted" | "verified" | "rejected";
  disbursedAmountMinor: number | null;
  disbursedAt: string | null;
  tenureMonths: number;
  interestRateAnnual: number;
  createdAt: string;
}

export interface ActiveLoan {
  applicationId: string;
  disbursedAmountMinor: number;
  remainingBalanceMinor: number;
  tenureMonths: number;
  interestRateAnnual: number;
  emiMinor: number;
  nextEmiDate: string;
  paidEmis: number;
  totalEmis: number;
  status: "active" | "completed" | "overdue";
  disbursedAt: string;
}

export interface EmiPayment {
  id: string;
  loanId: string;
  emiNumber: number;
  amountMinor: number;
  principalMinor: number;
  interestMinor: number;
  paidAt: string;
  mode: "UPI" | "CASH" | "AUTO_DEBIT";
  status: "paid" | "partial" | "failed";
}

export interface CreditApplyResponse {
  success: boolean;
  applicationId?: string;
  status?: string;
  nextStep?: string;
  message: string;
  error?: string;
}

export interface CreditKycResponse {
  success: boolean;
  kycStatus: string;
  applicationStatus: string;
  approvedAmount?: number;
  disbursementEta?: string;
  message: string;
}

export interface CreditApplicationsResponse {
  success: boolean;
  applications: CreditApplication[];
}

// =============================================================================
// API FUNCTIONS
// =============================================================================

const CREDIT_BASE = "/api/v1/pos/credit";

/**
 * SM-022: Get available credit offers for the store
 * Returns offers based on store's credit score and eligibility
 */
export async function getCreditOffers(): Promise<CreditOffersResponse> {
  return apiClient.get<CreditOffersResponse>(`${CREDIT_BASE}/offers`);
}

/**
 * SM-022: Apply for a credit offer
 * @param offerId The offer ID to apply for
 * @param requestedAmountMinor The amount requested (in paise)
 */
export async function applyForCredit(
  offerId: string,
  requestedAmountMinor: number
): Promise<CreditApplyResponse> {
  return apiClient.post<CreditApplyResponse>(`${CREDIT_BASE}/apply`, {
    offerId,
    requestedAmountMinor,
  });
}

/**
 * SM-022: Submit KYC for credit application
 * @param applicationId The application ID
 * @param panNumber PAN card number (format: ABCDE1234F)
 * @param aadhaarLast4 Last 4 digits of Aadhaar
 */
export async function submitCreditKyc(
  applicationId: string,
  panNumber: string,
  aadhaarLast4: string
): Promise<CreditKycResponse> {
  return apiClient.post<CreditKycResponse>(
    `${CREDIT_BASE}/${applicationId}/kyc`,
    {
      panNumber,
      aadhaarLast4,
    }
  );
}

/**
 * SM-022: Get credit application history
 * Returns list of past and current applications
 */
export async function getCreditApplications(): Promise<CreditApplicationsResponse> {
  return apiClient.get<CreditApplicationsResponse>(`${CREDIT_BASE}/applications`);
}

// =============================================================================
// T-274: Multi-Provider Credit Offers (from CreditProviderRegistry)
// =============================================================================

export interface ProviderOffer {
  offerId: string;
  providerId: string;
  providerName: string;
  mode: string;
  amountMinor: number;
  tenureDays: number;
  interestRateAnnual: number;
  emiMinor?: number;
  totalRepayableMinor: number;
  validUntil: string;
  terms?: string;
}

export interface ProviderOffersResponse {
  success: boolean;
  offers: ProviderOffer[];
  balance: {
    totalCreditLimitMinor: number;
    usedMinor: number;
    availableMinor: number;
    activeDrawdowns: number;
    overdueDrawdowns: number;
  };
  providerCount: number;
}

/**
 * T-274: Get aggregated credit offers from ALL active providers
 * Sorted by total cost (cheapest first)
 */
export async function getProviderOffers(): Promise<ProviderOffersResponse> {
  return apiClient.get<ProviderOffersResponse>("/api/v1/credit/offers");
}

/**
 * T-274: Create a drawdown from a specific provider
 */
export async function createProviderDrawdown(params: {
  providerId: string;
  amountMinor: number;
  tenureDays: number;
  supplierId?: string;
  purchaseOrderId?: string;
}): Promise<{ success: boolean; drawdownId: string; status: string; message?: string }> {
  return apiClient.post("/api/v1/credit/drawdown", params);
}

// =============================================================================
// HELPER FUNCTIONS
// =============================================================================

/**
 * Format amount in rupees for display
 */
export function formatCreditAmount(amountMinor: number): string {
  const rupees = amountMinor / 100;
  if (rupees >= 100000) {
    return `₹${(rupees / 100000).toFixed(1)}L`;
  }
  if (rupees >= 1000) {
    return `₹${(rupees / 1000).toFixed(0)}K`;
  }
  return `₹${rupees.toFixed(0)}`;
}

/**
 * Format EMI amount for display
 */
export function formatEmiAmount(emiMinor: number): string {
  const rupees = emiMinor / 100;
  return `₹${rupees.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

/**
 * Get color based on credit score
 */
export function getCreditScoreColor(score: CreditScore): string {
  switch (score) {
    case "EXCELLENT":
      return "#16A34A"; // green
    case "GOOD":
      return "#22C55E"; // light green
    case "FAIR":
      return "#F59E0B"; // amber
    case "POOR":
      return "#DC2626"; // red
    default:
      return "#6B7280"; // gray
  }
}

/**
 * Get label for credit score
 */
export function getCreditScoreLabel(score: CreditScore): string {
  switch (score) {
    case "EXCELLENT":
      return "Excellent";
    case "GOOD":
      return "Good";
    case "FAIR":
      return "Fair";
    case "POOR":
      return "Needs Improvement";
    default:
      return "Unknown";
  }
}

/**
 * Get status color for application
 */
export function getApplicationStatusColor(status: CreditApplication["status"]): string {
  switch (status) {
    case "disbursed":
      return "#16A34A"; // green
    case "approved":
      return "#22C55E"; // light green
    case "processing":
    case "submitted":
      return "#F59E0B"; // amber
    case "rejected":
      return "#DC2626"; // red
    default:
      return "#6B7280"; // gray
  }
}

/**
 * Get status label for application
 */
export function getApplicationStatusLabel(
  status: CreditApplication["status"],
  kycStatus: CreditApplication["kycStatus"]
): string {
  switch (status) {
    case "disbursed":
      return "Disbursed";
    case "approved":
      return "Approved - Pending Disbursement";
    case "processing":
      return "Processing";
    case "submitted":
      if (kycStatus === "pending") return "KYC Pending";
      if (kycStatus === "submitted") return "KYC Under Review";
      return "Submitted";
    case "rejected":
      return "Rejected";
    default:
      return status;
  }
}

/**
 * Calculate EMI from principal, rate, and tenure
 * Formula: P * r * (1+r)^n / ((1+r)^n - 1)
 */
export function calculateEmi(
  principalMinor: number,
  annualRate: number,
  tenureMonths: number
): number {
  const r = annualRate / 12 / 100;
  if (r === 0) return Math.round(principalMinor / tenureMonths);
  const emi =
    (principalMinor * r * Math.pow(1 + r, tenureMonths)) /
    (Math.pow(1 + r, tenureMonths) - 1);
  return Math.round(emi);
}

/**
 * Get offer source display name
 */
export function getOfferSourceLabel(source: string): string {
  switch (source) {
    case "SUPERMANDI":
      return "SuperMandi Credit";
    case "SUPERMANDI_BNPL":
      return "Interest-Free BNPL";
    case "OCEN":
      return "OCEN Partner";
    case "PARTNER_BANK":
      return "Partner Bank";
    default:
      return source;
  }
}

/**
 * Format interest rate for display
 */
export function formatInterestRate(rate: number): string {
  if (rate === 0) return "0% Interest";
  return `${rate.toFixed(1)}% p.a.`;
}

/**
 * Format tenure for display
 */
export function formatTenure(months: number): string {
  if (months === 1) return "1 month";
  if (months === 12) return "1 year";
  if (months > 12 && months % 12 === 0) return `${months / 12} years`;
  return `${months} months`;
}
