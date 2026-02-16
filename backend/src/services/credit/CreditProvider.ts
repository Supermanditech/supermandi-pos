// T-263: Credit Provider Abstraction Layer
// Standard interface that all B2B finance providers implement
// Supports: trade_credit, credit_line, invoice_discounting, laas

export type CreditMode = 'trade_credit' | 'credit_line' | 'invoice_discounting' | 'laas';

export interface EligibilityResult {
  eligible: boolean;
  maxAmountMinor: number;
  minAmountMinor: number;
  tenureOptions: { days: number; interestRateAnnual: number }[];
  reason?: string;              // if not eligible
  providerRef?: string;         // provider-side reference
}

export interface CreditOffer {
  offerId: string;              // internal UUID
  providerId: string;
  providerName: string;
  mode: CreditMode;
  amountMinor: number;
  tenureDays: number;
  interestRateAnnual: number;
  emiMinor?: number;            // monthly EMI if applicable
  processingFeeMinor?: number;
  totalRepayableMinor: number;
  validUntil: string;           // ISO date
  terms?: string;               // human-readable terms
  providerRef?: string;
}

export interface DrawdownParams {
  storeId: string;
  supplierId?: string;
  purchaseOrderId?: string;
  offerId?: string;
  amountMinor: number;
  tenureDays: number;
}

export interface DrawdownResult {
  success: boolean;
  drawdownId: string;           // internal UUID
  externalLoanId?: string;      // provider-side loan ID
  status: string;
  message?: string;
}

export interface RepaymentSchedule {
  installments: {
    number: number;
    dueDate: string;            // ISO date
    principalMinor: number;
    interestMinor: number;
    totalMinor: number;
    status: 'pending' | 'paid' | 'overdue' | 'waived';
    paidAt?: string;
  }[];
  totalPrincipalMinor: number;
  totalInterestMinor: number;
  totalRepayableMinor: number;
  nextDueDate?: string;
  nextAmountMinor?: number;
}

export interface RepaymentParams {
  drawdownId: string;
  amountMinor: number;
  mode: 'UPI' | 'CASH' | 'BANK';
  utr?: string;
}

export interface RepaymentResult {
  success: boolean;
  repaymentId: string;
  remainingMinor: number;
  status: 'paid' | 'partial' | 'failed';
  message?: string;
}

export interface BalanceResult {
  totalCreditLimitMinor: number;
  usedMinor: number;
  availableMinor: number;
  activeDrawdowns: number;
  overdueDrawdowns: number;
}

export interface ProviderHealth {
  providerId: string;
  status: 'healthy' | 'degraded' | 'down';
  latencyMs: number;
  lastChecked: string;
  approvalRate?: number;        // percentage
  errorRate?: number;
}

/**
 * Standard interface for all credit providers.
 * Each provider (Rupifi, KredX, Mintifi, etc.) implements this interface.
 * The registry manages provider lifecycle and routing.
 */
export interface CreditProvider {
  readonly providerId: string;
  readonly providerName: string;
  readonly mode: CreditMode;

  /** Check if a store is eligible for credit from this provider */
  checkEligibility(storeId: string): Promise<EligibilityResult>;

  /** Get available credit offers for a store */
  getOffers(storeId: string): Promise<CreditOffer[]>;

  /** Create a drawdown (loan/credit usage) */
  createDrawdown(params: DrawdownParams): Promise<DrawdownResult>;

  /** Get repayment schedule for an active drawdown */
  getRepaymentSchedule(drawdownId: string): Promise<RepaymentSchedule>;

  /** Process a repayment against a drawdown */
  processRepayment(params: RepaymentParams): Promise<RepaymentResult>;

  /** Get credit balance summary for a store */
  getBalance(storeId: string): Promise<BalanceResult>;

  /** Health check for monitoring */
  healthCheck(): Promise<ProviderHealth>;
}
