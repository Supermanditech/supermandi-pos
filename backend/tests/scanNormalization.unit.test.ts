// Unit tests for backend/src/services/scanNormalization.ts
import { normalizeScan } from "../src/services/scanNormalization";

describe("normalizeScan", () => {
  describe("empty/null inputs", () => {
    it("returns null for empty string", () => {
      expect(normalizeScan(null, "")).toBeNull();
    });

    it("returns null for whitespace-only", () => {
      expect(normalizeScan(null, "   ")).toBeNull();
    });
  });

  describe("EAN-13 barcodes", () => {
    it("normalizes EAN-13 to 14-digit GTIN", () => {
      const result = normalizeScan("ean13", "8901030645457");
      expect(result).not.toBeNull();
      expect(result!.normalized_value).toBe("08901030645457");
      expect(result!.code_type).toBe("EAN");
    });

    it("normalizes EAN-13 with EAN format hint", () => {
      const result = normalizeScan("EAN", "8901030645457");
      expect(result).not.toBeNull();
      expect(result!.code_type).toBe("EAN");
    });
  });

  describe("EAN-8 barcodes", () => {
    it("normalizes EAN-8 to 14-digit GTIN", () => {
      const result = normalizeScan("ean8", "12345678");
      expect(result).not.toBeNull();
      expect(result!.normalized_value).toHaveLength(14);
      expect(result!.normalized_value).toBe("00000012345678");
    });
  });

  describe("UPC-A barcodes", () => {
    it("normalizes UPC-A (12 digits) to 14-digit GTIN", () => {
      const result = normalizeScan("upc_a", "012345678901");
      expect(result).not.toBeNull();
      expect(result!.normalized_value).toHaveLength(14);
      expect(result!.normalized_value).toBe("00012345678901");
    });
  });

  describe("UPC-E barcodes", () => {
    it("expands UPC-E to UPC-A then normalizes", () => {
      const result = normalizeScan("upc_e", "01234565");
      expect(result).not.toBeNull();
      expect(result!.normalized_value).toHaveLength(14);
    });
  });

  describe("GS1 barcodes", () => {
    it("parses GS1 with parenthesized AIs", () => {
      const result = normalizeScan("gs1", "(01)08901030645457(10)BATCH123");
      expect(result).not.toBeNull();
      expect(result!.code_type).toBe("GS1");
      expect(result!.normalized_value).toBe("08901030645457");
      expect(result!.metadata?.batch).toBe("BATCH123");
    });

    it("parses GS1 with fixed-length AIs (no parens)", () => {
      const result = normalizeScan("gs1", "0108901030645457");
      expect(result).not.toBeNull();
      expect(result!.code_type).toBe("GS1");
      expect(result!.normalized_value).toBe("08901030645457");
    });

    it("extracts expiry date from AI 17", () => {
      const result = normalizeScan("gs1", "(01)08901030645457(17)260115");
      expect(result).not.toBeNull();
      expect(result!.metadata?.expiry).toBe("260115");
    });

    it("extracts serial from AI 21", () => {
      const gs = "\x1D";
      const result = normalizeScan(
        "gs1",
        `(01)08901030645457(21)SERIAL123${gs}`
      );
      expect(result).not.toBeNull();
      expect(result!.metadata?.serial).toBe("SERIAL123");
    });

    it("strips GS1 prefix ]C1", () => {
      const result = normalizeScan("gs1", "]C1(01)08901030645457");
      expect(result).not.toBeNull();
      expect(result!.normalized_value).toBe("08901030645457");
    });

    it("falls back to AI 15 for expiry when no AI 17", () => {
      const result = normalizeScan("gs1", "(01)08901030645457(15)260115");
      expect(result).not.toBeNull();
      expect(result!.metadata?.expiry).toBe("260115");
    });
  });

  describe("QR / text barcodes", () => {
    it("returns QR_TEXT code type for QR with non-numeric data", () => {
      const result = normalizeScan("qr", "https://example.com/product/123");
      expect(result).not.toBeNull();
      expect(result!.code_type).toBe("QR_TEXT");
      expect(result!.normalized_value).toBe("https://example.com/product/123");
    });

    it("returns CODE128_TEXT for code128 text data", () => {
      const result = normalizeScan("code128", "ABC-DEF-123");
      expect(result).not.toBeNull();
      expect(result!.code_type).toBe("CODE128_TEXT");
    });
  });

  describe("format resolution", () => {
    it("resolves ean_13 format", () => {
      const result = normalizeScan("ean_13", "8901030645457");
      expect(result!.code_type).toBe("EAN");
    });

    it("resolves upc-a format", () => {
      const result = normalizeScan("upc-a", "012345678901");
      expect(result!.code_type).toBe("UPC");
    });

    it("resolves ITF-14 format", () => {
      const result = normalizeScan("itf14", "12345678901234");
      expect(result).not.toBeNull();
      expect(result!.code_type).toBe("EAN");
    });

    it("resolves data_matrix format", () => {
      const result = normalizeScan("data_matrix", "some-text-data");
      expect(result).not.toBeNull();
      expect(result!.code_type).toBe("DATAMATRIX_TEXT");
    });

    it("returns UNKNOWN for unrecognized format", () => {
      const result = normalizeScan("weird_format", "12345678");
      expect(result).not.toBeNull();
      expect(result!.code_type).toBe("WEIRD_FORMAT");
    });

    it("handles null format", () => {
      const result = normalizeScan(null, "8901030645457");
      expect(result).not.toBeNull();
      expect(result!.code_type).toBe("UNKNOWN");
    });

    it("handles undefined format", () => {
      const result = normalizeScan(undefined, "8901030645457");
      expect(result).not.toBeNull();
    });
  });

  describe("control character stripping", () => {
    it("strips control characters from text values", () => {
      const result = normalizeScan("qr", "text\x00with\x1Fcontrol");
      expect(result).not.toBeNull();
      expect(result!.normalized_value).toBe("textwithcontrol");
    });

    it("returns null if only control characters remain", () => {
      const result = normalizeScan("qr", "\x00\x01\x02");
      expect(result).toBeNull();
    });
  });

  describe("GTIN normalization", () => {
    it("pads 8-digit code to 14 digits", () => {
      const result = normalizeScan(null, "12345678");
      expect(result!.normalized_value).toHaveLength(14);
    });

    it("pads 12-digit code to 14 digits", () => {
      const result = normalizeScan(null, "123456789012");
      expect(result!.normalized_value).toHaveLength(14);
    });

    it("pads 13-digit code to 14 digits", () => {
      const result = normalizeScan(null, "1234567890123");
      expect(result!.normalized_value).toHaveLength(14);
    });

    it("keeps 14-digit code as-is", () => {
      const result = normalizeScan(null, "12345678901234");
      expect(result!.normalized_value).toBe("12345678901234");
    });
  });
});
