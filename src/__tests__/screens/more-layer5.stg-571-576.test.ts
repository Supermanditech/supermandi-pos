import * as fs from "fs";
import * as path from "path";
const r = (f: string) => fs.readFileSync(path.resolve(__dirname, f), "utf8");

describe("STG-571: MoreScreenV3", () => {
  test("has morning brief, stats, finance banner, menu", () => {
    const s = r("../../screens/v3/MoreScreenV3.tsx");
    expect(s).toContain("morningCard"); expect(s).toContain("Today's Sales"); expect(s).toContain("Credit & Finance"); expect(s).toContain("QUICK ACCESS");
  });
});
describe("STG-572: KhataScreenV3", () => {
  test("has overdue section, WhatsApp remind, collect", () => {
    const s = r("../../screens/v3/KhataScreenV3.tsx");
    expect(s).toContain("OVERDUE"); expect(s).toContain("Remind All"); expect(s).toContain("Collect"); expect(s).toContain("25D366");
  });
});
describe("STG-573: FinanceScreenV3", () => {
  test("has BNPL, credit line, bill discount offers", () => {
    const s = r("../../screens/v3/FinanceScreenV3.tsx");
    expect(s).toContain("BNPL"); expect(s).toContain("Credit Line"); expect(s).toContain("Bill Discount"); expect(s).toContain("Apply Now");
  });
});
describe("STG-574: ReportsScreenV3", () => {
  test("has today/week/month tabs, payment split, WhatsApp share", () => {
    const s = r("../../screens/v3/ReportsScreenV3.tsx");
    expect(s).toContain('"today"'); expect(s).toContain("PAYMENT SPLIT"); expect(s).toContain("Cash"); expect(s).toContain("Share");
  });
});
describe("STG-575: CustomersScreenV3", () => {
  test("has customer list with WhatsApp button", () => {
    const s = r("../../screens/v3/CustomersScreenV3.tsx");
    expect(s).toContain("waBtn"); expect(s).toContain("visits"); expect(s).toContain("+ Add");
  });
});
describe("STG-576: SettingsScreenV3", () => {
  test("has language toggle, dark mode, printer, HID, express checkout", () => {
    const s = r("../../screens/v3/SettingsScreenV3.tsx");
    expect(s).toContain("Language"); expect(s).toContain("Dark Mode"); expect(s).toContain("HID Scanner"); expect(s).toContain("Express Checkout"); expect(s).toContain("langToggle");
  });
});
