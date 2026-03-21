// GCP-STG-0052: Scan quick-qty presets validate against available stock
import * as fs from "fs";
import * as path from "path";

const scanPath = path.resolve(__dirname, "../../screens/v3/ScanScreenV3.tsx");
const scanCode = fs.readFileSync(scanPath, "utf-8");

describe("GCP-STG-0052: Scan quick-qty stock validation", () => {
  test("checks stock before adding quick-qty preset", () => {
    expect(scanCode).toContain("product.stock ?? 0");
    expect(scanCode).toContain("inCart + p.qty > currentStock");
  });

  test("shows warning toast with available stock amount", () => {
    expect(scanCode).toContain("Only ${currentStock}");
    expect(scanCode).toContain("available");
  });

  test("includes unit in stock warning (e.g. 'kg', 'ltr')", () => {
    expect(scanCode).toContain("product.rateUnit");
    expect(scanCode).toContain(".toLowerCase()");
  });

  test("still allows the add (non-blocking warning — no early return)", () => {
    // After the stock warning, the add proceeds (warning is toast, not block)
    // The onPress handler contains both the warning AND the addItem call
    const presetSection = scanCode.slice(
      scanCode.indexOf("Validate stock before adding quick-qty"),
      scanCode.indexOf("Validate stock before adding quick-qty") + 1200
    );
    expect(presetSection).toContain("buildCartItem(product)");
    expect(presetSection).toContain("updateQuantity(existing.id");
  });

  test("accounts for items already in cart", () => {
    expect(scanCode).toContain("existing?.quantity ?? 0");
    expect(scanCode).toContain("inCart + p.qty");
  });
});
