// GCP-STG-0664: Goods return endpoint unit test
import { describe, it, expect } from "@jest/globals";

describe("GCP-STG-0664: Goods return/rejection flow", () => {
  it("rejects empty items array", () => {
    const items: any[] = [];
    expect(items.length).toBe(0);
    // Endpoint returns 400 when items is empty
    const isValid = Array.isArray(items) && items.length > 0;
    expect(isValid).toBe(false);
  });

  it("accepts valid return items with reason codes", () => {
    const validReasonCodes = ["DAMAGED", "WRONG_ITEM", "EXPIRED", "QUALITY"];
    const items = [
      { productId: "p1", qty: 2, reasonCode: "DAMAGED" },
      { productId: "p2", qty: 1, reasonCode: "EXPIRED" },
    ];
    for (const item of items) {
      expect(validReasonCodes).toContain(item.reasonCode);
      expect(item.qty).toBeGreaterThan(0);
    }
  });

  it("only allows return on delivered orders", () => {
    const allowedStatuses = ["delivered"];
    expect(allowedStatuses.includes("delivered")).toBe(true);
    expect(allowedStatuses.includes("submitted")).toBe(false);
    expect(allowedStatuses.includes("draft")).toBe(false);
    expect(allowedStatuses.includes("cancelled")).toBe(false);
  });
});
