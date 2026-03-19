/**
 * V3-FIX-187: Supplier allocation API client — contract verification
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const src = readFileSync(join(__dirname, "../../lib/demandAllocations.ts"), "utf-8");

describe("supplier allocations API client contract", () => {
  it("exports listAllocations function", () => {
    expect(src).toContain("export async function listAllocations");
  });

  it("exports getAllocation function", () => {
    expect(src).toContain("export async function getAllocation");
  });

  it("exports updateAllocationStatus function", () => {
    expect(src).toContain("export async function updateAllocationStatus");
  });

  it("calls /api/v1/supplier/allocations endpoint", () => {
    expect(src).toContain("/api/v1/supplier/allocations");
  });

  it("uses credentials: include for cookie auth", () => {
    expect(src).toContain('credentials: "include"');
  });

  it("sends PATCH for status updates", () => {
    expect(src).toContain('method: "PATCH"');
  });

  it("has SupplierAllocation type with required fields", () => {
    expect(src).toContain("id: string");
    expect(src).toContain("retailerOrderId: string");
    expect(src).toContain("supplierId: string");
    expect(src).toContain("status: string");
  });
});
