/**
 * STG-266: PurchaseScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All purchase.* keys used in PurchaseScreen exist in en.json and hi.json
 * 2. PurchaseScreen.tsx uses t() calls instead of hardcoded strings
 * 3. No raw English strings remain in the component
 * 4. useTranslation is imported and used
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const screenSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'PurchaseScreen.tsx'),
  'utf-8'
);

// Rotating hint keys — referenced indirectly via ROTATING_HINT_KEYS array + t()
const ROTATING_HINT_KEYS = [
  'hintSearchBuy',
  'hintLiveSuppliers',
  'hintBestRates',
  'hintTypeProduct',
  'hintSearchKaro',
  'hintBuyKaro',
  'hintQuickPurchase',
  'hintTypeKaro',
] as const;

// New keys added by STG-266 (beyond pre-existing purchase.* keys)
const STG266_KEYS = [
  'storeNotConfigured',
  'failedToLoadCatalog',
  'noItemsTitle',
  'scanItemsToAdd',
  'incompleteTitle',
  'fillAllFields',
  'demoMode',
  'itemsAddedToLedger',
  'itemsSavedLocally',
  'failedToSubmit',
  'backendPending',
  'stockInNotDeployed',
  'blockedByApi',
  'retryCheck',
  'saveLocallyDemo',
  'stockInDraft',
  'checkingCatalog',
  'addedFromCatalog',
  'notInCatalogManual',
  'supplierDetailsOptional',
  'gstin',
  'name',
  'supplierName',
  'gstinPlaceholder',
  'itemsCount',
  'checkingBackend',
  'catalogComingSoon',
  'catalogNotEnabled',
  'requires',
  'supplierApiNotAvailable',
  'retryCheckingSuppliers',
  'useQuickPurchaseHint',
  'retryLoadingCatalog',
  'noProductsFound',
  'noProductsMatch',
  'searchToAdd',
  'cartSummary',
  'reviewOrder',
  'reviewOrderSummary',
  'continueShopping',
  'placeOrder',
  'storeNotConfiguredReenroll',
  'ordersPlaced',
  'ordersPlacedMessage',
  'partialSuccess',
  'partialSuccessMessage',
  'orderFailed',
  'failedToPlaceOrder',
  'placingOrder',
] as const;

// Pre-existing keys that are also used in PurchaseScreen
const PREEXISTING_KEYS = [
  'quickPurchase',
  'liveSuppliers',
  'productName',
  'buyPrice',
  'sellPrice',
  'stockIn',
] as const;

const ALL_KEYS = [...ROTATING_HINT_KEYS, ...STG266_KEYS, ...PREEXISTING_KEYS] as const;

describe('STG-266: PurchaseScreen i18n', () => {
  describe('en.json has all purchase keys', () => {
    it.each(ALL_KEYS)('purchase.%s exists in en.json', (key) => {
      expect(en.purchase).toBeDefined();
      expect(en.purchase[key]).toBeTruthy();
      expect(typeof en.purchase[key]).toBe('string');
    });
  });

  describe('hi.json has all purchase keys', () => {
    it.each(ALL_KEYS)('purchase.%s exists in hi.json', (key) => {
      expect(hi.purchase).toBeDefined();
      expect(hi.purchase[key]).toBeTruthy();
      expect(typeof hi.purchase[key]).toBe('string');
    });
  });

  describe('en/hi key parity', () => {
    it('en and hi have the same purchase keys', () => {
      const enKeys = Object.keys(en.purchase).sort();
      const hiKeys = Object.keys(hi.purchase).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('PurchaseScreen.tsx uses t() calls for new keys', () => {
    it.each(STG266_KEYS)(
      'uses t("purchase.%s") in source',
      (key) => {
        expect(screenSource).toContain(`t("purchase.${key}"`);
      }
    );
  });

  describe('Rotating hint keys are in ROTATING_HINT_KEYS array', () => {
    it.each(ROTATING_HINT_KEYS)(
      'ROTATING_HINT_KEYS contains "purchase.%s"',
      (key) => {
        expect(screenSource).toContain(`"purchase.${key}"`);
      }
    );

    it('rotating hints are rendered via t(ROTATING_HINT_KEYS[...])', () => {
      expect(screenSource).toContain('t(ROTATING_HINT_KEYS[hintIndex])');
    });
  });

  describe('no hardcoded user-facing strings remain', () => {
    it('should not have hardcoded "No Items" in Alert.alert', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\("No Items"/);
    });

    it('should not have hardcoded "Incomplete" in Alert.alert', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\("Incomplete"/);
    });

    it('should not have hardcoded "Error" in Alert.alert', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\("Error"/);
    });

    it('should not have hardcoded "Backend Pending" in Alert.alert', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\(\s*"Backend Pending"/);
    });

    it('should not have hardcoded "Review Order" in Alert.alert', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\(\s*"Review Order"/);
    });

    it('should not have hardcoded "Orders Placed" in Alert.alert', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\(\s*"Orders Placed"/);
    });

    it('should not have hardcoded "Order Failed" in Alert.alert', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\("Order Failed"/);
    });

    it('should not have hardcoded "Partial Success" in Alert.alert', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\(\s*"Partial Success"/);
    });

    it('should not have hardcoded "Quick Purchase" as JSX text', () => {
      expect(screenSource).not.toMatch(/>Quick Purchase</);
    });

    it('should not have hardcoded "Live Suppliers" as JSX text', () => {
      expect(screenSource).not.toMatch(/>Live Suppliers</);
    });

    it('should not have hardcoded "Checking Backend..." as JSX text', () => {
      expect(screenSource).not.toMatch(/>Checking Backend\.\.\.</);
    });

    it('should not have hardcoded "Supplier Catalog Coming Soon" as JSX text', () => {
      expect(screenSource).not.toMatch(/>Supplier Catalog Coming Soon</);
    });

    it('should not have hardcoded "No Products Found" as JSX text', () => {
      expect(screenSource).not.toMatch(/>No Products Found</);
    });

    it('should not have hardcoded "Demo Mode" as JSX text', () => {
      expect(screenSource).not.toMatch(/>Demo Mode</);
    });

    it('should not have hardcoded "Stock In" button text as raw string', () => {
      // Should not find "Stock In" as a raw string literal used in JSX
      // (only as t() key reference is acceptable)
      expect(screenSource).not.toMatch(/>\s*Stock In\s*</);
    });

    it('should not have hardcoded placeholder="Product name" as raw string', () => {
      expect(screenSource).not.toMatch(/placeholder="Product name"/);
    });

    it('should not have hardcoded placeholder="Supplier Name" as raw string', () => {
      expect(screenSource).not.toMatch(/placeholder="Supplier Name"/);
    });

    it('should not have hardcoded ROTATING_HINTS array with English strings', () => {
      // Should use ROTATING_HINT_KEYS with t() calls, not hardcoded strings
      expect(screenSource).not.toMatch(/ROTATING_HINTS\s*=\s*\[/);
      expect(screenSource).toMatch(/ROTATING_HINT_KEYS\s*=\s*\[/);
    });

    it('should import useTranslation', () => {
      expect(screenSource).toContain('useTranslation');
    });

    it('should call useTranslation hook', () => {
      expect(screenSource).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
    });
  });
});
