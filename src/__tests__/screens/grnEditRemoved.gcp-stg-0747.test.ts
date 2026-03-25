// GCP-STG-0747: Verify "Edit ▸" dead pattern is absent from GRNScreenV3
// This confirms the old inline-edit button was removed as intended.
// Since React Native components cannot be rendered in plain Jest without
// a full native runtime, we verify the source no longer contains the
// specific UI string that was removed. This is acceptable for an
// ABSENCE-of-code check — it guards against accidental re-introduction.
import { describe, it, expect } from "@jest/globals";
import * as fs from "fs";
import * as path from "path";

describe("GCP-STG-0747: GRN Edit button removed", () => {
  const grnSource = fs.readFileSync(
    path.resolve(__dirname, "../../screens/v3/GRNScreenV3.tsx"),
    "utf8"
  );

  it("does not contain 'Edit ▸' text (removed dead inline-edit button)", () => {
    expect(grnSource).not.toContain("Edit ▸");
  });

  it("does not contain 'Edit ►' text (alternate arrow variant)", () => {
    expect(grnSource).not.toContain("Edit ►");
  });

  it("does not render an edit-item inline button pattern", () => {
    // The old pattern was a Pressable with onPress that toggled item editing
    // Verify no 'editItem' or 'onEditItem' handler exists in the component
    expect(grnSource).not.toMatch(/onPress=\{.*editItem/);
  });

  it("still renders the core GRN component (sanity check)", () => {
    expect(grnSource).toContain("GRNScreenV3");
    expect(grnSource).toContain("export default function GRNScreenV3");
  });
});
