// T-263: Credit Provider Registry
// Manages all registered credit providers, routes requests, aggregates offers

import type { Pool } from 'pg';
import type {
  CreditProvider,
  CreditOffer,
  EligibilityResult,
  BalanceResult,
  ProviderHealth,
} from './CreditProvider';
import { SuperMandiCreditProvider } from './SuperMandiCreditProvider';
import { MockCreditProvider } from './MockCreditProvider';
import { log } from "../../lib/logger";

export class CreditProviderRegistry {
  private providers = new Map<string, CreditProvider>();
  private pool: Pool | null = null;

  /** Initialize registry with DB pool — registers built-in providers */
  init(pool: Pool): void {
    this.pool = pool;
    // Always register internal provider
    this.register(new SuperMandiCreditProvider(pool));
    // Register mock provider in non-production
    if (process.env.NODE_ENV !== 'production' || process.env.MOCK_CREDIT_PROVIDER === 'true') {
      this.register(new MockCreditProvider());
    }
  }

  /** Register a credit provider */
  register(provider: CreditProvider): void {
    this.providers.set(provider.providerId, provider);
  }

  /** Get a specific provider by ID */
  get(providerId: string): CreditProvider | undefined {
    return this.providers.get(providerId);
  }

  /** List all registered provider IDs */
  listProviderIds(): string[] {
    return Array.from(this.providers.keys());
  }

  /** Get active providers from DB config (respects is_active flag) */
  async getActiveProviders(): Promise<{ providerId: string; providerName: string; mode: string; priority: number }[]> {
    if (!this.pool) return [];
    const result = await this.pool.query(
      `SELECT provider_id, provider_name, mode, priority
       FROM payments.credit_provider_configs
       WHERE is_active = true
       ORDER BY priority ASC`
    );
    return result.rows.map(r => ({
      providerId: r.provider_id,
      providerName: r.provider_name,
      mode: r.mode,
      priority: r.priority,
    }));
  }

  /**
   * T-282: Get aggregated offers from ALL active providers for a store
   * Returns offers sorted by total cost (cheapest first)
   */
  async getAllOffers(storeId: string): Promise<CreditOffer[]> {
    const activeConfigs = await this.getActiveProviders();
    const allOffers: CreditOffer[] = [];

    const promises = activeConfigs.map(async (config) => {
      const provider = this.providers.get(config.providerId);
      if (!provider) return;
      try {
        const offers = await provider.getOffers(storeId);
        allOffers.push(...offers);
      } catch (err) {
        log.warn(`[T-263] Provider ${config.providerId} getOffers failed:`, err instanceof Error ? err.message : err);
      }
    });

    await Promise.all(promises);

    // Sort by total repayable (cheapest first)
    allOffers.sort((a, b) => {
      const costA = a.totalRepayableMinor - a.amountMinor;
      const costB = b.totalRepayableMinor - b.amountMinor;
      return costA - costB;
    });

    return allOffers;
  }

  /**
   * Check eligibility across all active providers
   */
  async checkAllEligibility(storeId: string): Promise<{ providerId: string; result: EligibilityResult }[]> {
    const activeConfigs = await this.getActiveProviders();
    const results: { providerId: string; result: EligibilityResult }[] = [];

    const promises = activeConfigs.map(async (config) => {
      const provider = this.providers.get(config.providerId);
      if (!provider) return;
      try {
        const result = await provider.checkEligibility(storeId);
        results.push({ providerId: config.providerId, result });
      } catch (err) {
        log.warn(`[T-263] Provider ${config.providerId} eligibility check failed:`, err instanceof Error ? err.message : err);
      }
    });

    await Promise.all(promises);
    return results;
  }

  /**
   * T-282: Get aggregated balance across all providers for a store
   */
  async getAggregatedBalance(storeId: string): Promise<BalanceResult & { perProvider: (BalanceResult & { providerId: string })[] }> {
    const activeConfigs = await this.getActiveProviders();
    const perProvider: (BalanceResult & { providerId: string })[] = [];

    const promises = activeConfigs.map(async (config) => {
      const provider = this.providers.get(config.providerId);
      if (!provider) return;
      try {
        const bal = await provider.getBalance(storeId);
        perProvider.push({ ...bal, providerId: config.providerId });
      } catch (err) {
        log.warn(`[T-263] Provider ${config.providerId} balance failed:`, err instanceof Error ? err.message : err);
      }
    });

    await Promise.all(promises);

    return {
      totalCreditLimitMinor: perProvider.reduce((s, p) => s + p.totalCreditLimitMinor, 0),
      usedMinor: perProvider.reduce((s, p) => s + p.usedMinor, 0),
      availableMinor: perProvider.reduce((s, p) => s + p.availableMinor, 0),
      activeDrawdowns: perProvider.reduce((s, p) => s + p.activeDrawdowns, 0),
      overdueDrawdowns: perProvider.reduce((s, p) => s + p.overdueDrawdowns, 0),
      perProvider,
    };
  }

  /**
   * T-281: Health check all providers
   */
  async healthCheckAll(): Promise<ProviderHealth[]> {
    const results: ProviderHealth[] = [];
    const promises = Array.from(this.providers.entries()).map(async ([id, provider]) => {
      try {
        const health = await provider.healthCheck();
        results.push(health);
      } catch {
        results.push({
          providerId: id,
          status: 'down',
          latencyMs: 0,
          lastChecked: new Date().toISOString(),
        });
      }
    });
    await Promise.all(promises);
    return results;
  }
}

// Singleton instance
export const creditRegistry = new CreditProviderRegistry();
