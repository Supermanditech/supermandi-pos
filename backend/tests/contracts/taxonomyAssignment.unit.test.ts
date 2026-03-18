/**
 * V3-FIX-154 / V3-HARDEN-155 / V3-HARDEN-156
 * Taxonomy assignment, repeated-purchase preservation, category truth propagation
 */

import {
  assignTaxonomy,
  resolveStoreTaxonomy,
  UNCATEGORIZED,
  CATEGORY_TRUTH_RULES,
  type TaxonomyAssignmentInput,
} from "../../src/services/taxonomyAssignment";
import { suggestCategory, getAvailableCategories } from "../../src/utils/autoCategorization";

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-154: Canonical taxonomy assignment
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-154: Canonical taxonomy assignment (executable)", () => {
  // Mock pool that simulates no DB function
  const mockPool = {
    query: jest.fn().mockRejectedValue(new Error("function does not exist")),
  } as any;

  it("explicit override takes priority over all other methods", async () => {
    const result = await assignTaxonomy(mockPool, {
      productName: "Maggi Noodles",
      rawCategory: "Snacks",
      explicitTaxonomyId: "Custom Category",
      entryPath: "RETAILER_MANUAL_CREATE",
    });
    expect(result.taxonomyId).toBe("Custom Category");
    expect(result.method).toBe("explicit_override");
  });

  it("keyword matching works for known Indian FMCG products", async () => {
    const result = await assignTaxonomy(mockPool, {
      productName: "Tata Tea Gold 500g",
      entryPath: "STORE_DIGITISATION",
    });
    expect(result.taxonomyId).toBe("Tea & Coffee");
    expect(result.method).toBe("keyword_match");
  });

  it("raw category used when keyword matching fails", async () => {
    const result = await assignTaxonomy(mockPool, {
      productName: "XYZ Unknown Product 123",
      rawCategory: "Misc Items",
      entryPath: "SUPPLIER_CATALOG_ADD",
    });
    expect(result.taxonomyId).toBe("Misc Items");
    expect(result.method).toBe("raw_category");
  });

  it("returns UNCATEGORIZED when no method resolves", async () => {
    const result = await assignTaxonomy(mockPool, {
      productName: "ABC123",
      entryPath: "CSV_IMPORT",
    });
    expect(result.taxonomyId).toBe(UNCATEGORIZED);
    expect(result.method).toBe("uncategorized");
  });

  it("UNCATEGORIZED constant is explicit string, not null", () => {
    expect(UNCATEGORIZED).toBe("Uncategorized");
    expect(typeof UNCATEGORIZED).toBe("string");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-154: suggestCategory coverage
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-154: suggestCategory keyword matching (executable)", () => {
  it.each([
    ["Amul Butter 500g", "Dairy"],
    ["Toor Dal 1kg", "Pulses & Lentils"],
    ["Surf Excel Detergent", "Cleaning & Household"],
    ["Parle-G Biscuit", "Biscuits & Snacks"],
    ["Lays Chips Classic", "Biscuits & Snacks"],
    ["Fortune Sunflower Oil 1L", "Cooking Oil & Ghee"],
    ["Maggi 2 Minute Noodles", "Instant & Ready-to-Eat"],
    ["Colgate Toothpaste", "Personal Care"],
    ["Red Label Tea", "Tea & Coffee"],
  ])("suggestCategory(%j) === %j", (input, expected) => {
    expect(suggestCategory(input)).toBe(expected);
  });

  it("returns null for unrecognizable products", () => {
    expect(suggestCategory("XYZ123")).toBeNull();
  });

  it("covers 15+ FMCG categories", () => {
    expect(getAvailableCategories().length).toBeGreaterThanOrEqual(15);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-155: Repeated purchase preservation
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-155: Repeated purchase category preservation (executable)", () => {
  it("preserves existing store category for known product", async () => {
    const mockPool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [{ category: "Dairy" }] }) // getExistingStoreTaxonomy
        .mockRejectedValue(new Error("should not reach")),
    } as any;

    const result = await resolveStoreTaxonomy(mockPool, "store-1", "product-1", {
      productName: "Amul Butter",
      rawCategory: "Cooking",
      entryPath: "SUPPLIER_CATALOG_ADD",
    });

    expect(result.taxonomyId).toBe("Dairy"); // Preserved, not overwritten to "Cooking"
    expect(result.method).toBe("explicit_override"); // Treated as preserved override
  });

  it("assigns fresh taxonomy for new product (no existing store product)", async () => {
    const mockPool = {
      query: jest.fn()
        .mockResolvedValueOnce({ rows: [] }) // getExistingStoreTaxonomy — no existing
        .mockRejectedValueOnce(new Error("no DB function")), // assignTaxonomy DB fallback
    } as any;

    const result = await resolveStoreTaxonomy(mockPool, "store-1", "new-product", {
      productName: "Tata Salt 1kg",
      entryPath: "SUPPLIER_CATALOG_ADD",
    });

    expect(result.taxonomyId).toBe("Salt & Sugar"); // Fresh keyword assignment
    expect(result.method).toBe("keyword_match");
  });

  it("assigns fresh taxonomy when productId is null (truly new)", async () => {
    const mockPool = {
      query: jest.fn().mockRejectedValue(new Error("no DB function")),
    } as any;

    const result = await resolveStoreTaxonomy(mockPool, "store-1", null, {
      productName: "Nescafe Classic 200g",
      entryPath: "STORE_DIGITISATION",
    });

    expect(result.taxonomyId).toBe("Tea & Coffee");
    expect(result.method).toBe("keyword_match");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-HARDEN-156: Category truth rules
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-HARDEN-156: Category truth propagation rules (executable)", () => {
  it("taxonomy_id is the canonical authority", () => {
    expect(CATEGORY_TRUTH_RULES.AUTHORITY).toBe("taxonomy_id");
  });

  it("raw category is informational metadata only", () => {
    expect(CATEGORY_TRUTH_RULES.RAW_CATEGORY_ROLE).toBe("informational_metadata");
  });

  it("uncategorized items use explicit UNCATEGORIZED value", () => {
    expect(CATEGORY_TRUTH_RULES.UNCATEGORIZED_VALUE).toBe("Uncategorized");
  });

  it("store-local override is preserved on repeat procurement", () => {
    expect(CATEGORY_TRUTH_RULES.PRESERVE_STORE_OVERRIDE).toBe(true);
  });

  it("admin correction propagates to all surfaces", () => {
    expect(CATEGORY_TRUTH_RULES.ADMIN_CORRECTION_PROPAGATES).toBe(true);
  });

  it("retailer override stays store-local", () => {
    expect(CATEGORY_TRUTH_RULES.RETAILER_OVERRIDE_SCOPE).toBe("store_local");
  });

  it("correction precedence: admin > retailer > automatic", () => {
    expect(CATEGORY_TRUTH_RULES.CORRECTION_PRECEDENCE).toEqual(["admin", "retailer", "automatic"]);
  });
});
