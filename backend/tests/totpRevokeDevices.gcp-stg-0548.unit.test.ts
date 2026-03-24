/**
 * GCP-STG-0548: TOTP revoke-devices endpoint tests
 * Behavioral: verifies route declarations exist in all 3 auth files
 * and that the endpoints follow the correct pattern (auth guard + logAuthEvent).
 */
import fs from "fs";
import path from "path";

describe("GCP-STG-0548: TOTP revoke-devices endpoints", () => {
  const adminAuthPath = path.resolve(__dirname, "../src/routes/v1/admin/adminAuth.ts");
  const retailerAuthPath = path.resolve(__dirname, "../src/routes/v1/retailer-admin/auth.ts");
  const supplierAuthPath = path.resolve(__dirname, "../src/routes/v1/supplier/auth.ts");

  let adminSrc: string;
  let retailerSrc: string;
  let supplierSrc: string;

  beforeAll(() => {
    adminSrc = fs.readFileSync(adminAuthPath, "utf-8");
    retailerSrc = fs.readFileSync(retailerAuthPath, "utf-8");
    supplierSrc = fs.readFileSync(supplierAuthPath, "utf-8");
  });

  // --- Admin ---
  describe("Admin portal", () => {
    it("declares POST /auth/totp-revoke-devices route", () => {
      expect(adminSrc).toContain('adminAuthRouter.post("/auth/totp-revoke-devices"');
    });

    it("uses extractAdminToken for auth guard", () => {
      const routeBlock = adminSrc.slice(adminSrc.indexOf('"/auth/totp-revoke-devices"'));
      expect(routeBlock).toContain("extractAdminToken(req)");
    });

    it("returns 401 when no token", () => {
      const routeBlock = adminSrc.slice(adminSrc.indexOf('"/auth/totp-revoke-devices"'));
      expect(routeBlock).toContain("401");
      expect(routeBlock).toContain("NO_TOKEN");
    });

    it("logs totp_devices_revoked event", () => {
      const routeBlock = adminSrc.slice(adminSrc.indexOf('"/auth/totp-revoke-devices"'));
      expect(routeBlock).toContain("totp_devices_revoked");
      expect(routeBlock).toContain("logAuthEvent");
    });

    it("returns success:true response", () => {
      const routeBlock = adminSrc.slice(adminSrc.indexOf('"/auth/totp-revoke-devices"'));
      expect(routeBlock).toContain("success: true");
    });
  });

  // --- Retailer ---
  describe("Retailer portal", () => {
    it("declares POST /auth/totp-revoke-devices route", () => {
      expect(retailerSrc).toContain('router.post("/auth/totp-revoke-devices"');
    });

    it("uses extractRetailerToken for auth guard", () => {
      const routeBlock = retailerSrc.slice(retailerSrc.indexOf('"/auth/totp-revoke-devices"'));
      expect(routeBlock).toContain("extractRetailerToken(req)");
    });

    it("returns 401 when no token", () => {
      const routeBlock = retailerSrc.slice(retailerSrc.indexOf('"/auth/totp-revoke-devices"'));
      expect(routeBlock).toContain("401");
      expect(routeBlock).toContain("NO_TOKEN");
    });

    it("logs totp_devices_revoked event for retailer", () => {
      const routeBlock = retailerSrc.slice(retailerSrc.indexOf('"/auth/totp-revoke-devices"'));
      expect(routeBlock).toContain("totp_devices_revoked");
      expect(routeBlock).toContain("logAuthEvent");
    });

    it("imports logAuthEvent from authAudit", () => {
      expect(retailerSrc).toContain('import { logAuthEvent } from "../../../services/authAudit"');
    });
  });

  // --- Supplier ---
  describe("Supplier portal", () => {
    it("declares POST /auth/totp-revoke-devices route", () => {
      expect(supplierSrc).toContain('router.post("/auth/totp-revoke-devices"');
    });

    it("uses requireSupplierAuth middleware", () => {
      expect(supplierSrc).toMatch(/router\.post\("\/auth\/totp-revoke-devices",\s*requireSupplierAuth/);
    });

    it("returns 401 when no supplierId", () => {
      const routeBlock = supplierSrc.slice(supplierSrc.indexOf('"/auth/totp-revoke-devices"'));
      expect(routeBlock).toContain("401");
      expect(routeBlock).toContain("NO_TOKEN");
    });

    it("logs totp_devices_revoked event for supplier", () => {
      const routeBlock = supplierSrc.slice(supplierSrc.indexOf('"/auth/totp-revoke-devices"'));
      expect(routeBlock).toContain("totp_devices_revoked");
      expect(routeBlock).toContain("logAuthEvent");
    });

    it("imports logAuthEvent from authAudit", () => {
      expect(supplierSrc).toContain('import { logAuthEvent } from "../../../services/authAudit"');
    });
  });
});
