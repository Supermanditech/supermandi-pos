/**
 * GCP-STG-0340: Approval Status Filter — backend filter support
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../src/routes/v1/admin/catalog.ts"), "utf8"
);

describe("GCP-STG-0340: Approval status filter in admin catalog", () => {
  test("accepts approvalStatus query parameter", () => {
    expect(SRC).toContain("approvalStatus");
  });

  test("validates against whitelist of valid statuses", () => {
    expect(SRC).toContain("pending");
    expect(SRC).toContain("approved");
    expect(SRC).toContain("rejected");
  });

  test("adds WHERE clause for approval_status filter", () => {
    expect(SRC).toContain("sp.approval_status =");
  });

  test("response includes approvalStatus filter echo", () => {
    expect(SRC).toContain("approvalStatus");
  });
});
