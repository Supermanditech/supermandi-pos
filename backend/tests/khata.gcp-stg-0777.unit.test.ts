/**
 * GCP-STG-0777: Khata accepts only `type` field, no `entryType` alias
 */
describe("GCP-STG-0777: Single khata entry type field", () => {
  const fs = require("fs");
  const khata = fs.readFileSync("src/routes/v1/pos/khata.ts", "utf8");

  it("should not destructure entryType from req.body", () => {
    expect(khata).not.toContain("entryType: legacyEntryType");
    expect(khata).not.toContain("legacyEntryType");
  });

  it("should destructure type from req.body", () => {
    expect(khata).toContain("type: rawType");
  });

  it("should have GCP-STG-0777 comment", () => {
    expect(khata).toContain("GCP-STG-0777");
  });
});
