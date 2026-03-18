/**
 * V3-FIX-139 / V3-FIX-140 / V3-FIX-141
 * Supplier readiness, SKU lifecycle, catalogue commercialization
 */

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-139: Supplier readiness gate
// ═══════════════════════════════════════════════════════════════════════════════

describe("V3-FIX-139: Supplier readiness gate", () => {
  it("readiness service exists and is wired into product creation (static — narrowly scoped)", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/routes/v1/supplier/products.ts"), "utf8"
    );
    expect(src).toContain("checkSupplierReadiness");
    expect(src).toContain("SUPPLIER_NOT_READY");
    expect(src).toContain("readiness.blockers");
  });

  it("readiness service checks all required fields", () => {
    const fs = require("fs");
    const path = require("path");
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../src/services/supplierReadiness.ts"), "utf8"
    );
    expect(src).toContain("email_verified");
    expect(src).toContain("verification_status");
    expect(src).toContain("bank_verification_status");
    expect(src).toContain("pan_card");
    expect(src).toContain("gstin_certificate");
    expect(src).toContain("cancelled_cheque");
    expect(src).toContain("dispatch_address");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-140: SKU intake lifecycle
// ═══════════════════════════════════════════════════════════════════════════════

import {
  isValidTransition,
  validateForSubmission,
  VALID_SKU_TRANSITIONS,
  SUBMISSION_REQUIRED_FIELDS,
  SUBMISSION_RECOMMENDED_FIELDS,
  type SkuLifecycleState,
} from "../../src/services/skuLifecycle";

describe("V3-FIX-140: SKU lifecycle (executable)", () => {
  it("draft → submitted is valid", () => {
    expect(isValidTransition("draft", "submitted")).toBe(true);
  });

  it("submitted → approved is valid", () => {
    expect(isValidTransition("submitted", "approved")).toBe(true);
  });

  it("submitted → changes_requested is valid", () => {
    expect(isValidTransition("submitted", "changes_requested")).toBe(true);
  });

  it("changes_requested → submitted is valid (resubmit)", () => {
    expect(isValidTransition("changes_requested", "submitted")).toBe(true);
  });

  it("approved → published is valid", () => {
    expect(isValidTransition("approved", "published")).toBe(true);
  });

  it("published → paused is valid", () => {
    expect(isValidTransition("published", "paused")).toBe(true);
  });

  it("paused → published is valid (resume)", () => {
    expect(isValidTransition("paused", "published")).toBe(true);
  });

  it("draft → approved is NOT valid (must go through submitted)", () => {
    expect(isValidTransition("draft", "approved")).toBe(false);
  });

  it("submitted → published is NOT valid (must go through approved)", () => {
    expect(isValidTransition("submitted", "published")).toBe(false);
  });

  it("published → draft is NOT valid (no regression)", () => {
    expect(isValidTransition("published", "draft")).toBe(false);
  });

  it("covers all 6 lifecycle states", () => {
    const states = Object.keys(VALID_SKU_TRANSITIONS) as SkuLifecycleState[];
    expect(states).toContain("draft");
    expect(states).toContain("submitted");
    expect(states).toContain("changes_requested");
    expect(states).toContain("approved");
    expect(states).toContain("published");
    expect(states).toContain("paused");
    expect(states.length).toBe(6);
  });

  it("validateForSubmission rejects empty product", () => {
    const result = validateForSubmission({});
    expect(result.valid).toBe(false);
    expect(result.missingRequired.length).toBeGreaterThan(0);
  });

  it("validateForSubmission passes complete product", () => {
    const result = validateForSubmission({
      name: "Maggi Noodles",
      brand: "Nestle",
      category: "Noodles",
      unit: "pcs",
      purchase_price: 1200,
      moq: 1,
      hsn_code: "1902",
      barcode: "8901234567890",
      image_url: "https://img/maggi.jpg",
      pack_size: "70g",
      gst_rate: 12,
    });
    expect(result.valid).toBe(true);
    expect(result.missingRequired).toHaveLength(0);
  });

  it("validateForSubmission identifies missing recommended fields", () => {
    const result = validateForSubmission({
      name: "Test", brand: "Test", category: "Test", unit: "pcs",
      purchase_price: 100, moq: 1,
    });
    expect(result.valid).toBe(true); // Required met
    expect(result.missingRecommended.length).toBeGreaterThan(0); // Recommended missing
  });

  it("required fields are at least 6", () => {
    expect(SUBMISSION_REQUIRED_FIELDS.length).toBeGreaterThanOrEqual(6);
  });

  it("recommended fields include HSN and barcode", () => {
    expect(SUBMISSION_RECOMMENDED_FIELDS).toContain("hsn_code");
    expect(SUBMISSION_RECOMMENDED_FIELDS).toContain("barcode");
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// V3-FIX-141: SuperAdmin catalogue commercialization
// ═══════════════════════════════════════════════════════════════════════════════

import {
  validateCommercialization,
  calculateRetailPrice,
  DEFAULT_COMMERCIALIZATION,
  type CommercializationConfig,
} from "../../src/services/catalogCommercialization";

describe("V3-FIX-141: Catalogue commercialization (executable)", () => {
  it("default config uses SUPERMANDI_PRINCIPAL billing model", () => {
    expect(DEFAULT_COMMERCIALIZATION.billingModel).toBe("SUPERMANDI_PRINCIPAL");
  });

  it("default margin is 15%", () => {
    expect(DEFAULT_COMMERCIALIZATION.marginPct).toBe(15);
  });

  it("validates valid config", () => {
    const result = validateCommercialization(DEFAULT_COMMERCIALIZATION);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it("rejects invalid billing model", () => {
    const result = validateCommercialization({ billingModel: "DIRECT" as any });
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("SUPERMANDI_PRINCIPAL");
  });

  it("rejects negative margin", () => {
    const result = validateCommercialization({ marginPct: -5 });
    expect(result.valid).toBe(false);
  });

  it("rejects margin over 100%", () => {
    const result = validateCommercialization({ marginPct: 150 });
    expect(result.valid).toBe(false);
  });

  it("rejects specific_stores without store IDs", () => {
    const result = validateCommercialization({ publishTarget: "specific_stores" });
    expect(result.valid).toBe(false);
  });

  it("calculateRetailPrice applies percentage margin", () => {
    const config: CommercializationConfig = {
      ...DEFAULT_COMMERCIALIZATION,
      marginMode: "percentage",
      marginPct: 20,
    };
    // 1000 * 1.20 = 1200
    expect(calculateRetailPrice(1000, config)).toBe(1200);
  });

  it("calculateRetailPrice applies fixed margin", () => {
    const config: CommercializationConfig = {
      ...DEFAULT_COMMERCIALIZATION,
      marginMode: "fixed",
      marginFixedMinor: 500,
    };
    // 1000 + 500 = 1500
    expect(calculateRetailPrice(1000, config)).toBe(1500);
  });

  it("calculateRetailPrice applies both margins", () => {
    const config: CommercializationConfig = {
      ...DEFAULT_COMMERCIALIZATION,
      marginMode: "both",
      marginPct: 10,
      marginFixedMinor: 100,
    };
    // 1000 * 1.10 = 1100, + 100 = 1200
    expect(calculateRetailPrice(1000, config)).toBe(1200);
  });

  it("calculateRetailPrice defaults to 15% when no margin config", () => {
    const config: CommercializationConfig = {
      billingModel: "SUPERMANDI_PRINCIPAL",
      supplierVisible: false,
      marginMode: "percentage" as any,
      marginBasis: "per_unit",
      publishTarget: "all_stores",
    };
    // No marginPct set → default 15%
    expect(calculateRetailPrice(1000, config)).toBe(1150);
  });
});
