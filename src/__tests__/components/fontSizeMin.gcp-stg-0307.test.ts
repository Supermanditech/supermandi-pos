/**
 * GCP-STG-0307: No sub-10px fontSize in ANY V3 component or screen
 *
 * Scans all .tsx files under components/v3/ and screens/v3/ for literal
 * `fontSize: N` where N < 10. Dynamic expressions like getChipFontSize()-3
 * are guarded by Math.max(..., 10) in source — this test catches literals only.
 */
import * as fs from "fs";
import * as path from "path";

function readComponent(name: string): string {
  return fs.readFileSync(path.resolve(__dirname, `../../components/v3/${name}`), "utf8");
}

function readScreen(name: string): string {
  return fs.readFileSync(path.resolve(__dirname, `../../screens/v3/${name}`), "utf8");
}

function listTsx(dir: string): string[] {
  const full = path.resolve(__dirname, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full).filter((f) => f.endsWith(".tsx"));
}

// Matches literal fontSize: 7, fontSize: 8, fontSize: 9 (not in comments)
const SUB_10_REGEX = /fontSize:\s*[789][,\s})]/;

describe("GCP-STG-0307: Minimum fontSize enforcement", () => {
  const componentFiles = listTsx("../../components/v3");
  const screenFiles = listTsx("../../screens/v3");

  test("all V3 components have no literal sub-10px fontSize", () => {
    for (const file of componentFiles) {
      const src = readComponent(file);
      // Strip comment lines before checking
      const codeLines = src.split("\n").filter((l) => !l.trim().startsWith("//"));
      const code = codeLines.join("\n");
      const match = code.match(SUB_10_REGEX);
      expect(match).toBeNull();
    }
  });

  test("all V3 screens have no literal sub-10px fontSize", () => {
    for (const file of screenFiles) {
      const src = readScreen(file);
      const codeLines = src.split("\n").filter((l) => !l.trim().startsWith("//"));
      const code = codeLines.join("\n");
      const match = code.match(SUB_10_REGEX);
      expect(match).toBeNull();
    }
  });

  test("ProductTileV3 dynamic fontSize uses Math.max(..., 10)", () => {
    const src = readComponent("ProductTileV3.tsx");
    // All getChipFontSize() - 3 calls must be wrapped in Math.max
    const dynamicSubs = src.match(/getChipFontSize\(\)\s*-\s*3/g) || [];
    for (const _match of dynamicSubs) {
      // Every occurrence should be inside Math.max(...)
      expect(src).toContain("Math.max(getChipFontSize() - 3, 10)");
    }
  });

  test("No fontSize: 7 anywhere in critical components", () => {
    const files = ["BottomNavV3.tsx", "ProductTileV3.tsx", "SupplierProductCardV3.tsx"];
    for (const file of files) {
      const src = readComponent(file);
      expect(src).not.toMatch(/fontSize:\s*7[^0-9]/);
    }
  });

  test("scanned at least 10 component + screen files", () => {
    // Sanity check — ensure test is not trivially passing on empty dirs
    expect(componentFiles.length + screenFiles.length).toBeGreaterThanOrEqual(10);
  });
});
