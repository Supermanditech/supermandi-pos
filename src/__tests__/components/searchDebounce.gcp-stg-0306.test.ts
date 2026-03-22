/**
 * GCP-STG-0306: Search debounce in UniversalSearchV3
 */
import * as fs from "fs";
import * as path from "path";

const SRC = fs.readFileSync(
  path.resolve(__dirname, "../../components/v3/UniversalSearchV3.tsx"), "utf8"
);

describe("GCP-STG-0306: Search debounce", () => {
  test("uses setTimeout for debounce in handleQueryChange", () => {
    expect(SRC).toContain("setTimeout(");
    expect(SRC).toContain("onQueryChange?.(text)");
  });

  test("debounce delay is 300ms", () => {
    expect(SRC).toContain("}, 300)");
  });

  test("clears previous timeout on new input", () => {
    expect(SRC).toContain("clearTimeout(debounceRef.current)");
  });

  test("uses useRef for debounce timer", () => {
    expect(SRC).toContain("debounceRef");
    expect(SRC).toContain("useRef<");
  });

  test("chip tap fires immediately (no debounce)", () => {
    // handleChipTap should clear debounce and call directly
    const chipSection = SRC.split("handleChipTap")[1]?.split("}, [")[0] || "";
    expect(chipSection).toContain("clearTimeout");
    expect(chipSection).toContain("onQueryChange?.(term)");
    expect(chipSection).not.toContain("setTimeout");
  });
});
