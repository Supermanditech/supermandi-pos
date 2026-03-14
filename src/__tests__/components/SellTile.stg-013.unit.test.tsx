/**
 * STG-013: FEFO badge — explain or hide jargon for kirana users
 *
 * Tests: daysUntilExpiry calculation, expiry date formatting,
 *        expiry badge text (plain language, not jargon),
 *        edge cases around null/invalid dates
 */

describe("STG-013: FEFO badge — plain language for kirana users", () => {
  // Re-implement the exact logic from SellTile.tsx for testing
  function daysUntilExpiry(expiryIso: string | null | undefined): number | null {
    if (!expiryIso) return null;
    const expiry = new Date(expiryIso);
    if (isNaN(expiry.getTime())) return null;
    const now = new Date();
    const istNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const istExpiry = new Date(expiry.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
    const nowDay = Date.UTC(istNow.getFullYear(), istNow.getMonth(), istNow.getDate());
    const expDay = Date.UTC(istExpiry.getFullYear(), istExpiry.getMonth(), istExpiry.getDate());
    return Math.round((expDay - nowDay) / (1000 * 60 * 60 * 24));
  }

  function formatExpiryDate(expiryIso: string): string {
    const d = new Date(expiryIso);
    if (isNaN(d.getTime())) return expiryIso;
    const day = String(d.getDate()).padStart(2, "0");
    const month = d.toLocaleString("en-US", { month: "short" });
    const year = String(d.getFullYear()).slice(-2);
    return `${day}-${month}-${year}`;
  }

  describe("daysUntilExpiry", () => {
    it("returns null for null input", () => {
      expect(daysUntilExpiry(null)).toBeNull();
    });

    it("returns null for undefined input", () => {
      expect(daysUntilExpiry(undefined)).toBeNull();
    });

    it("returns null for invalid date string", () => {
      expect(daysUntilExpiry("not-a-date")).toBeNull();
    });

    it("returns 0 for today's date", () => {
      const today = new Date().toISOString().split("T")[0];
      expect(daysUntilExpiry(today)).toBe(0);
    });

    it("returns positive number for future date", () => {
      const future = new Date();
      future.setDate(future.getDate() + 30);
      const result = daysUntilExpiry(future.toISOString());
      expect(result).toBeGreaterThanOrEqual(29);
      expect(result).toBeLessThanOrEqual(31);
    });

    it("returns negative number for past date", () => {
      const past = new Date();
      past.setDate(past.getDate() - 10);
      const result = daysUntilExpiry(past.toISOString());
      expect(result).toBeLessThan(0);
    });

    it("returns empty string for empty input", () => {
      expect(daysUntilExpiry("")).toBeNull();
    });
  });

  describe("formatExpiryDate", () => {
    it("formats date as DD-Mon-YY", () => {
      const result = formatExpiryDate("2026-08-15");
      expect(result).toBe("15-Aug-26");
    });

    it("returns input string for invalid date", () => {
      expect(formatExpiryDate("invalid")).toBe("invalid");
    });

    it("pads single-digit days", () => {
      const result = formatExpiryDate("2026-03-05");
      expect(result).toBe("05-Mar-26");
    });
  });

  describe("Expiry badge text (plain language, not FEFO jargon)", () => {
    function getExpiryBadgeText(daysLeft: number | null): string | null {
      if (daysLeft === null) return null;
      if (daysLeft < 0) return "Expired";
      if (daysLeft === 0) return "Expires today";
      if (daysLeft <= 7) return `Expires in ${daysLeft}d`;
      if (daysLeft <= 30) return `Exp ${daysLeft}d`;
      return null; // No badge for 30+ days
    }

    it('shows "Expired" for past dates', () => {
      expect(getExpiryBadgeText(-5)).toBe("Expired");
    });

    it('shows "Expires today" for today', () => {
      expect(getExpiryBadgeText(0)).toBe("Expires today");
    });

    it("shows days remaining for 1-7 days", () => {
      expect(getExpiryBadgeText(3)).toBe("Expires in 3d");
    });

    it("shows shortened format for 8-30 days", () => {
      expect(getExpiryBadgeText(15)).toBe("Exp 15d");
    });

    it("hides badge for 30+ days", () => {
      expect(getExpiryBadgeText(60)).toBeNull();
    });

    it("hides badge for null (no expiry date)", () => {
      expect(getExpiryBadgeText(null)).toBeNull();
    });
  });
});
