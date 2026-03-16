/**
 * STG-567..570: Layer 4 Store screens
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-567: StoreHubScreenV3", () => {
  test("has 4 action cards with SVG illustrations", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/StoreHubScreenV3.tsx"), "utf8");
    expect(src).toContain("Receive Stock");
    expect(src).toContain("Reorder");
    expect(src).toContain("Stock Report");
    expect(src).toContain("Barcode Labels");
    expect(src).toContain("<Svg");
    expect(src).toContain("onNavigate");
  });
  test("has recent orders list", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/StoreHubScreenV3.tsx"), "utf8");
    expect(src).toContain("RECENT ORDERS");
    expect(src).toContain("Delivered");
    expect(src).toContain("In Transit");
  });
});

describe("STG-568: GRNScreenV3", () => {
  test("has HID scan bar and camera button", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/GRNScreenV3.tsx"), "utf8");
    expect(src).toContain("scanBar");
    expect(src).toContain("HID ready");
    expect(src).toContain("camBtn");
  });
  test("has PO tab and Ad-hoc tab", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/GRNScreenV3.tsx"), "utf8");
    expect(src).toContain("Against PO");
    expect(src).toContain("Ad-hoc Inward");
  });
  test("has checkboxes, qty controls, edit button per item", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/GRNScreenV3.tsx"), "utf8");
    expect(src).toContain("toggleCheck");
    expect(src).toContain("changeReceived");
    expect(src).toContain("Edit");
    expect(src).toContain("Match All");
    expect(src).toContain("Confirm Receipt");
  });
});

describe("STG-569: ReorderScreenV3", () => {
  test("has stock runout prediction", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/ReorderScreenV3.tsx"), "utf8");
    expect(src).toContain("daysLeft");
    expect(src).toContain("Runs out today");
    expect(src).toContain("dailySales");
  });
  test("has approve/edit/dismiss + WhatsApp send", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/ReorderScreenV3.tsx"), "utf8");
    expect(src).toContain("Approve");
    expect(src).toContain("Edit");
    expect(src).toContain("WhatsApp");
    expect(src).toContain("Approve All");
  });
});

describe("STG-570: StockScreenV3", () => {
  test("has current/unsold/movement tabs", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/StockScreenV3.tsx"), "utf8");
    expect(src).toContain('"current"');
    expect(src).toContain('"unsold"');
    expect(src).toContain('"movement"');
  });
  test("has stats cards and search", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/StockScreenV3.tsx"), "utf8");
    expect(src).toContain("Products");
    expect(src).toContain("Low");
    expect(src).toContain("Out");
    expect(src).toContain("searchInput");
  });
  test("has opening stock and barcode labels buttons", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/StockScreenV3.tsx"), "utf8");
    expect(src).toContain("Opening Stock");
    expect(src).toContain("Barcode Labels");
  });
});
