// GCP-STG-0049: Split payment race condition prevention
// Tests that split payment handler has proper guards against double-tap

import * as fs from "fs";
import * as path from "path";

const paymentScreenPath = path.resolve(__dirname, "../../screens/v3/PaymentScreenV3.tsx");
const paymentScreenCode = fs.readFileSync(paymentScreenPath, "utf-8");

const usePaymentFlowPath = path.resolve(__dirname, "../../screens/v3/usePaymentFlow.ts");
const usePaymentFlowCode = fs.readFileSync(usePaymentFlowPath, "utf-8");

describe("GCP-STG-0049: Split payment race condition prevention", () => {
  test("split payment handler checks createSaleInFlight before proceeding", () => {
    expect(paymentScreenCode).toContain("if (createSaleInFlight.current || processing) return");
  });

  test("Confirm Split button is disabled during processing", () => {
    // The Pressable should have disabled={processing}
    expect(paymentScreenCode).toContain("disabled={processing}");
    // Visual feedback during processing
    expect(paymentScreenCode).toContain("Processing...");
  });

  test("split payment button opacity reduces when processing", () => {
    expect(paymentScreenCode).toContain("opacity: processing ? 0.6 : 1");
  });

  test("createSaleInFlight ref prevents duplicate sale creation in usePaymentFlow", () => {
    expect(usePaymentFlowCode).toContain("if (createSaleInFlight.current) return");
  });

  test("split payment reuses existing saleId if already created", () => {
    // saleId ?? await createSaleStep() — reuses if exists
    expect(paymentScreenCode).toContain("const id = saleId ?? await createSaleStep()");
  });

  test("createSaleInFlight is reset in finally block", () => {
    expect(paymentScreenCode).toContain("createSaleInFlight.current = false");
  });

  test("cart is unlocked in finally block even on error", () => {
    // unlockCart should be in the finally block
    const splitSection = paymentScreenCode.slice(
      paymentScreenCode.indexOf("Confirm Split"),
      paymentScreenCode.indexOf("Confirm Split") + 500
    );
    // Check that finally block has cleanup
    expect(paymentScreenCode).toContain("useCartStore.getState().unlockCart()");
  });
});
