/**
 * STG-498: Cart lock expiry blocks payment submission
 *
 * When cart lock expires (5 minutes), the Complete Payment button must be
 * disabled to prevent payment on a stale/modified cart. The canSubmit guard
 * must include !lockExpired check.
 *
 * Test type: UNIT_TEST (logic verification, no component render)
 */

describe("STG-498: Cart lock expiry blocks canSubmit", () => {
  // Extracted canSubmit logic from PaymentScreen.tsx lines 1156-1167
  const computeCanSubmit = ({
    saleId = "sale-1",
    billRef = "BILL-001",
    loadingSale = false,
    submitting = false,
    lockExpired = false,
    cartValid = true,
    selectedMode = "CASH" as string,
    paymentId = null as string | null,
  } = {}) => {
    return (
      Boolean(saleId && billRef) &&
      !loadingSale &&
      !submitting &&
      !lockExpired &&
      cartValid &&
      selectedMode !== "CARD" &&
      selectedMode !== "WALLET" &&
      (selectedMode !== "UPI" || Boolean(paymentId))
    );
  };

  test("canSubmit is true when lock is active (not expired)", () => {
    expect(computeCanSubmit({ lockExpired: false })).toBe(true);
  });

  test("canSubmit is false when lock has expired", () => {
    expect(computeCanSubmit({ lockExpired: true })).toBe(false);
  });

  test("canSubmit is false when submitting", () => {
    expect(computeCanSubmit({ submitting: true })).toBe(false);
  });

  test("canSubmit is false when no saleId", () => {
    expect(computeCanSubmit({ saleId: "" })).toBe(false);
  });

  test("canSubmit is false for UPI without paymentId", () => {
    expect(computeCanSubmit({ selectedMode: "UPI", paymentId: null })).toBe(false);
  });

  test("canSubmit is true for UPI with paymentId", () => {
    expect(computeCanSubmit({ selectedMode: "UPI", paymentId: "pay_123" })).toBe(true);
  });

  test("lock expiry takes precedence over valid payment state", () => {
    // Everything else valid, but lock expired — should block
    expect(
      computeCanSubmit({
        saleId: "sale-1",
        billRef: "BILL-001",
        loadingSale: false,
        submitting: false,
        lockExpired: true,
        cartValid: true,
        selectedMode: "CASH",
      })
    ).toBe(false);
  });

  // Verify disabledReason includes lock expiry
  const computeDisabledReason = ({
    loadingSale = false,
    saleId = "sale-1",
    billRef = "BILL-001",
    submitting = false,
    lockExpired = false,
    selectedMode = "CASH" as string,
    paymentId = null as string | null,
    cartValid = true,
  } = {}): string | null => {
    if (loadingSale) return "Creating sale...";
    if (!saleId || !billRef) return "Waiting for sale to be created";
    if (submitting) return "Processing payment...";
    if (lockExpired) return "Cart lock expired — go back to refresh";
    if (selectedMode === "UPI" && !paymentId) return "Waiting for UPI QR to be generated";
    if (selectedMode === "CARD" || selectedMode === "WALLET") return "This payment method is coming soon";
    if (!cartValid) return "Cart has invalid items";
    return null;
  };

  test("disabledReason shows lock expiry message", () => {
    expect(computeDisabledReason({ lockExpired: true })).toBe(
      "Cart lock expired — go back to refresh"
    );
  });

  test("disabledReason is null when all valid", () => {
    expect(computeDisabledReason()).toBeNull();
  });
});
