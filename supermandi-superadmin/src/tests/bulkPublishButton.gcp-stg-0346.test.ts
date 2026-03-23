/**
 * GCP-STG-0346: Bulk Publish UI Button in SuppliersTab
 *
 * Verifies that:
 * 1. publishBulkProducts is imported and wired in SuppliersTab
 * 2. "Publish All Approved" button exists in the verified suppliers Actions column
 * 3. Confirmation dialog is shown before calling the API
 * 4. Loading state ("Publishing...") is shown while API call is in progress
 * 5. Success/error result is displayed after API call completes
 * 6. Button is not shown for SUSPENDED suppliers
 */

import * as fs from "fs";
import * as path from "path";

const SUPPLIERS_TAB_PATH = path.resolve(
  __dirname,
  "../tabs/SuppliersTab.tsx"
);
const SUPPLIERS_API_PATH = path.resolve(
  __dirname,
  "../api/suppliers.ts"
);

describe("GCP-STG-0346: Bulk Publish UI Button", () => {
  let tabSource: string;
  let apiSource: string;

  beforeAll(() => {
    tabSource = fs.readFileSync(SUPPLIERS_TAB_PATH, "utf-8");
    apiSource = fs.readFileSync(SUPPLIERS_API_PATH, "utf-8");
  });

  test("publishBulkProducts is exported from suppliers API", () => {
    expect(apiSource).toContain("export async function publishBulkProducts");
  });

  test("publishBulkProducts is imported in SuppliersTab", () => {
    expect(tabSource).toMatch(/import\s*\{[^}]*publishBulkProducts[^}]*\}\s*from\s*["']\.\.\/api\/suppliers["']/);
  });

  test("bulkPublishLoading state is declared", () => {
    expect(tabSource).toContain("useState<Record<string, boolean>>({})");
    expect(tabSource).toContain("bulkPublishLoading");
  });

  test("bulkPublishResult state is declared", () => {
    expect(tabSource).toContain("bulkPublishResult");
    expect(tabSource).toContain("setBulkPublishResult");
  });

  test("handleBulkPublish function is defined", () => {
    expect(tabSource).toContain("const handleBulkPublish = async (supplierId: string, businessName: string)");
  });

  test("confirmation dialog is shown with supplier name", () => {
    expect(tabSource).toContain("Publish All Approved Products");
    expect(tabSource).toContain('Publish all approved products for "');
    expect(tabSource).toContain("to all linked stores?");
  });

  test("Publish All Approved button is rendered in verified supplier rows", () => {
    expect(tabSource).toContain("Publish All Approved");
    expect(tabSource).toContain("handleBulkPublish(s.id, s.businessName)");
  });

  test("loading state shows Publishing... text", () => {
    expect(tabSource).toContain('"Publishing..."');
  });

  test("button is disabled while loading", () => {
    expect(tabSource).toContain("disabled={bulkPublishLoading[s.id]}");
  });

  test("success/error result is displayed below button", () => {
    expect(tabSource).toContain("bulkPublishResult[s.id]");
    expect(tabSource).toContain("sa-text-error");
    expect(tabSource).toContain("sa-text-success");
  });

  test("button is NOT shown for SUSPENDED suppliers (inside else branch of non-SUSPENDED)", () => {
    // The Publish All Approved button is inside the else branch (non-SUSPENDED),
    // wrapped in a Fragment with the Suspend button
    const suspendedBlock = tabSource.match(
      /verificationStatus === "SUSPENDED" \? \(\s*<button[\s\S]*?Reactivate[\s\S]*?\) : \(\s*<>[\s\S]*?Publish All Approved[\s\S]*?<\/>/
    );
    expect(suspendedBlock).not.toBeNull();
  });

  test("refreshSuppliers is called after successful bulk publish", () => {
    // Inside handleBulkPublish, after publishBulkProducts resolves, refreshSuppliers() is called
    const handlerBlock = tabSource.match(
      /const handleBulkPublish[\s\S]*?refreshSuppliers\(\)/
    );
    expect(handlerBlock).not.toBeNull();
  });

  test("result auto-clears after 5 seconds", () => {
    expect(tabSource).toContain("setTimeout(() => setBulkPublishResult");
    expect(tabSource).toContain("5000");
  });
});
