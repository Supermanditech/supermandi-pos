// GCP-STG-0747: GRN Edit button dead fix
import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0747: GRN Edit button dead fix", () => {
  it("GRNScreenV3 no longer has dead Edit text", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/GRNScreenV3.tsx"),
      "utf8"
    );
    expect(src).toContain("GCP-STG-0747");
    // Verify the dead "Edit" text was removed
    expect(src).not.toContain('>Edit ▸</Text>');
    // Verify qty +/- buttons still exist
    expect(src).toContain("changeReceived");
    expect(src).toContain("qtyBtn");
  });

  it("editBtn style definition is removed", () => {
    const src = fs.readFileSync(
      path.resolve(__dirname, "../../screens/v3/GRNScreenV3.tsx"),
      "utf8"
    );
    expect(src).not.toContain("editBtn: {");
  });
});
