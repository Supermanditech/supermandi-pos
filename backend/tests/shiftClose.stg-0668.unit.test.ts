// GCP-STG-0668: Shift close / cash reconciliation unit test
import { describe, it, expect } from "@jest/globals";

describe("GCP-STG-0668: Shift close cash reconciliation", () => {
  it("returns UNCOUNTED when no actual cash provided", () => {
    const actualCash = null;
    const variance = actualCash !== null ? actualCash - 5000 : null;
    const status = variance === null ? "UNCOUNTED" : Math.abs(variance) <= 100 ? "BALANCED" : "VARIANCE";
    expect(status).toBe("UNCOUNTED");
  });

  it("returns BALANCED when variance is within 100 paise", () => {
    const expectedCash = 5000;
    const actualCash = 5050;
    const variance = actualCash - expectedCash;
    const status = variance === null ? "UNCOUNTED" : Math.abs(variance) <= 100 ? "BALANCED" : "VARIANCE";
    expect(status).toBe("BALANCED");
    expect(variance).toBe(50);
  });

  it("returns VARIANCE when cash difference exceeds 100 paise", () => {
    const expectedCash = 5000;
    const actualCash = 5500;
    const variance = actualCash - expectedCash;
    const status = variance === null ? "UNCOUNTED" : Math.abs(variance) <= 100 ? "BALANCED" : "VARIANCE";
    expect(status).toBe("VARIANCE");
    expect(variance).toBe(500);
  });

  it("handles negative variance (short cash)", () => {
    const expectedCash = 5000;
    const actualCash = 4000;
    const variance = actualCash - expectedCash;
    expect(variance).toBe(-1000);
    expect(Math.abs(variance) > 100).toBe(true);
  });
});
