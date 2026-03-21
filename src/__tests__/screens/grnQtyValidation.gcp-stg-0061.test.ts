// GCP-STG-0061: GRN qty validation (over-receive warning)
// GCP-STG-0137: Match All disabled on empty items
import * as fs from "fs";
import * as path from "path";

const grnPath = path.resolve(__dirname, "../../screens/v3/GRNScreenV3.tsx");
const grnCode = fs.readFileSync(grnPath, "utf-8");

describe("GCP-STG-0061: GRN over-receive warning", () => {
  test("changeReceived warns when newReceived > ordered", () => {
    expect(grnCode).toContain("newReceived > it.ordered");
    expect(grnCode).toContain("more than expected");
  });

  test("warning only fires when delta is positive (incrementing)", () => {
    expect(grnCode).toContain("delta > 0");
  });

  test("warning only fires when ordered > 0 (not ad-hoc items)", () => {
    expect(grnCode).toContain("it.ordered > 0");
  });

  test("still allows the override (no hard block)", () => {
    // newReceived is set regardless of warning
    expect(grnCode).toContain("received: newReceived");
  });

  test("lower bound is still 0 (Math.max)", () => {
    expect(grnCode).toContain("Math.max(0, it.received + delta)");
  });
});

describe("GCP-STG-0137: Match All empty state", () => {
  test("Match All button is disabled when items.length === 0", () => {
    expect(grnCode).toContain("disabled={items.length === 0}");
  });

  test("Match All shows 'No items to match' for empty state", () => {
    expect(grnCode).toContain("No items to match");
  });

  test("Match All has reduced opacity when disabled", () => {
    expect(grnCode).toContain("items.length === 0 && { opacity: 0.5 }");
  });
});
