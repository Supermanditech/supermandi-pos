/**
 * STG-513: Large amount silent cap — show error instead of truncating
 *
 * Verifies that isAmountWithinLimit correctly identifies amounts exceeding
 * MAX_AMOUNT_MINOR and that formatMoney warns in dev mode.
 *
 * Test type: UNIT_TEST (logic extraction)
 */

jest.mock("../../i18n", () => ({ language: "en" }));

// Mock __DEV__ as true for tests
(global as any).__DEV__ = true;

import { isAmountWithinLimit, formatMoney } from "../../utils/money";

describe("STG-513: Large amount validation", () => {
  test("normal amount within limit", () => {
    expect(isAmountWithinLimit(100_000)).toBe(true); // ₹1,000
  });

  test("zero within limit", () => {
    expect(isAmountWithinLimit(0)).toBe(true);
  });

  test("MAX_AMOUNT_MINOR exactly is within limit", () => {
    expect(isAmountWithinLimit(1_000_000_000_00)).toBe(true);
  });

  test("above MAX_AMOUNT_MINOR is over limit", () => {
    expect(isAmountWithinLimit(1_000_000_000_01)).toBe(false);
  });

  test("negative large amount over limit", () => {
    expect(isAmountWithinLimit(-1_000_000_000_01)).toBe(false);
  });

  test("NaN is over limit", () => {
    expect(isAmountWithinLimit(NaN)).toBe(false);
  });

  test("Infinity is over limit", () => {
    expect(isAmountWithinLimit(Infinity)).toBe(false);
  });

  test("formatMoney warns in dev for over-cap amount", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    formatMoney(1_000_000_000_01); // slightly over cap
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("exceeds MAX_AMOUNT_MINOR")
    );
    warnSpy.mockRestore();
  });

  test("formatMoney does not warn for normal amounts", () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation();
    formatMoney(100_000);
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });
});
