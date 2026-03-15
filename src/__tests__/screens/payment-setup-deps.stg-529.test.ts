/**
 * STG-529: PaymentSetupScreen BackHandler — add handleSkip to useEffect deps
 *
 * Verifies that the BackHandler useEffect includes handleSkip in its
 * dependency array to prevent stale closures.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../screens/PaymentSetupScreen.tsx"
);

describe("STG-529: PaymentSetupScreen BackHandler deps", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("BackHandler useEffect includes handleSkip in deps", () => {
    // Find the BackHandler useEffect and check its deps
    const backHandlerMatch = content.match(
      /BackHandler\.addEventListener[\s\S]*?\}, \[([^\]]*)\]\)/
    );
    expect(backHandlerMatch).not.toBeNull();
    expect(backHandlerMatch![1]).toContain("handleSkip");
  });

  test("handleSkip is wrapped in useCallback for stable reference", () => {
    expect(content).toMatch(/const handleSkip = useCallback/);
  });

  test("handleSkip useCallback includes navigation in deps", () => {
    const callbackMatch = content.match(
      /const handleSkip = useCallback\([\s\S]*?\}, \[([^\]]*)\]\)/
    );
    expect(callbackMatch).not.toBeNull();
    expect(callbackMatch![1]).toContain("navigation");
  });
});
