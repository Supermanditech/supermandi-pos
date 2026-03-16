/**
 * STG-559: ScanScreenV3 — context-aware barcode scan
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-559: ScanScreenV3", () => {
  test("has 3 scan contexts: sell, stock_in, new_product", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx"), "utf8");
    expect(src).toContain('"sell"');
    expect(src).toContain('"stock_in"');
    expect(src).toContain('"new_product"');
    expect(src).toContain("ScanContext");
  });

  test("has HID scanner status and camera viewfinder", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx"), "utf8");
    expect(src).toContain("HID Scanner Active");
    expect(src).toContain("scanFrame");
    expect(src).toContain("viewfinder");
    expect(src).toContain("corner");
  });

  test("has barcode input field with submit", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx"), "utf8");
    expect(src).toContain("barcodeInput");
    expect(src).toContain("handleScanSubmit");
    expect(src).toContain("onSubmitEditing");
  });

  test("shows found product result with price and stock", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx"), "utf8");
    expect(src).toContain("resultFound");
    expect(src).toContain("resultPrice");
    expect(src).toContain("resultStock");
    expect(src).toContain("Added to cart");
  });

  test("shows new product prompt when barcode not found", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx"), "utf8");
    expect(src).toContain("Product Not Found");
    expect(src).toContain("Create");
    expect(src).toContain("onNewProduct");
  });
});
