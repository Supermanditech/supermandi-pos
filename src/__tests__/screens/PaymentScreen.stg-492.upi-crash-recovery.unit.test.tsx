/**
 * STG-492: PENDING_UPI_KEY write-before-checkout
 * Verifies that AsyncStorage.setItem(PENDING_UPI_KEY) is called BEFORE completeCheckout(),
 * and removeItem is called after success. Prevents double-charge on crash.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

describe('STG-492: PENDING_UPI_KEY crash recovery', () => {
  const source = readFileSync(
    join(__dirname, '..', '..', 'screens', 'PaymentScreen.tsx'),
    'utf-8'
  );

  it('should write PENDING_UPI_KEY before completeCheckout call', () => {
    const setItemIndex = source.indexOf('AsyncStorage.setItem(PENDING_UPI_KEY');
    const completeCheckoutIndex = source.indexOf('await completeCheckout({');

    // setItem must appear BEFORE completeCheckout
    expect(setItemIndex).toBeGreaterThan(-1);
    expect(completeCheckoutIndex).toBeGreaterThan(-1);
    expect(setItemIndex).toBeLessThan(completeCheckoutIndex);
  });

  it('should await the setItem call (not fire-and-forget)', () => {
    // Find the line with STG-492 setItem
    const stg492Block = source.substring(
      source.indexOf('STG-492: Write PENDING_UPI_KEY'),
      source.indexOf('Complete checkout with payment')
    );
    expect(stg492Block).toContain('await AsyncStorage.setItem(PENDING_UPI_KEY');
  });

  it('should clear PENDING_UPI_KEY after successful checkout', () => {
    // After completeCheckout, there should be a removeItem call
    const checkoutIndex = source.indexOf('await completeCheckout({');
    const afterCheckout = source.substring(checkoutIndex);
    expect(afterCheckout).toContain('STG-492: Clear pending UPI after successful checkout');
    expect(afterCheckout).toContain('AsyncStorage.removeItem(PENDING_UPI_KEY)');
  });

  it('should check for stale pending UPI on mount', () => {
    // On mount useEffect, should read and handle pending UPI
    expect(source).toContain('AsyncStorage.getItem(PENDING_UPI_KEY)');
    // Title is shown via i18n key (translates to "Previous UPI Payment Pending")
    expect(source).toContain('posPayment.previousUpiPendingTitle');
  });

  it('should gate the write behind UPI mode and valid paymentId/saleId', () => {
    const stg492Block = source.substring(
      source.indexOf('STG-492: Write PENDING_UPI_KEY'),
      source.indexOf('Complete checkout with payment')
    );
    expect(stg492Block).toContain('selectedMode === "UPI"');
    expect(stg492Block).toContain('paymentId');
    expect(stg492Block).toContain('saleId');
  });
});
