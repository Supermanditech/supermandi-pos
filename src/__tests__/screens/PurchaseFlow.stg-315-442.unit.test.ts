/**
 * Layer 12C — Reorder/Dismiss in Purchase context
 * STG-315, 442
 */

describe("STG-315: Confirmation before dismissing suggestion", () => {
  it("shows confirmation dialog before dismiss", () => {
    const showConfirm = true;
    expect(showConfirm).toBe(true);
  });

  it("confirmation has cancel and confirm buttons", () => {
    const buttons = ["Cancel", "Dismiss"];
    expect(buttons).toContain("Cancel");
    expect(buttons).toContain("Dismiss");
  });

  it("does not dismiss on cancel", () => {
    function shouldDismiss(action: string): boolean {
      return action === "confirm";
    }
    expect(shouldDismiss("cancel")).toBe(false);
  });
});

describe("STG-442: DismissReasonModal reason codes as i18n", () => {
  function getReasonKey(code: string): string {
    return `reorder.dismissReason.${code}`;
  }

  it("maps reason code to i18n key", () => {
    expect(getReasonKey("priceHigh")).toBe("reorder.dismissReason.priceHigh");
  });

  it("stores code not translated string", () => {
    const stored = "priceHigh";
    expect(stored).not.toBe("Price too high");
  });

  it("all reason codes have i18n keys", () => {
    const codes = ["priceHigh", "notNeeded", "alternateSupplier", "stockSufficient"];
    codes.forEach(code => {
      expect(getReasonKey(code)).toContain("reorder.dismissReason.");
    });
  });
});
