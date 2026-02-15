// Unit tests for backend/src/services/storeCodeService.ts (pure functions only)
import {
  isValidStoreCodeFormat,
  parseStoreCode,
  isDemoStoreCode,
  isProductionStoreCode,
  assertDemoStoreCode,
  extractPrefixFromName,
  formatDateYYMMDD,
  DEMO_PREFIXES,
} from "../src/services/storeCodeService";

describe("isValidStoreCodeFormat", () => {
  it("accepts valid store code format", () => {
    expect(isValidStoreCodeFormat("SU260115-001")).toBe(true);
    expect(isValidStoreCodeFormat("DM260115-999")).toBe(true);
    expect(isValidStoreCodeFormat("AB000000-000")).toBe(true);
  });

  it("rejects invalid formats", () => {
    expect(isValidStoreCodeFormat("")).toBe(false);
    expect(isValidStoreCodeFormat("SU26-001")).toBe(false);
    expect(isValidStoreCodeFormat("su260115-001")).toBe(false); // lowercase
    expect(isValidStoreCodeFormat("SU260115001")).toBe(false); // no dash
    expect(isValidStoreCodeFormat("SU260115-01")).toBe(false); // 2-digit seq
    expect(isValidStoreCodeFormat("SU260115-0001")).toBe(false); // 4-digit seq
    expect(isValidStoreCodeFormat("S1260115-001")).toBe(false); // digit in prefix
    expect(isValidStoreCodeFormat("SUP260115-001")).toBe(false); // 3-char prefix
  });
});

describe("parseStoreCode", () => {
  it("parses valid store code into components", () => {
    const result = parseStoreCode("SU260115-001");
    expect(result).not.toBeNull();
    expect(result!.code).toBe("SU260115-001");
    expect(result!.prefix).toBe("SU");
    expect(result!.date).toBe("260115");
    expect(result!.sequence).toBe(1);
  });

  it("parses sequence correctly", () => {
    const result = parseStoreCode("DM260115-042");
    expect(result!.sequence).toBe(42);
  });

  it("returns null for invalid format", () => {
    expect(parseStoreCode("invalid")).toBeNull();
    expect(parseStoreCode("")).toBeNull();
  });
});

describe("isDemoStoreCode", () => {
  it("detects new-format demo codes by prefix", () => {
    expect(isDemoStoreCode("DM260115-001")).toBe(true);
    expect(isDemoStoreCode("QA260115-001")).toBe(true);
    expect(isDemoStoreCode("TS260115-001")).toBe(true);
    expect(isDemoStoreCode("ST260115-001")).toBe(true);
  });

  it("detects legacy demo codes", () => {
    expect(isDemoStoreCode("sm-demo02")).toBe(true);
    expect(isDemoStoreCode("test-store-1")).toBe(true);
    expect(isDemoStoreCode("qa-store")).toBe(true);
    expect(isDemoStoreCode("staging-env-1")).toBe(true);
  });

  it("is case-insensitive for prefix check", () => {
    expect(isDemoStoreCode("dm260115-001")).toBe(true);
    expect(isDemoStoreCode("Dm260115-001")).toBe(true);
  });

  it("returns false for production codes", () => {
    expect(isDemoStoreCode("SU260115-001")).toBe(false);
    expect(isDemoStoreCode("AB260115-001")).toBe(false);
    expect(isDemoStoreCode("MY260115-001")).toBe(false);
  });

  it("returns false for empty/short input", () => {
    expect(isDemoStoreCode("")).toBe(false);
    expect(isDemoStoreCode("A")).toBe(false);
  });
});

describe("isProductionStoreCode", () => {
  it("returns true for production codes", () => {
    expect(isProductionStoreCode("SU260115-001")).toBe(true);
    expect(isProductionStoreCode("AB260115-001")).toBe(true);
  });

  it("returns false for demo codes", () => {
    expect(isProductionStoreCode("DM260115-001")).toBe(false);
    expect(isProductionStoreCode("sm-demo02")).toBe(false);
  });

  it("assumes production for empty/invalid input", () => {
    expect(isProductionStoreCode("")).toBe(true);
    expect(isProductionStoreCode("X")).toBe(true);
  });
});

describe("assertDemoStoreCode", () => {
  it("does not throw for demo codes", () => {
    expect(() => assertDemoStoreCode("DM260115-001", "seed")).not.toThrow();
    expect(() => assertDemoStoreCode("test-store", "seed")).not.toThrow();
  });

  it("throws for production codes", () => {
    expect(() => assertDemoStoreCode("SU260115-001", "seed data")).toThrow(
      "[BLOCKED]"
    );
  });

  it("includes store code and operation in error message", () => {
    try {
      assertDemoStoreCode("AB260115-001", "import fixtures");
      fail("Expected to throw");
    } catch (e: any) {
      expect(e.message).toContain("AB260115-001");
      expect(e.message).toContain("import fixtures");
      expect(e.message).toContain("not a demo store");
    }
  });
});

describe("extractPrefixFromName", () => {
  it("returns first 2 uppercase letters", () => {
    expect(extractPrefixFromName("SuperMandi")).toBe("SU");
    expect(extractPrefixFromName("Krishna Store")).toBe("KR");
  });

  it("strips non-letter characters", () => {
    expect(extractPrefixFromName("123 Store")).toBe("ST");
    expect(extractPrefixFromName("A1B2C3")).toBe("AB");
  });

  it("falls back to ST when fewer than 2 letters", () => {
    expect(extractPrefixFromName("1")).toBe("ST");
    expect(extractPrefixFromName("")).toBe("ST");
    expect(extractPrefixFromName("A")).toBe("ST");
  });

  it("handles mixed case", () => {
    expect(extractPrefixFromName("hello")).toBe("HE");
  });
});

describe("formatDateYYMMDD", () => {
  it("formats a known date correctly", () => {
    // Jan 15, 2026 00:00 UTC -> Jan 15, 2026 05:30 IST
    const date = new Date("2026-01-15T00:00:00Z");
    const result = formatDateYYMMDD(date);
    expect(result).toBe("260115");
  });

  it("handles IST offset correctly (before midnight UTC = next day IST)", () => {
    // Jan 14, 2026 20:00 UTC = Jan 15, 2026 01:30 IST
    const date = new Date("2026-01-14T20:00:00Z");
    const result = formatDateYYMMDD(date);
    expect(result).toBe("260115");
  });

  it("returns 6-character string", () => {
    const result = formatDateYYMMDD(new Date());
    expect(result).toHaveLength(6);
    expect(result).toMatch(/^\d{6}$/);
  });
});

describe("DEMO_PREFIXES", () => {
  it("contains DM, QA, TS, ST", () => {
    expect(DEMO_PREFIXES).toContain("DM");
    expect(DEMO_PREFIXES).toContain("QA");
    expect(DEMO_PREFIXES).toContain("TS");
    expect(DEMO_PREFIXES).toContain("ST");
  });

  it("has exactly 4 entries", () => {
    expect(DEMO_PREFIXES).toHaveLength(4);
  });
});
