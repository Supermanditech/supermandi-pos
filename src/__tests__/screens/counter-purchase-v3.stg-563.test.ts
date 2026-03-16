/**
 * STG-563: CounterPurchaseScreenV3 — scan + metadata + repeat purchase
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-563: CounterPurchaseScreenV3", () => {
  test("has HID + camera scan buttons and barcode input", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/CounterPurchaseScreenV3.tsx"), "utf8");
    expect(src).toContain("Camera Scan");
    expect(src).toContain("HID Scanner");
    expect(src).toContain("scanInput");
    expect(src).toContain("READY");
  });

  test("has supplier selector and invoice number", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/CounterPurchaseScreenV3.tsx"), "utf8");
    expect(src).toContain("SUPPLIER");
    expect(src).toContain("Invoice");
    expect(src).toContain("GSTIN");
  });

  test("has 3 product states: repeat, existing, new", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/CounterPurchaseScreenV3.tsx"), "utf8");
    expect(src).toContain('"repeat"');
    expect(src).toContain('"existing"');
    expect(src).toContain('"new"');
    expect(src).toContain("PurchaseItemCardV3");
  });

  test("PurchaseItemCardV3 has Same button for repeat, required price for existing, full form for new", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/PurchaseItemCardV3.tsx"), "utf8");
    expect(src).toContain("Same ↺");
    expect(src).toContain("lastPurchasePrice");
    expect(src).toContain("No previous purchase");
    expect(src).toContain("Product name *");
    expect(src).toContain("Brand *");
  });

  test("has expandable (+) details for tax, batch, trade terms", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/PurchaseItemCardV3.tsx"), "utf8");
    expect(src).toContain("ExpandableDetails");
    expect(src).toContain("HSN Code");
    expect(src).toContain("Trade Disc");
    expect(src).toContain("Batch No");
    expect(src).toContain("Expiry");
  });

  test("ExpandableDetails is a reusable collapsible component", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/ExpandableDetails.tsx"), "utf8");
    expect(src).toContain("expanded");
    expect(src).toContain("setExpanded");
    expect(src).toContain("children");
  });

  test("has GST summary footer with WhatsApp send and confirm", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/CounterPurchaseScreenV3.tsx"), "utf8");
    expect(src).toContain("Grand Total");
    expect(src).toContain("GST");
    expect(src).toContain("Save Draft");
    expect(src).toContain("WhatsApp");
    expect(src).toContain("Confirm");
  });

  test("has why-add-details explanation card", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/CounterPurchaseScreenV3.tsx"), "utf8");
    expect(src).toContain("Why add full product details");
    expect(src).toContain("Stock sync");
    expect(src).toContain("GST compliance");
    expect(src).toContain("Supplier ledger");
  });
});
