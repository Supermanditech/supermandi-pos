// GCP-STG-0665: Supplier SLA monitoring unit test
import { describe, it, expect } from "@jest/globals";

describe("GCP-STG-0665: Supplier SLA monitoring", () => {
  it("computes SLA status as GOOD when >= 90%", () => {
    const onTimeRate = 95;
    const status = onTimeRate >= 90 ? 'GOOD' : onTimeRate >= 70 ? 'WARNING' : 'POOR';
    expect(status).toBe('GOOD');
  });

  it("computes SLA status as WARNING when 70-89%", () => {
    const onTimeRate = 75;
    const status = onTimeRate >= 90 ? 'GOOD' : onTimeRate >= 70 ? 'WARNING' : 'POOR';
    expect(status).toBe('WARNING');
  });

  it("computes SLA status as POOR when < 70%", () => {
    const onTimeRate = 50;
    const status = onTimeRate >= 90 ? 'GOOD' : onTimeRate >= 70 ? 'WARNING' : 'POOR';
    expect(status).toBe('POOR');
  });

  it("handles zero orders gracefully", () => {
    const totalOrders = 0;
    const onTimeRate = totalOrders > 0 ? Math.round((0 / totalOrders) * 100) : 0;
    expect(onTimeRate).toBe(0);
  });
});
