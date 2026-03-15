/**
 * STG-523: Store isolation enforceStoreBinding — log warning when no storeId sent
 *
 * Verifies that enforceStoreBinding logs a warning when the client
 * sends no storeId despite the device being bound to a store.
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const filePath = path.resolve(
  __dirname,
  "../../../backend/src/middleware/deviceToken.ts"
);

describe("STG-523: enforceStoreBinding logs when no storeId sent", () => {
  const content = fs.readFileSync(filePath, "utf-8");

  test("logs warning when candidates array is empty", () => {
    // The code should have a log.warn inside the candidates.length === 0 branch
    expect(content).toContain("store_binding_no_store_id");
  });

  test("log includes deviceId and enrolledStoreId", () => {
    const warnSection = content.split("store_binding_no_store_id")[1]?.split("}")[0];
    expect(warnSection).toContain("deviceId");
    expect(warnSection).toContain("enrolledStoreId");
  });

  test("log includes request path for debugging", () => {
    const warnSection = content.split("store_binding_no_store_id")[1]?.split("}")[0];
    expect(warnSection).toContain("method");
    expect(warnSection).toContain("path");
  });
});
