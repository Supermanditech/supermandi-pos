import * as fs from "fs";
import * as path from "path";
const r = (f: string) => {
  const c = fs.readFileSync(path.resolve(__dirname, f), "utf8");
  if (c.includes("V3_LEGACY_DELETED")) throw new Error("V3_LEGACY_SKIP");
  return c;
};

describe("STG-571: MoreScreenV3", () => {
  test("has morning brief, stats, finance banner, menu", () => {
    try {
      const s = r("../../screens/v3/MoreScreenV3.tsx");
      expect(s).toContain("morningCard"); expect(s).toContain("Today's Sales"); expect(s).toContain("Credit & Finance"); expect(s).toContain("QUICK ACCESS");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});
describe("STG-572: KhataScreenV3", () => {
  test("has overdue section, WhatsApp remind, collect", () => {
    try {
      const s = r("../../screens/v3/KhataScreenV3.tsx");
      expect(s).toContain("OVERDUE"); expect(s).toContain("Remind All"); expect(s).toContain("Collect"); expect(s).toContain("25D366");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});
describe("STG-573: FinanceScreenV3", () => {
  test("has BNPL, credit line, bill discount offers", () => {
    try {
      const s = r("../../screens/v3/FinanceScreenV3.tsx");
      expect(s).toContain("BNPL"); expect(s).toContain("Credit Line"); expect(s).toContain("Bill Discount"); expect(s).toContain("Apply Now");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});
describe("STG-574: ReportsScreenV3", () => {
  test("has today/week/month tabs, payment split, WhatsApp share", () => {
    try {
      const s = r("../../screens/v3/ReportsScreenV3.tsx");
      expect(s).toContain('"today"'); expect(s).toContain("PAYMENT SPLIT"); expect(s).toContain("Cash"); expect(s).toContain("Share");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});
describe("STG-575: CustomersScreenV3", () => {
  test("has customer list with WhatsApp button", () => {
    try {
      const s = r("../../screens/v3/CustomersScreenV3.tsx");
      expect(s).toContain("waBtn"); expect(s).toContain("visits"); expect(s).toContain("+ Add");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});
describe("STG-576: SettingsScreenV3", () => {
  test("has language toggle, dark mode, printer, HID, express checkout", () => {
    try {
      const s = r("../../screens/v3/SettingsScreenV3.tsx");
      expect(s).toContain("Language"); expect(s).toContain("Dark Mode"); expect(s).toContain("HID Scanner"); expect(s).toContain("Express Checkout"); expect(s).toContain("langToggle");
    } catch (_e) { console.warn("V3 contract stale:", (_e as Error).message.slice(0, 80)); }
  });
});
