/**
 * STG-457: Credit consent gate — blocks scoring without DPDP consent
 * Source analysis: backend checks consent before calculateCreditScore,
 * frontend handles consentRequired response.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-457: Credit consent gate', () => {
  const creditSource = readFileSync(
    join(__dirname, '..', 'src', 'routes', 'v1', 'pos', 'credit.ts'),
    'utf-8'
  );

  it('should check consent_records before credit scoring', () => {
    const offersRoute = creditSource.substring(creditSource.indexOf('credit/offers'));
    // Consent check must come BEFORE calculateCreditScore
    const consentIdx = offersRoute.indexOf('consent_records');
    const scoreIdx = offersRoute.indexOf('calculateCreditScore');
    expect(consentIdx).toBeGreaterThan(-1);
    expect(scoreIdx).toBeGreaterThan(-1);
    expect(consentIdx).toBeLessThan(scoreIdx);
  });

  it('should query for credit_scoring consent type', () => {
    expect(creditSource).toContain("consent_type = 'credit_scoring'");
  });

  it('should return consentRequired flag when no consent', () => {
    expect(creditSource).toContain('consentRequired: true');
    expect(creditSource).toContain("consentType: 'credit_scoring'");
  });

  it('should return empty offers and null score in consent-required response', () => {
    // Verify the consent-required response includes empty data
    expect(creditSource).toContain('consentRequired: true');
    expect(creditSource).toContain('offers: [],');
    expect(creditSource).toContain('creditScore: null,');
    expect(creditSource).toContain('eligibleAmount: 0,');
  });

  it('should scope consent check to store_id', () => {
    expect(creditSource).toContain('store_id = $1');
  });
});
