/**
 * STG-239 to STG-244: i18n shared locale key fixes (Layer 2D)
 */

import en from '../../i18n/locales/en.json';
import hi from '../../i18n/locales/hi.json';

describe('STG-239: Replace MOQ with Min. Order', () => {
  it('should not have raw "MOQ" in English buy section', () => {
    expect((en as any).buy.moq).not.toBe('MOQ');
    expect((en as any).buy.moq).toContain('Min');
  });
  it('should not have raw "MOQ" in Hindi', () => {
    expect((hi as any).buy.moq).not.toBe('MOQ');
  });
});

describe('STG-240: Tab labels title case', () => {
  it('should use title case for tabs in English', () => {
    expect(en.tabs.sell).toBe('Sell');
    expect(en.tabs.buy).toBe('Buy');
    expect(en.tabs.menu).toBe('Menu');
    expect(en.tabs.credit).toBe('Credit');
    expect(en.tabs.purchase).toBe('Purchase');
    expect(en.tabs.reorder).toBe('Reorder');
  });
});

describe('STG-241: dismissSuggestedFrom simplified for Hindi', () => {
  it('should have supplier and qty in Hindi template', () => {
    expect((hi as any).reorder.dismissSuggestedFrom).toContain('{{supplier}}');
    expect((hi as any).reorder.dismissSuggestedFrom).toContain('{{qty}}');
  });
});

describe('STG-242: KYC/UTR/EMI jargon explained', () => {
  it('should explain KYC in English', () => {
    expect(en.credit.kycVerification).toContain('Identity');
  });
  it('should explain EMI in English', () => {
    expect(en.credit.emi).toContain('Monthly');
  });
  it('should mention GPay/PhonePe in UPI instructions', () => {
    expect((en as any).bnpl.upiInstructions).toContain('GPay');
  });
});

describe('STG-243: UPI instructions clearer', () => {
  it('should explain UTR as 12-digit reference', () => {
    expect((en as any).bnpl.upiInstructions).toContain('12-digit');
  });
  it('should explain UTR in Hindi', () => {
    expect((hi as any).bnpl.upiInstructions).toContain('12-अंकीय');
  });
});

describe('STG-244: Goods Receipt Note → Stock Received', () => {
  it('should say Stock Received in English', () => {
    expect((en as any).grn.title).toBe('Stock Received');
  });
  it('should say स्टॉक प्राप्त in Hindi', () => {
    expect((hi as any).grn.title).toBe('स्टॉक प्राप्त');
  });
});
