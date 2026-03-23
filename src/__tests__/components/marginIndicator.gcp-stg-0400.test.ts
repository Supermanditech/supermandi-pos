/**
 * GCP-STG-0400: Profit Margin Indicator — unit tests for computeMargin
 *
 * Tests the margin computation logic used by ProductTileV3 and ProductDetailSheetV3.
 */
import { computeMargin } from "../../components/v3/ProductTileV3";

describe("GCP-STG-0400: computeMargin", () => {
  it("returns null when purchasePriceMinor is undefined", () => {
    expect(computeMargin(10000, undefined)).toBeNull();
  });

  it("returns null when purchasePriceMinor is 0", () => {
    expect(computeMargin(10000, 0)).toBeNull();
  });

  it("returns null when purchasePriceMinor is negative", () => {
    expect(computeMargin(10000, -100)).toBeNull();
  });

  it("returns green for margin >= 10%", () => {
    // sell 12000 paise, purchase 10000 paise => 20% margin
    const result = computeMargin(12000, 10000);
    expect(result).not.toBeNull();
    expect(result!.color).toBe("green");
    expect(result!.label).toContain("20");
    expect(result!.label).toContain("\u2191"); // up arrow
  });

  it("returns yellow for margin 0-10%", () => {
    // sell 10500 paise, purchase 10000 paise => 5% margin
    const result = computeMargin(10500, 10000);
    expect(result).not.toBeNull();
    expect(result!.color).toBe("yellow");
    expect(result!.label).toContain("5");
    expect(result!.label).toContain("\u2191");
  });

  it("returns yellow for exactly 0% margin", () => {
    const result = computeMargin(10000, 10000);
    expect(result).not.toBeNull();
    expect(result!.color).toBe("yellow");
    expect(result!.label).toContain("0");
  });

  it("returns red for negative margin", () => {
    // sell 9000 paise, purchase 10000 paise => -10% margin
    const result = computeMargin(9000, 10000);
    expect(result).not.toBeNull();
    expect(result!.color).toBe("red");
    expect(result!.label).toContain("-10");
    expect(result!.label).toContain("\u2193"); // down arrow
  });

  it("returns green for exactly 10% margin (boundary)", () => {
    // sell 11000 paise, purchase 10000 paise => exactly 10%
    const result = computeMargin(11000, 10000);
    expect(result).not.toBeNull();
    expect(result!.color).toBe("green");
  });

  it("handles fractional margins correctly", () => {
    // sell 10750, purchase 10000 => 7.5%
    const result = computeMargin(10750, 10000);
    expect(result).not.toBeNull();
    expect(result!.color).toBe("yellow");
    expect(result!.label).toContain("7.5");
  });

  it("handles large margins", () => {
    // sell 30000, purchase 10000 => 200%
    const result = computeMargin(30000, 10000);
    expect(result).not.toBeNull();
    expect(result!.color).toBe("green");
    expect(result!.label).toContain("200");
  });

  it("handles small purchase prices (low-cost items)", () => {
    // sell 200 paise (₹2), purchase 100 paise (₹1) => 100% margin
    const result = computeMargin(200, 100);
    expect(result).not.toBeNull();
    expect(result!.color).toBe("green");
    expect(result!.label).toContain("100");
  });
});
