/**
 * STG-263: Screen-level i18n for InwardScreen
 *
 * Source-code analysis test — verifies all hardcoded UI strings
 * have been replaced with t() calls and that i18n keys exist.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const screenPath = resolve(
  __dirname,
  "../../screens/InwardScreen.tsx"
);
const enPath = resolve(__dirname, "../../i18n/locales/en.json");
const hiPath = resolve(__dirname, "../../i18n/locales/hi.json");

const screenSrc = readFileSync(screenPath, "utf-8");
const enJson = JSON.parse(readFileSync(enPath, "utf-8"));
const hiJson = JSON.parse(readFileSync(hiPath, "utf-8"));

describe("STG-263: InwardScreen i18n", () => {
  test("imports useTranslation from react-i18next", () => {
    expect(screenSrc).toContain(
      'import { useTranslation } from "react-i18next"'
    );
  });

  test("calls useTranslation() in main component", () => {
    expect(screenSrc).toContain("const { t } = useTranslation()");
  });

  // Count useTranslation calls — should be 3 (main + SupplierPicker + InwardItemRow)
  test("useTranslation() is called in all 3 components", () => {
    const matches = screenSrc.match(/const \{ t \} = useTranslation\(\)/g);
    expect(matches).not.toBeNull();
    expect(matches!.length).toBeGreaterThanOrEqual(3);
  });

  const expectedKeys = [
    // Header
    "inward.title",
    // SupplierPicker
    "inward.selectSupplierTitle",
    "inward.noSupplier",
    "inward.loadingSuppliers",
    "inward.noSuppliers",
    // Supplier selector in main
    "inward.selectSupplier",
    // Search
    "inward.searchProduct",
    "inward.noProducts",
    "inward.typeToSearch",
    // Cart
    "inward.itemsCount",
    "inward.clearAll",
    "inward.noItems",
    "inward.addItemsHint",
    "inward.addNotes",
    // InwardItemRow fields
    "inward.qty",
    "inward.price",
    "inward.total",
    "inward.batchNumber",
    "inward.expiryDate",
    "inward.atMarket",
    "inward.vsMarket",
    // Footer
    "inward.totalItems",
    "inward.submitInward",
    // Alerts
    "inward.successTitle",
    "inward.successMessage",
    "inward.failedTitle",
    "inward.stockCheckFailed",
    "inward.stockCheckFailedMessage",
  ];

  test.each(expectedKeys)(
    't("%s") call exists in source',
    (key) => {
      // Match both t("key") and t('key'), with or without extra params after
      const doubleQuote = screenSrc.includes(`t("${key}")`);
      const singleQuote = screenSrc.includes(`t('${key}')`);
      const withParams = screenSrc.includes(`t("${key}",`);
      expect(doubleQuote || singleQuote || withParams).toBe(true);
    }
  );

  test.each(expectedKeys)(
    'en.json has key "%s"',
    (key) => {
      const [ns, k] = key.split(".");
      expect(enJson[ns]).toBeDefined();
      expect(enJson[ns][k]).toBeDefined();
    }
  );

  test.each(expectedKeys)(
    'hi.json has key "%s"',
    (key) => {
      const [ns, k] = key.split(".");
      expect(hiJson[ns]).toBeDefined();
      expect(hiJson[ns][k]).toBeDefined();
    }
  );

  // Verify no hardcoded UI strings remain in JSX
  const forbiddenLiterals = [
    { pattern: />Stock Inward</, label: "Stock Inward" },
    { pattern: />Select Supplier</, label: "Select Supplier" },
    { pattern: />No supplier \(manual entry\)</, label: "No supplier (manual entry)" },
    { pattern: />Loading suppliers\.\.\.</, label: "Loading suppliers..." },
    { pattern: />No suppliers linked to this store</, label: "No suppliers linked..." },
    { pattern: />No products found</, label: "No products found" },
    { pattern: />Type 2\+ characters to search</, label: "Type 2+ characters..." },
    { pattern: />Qty</, label: "Qty" },
    { pattern: />Price</, label: "Price" },
    { pattern: />Total</, label: "Total" },
    { pattern: />Batch No\. \(optional\)</, label: "Batch No. (optional)" },
    { pattern: />Expiry Date \(optional\)</, label: "Expiry Date (optional)" },
    { pattern: />Clear all</, label: "Clear all" },
    { pattern: />Submit Inward</, label: "Submit Inward" },
    { pattern: />At market</, label: "At market" },
  ];

  test.each(forbiddenLiterals)(
    'no hardcoded "$label" in JSX',
    ({ pattern }) => {
      expect(screenSrc).not.toMatch(pattern);
    }
  );

  // Verify Alert.alert calls use t() not hardcoded strings
  test("Alert.alert for stock check failure uses t()", () => {
    expect(screenSrc).not.toMatch(/Alert\.alert\(\s*"Stock Check Failed"/);
    expect(screenSrc).toContain('t("inward.stockCheckFailed")');
  });

  test("Alert.alert for inward complete uses t()", () => {
    expect(screenSrc).not.toMatch(/Alert\.alert\(\s*"Stock Inward Complete"/);
    expect(screenSrc).toContain('t("inward.successTitle")');
  });

  test("Alert.alert for inward failed uses t()", () => {
    expect(screenSrc).not.toMatch(/Alert\.alert\(\s*"Inward Failed"/);
    expect(screenSrc).toContain('t("inward.failedTitle")');
  });

  // Verify placeholder strings use t() not hardcoded
  test("search placeholder uses t()", () => {
    expect(screenSrc).not.toMatch(
      /placeholder="Search product by name or barcode"/
    );
    expect(screenSrc).toContain('placeholder={t("inward.searchProduct")}');
  });

  test("notes placeholder uses t()", () => {
    expect(screenSrc).not.toMatch(/placeholder="Add notes \(optional\)"/);
    expect(screenSrc).toContain('placeholder={t("inward.addNotes")}');
  });

  // Verify interpolation keys exist with proper format
  test("itemsCount uses {{count}} interpolation", () => {
    expect(enJson.inward.itemsCount).toContain("{{count}}");
  });

  test("totalItems uses {{count}} interpolation", () => {
    expect(enJson.inward.totalItems).toContain("{{count}}");
  });

  test("successMessage uses {{count}} interpolation", () => {
    expect(enJson.inward.successMessage).toContain("{{count}}");
  });

  test("vsMarket uses {{pct}} interpolation", () => {
    expect(enJson.inward.vsMarket).toContain("{{pct}}");
  });
});
