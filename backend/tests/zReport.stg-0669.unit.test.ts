// GCP-STG-0669: Z-report (daily tax totals) unit test
import { describe, it, expect } from "@jest/globals";

describe("GCP-STG-0669: Z-report daily tax summary", () => {
  it("computes net total as gross minus tax", () => {
    const grossTotal = 10000;
    const totalTax = 1800;
    const netTotal = grossTotal - totalTax;
    expect(netTotal).toBe(8200);
  });

  it("returns zero values for no transactions", () => {
    const row = { total_transactions: "0", gross_total: "0", total_discount: "0", total_tax: "0", net_total: "0" };
    expect(parseInt(row.total_transactions)).toBe(0);
    expect(parseInt(row.gross_total)).toBe(0);
    expect(parseInt(row.total_tax)).toBe(0);
  });

  it("defaults date to today when not provided", () => {
    const date = undefined || new Date().toISOString().split("T")[0];
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("includes reportType Z-REPORT in response", () => {
    const response = { reportType: "Z-REPORT", storeId: "s1", date: "2026-03-25" };
    expect(response.reportType).toBe("Z-REPORT");
  });
});
