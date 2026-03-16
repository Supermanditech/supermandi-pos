/**
 * STG-557: SuccessScreenV3 — profit, streak, confetti, WhatsApp
 */
import * as fs from "fs";
import * as path from "path";

describe("STG-557: SuccessScreenV3", () => {
  test("shows profit badge with margin percentage", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/SuccessScreenV3.tsx"), "utf8");
    expect(src).toContain("ProfitBadge");
    expect(src).toContain("profitMinor");
    expect(src).toContain("marginPct");
  });

  test("has sale streak counter", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/SuccessScreenV3.tsx"), "utf8");
    expect(src).toContain("streak");
    expect(src).toContain("sales today");
  });

  test("has confetti animation", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/SuccessScreenV3.tsx"), "utf8");
    expect(src).toContain("Confetti");
    expect(src).toContain("showConfetti");
  });

  test("Confetti component has particles with brand colors", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/Confetti.tsx"), "utf8");
    expect(src).toContain("#2563EB");
    expect(src).toContain("#14B8A6");
    expect(src).toContain("PARTICLE_COUNT");
    expect(src).toContain("Animated");
  });

  test("has WhatsApp bill send with proper message", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/SuccessScreenV3.tsx"), "utf8");
    expect(src).toContain("whatsapp://send");
    expect(src).toContain("SuperMandi POS");
    expect(src).toContain("handleWhatsAppBill");
  });

  test("has New Sale, Reprint, Void buttons", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../screens/v3/SuccessScreenV3.tsx"), "utf8");
    expect(src).toContain("New Sale");
    expect(src).toContain("Reprint");
    expect(src).toContain("Void");
    expect(src).toContain("clearCart");
  });

  test("ProfitBadge displays margin in INR", () => {
    const src = fs.readFileSync(path.resolve(__dirname, "../../components/v3/ProfitBadge.tsx"), "utf8");
    expect(src).toContain("Margin:");
    expect(src).toContain("profitMinor");
    expect(src).toContain("toLocaleString");
  });
});
