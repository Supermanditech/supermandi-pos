/**
 * STG-564: NewProductScreenV3 — scan-to-digitize
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-564: NewProductScreenV3", () => {
  test("has barcode pre-filled and auto-fill from master DB", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/NewProductScreenV3.tsx"), "utf8");
    expect(src).toContain("lookupMasterDB");
    expect(src).toContain("isAutoFilled");
    expect(src).toContain("auto-filled");
    expect(src).toContain("barcode");
  });

  test("has photo capture section", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/NewProductScreenV3.tsx"), "utf8");
    expect(src).toContain("photoBox");
    expect(src).toContain("photograph product");
  });

  test("has all product fields: name, brand, category, pack, unit, case, MRP, sell, cost, stock, HSN, GST", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/NewProductScreenV3.tsx"), "utf8");
    expect(src).toContain("PRODUCT NAME");
    expect(src).toContain("SELLING PRICE");
    expect(src).toContain("COST PRICE");
    expect(src).toContain("BRAND");
    expect(src).toContain("CATEGORY");
    expect(src).toContain("PACK SIZE");
    expect(src).toContain("CASE QTY");
    expect(src).toContain("MRP");
    expect(src).toContain("OPENING STOCK");
    expect(src).toContain("HSN CODE");
    expect(src).toContain("GST %");
  });

  test("shows margin preview when sell and cost prices entered", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/NewProductScreenV3.tsx"), "utf8");
    expect(src).toContain("marginPreview");
    expect(src).toContain("Margin:");
  });

  test("auto-filled fields have green styling", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/NewProductScreenV3.tsx"), "utf8");
    expect(src).toContain("autoFilledInput");
    expect(src).toContain("successSoft");
  });

  test("has Add to Store & Cart submit button", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/NewProductScreenV3.tsx"), "utf8");
    expect(src).toContain("Add to Store & Cart");
    expect(src).toContain("onProductAdded");
    expect(src).toContain("canSubmit");
  });
});
