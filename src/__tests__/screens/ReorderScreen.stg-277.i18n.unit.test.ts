/**
 * STG-277: ReorderScreen & ReorderPoliciesScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All reorder.* keys used in ReorderScreen exist in en.json and hi.json
 * 2. All reorderPolicy.* keys used in ReorderPoliciesScreen exist in en.json and hi.json
 * 3. Both screens use t() calls instead of hardcoded strings
 * 4. No raw English strings remain in the components
 * 5. useTranslation is imported and used in both screens
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const reorderSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'ReorderScreen.tsx'),
  'utf-8'
);
const policiesSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'ReorderPoliciesScreen.tsx'),
  'utf-8'
);

// New reorder.* keys added by STG-277 for ReorderScreen
const REORDER_KEYS = [
  'loadFailed',
  'allCaughtUp',
  'noPendingDescription',
  'itemsNeedAttention',
  'selectAll',
  'deselectAll',
  'selectedCount',
  'loadingPending',
  'approveSelected',
  'approveSelectedLabel',
  'dismissFailedTitle',
  'dismissFailedMessage',
] as const;

// reorderPolicy.* keys for ReorderPoliciesScreen
const REORDER_POLICY_KEYS = [
  'title',
  'loadFailed',
  'updateFailed',
  'noMatchingPolicies',
  'adjustSearchOrFilter',
  'noPoliciesYet',
  'noPoliciesDescription',
  'statsSubtitle',
  'searchPlaceholder',
  'loadingPolicies',
  'filterAll',
  'filterEnabled',
  'filterDisabled',
  'filterLowStock',
] as const;

describe('STG-277: ReorderScreen i18n', () => {
  describe('en.json has all new reorder keys', () => {
    it.each(REORDER_KEYS)('reorder.%s exists in en.json', (key) => {
      expect(en.reorder).toBeDefined();
      expect(en.reorder[key]).toBeTruthy();
      expect(typeof en.reorder[key]).toBe('string');
    });
  });

  describe('hi.json has all new reorder keys', () => {
    it.each(REORDER_KEYS)('reorder.%s exists in hi.json', (key) => {
      expect(hi.reorder).toBeDefined();
      expect(hi.reorder[key]).toBeTruthy();
      expect(typeof hi.reorder[key]).toBe('string');
    });
  });

  describe('ReorderScreen.tsx uses t() calls', () => {
    const normalizedSource = reorderSource.replace(/\s+/g, '');

    it.each(REORDER_KEYS)(
      'uses t("reorder.%s") in source',
      (key) => {
        expect(normalizedSource).toContain(`t("reorder.${key}"`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain in ReorderScreen', () => {
    it('should not have hardcoded "Pending Reorders" as raw text', () => {
      expect(reorderSource).not.toMatch(/>Pending Reorders</);
    });

    it('should not have hardcoded "All caught up!" as raw text', () => {
      expect(reorderSource).not.toMatch(/>All caught up!</);
    });

    it('should not have hardcoded "No pending reorders at this time" as raw text', () => {
      expect(reorderSource).not.toMatch(/No pending reorders at this time/);
    });

    it('should not have hardcoded "Retry" as raw text', () => {
      expect(reorderSource).not.toMatch(/>Retry</);
    });

    it('should not have hardcoded "Loading pending reorders..." as raw text', () => {
      expect(reorderSource).not.toMatch(/>Loading pending reorders\.\.\.</);
    });

    it('should not have hardcoded "Select All" as raw text', () => {
      expect(reorderSource).not.toMatch(/>Select All</);
      expect(reorderSource).not.toMatch(/>Deselect All</);
    });

    it('should not have hardcoded "Approve Selected" as raw text', () => {
      expect(reorderSource).not.toMatch(/>Approve Selected/);
    });

    it('should not have hardcoded "selected" count as raw text', () => {
      expect(reorderSource).not.toMatch(/\} selected</);
    });

    it('should not have hardcoded "Dismiss Failed" in Alert.alert', () => {
      expect(reorderSource).not.toMatch(/Alert\.alert\(\s*"Dismiss Failed"/);
    });

    it('should not have hardcoded "Failed to load pending reorders" as raw string', () => {
      expect(reorderSource).not.toMatch(/setError\("Failed to load/);
    });

    it('should import useTranslation', () => {
      expect(reorderSource).toContain('useTranslation');
    });

    it('should call useTranslation hook', () => {
      expect(reorderSource).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
    });
  });
});

describe('STG-277: ReorderPoliciesScreen i18n', () => {
  describe('en.json has all reorderPolicy keys', () => {
    it.each(REORDER_POLICY_KEYS)('reorderPolicy.%s exists in en.json', (key) => {
      expect(en.reorderPolicy).toBeDefined();
      expect(en.reorderPolicy[key]).toBeTruthy();
      expect(typeof en.reorderPolicy[key]).toBe('string');
    });
  });

  describe('hi.json has all reorderPolicy keys', () => {
    it.each(REORDER_POLICY_KEYS)('reorderPolicy.%s exists in hi.json', (key) => {
      expect(hi.reorderPolicy).toBeDefined();
      expect(hi.reorderPolicy[key]).toBeTruthy();
      expect(typeof hi.reorderPolicy[key]).toBe('string');
    });
  });

  describe('en/hi key parity for reorderPolicy', () => {
    it('en and hi have the same reorderPolicy keys', () => {
      const enKeys = Object.keys(en.reorderPolicy).sort();
      const hiKeys = Object.keys(hi.reorderPolicy).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('ReorderPoliciesScreen.tsx uses t() calls', () => {
    const normalizedSource = policiesSource.replace(/\s+/g, '');

    it.each(REORDER_POLICY_KEYS)(
      'uses t("reorderPolicy.%s") in source',
      (key) => {
        expect(normalizedSource).toContain(`t("reorderPolicy.${key}"`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain in ReorderPoliciesScreen', () => {
    it('should not have hardcoded "Reorder Policies" as raw text', () => {
      expect(policiesSource).not.toMatch(/>Reorder Policies</);
    });

    it('should not have hardcoded "No matching policies" as raw text', () => {
      expect(policiesSource).not.toMatch(/>No matching policies</);
    });

    it('should not have hardcoded "No Policies Yet" as raw text', () => {
      expect(policiesSource).not.toMatch(/>No Policies Yet</);
    });

    it('should not have hardcoded "Retry" as raw text', () => {
      expect(policiesSource).not.toMatch(/>Retry</);
    });

    it('should not have hardcoded "Loading policies..." as raw text', () => {
      expect(policiesSource).not.toMatch(/>Loading policies\.\.\.</);
    });

    it('should not have hardcoded "Search products..." as raw placeholder', () => {
      expect(policiesSource).not.toMatch(/placeholder="Search products\.\.\."/);
    });

    it('should not have hardcoded filter labels as raw text', () => {
      expect(policiesSource).not.toMatch(/label="All"/);
      expect(policiesSource).not.toMatch(/label="Enabled"/);
      expect(policiesSource).not.toMatch(/label="Disabled"/);
      expect(policiesSource).not.toMatch(/label="Low Stock"/);
    });

    it('should not have hardcoded "Error" in Alert.alert', () => {
      expect(policiesSource).not.toMatch(/Alert\.alert\(\s*"Error"/);
    });

    it('should not have hardcoded "Failed to load reorder policies" as raw string', () => {
      expect(policiesSource).not.toMatch(/setError\("Failed to load/);
    });

    it('should not have hardcoded policy description as raw text', () => {
      expect(policiesSource).not.toMatch(/Reorder policies will be created automatically/);
    });

    it('should not have hardcoded "Try adjusting" as raw text', () => {
      expect(policiesSource).not.toMatch(/Try adjusting your search or filter/);
    });

    it('should import useTranslation', () => {
      expect(policiesSource).toContain('useTranslation');
    });

    it('should call useTranslation hook', () => {
      expect(policiesSource).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
    });
  });
});
