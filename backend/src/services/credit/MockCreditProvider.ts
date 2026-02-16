// T-263: Mock Credit Provider for staging/testing
// Simulates a real provider with configurable behavior

import type {
  CreditProvider,
  CreditMode,
  EligibilityResult,
  CreditOffer,
  DrawdownParams,
  DrawdownResult,
  RepaymentSchedule,
  RepaymentParams,
  RepaymentResult,
  BalanceResult,
  ProviderHealth,
} from './CreditProvider';

export class MockCreditProvider implements CreditProvider {
  readonly providerId = 'mock_provider';
  readonly providerName = 'Mock Finance (Staging)';
  readonly mode: CreditMode = 'trade_credit';

  private balances = new Map<string, { used: number; limit: number }>();

  async checkEligibility(storeId: string): Promise<EligibilityResult> {
    return {
      eligible: true,
      maxAmountMinor: 20000000, // Rs 2,00,000
      minAmountMinor: 100000,   // Rs 1,000
      tenureOptions: [
        { days: 15, interestRateAnnual: 0 },
        { days: 30, interestRateAnnual: 12 },
        { days: 60, interestRateAnnual: 15 },
        { days: 90, interestRateAnnual: 18 },
      ],
      providerRef: `mock-elig-${storeId.slice(0, 8)}`,
    };
  }

  async getOffers(storeId: string): Promise<CreditOffer[]> {
    const now = new Date();
    const validUntil = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

    return [
      {
        offerId: `mock-offer-15d-${storeId.slice(0, 8)}`,
        providerId: this.providerId,
        providerName: this.providerName,
        mode: this.mode,
        amountMinor: 10000000,  // Rs 1,00,000
        tenureDays: 15,
        interestRateAnnual: 0,
        totalRepayableMinor: 10000000,
        validUntil,
        terms: '15-day interest-free trade credit',
      },
      {
        offerId: `mock-offer-30d-${storeId.slice(0, 8)}`,
        providerId: this.providerId,
        providerName: this.providerName,
        mode: this.mode,
        amountMinor: 20000000,  // Rs 2,00,000
        tenureDays: 30,
        interestRateAnnual: 12,
        emiMinor: 0,            // single repayment
        totalRepayableMinor: 20197260, // Rs 2,00,000 + 1% monthly interest
        validUntil,
        terms: '30-day trade credit at 12% p.a.',
      },
    ];
  }

  async createDrawdown(params: DrawdownParams): Promise<DrawdownResult> {
    const bal = this.balances.get(params.storeId) || { used: 0, limit: 20000000 };
    if (bal.used + params.amountMinor > bal.limit) {
      return { success: false, drawdownId: '', status: 'rejected', message: 'Credit limit exceeded' };
    }
    bal.used += params.amountMinor;
    this.balances.set(params.storeId, bal);

    return {
      success: true,
      drawdownId: `mock-dd-${Date.now()}`,
      externalLoanId: `MOCK-LOAN-${Date.now()}`,
      status: 'active',
    };
  }

  async getRepaymentSchedule(drawdownId: string): Promise<RepaymentSchedule> {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);

    return {
      installments: [{
        number: 1,
        dueDate: dueDate.toISOString().split('T')[0],
        principalMinor: 10000000,
        interestMinor: 100000,
        totalMinor: 10100000,
        status: 'pending',
      }],
      totalPrincipalMinor: 10000000,
      totalInterestMinor: 100000,
      totalRepayableMinor: 10100000,
      nextDueDate: dueDate.toISOString().split('T')[0],
      nextAmountMinor: 10100000,
    };
  }

  async processRepayment(params: RepaymentParams): Promise<RepaymentResult> {
    return {
      success: true,
      repaymentId: `mock-repay-${Date.now()}`,
      remainingMinor: 0,
      status: 'paid',
    };
  }

  async getBalance(storeId: string): Promise<BalanceResult> {
    const bal = this.balances.get(storeId) || { used: 0, limit: 20000000 };
    return {
      totalCreditLimitMinor: bal.limit,
      usedMinor: bal.used,
      availableMinor: bal.limit - bal.used,
      activeDrawdowns: bal.used > 0 ? 1 : 0,
      overdueDrawdowns: 0,
    };
  }

  async healthCheck(): Promise<ProviderHealth> {
    return {
      providerId: this.providerId,
      status: 'healthy',
      latencyMs: 5,
      lastChecked: new Date().toISOString(),
      approvalRate: 95,
      errorRate: 0,
    };
  }
}
