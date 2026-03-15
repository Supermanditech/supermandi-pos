/**
 * STG-518: HTTPS enforcement for supplier-portal and superadmin
 *
 * Verifies that both portals have HTTPS enforcement checks matching
 * retailer-admin's FIX-019 pattern.
 *
 * Test type: UNIT_TEST (static analysis — no component render)
 */

import * as fs from "fs";
import * as path from "path";

describe("STG-518: HTTPS enforcement across all portals", () => {
  const portalFiles = [
    {
      name: "retailer-admin",
      path: path.resolve(__dirname, "../../../retailer-admin/src/lib/api.ts"),
    },
    {
      name: "supplier-portal",
      path: path.resolve(__dirname, "../../../supplier-portal/src/lib/api.ts"),
    },
    {
      name: "superadmin",
      path: path.resolve(
        __dirname,
        "../../../supermandi-superadmin/src/api/authToken.ts"
      ),
    },
  ];

  for (const portal of portalFiles) {
    test(`${portal.name} enforces HTTPS in production`, () => {
      const content = fs.readFileSync(portal.path, "utf-8");
      // Must contain a check for http: + production env
      const hasHttpCheck =
        content.includes("http:") &&
        (content.includes("PROD") || content.includes("production"));
      const hasThrow =
        content.includes("throw") && content.includes("HTTPS");
      expect(hasHttpCheck).toBe(true);
      expect(hasThrow).toBe(true);
    });
  }
});
