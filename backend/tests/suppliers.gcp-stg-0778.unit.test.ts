/**
 * GCP-STG-0778: Supplier rejection accepts only `notes`, no `reason` alias
 */
describe("GCP-STG-0778: Single supplier rejection field", () => {
  const fs = require("fs");
  const suppliers = fs.readFileSync("src/routes/v1/admin/suppliers.ts", "utf8");

  it("should not destructure reason from req.body in reject handler", () => {
    // Find the reject handler section
    const rejectSection = suppliers.slice(suppliers.indexOf("/reject"));
    expect(rejectSection).not.toContain("{ notes, reason }");
  });

  it("should destructure only notes", () => {
    expect(suppliers).toContain("{ notes }");
  });

  it("should have GCP-STG-0778 comment", () => {
    expect(suppliers).toContain("GCP-STG-0778");
  });
});
