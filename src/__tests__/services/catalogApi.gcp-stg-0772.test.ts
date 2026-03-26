/**
 * GCP-STG-0772: Deprecated getCategories() removed, use getFmcgCategories()
 */
describe("GCP-STG-0772: getCategories removed", () => {
  const fs = require("fs");
  const api = fs.readFileSync("src/services/api/catalogApi.ts", "utf8");

  it("should not export getCategories function", () => {
    expect(api).not.toContain("export async function getCategories");
  });

  it("should have getFmcgCategories available", () => {
    expect(api).toContain("export async function getFmcgCategories");
  });

  it("should have removal comment for traceability", () => {
    expect(api).toContain("GCP-STG-0772");
  });
});
