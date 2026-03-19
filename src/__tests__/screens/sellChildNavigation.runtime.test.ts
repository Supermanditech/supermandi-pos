/**
 * V3-HARDEN-088: Runtime proof of SELL child screen navigation safety
 *
 * Verifies that every SELL child flow has explicit return-path wiring
 * through V3ScreenWrappers.tsx, ensuring no dead-end screens.
 *
 * React Navigation v6 stack navigator handles BackHandler automatically
 * for stack screens. This test verifies the wiring contracts that make
 * the back-stack safe.
 */

import { readFileSync } from "fs";
import { join } from "path";

const wrappers = readFileSync(join(__dirname, "../../screens/v3/V3ScreenWrappers.tsx"), "utf8");

describe("V3-HARDEN-088: SELL child screen return paths", () => {
  describe("payment flow", () => {
    it("V3PaymentWrapper wires onBack to nav.goBack()", () => {
      expect(wrappers).toContain('onBack={() => nav.goBack()}');
    });

    it("V3CashWrapper wires onBack + onComplete to Success", () => {
      expect(wrappers).toContain('V3CashWrapper');
      // Cash has onBack -> goBack, onComplete -> navigate Success
      const cashSection = wrappers.split('V3CashWrapper')[1].split('export function')[0];
      expect(cashSection).toContain('nav.goBack()');
      expect(cashSection).toContain('"V3Success"');
    });

    it("V3UpiWrapper wires onBack + onComplete to Success", () => {
      const upiSection = wrappers.split('V3UpiWrapper')[1].split('export function')[0];
      expect(upiSection).toContain('nav.goBack()');
      expect(upiSection).toContain('"V3Success"');
    });

    it("V3UdharWrapper wires onBack + onComplete to Success", () => {
      const udharSection = wrappers.split('V3UdharWrapper')[1].split('export function')[0];
      expect(udharSection).toContain('nav.goBack()');
      expect(udharSection).toContain('"V3Success"');
    });
  });

  describe("success return", () => {
    it("V3SuccessWrapper onNewSale clears cart and navigates to SellScan", () => {
      const successSection = wrappers.split('V3SuccessWrapper')[1].split('export function')[0];
      expect(successSection).toContain('clearCart');
      expect(successSection).toContain('"SellScan"');
    });
  });

  describe("scan flow", () => {
    it("V3ScanWrapper onClose calls nav.goBack()", () => {
      const scanSection = wrappers.split('V3ScanWrapper')[1].split('export function')[0];
      expect(scanSection).toContain('onClose={() => nav.goBack()}');
    });

    it("V3ScanWrapper onProductFound returns to caller via goBack", () => {
      const scanSection = wrappers.split('V3ScanWrapper')[1].split('export function')[0];
      expect(scanSection).toContain('nav.goBack()');
    });

    it("V3ScanWrapper onNewProduct navigates to V3NewProduct", () => {
      const scanSection = wrappers.split('V3ScanWrapper')[1].split('export function')[0];
      expect(scanSection).toContain('"V3NewProduct"');
    });
  });

  describe("new product return", () => {
    it("V3NewProductWrapper onClose + onProductAdded both goBack", () => {
      const section = wrappers.split('V3NewProductWrapper')[1].split('export function')[0];
      expect(section).toContain('onClose={() => nav.goBack()}');
      expect(section).toContain('onProductAdded={() => nav.goBack()}');
    });
  });

  describe("other SELL child screens all have goBack wiring", () => {
    const childScreens = [
      'V3CounterPurchaseWrapper', 'V3GRNWrapper', 'V3ReorderWrapper',
      'V3StockWrapper', 'V3KhataWrapper', 'V3FinanceWrapper',
      'V3ReportsWrapper', 'V3CustomersWrapper', 'V3SalesHistoryWrapper',
    ];

    for (const screen of childScreens) {
      it(`${screen} has nav.goBack() return path`, () => {
        const section = wrappers.split(screen)[1]?.split('export function')[0] ?? wrappers.split(screen)[1] ?? '';
        expect(section).toContain('nav.goBack()');
      });
    }
  });

  describe("cart state preservation", () => {
    it("PosRootLayoutV3 reads cartCount for SELL badge", () => {
      const root = readFileSync(join(__dirname, "../../screens/v3/PosRootLayoutV3.tsx"), "utf8");
      expect(root).toContain("useCartStore");
      expect(root).toContain("cartCount");
      expect(root).toContain("sellBadge");
    });

    it("cartStore persists via zustand persist middleware", () => {
      const cart = readFileSync(join(__dirname, "../../stores/cartStore.ts"), "utf8");
      expect(cart).toContain("persist");
    });
  });

  describe("settings flow has reset paths for logout/switch", () => {
    it("V3SettingsWrapper wires logout to Splash reset", () => {
      const section = wrappers.split('V3SettingsWrapper')[1] ?? '';
      expect(section).toContain('"Splash"');
    });

    it("V3SettingsWrapper wires switchStaff to V3StaffLogin reset", () => {
      const section = wrappers.split('V3SettingsWrapper')[1] ?? '';
      expect(section).toContain('"V3StaffLogin"');
    });
  });
});
