/**
 * STG-484: Verify CartItem + SupplierRow use useThemeColors() hook
 * instead of static `import { theme }` for color access.
 */
import * as fs from "fs";
import * as path from "path";

const COMPONENTS_DIR = path.resolve(__dirname, "../../components/buy");

function readComponent(filename: string): string {
  return fs.readFileSync(path.join(COMPONENTS_DIR, filename), "utf-8");
}

describe("STG-484: CartItem theme hook refactor", () => {
  const src = readComponent("CartItem.tsx");

  it("does not use static import { theme } for colors (only for spacing/borderRadius/shadows)", () => {
    // Should NOT have theme.colors anywhere — all color access via useThemeColors()
    expect(src).not.toMatch(/theme\.colors\./);
  });

  it("imports and calls useThemeColors", () => {
    expect(src).toMatch(/import\s*\{[^}]*useThemeColors[^}]*\}\s*from/);
    expect(src).toMatch(/useThemeColors\(\)/);
  });
});

describe("STG-484: SupplierRow theme hook refactor", () => {
  const src = readComponent("SupplierRow.tsx");

  it("does not use static import { theme } for colors (only for spacing/borderRadius/shadows)", () => {
    expect(src).not.toMatch(/theme\.colors\./);
  });

  it("imports and calls useThemeColors", () => {
    expect(src).toMatch(/import\s*\{[^}]*useThemeColors[^}]*\}\s*from/);
    expect(src).toMatch(/useThemeColors\(\)/);
  });

  it("does not use stockColor + \"20\" string concatenation for opacity", () => {
    // The old pattern was: { backgroundColor: stockColor + "20" }
    // Should use proper React Native opacity instead
    expect(src).not.toMatch(/stockColor\s*\+\s*["']20["']/);
  });
});
