/**
 * STG-234 to STG-238: i18n locale key fixes
 * - STG-234: status.storeInactive — remove "Superadmin"
 * - STG-235: status.deviceInactive — remove "Superadmin"
 * - STG-236: errors.deviceAlreadyEnrolled — remove "Superadmin"
 * - STG-237: errors.sessionExpired — "re-enter staff PIN"
 * - STG-238: sell.digitiseMode — plain language
 */

import en from '../../i18n/locales/en.json';
import hi from '../../i18n/locales/hi.json';

describe('STG-234: status.storeInactive', () => {
  it('should not contain "Superadmin" in English', () => {
    expect(en.status.storeInactive).not.toContain('Superadmin');
  });
  it('should not contain "Superadmin" in Hindi', () => {
    expect(hi.status.storeInactive).not.toContain('Superadmin');
  });
});

describe('STG-235: status.deviceInactive', () => {
  it('should not contain "Superadmin" in English', () => {
    expect(en.status.deviceInactive).not.toContain('Superadmin');
  });
  it('should not contain "Superadmin" in Hindi', () => {
    expect(hi.status.deviceInactive).not.toContain('Superadmin');
  });
});

describe('STG-236: errors.deviceAlreadyEnrolled', () => {
  it('should not contain "Superadmin" in English', () => {
    expect(en.errors.deviceAlreadyEnrolled).not.toContain('Superadmin');
  });
  it('should not contain "Superadmin" in Hindi', () => {
    expect(hi.errors.deviceAlreadyEnrolled).not.toContain('Superadmin');
  });
});

describe('STG-237: errors.sessionExpired', () => {
  it('should say "re-enter" and "PIN" in English', () => {
    expect(en.errors.sessionExpired).toContain('re-enter');
    expect(en.errors.sessionExpired).toContain('PIN');
  });
  it('should say "PIN" in Hindi', () => {
    expect(hi.errors.sessionExpired).toContain('PIN');
  });
});

describe('STG-238: sell.digitiseMode', () => {
  it('should not say "Digitise mode on" in English', () => {
    expect(en.sell.digitiseMode).not.toContain('Digitise mode on');
  });
  it('should use plain language "Catalog mode" in English', () => {
    expect(en.sell.digitiseMode).toMatch(/[Cc]atalog/);
  });
  it('should use plain language in Hindi', () => {
    expect(hi.sell.digitiseMode).toContain('कैटलॉग');
  });
});
