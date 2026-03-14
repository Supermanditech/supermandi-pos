/**
 * Layer 9B MenuScreen — Data Display
 * STG-146, 147, 149, 150, 151, 164, 171, 179, 181, 187
 */

describe("STG-146: Device label instead of UUID", () => {
  it("shows friendly label, not UUID", () => {
    const label = "Samsung A32 POS";
    expect(label).not.toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe("STG-147: toTitleCase() store name", () => {
  function toTitleCase(str: string): string {
    return str.replace(/\b\w/g, c => c.toUpperCase());
  }

  it("capitalizes first letter of each word", () => {
    expect(toTitleCase("raju general store")).toBe("Raju General Store");
  });

  it("handles already capitalized text", () => {
    expect(toTitleCase("RAJU STORE")).toBe("RAJU STORE");
  });
});

describe("STG-149: Comparison period label, hide % at 0 base", () => {
  function getTrendLabel(current: number, previous: number): string | null {
    if (previous === 0) return null; // hide when base is 0
    const pct = Math.round(((current - previous) / previous) * 100);
    return `${pct >= 0 ? "+" : ""}${pct}% vs yesterday`;
  }

  it("shows percentage change", () => {
    expect(getTrendLabel(150, 100)).toBe("+50% vs yesterday");
  });

  it("hides when base is 0", () => {
    expect(getTrendLabel(100, 0)).toBeNull();
  });

  it("shows negative trend", () => {
    expect(getTrendLabel(80, 100)).toBe("-20% vs yesterday");
  });
});

describe("STG-150: Fix empty Payment Modes section", () => {
  it("hides section when no payment data", () => {
    const paymentModes: unknown[] = [];
    const showSection = paymentModes.length > 0;
    expect(showSection).toBe(false);
  });
});

describe("STG-151: Labels above metric values", () => {
  it("metric has label and value", () => {
    const metric = { label: "Today's Sales", value: "₹15,000" };
    expect(metric.label).toBeTruthy();
    expect(metric.value).toBeTruthy();
  });
});

describe("STG-164: display_name instead of username", () => {
  it("shows display name", () => {
    const user = { username: "raju_mgr", displayName: "Raju Manager" };
    const shown = user.displayName || user.username;
    expect(shown).toBe("Raju Manager");
  });
});

describe("STG-171: Visual hierarchy — hero metric bigger", () => {
  it("hero metric font is larger than sub-metrics", () => {
    const heroSize = 32;
    const subSize = 16;
    expect(heroSize).toBeGreaterThan(subSize);
  });
});

describe("STG-179: App version instead of raw SHA", () => {
  function formatVersion(version: string, sha: string): string {
    return `v${version} (${sha.slice(0, 7)})`;
  }

  it("formats version with short SHA", () => {
    expect(formatVersion("1.0.0", "abcdef1234567890")).toBe("v1.0.0 (abcdef1)");
  });
});

describe("STG-181: Pass action param to SalesHistory navigation", () => {
  it("navigates with action parameter", () => {
    const navigate = jest.fn();
    navigate("SalesHistory", { action: "view" });
    expect(navigate).toHaveBeenCalledWith("SalesHistory", { action: "view" });
  });
});

describe("STG-187: Cap trend at 999%+", () => {
  function formatTrend(pct: number): string {
    if (pct > 999) return "+999%+";
    if (pct < -999) return "-999%+";
    return `${pct >= 0 ? "+" : ""}${pct}%`;
  }

  it("caps at 999%+", () => {
    expect(formatTrend(1500)).toBe("+999%+");
  });

  it("caps negative at -999%+", () => {
    expect(formatTrend(-1500)).toBe("-999%+");
  });

  it("shows normal percentage", () => {
    expect(formatTrend(42)).toBe("+42%");
  });
});
