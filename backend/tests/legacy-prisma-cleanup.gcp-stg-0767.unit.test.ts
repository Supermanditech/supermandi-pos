/**
 * GCP-STG-0767: Verify dead Prisma route files are deleted
 */
describe("GCP-STG-0767: Dead Prisma route files removed", () => {
  const fs = require("fs");
  const path = require("path");

  const deadFiles = [
    "src/routes/auth.prisma_disabled.ts",
    "src/routes/products.prisma_disabled.ts",
    "src/routes/transactions.prisma_disabled.ts",
    "src/routes/users.prisma_disabled.ts",
  ];

  for (const file of deadFiles) {
    it(`should not have ${path.basename(file)}`, () => {
      expect(fs.existsSync(file)).toBe(false);
    });
  }

  it("should have zero prisma_disabled imports in v1 routes", () => {
    const routeDir = "src/routes/v1";
    if (!fs.existsSync(routeDir)) return; // skip if dir missing
    const files = fs.readdirSync(routeDir, { recursive: true });
    for (const f of files) {
      if (typeof f !== "string" || !f.endsWith(".ts")) continue;
      const content = fs.readFileSync(path.join(routeDir, f), "utf8");
      expect(content).not.toContain("prisma_disabled");
    }
  });
});
