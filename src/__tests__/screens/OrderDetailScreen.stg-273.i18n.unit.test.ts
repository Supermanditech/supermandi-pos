/**
 * STG-273: OrderDetailScreen i18n — all user-facing strings use t() calls
 *
 * Validates:
 * 1. All orderDetail.* keys exist in en.json and hi.json
 * 2. OrderDetailScreen.tsx uses t() calls instead of hardcoded strings
 * 3. No raw English strings remain in the component
 * 4. useTranslation is imported and used
 */

import { readFileSync } from 'fs';
import { join } from 'path';

const localesDir = join(__dirname, '..', '..', 'i18n', 'locales');
const en = JSON.parse(readFileSync(join(localesDir, 'en.json'), 'utf-8'));
const hi = JSON.parse(readFileSync(join(localesDir, 'hi.json'), 'utf-8'));
const screenSource = readFileSync(
  join(__dirname, '..', '..', 'screens', 'OrderDetailScreen.tsx'),
  'utf-8'
);

const EXPECTED_KEYS = [
  'title',
  'loadingOrderDetails',
  'failedToLoadOrder',
  'orderNotFound',
  'retry',
  'cancelOrderTitle',
  'cancelOrderConfirm',
  'no',
  'yesCancel',
  'errorTitle',
  'failedToCancelOrder',
  'successTitle',
  'trackingUpdated',
  'failedToUpdateTracking',
  'whatsappNotFound',
  'whatsappNotFoundMessage',
  'whatsappGreeting',
  'whatsappTotal',
  'whatsappItems',
  'whatsappStatusRequest',
  'andMoreItems',
  'percentComplete',
  'supplier',
  'orderType',
  'reorder',
  'manual',
  'created',
  'expectedDelivery',
  'trackingNumber',
  'enterTrackingNumber',
  'addTracking',
  'notes',
  'itemsCount',
  'ordered',
  'received',
  'totalAmount',
  'timeline',
  'cancelOrder',
  'receiveGoods',
] as const;

describe('STG-273: OrderDetailScreen i18n', () => {
  describe('en.json has all orderDetail keys', () => {
    it.each(EXPECTED_KEYS)('orderDetail.%s exists in en.json', (key) => {
      expect(en.orderDetail).toBeDefined();
      expect(en.orderDetail[key]).toBeTruthy();
      expect(typeof en.orderDetail[key]).toBe('string');
    });
  });

  describe('hi.json has all orderDetail keys', () => {
    it.each(EXPECTED_KEYS)('orderDetail.%s exists in hi.json', (key) => {
      expect(hi.orderDetail).toBeDefined();
      expect(hi.orderDetail[key]).toBeTruthy();
      expect(typeof hi.orderDetail[key]).toBe('string');
    });
  });

  describe('en/hi key parity', () => {
    it('en and hi have the same orderDetail keys', () => {
      const enKeys = Object.keys(en.orderDetail).sort();
      const hiKeys = Object.keys(hi.orderDetail).sort();
      expect(enKeys).toEqual(hiKeys);
    });
  });

  describe('OrderDetailScreen.tsx uses t() calls', () => {
    const normalizedSource = screenSource.replace(/\s+/g, '');

    it.each(EXPECTED_KEYS)(
      'uses t("orderDetail.%s") in source',
      (key) => {
        expect(normalizedSource).toContain(`t("orderDetail.${key}"`);
      }
    );
  });

  describe('no hardcoded user-facing strings remain', () => {
    it('should not have hardcoded "Order Details" as raw text', () => {
      expect(screenSource).not.toMatch(/>Order Details</);
    });

    it('should not have hardcoded "Loading order details..." as raw text', () => {
      expect(screenSource).not.toMatch(/>Loading order details\.\.\.</);
    });

    it('should not have hardcoded "Order not found" as raw text', () => {
      expect(screenSource).not.toMatch(/"Order not found"/);
    });

    it('should not have hardcoded "Retry" as raw text', () => {
      expect(screenSource).not.toMatch(/>Retry</);
    });

    it('should not have hardcoded "Supplier" as card title', () => {
      expect(screenSource).not.toMatch(/>Supplier</);
    });

    it('should not have hardcoded "Order Type" as raw text', () => {
      expect(screenSource).not.toMatch(/>Order Type</);
    });

    it('should not have hardcoded "Total Amount" as raw text', () => {
      expect(screenSource).not.toMatch(/>Total Amount</);
    });

    it('should not have hardcoded "Timeline" as raw text', () => {
      expect(screenSource).not.toMatch(/>Timeline</);
    });

    it('should not have hardcoded "Cancel Order" as raw text', () => {
      expect(screenSource).not.toMatch(/>Cancel Order</);
    });

    it('should not have hardcoded "Receive Goods" as raw text', () => {
      expect(screenSource).not.toMatch(/>Receive Goods</);
    });

    it('should not have hardcoded Alert.alert titles', () => {
      expect(screenSource).not.toMatch(/Alert\.alert\("Cancel Order"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Error"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("Success"/);
      expect(screenSource).not.toMatch(/Alert\.alert\("WhatsApp Not Found"/);
    });

    it('should not have hardcoded "Ordered:" as raw text', () => {
      expect(screenSource).not.toMatch(/>\s*Ordered:/);
    });

    it('should not have hardcoded "Received:" as raw text', () => {
      expect(screenSource).not.toMatch(/>\s*Received:/);
    });

    it('should not have hardcoded "Notes" as raw text', () => {
      expect(screenSource).not.toMatch(/>Notes</);
    });

    it('should not have hardcoded "Add tracking..." as raw text', () => {
      expect(screenSource).not.toMatch(/"Add tracking\.\.\."/);
    });

    it('should not have hardcoded "Enter tracking number" as raw text', () => {
      expect(screenSource).not.toMatch(/"Enter tracking number"/);
    });

    it('should import useTranslation', () => {
      expect(screenSource).toContain('useTranslation');
    });

    it('should call useTranslation hook', () => {
      expect(screenSource).toMatch(/const\s*\{\s*t\s*\}\s*=\s*useTranslation/);
    });
  });
});
