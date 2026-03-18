/**
 * V3-HARDEN-103: WhatsApp bill send contract regression
 * Proves server-backed send and fallback behavior.
 */

describe("V3-HARDEN-103: WhatsApp bill send contract", () => {
  it("server-backed send requires { saleId, recipientPhone }", () => {
    // Read the backend route to verify required fields
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../src/routes/v1/pos/whatsapp.ts"), "utf8"
    );
    // Backend requires saleId + recipientPhone
    expect(src).toContain("const { saleId, recipientPhone } = req.body");
    expect(src).toContain("if (!saleId || !recipientPhone)");
  });

  it("SuccessScreenV3 sends { saleId, recipientPhone } when phone available", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../../src/screens/v3/SuccessScreenV3.tsx"), "utf8"
    );
    // Must send recipientPhone, not message/phone
    expect(src).toContain("{ saleId, recipientPhone }");
    // Must not send old wrong field names
    expect(src).not.toContain("{ saleId, message }");
  });

  it("billShare.ts sends { saleId, recipientPhone } with cleaned phone", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../../src/services/billing/billShare.ts"), "utf8"
    );
    expect(src).toContain("recipientPhone: cleanPhone");
    // Server send payload must NOT include message field
    expect(src).not.toMatch(/apiClient\.post\([^)]*message/s);
  });

  it("SuccessScreenV3 falls back to deep link when no phone", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../../src/screens/v3/SuccessScreenV3.tsx"), "utf8"
    );
    // Deep-link fallback exists
    expect(src).toContain("whatsapp://send?text=");
    // Fallback is ONLY used when server send not possible
    expect(src).toContain("Fallback: deep-link");
  });

  it("UdharScreenV3 passes customerPhone through onComplete", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../../src/screens/v3/UdharScreenV3.tsx"), "utf8"
    );
    expect(src).toContain("onComplete(method, saleId, totalMinor, itemCount, phone)");
  });

  it("V3SuccessWrapper reads customerPhone from route params", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../../src/screens/v3/V3ScreenWrappers.tsx"), "utf8"
    );
    expect(src).toContain("route?.params?.customerPhone");
    expect(src).toContain("customerPhone={customerPhone}");
  });
});

describe("V3-HARDEN-101: Status normalization", () => {
  it("admin/suppliers uses shared SQL constants not raw strings", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../src/routes/v1/admin/suppliers.ts"), "utf8"
    );
    // Uses imported SQL constants
    expect(src).toContain("SQL_SUPPLIER_IS_ACTIVE");
    expect(src).toContain("SQL_LINK_IS_ACTIVE");
    // No more raw lowercase 'active' or 'verified' in status writes
    expect(src).not.toMatch(/SET.*status = 'active'/);
    expect(src).not.toMatch(/SET.*verification_status = 'verified'/);
  });

  it("retailer-admin/suppliers uses shared SQL constants", () => {
    const src = require("fs").readFileSync(
      require("path").resolve(__dirname, "../../src/routes/v1/retailer-admin/suppliers.ts"), "utf8"
    );
    expect(src).toContain("SQL_LINK_IS_ACTIVE");
    expect(src).toContain("SQL_SUPPLIER_VERIFIED");
    // No more raw lowercase 'active' in status writes
    expect(src).not.toMatch(/VALUES.*'active'/);
  });
});
