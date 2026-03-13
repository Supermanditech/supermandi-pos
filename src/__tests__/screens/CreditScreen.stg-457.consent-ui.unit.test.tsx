/**
 * STG-457: CreditScreen handles consentRequired response from backend
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-457: CreditScreen consent UI', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'screens', 'CreditScreen.tsx'),
    'utf-8'
  );

  it('should have consentRequired state', () => {
    expect(source).toContain('consentRequired');
    expect(source).toContain('setConsentRequired');
  });

  it('should check offersRes.consentRequired from API response', () => {
    expect(source).toContain('offersRes.consentRequired');
  });

  it('should clear offers when consent is required', () => {
    const consentBlock = source.substring(
      source.indexOf('STG-457: Check if consent'),
      source.indexOf('setConsentRequired(false)')
    );
    expect(consentBlock).toContain('setOffers([])');
    expect(consentBlock).toContain('setCreditScore(null)');
  });
});
