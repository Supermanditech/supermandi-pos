/**
 * STG-504: Hardcoded WhatsApp color #25D366 — use theme token
 *
 * Verifies that all screen files use theme.colors.whatsapp instead of
 * hardcoded #25D366 hex values.
 *
 * Test type: UNIT_TEST (static analysis — no component render)
 */

import * as fs from "fs";
import * as path from "path";

const screensDir = path.resolve(__dirname, "../../screens");

describe("STG-504: No hardcoded WhatsApp color in screens", () => {
  const screenFiles = fs.readdirSync(screensDir).filter((f) => f.endsWith(".tsx"));

  test("theme defines whatsapp color token", () => {
    const colorsFile = fs.readFileSync(
      path.resolve(__dirname, "../../theme/colors.ts"),
      "utf-8"
    );
    expect(colorsFile).toContain('whatsapp: "#25D366"');
  });

  test("no screen file has hardcoded #25D366 in JSX color props", () => {
    const violations: string[] = [];
    for (const file of screenFiles) {
      const content = fs.readFileSync(path.join(screensDir, file), "utf-8");
      // Match color="#25D366" or color: "#25D366" (but not in comments or backgroundColor with opacity suffix)
      const lines = content.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
        // Match exact #25D366 (not #25D36610 which is opacity variant)
        if (/"#25D366"/.test(line) && !/#25D366[0-9a-fA-F]{2}/.test(line)) {
          violations.push(`${file}:${i + 1}: ${line.trim()}`);
        }
      }
    }
    expect(violations).toEqual([]);
  });

  test("screens that use WhatsApp icons import useThemeColors", () => {
    const screensWithWhatsapp = screenFiles.filter((file) => {
      const content = fs.readFileSync(path.join(screensDir, file), "utf-8");
      return content.includes('name="whatsapp"');
    });

    for (const file of screensWithWhatsapp) {
      const content = fs.readFileSync(path.join(screensDir, file), "utf-8");
      expect(content).toContain("useThemeColors");
    }
  });
});
