/**
 * STG-534: Khata negative balance — explicit overpayment display
 *
 * Verifies that KhataScreen uses "storeOwes" label instead of
 * "advance" when balance is negative (store owes customer).
 *
 * Test type: UNIT_TEST (static analysis)
 */

import * as fs from "fs";
import * as path from "path";

const screenPath = path.resolve(
  __dirname,
  "../../screens/KhataScreen.tsx"
);
const enPath = path.resolve(
  __dirname,
  "../../i18n/locales/en.json"
);
const hiPath = path.resolve(
  __dirname,
  "../../i18n/locales/hi.json"
);

describe("STG-534: Khata overpayment display", () => {
  const screen = fs.readFileSync(screenPath, "utf-8");
  const en = JSON.parse(fs.readFileSync(enPath, "utf-8"));
  const hi = JSON.parse(fs.readFileSync(hiPath, "utf-8"));

  test("uses storeOwes label for negative balance in customer card", () => {
    expect(screen).toContain('t("khata.storeOwes")');
  });

  test("uses storeOwes label in ledger modal", () => {
    expect(screen).toContain('t("khata.storeOwes").toLowerCase()');
  });

  test("en.json has storeOwes key", () => {
    expect(en.khata.storeOwes).toBe("Store Owes");
  });

  test("hi.json has storeOwes key", () => {
    expect(hi.khata.storeOwes).toBeTruthy();
  });
});
