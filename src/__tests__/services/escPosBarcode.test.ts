/**
 * GCP-STG-0536: ESC/POS Barcode Label Builder — behavioral tests.
 *
 * Verifies that buildBarcodeLabel produces valid ESC/POS byte sequences
 * and that detectBarcodeType correctly identifies symbologies.
 */
import { buildBarcodeLabel, detectBarcodeType } from "../../services/printer/escPosBarcode";

describe("ESC/POS Barcode Label Builder", () => {
  it("returns Uint8Array", () => {
    const result = buildBarcodeLabel({ name: "Test Product", barcode: "8901234567890" });
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("starts with ESC @ init command", () => {
    const result = buildBarcodeLabel({ name: "Test", barcode: "12345678" });
    expect(result[0]).toBe(0x1b); // ESC
    expect(result[1]).toBe(0x40); // @
  });

  it("contains GS k barcode command for valid barcodes", () => {
    const result = buildBarcodeLabel({ name: "Test", barcode: "8901234567890" });
    const bytes = Array.from(result);
    // Find GS k sequence (0x1D 0x6B)
    let found = false;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x1d && bytes[i + 1] === 0x6b) {
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });

  it("detects EAN-13 barcode type", () => {
    expect(detectBarcodeType("8901234567890")).toBe("EAN13");
  });

  it("detects EAN-8 barcode type", () => {
    expect(detectBarcodeType("12345678")).toBe("EAN8");
  });

  it("detects UPC-A barcode type", () => {
    expect(detectBarcodeType("012345678901")).toBe("UPCA");
  });

  it("falls back to Code128 for alphanumeric", () => {
    expect(detectBarcodeType("ABC123")).toBe("CODE128");
  });

  it("handles empty barcode gracefully (no crash)", () => {
    const result = buildBarcodeLabel({ name: "Test", barcode: "" });
    expect(result).toBeInstanceOf(Uint8Array);
    // Should still have init + name but no barcode command
    expect(result.length).toBeGreaterThan(0);
  });

  it("handles missing price gracefully", () => {
    const result = buildBarcodeLabel({ name: "Test", barcode: "8901234567890" });
    expect(result).toBeInstanceOf(Uint8Array);
  });

  it("includes price text when provided", () => {
    const result = buildBarcodeLabel({ name: "Test", barcode: "1234", price: 99.5 });
    const text = String.fromCharCode(...result);
    expect(text).toContain("Rs.99.50");
  });

  it("small label omits product name (shorter output)", () => {
    const small = buildBarcodeLabel(
      { name: "Product", barcode: "1234", price: 10 },
      "small",
    );
    const medium = buildBarcodeLabel(
      { name: "Product", barcode: "1234", price: 10 },
      "medium",
    );
    // Small should be shorter (no product name)
    expect(small.length).toBeLessThan(medium.length);
  });

  it("large label includes store name when provided", () => {
    const withStore = buildBarcodeLabel(
      { name: "Product", barcode: "1234", price: 10, storeName: "My Store" },
      "large",
    );
    const text = String.fromCharCode(...withStore);
    expect(text).toContain("My Store");
  });

  it("large label without store name does not crash", () => {
    const result = buildBarcodeLabel(
      { name: "Product", barcode: "1234", price: 10 },
      "large",
    );
    expect(result).toBeInstanceOf(Uint8Array);
    expect(result.length).toBeGreaterThan(0);
  });

  it("ends with partial cut command (GS V 66 3)", () => {
    const result = buildBarcodeLabel({ name: "Test", barcode: "1234" });
    const bytes = Array.from(result);
    const len = bytes.length;
    expect(bytes[len - 4]).toBe(0x1d); // GS
    expect(bytes[len - 3]).toBe(0x56); // V
    expect(bytes[len - 2]).toBe(66);
    expect(bytes[len - 1]).toBe(3);
  });

  it("does not emit barcode command for short barcodes (< 4 chars)", () => {
    const result = buildBarcodeLabel({ name: "Test", barcode: "12" });
    const bytes = Array.from(result);
    let found = false;
    for (let i = 0; i < bytes.length - 1; i++) {
      if (bytes[i] === 0x1d && bytes[i + 1] === 0x6b) {
        found = true;
        break;
      }
    }
    expect(found).toBe(false);
  });

  it("uses correct GS k type code for EAN-13 (67)", () => {
    const result = buildBarcodeLabel({ name: "Test", barcode: "8901234567890" });
    const bytes = Array.from(result);
    // Find GS k sequence and check type code
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x1d && bytes[i + 1] === 0x6b) {
        expect(bytes[i + 2]).toBe(67); // EAN-13 type code
        break;
      }
    }
  });

  it("uses correct GS k type code for Code128 (73)", () => {
    const result = buildBarcodeLabel({ name: "Test", barcode: "ABCDEF" });
    const bytes = Array.from(result);
    for (let i = 0; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x1d && bytes[i + 1] === 0x6b) {
        expect(bytes[i + 2]).toBe(73); // Code128 type code
        break;
      }
    }
  });
});
