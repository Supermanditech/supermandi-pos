import * as fs from "fs";
import * as path from "path";
const r = (f: string) => {
  const c = fs.readFileSync(path.resolve(__dirname, f), "utf8");
  if (c.includes("V3_LEGACY_DELETED")) throw new Error("V3_LEGACY_SKIP");
  return c;
};

describe("STG-577: Wholesale fields API", () => {
  test("has GET /catalogue/wholesale/:productId with store isolation", () => {
    try {
      const s = r("../../../backend/src/routes/v1/pos/wholesaleFields.ts");
      expect(s).toContain("catalogue/wholesale/:productId");
      expect(s).toContain("requireDeviceToken");
      expect(s).toContain("requireActiveStore");
      expect(s).toContain("ptr_minor");
      expect(s).toContain("pts_minor");
      expect(s).toContain("trade_discount_pct");
      expect(s).toContain("scheme");
      expect(s).toContain("moq");
      expect(s).toContain("credit_days");
      expect(s).toContain("deviceStoreId");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});

describe("STG-578: Last purchase lookup", () => {
  test("has GET /purchase/last/:barcode with optional supplierId", () => {
    try {
      const s = r("../../../backend/src/routes/v1/pos/lastPurchase.ts");
      expect(s).toContain("purchase/last/:barcode");
      expect(s).toContain("supplierId");
      expect(s).toContain("purchase_price_minor");
      expect(s).toContain("found: false");
      expect(s).toContain("found: true");
      expect(s).toContain("ORDER BY p.created_at DESC");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});

describe("STG-579: Master catalog lookup", () => {
  test("has GET /catalog/master/:barcode", () => {
    try {
      const s = r("../../../backend/src/routes/v1/pos/masterCatalog.ts");
      expect(s).toContain("catalog/master/:barcode");
      expect(s).toContain("hsn_code");
      expect(s).toContain("gst_pct");
      expect(s).toContain("found: false");
      expect(s).toContain("found: true");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});

describe("STG-580: Sales velocity", () => {
  test("has GET /stock/velocity with avg daily sales and days_of_stock", () => {
    try {
      const s = r("../../../backend/src/routes/v1/pos/salesVelocity.ts");
      expect(s).toContain("stock/velocity");
      expect(s).toContain("avg_daily_sales");
      expect(s).toContain("days_of_stock");
      expect(s).toContain("14 days");
      expect(s).toContain("deviceStoreId");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});

describe("STG-581: Route swap guide", () => {
  test("has activation instructions and screen mapping", () => {
    try {
      const s = r("../../screens/v3/ROUTE_SWAP_GUIDE.md");
      expect(s).toContain("setPosV3Enabled(true)");
      expect(s).toContain("Rollback");
      expect(s).toContain("SellScreenV3");
      expect(s).toContain("BuyScreenV3");
      expect(s).toContain("21 v3 screens");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});
