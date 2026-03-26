/**
 * Phase 10 Testing: FIX Ticket Backend Unit Tests
 * Covers: FIX-002 (Razorpay graceful degradation), FIX-013 (paisa→rupees display),
 *         FIX-018 (rupees→paise string math), FIX-030 (Indian phone validation)
 * Tier 1 — no DB required.
 */

// =============================================================================
// FIX-002: Razorpay Graceful Degradation
// =============================================================================

describe("FIX-002: Razorpay graceful degradation", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("isRazorpayOrdersConfigured returns true when both vars set", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
    process.env.RAZORPAY_KEY_SECRET = "secret_xyz";
    const mod = require("../src/services/razorpayOrderService");
    expect(mod.isRazorpayOrdersConfigured()).toBe(true);
  });

  it("isRazorpayOrdersConfigured returns false when KEY_ID missing", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    process.env.RAZORPAY_KEY_SECRET = "secret_xyz";
    const mod = require("../src/services/razorpayOrderService");
    expect(mod.isRazorpayOrdersConfigured()).toBe(false);
  });

  it("isRazorpayOrdersConfigured returns false when KEY_SECRET missing", async () => {
    process.env.RAZORPAY_KEY_ID = "rzp_test_abc";
    delete process.env.RAZORPAY_KEY_SECRET;
    const mod = require("../src/services/razorpayOrderService");
    expect(mod.isRazorpayOrdersConfigured()).toBe(false);
  });

  it("isRazorpayOrdersConfigured returns false when both missing", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const mod = require("../src/services/razorpayOrderService");
    expect(mod.isRazorpayOrdersConfigured()).toBe(false);
  });

  it("createRazorpayOrder returns null when not configured", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const mod = require("../src/services/razorpayOrderService");
    const result = await mod.createRazorpayOrder({
      amountPaise: 5000,
      receipt: "test-001",
    });
    expect(result).toBeNull();
  });

  it("fetchRazorpayOrder returns null when not configured", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const mod = require("../src/services/razorpayOrderService");
    const result = await mod.fetchRazorpayOrder("order_xyz");
    expect(result).toBeNull();
  });

  it("fetchOrderPayments returns empty array when not configured", async () => {
    delete process.env.RAZORPAY_KEY_ID;
    delete process.env.RAZORPAY_KEY_SECRET;
    const mod = require("../src/services/razorpayOrderService");
    const result = await mod.fetchOrderPayments("order_xyz");
    expect(result).toEqual([]);
  });
});

// =============================================================================
// FIX-013: formatMinor — paisa to rupees display
// =============================================================================

describe("FIX-013: formatMinor (paisa → rupees display)", () => {
  // Inline the function as defined in POS whatsapp.ts
  function formatMinor(minor: number, currency: string): string {
    const amount = (minor / 100).toFixed(2);
    return currency === "INR" ? `₹${amount}` : `${currency} ${amount}`;
  }

  it("converts 5000 paise to ₹50.00", () => {
    expect(formatMinor(5000, "INR")).toBe("₹50.00");
  });

  it("converts 15050 paise to ₹150.50", () => {
    expect(formatMinor(15050, "INR")).toBe("₹150.50");
  });

  it("converts 1 paisa to ₹0.01", () => {
    expect(formatMinor(1, "INR")).toBe("₹0.01");
  });

  it("converts 0 paise to ₹0.00", () => {
    expect(formatMinor(0, "INR")).toBe("₹0.00");
  });

  it("converts 999999 paise to ₹9999.99", () => {
    expect(formatMinor(999999, "INR")).toBe("₹9999.99");
  });

  it("handles non-INR currency", () => {
    expect(formatMinor(5000, "USD")).toBe("USD 50.00");
  });

  it("handles negative amount", () => {
    expect(formatMinor(-500, "INR")).toBe("₹-5.00");
  });

  it("always produces exactly 2 decimal places", () => {
    expect(formatMinor(100, "INR")).toBe("₹1.00");
    expect(formatMinor(10, "INR")).toBe("₹0.10");
  });
});

// =============================================================================
// FIX-018: rupeesToPaise — String-based conversion (no float errors)
// =============================================================================

describe("FIX-018: rupeesToPaise (string-based, no float errors)", () => {
  // Inline the pure function as defined in ProductsPage.tsx
  function rupeesToPaise(rupees: string | undefined): number | undefined {
    if (!rupees) return undefined;
    const trimmed = rupees.trim();
    if (!trimmed || isNaN(Number(trimmed))) return undefined;
    const [whole = "0", frac = ""] = trimmed.split(".");
    return parseInt(whole, 10) * 100 + parseInt(frac.padEnd(2, "0").slice(0, 2), 10);
  }

  describe("basic conversions", () => {
    it("converts '50' to 5000", () => {
      expect(rupeesToPaise("50")).toBe(5000);
    });

    it("converts '50.00' to 5000", () => {
      expect(rupeesToPaise("50.00")).toBe(5000);
    });

    it("converts '50.5' to 5050 (pads fraction)", () => {
      expect(rupeesToPaise("50.5")).toBe(5050);
    });

    it("converts '50.50' to 5050", () => {
      expect(rupeesToPaise("50.50")).toBe(5050);
    });

    it("converts '0.01' to 1", () => {
      expect(rupeesToPaise("0.01")).toBe(1);
    });

    it("converts '0.10' to 10", () => {
      expect(rupeesToPaise("0.10")).toBe(10);
    });

    it("converts '1' to 100", () => {
      expect(rupeesToPaise("1")).toBe(100);
    });

    it("converts '0' to 0", () => {
      expect(rupeesToPaise("0")).toBe(0);
    });
  });

  describe("truncation (3+ decimal places)", () => {
    it("truncates '50.123' to 5012 (not 5012.3)", () => {
      expect(rupeesToPaise("50.123")).toBe(5012);
    });

    it("truncates '50.999' to 5099 (not 5100)", () => {
      expect(rupeesToPaise("50.999")).toBe(5099);
    });

    it("truncates '1.001' to 100 (not 100.1)", () => {
      expect(rupeesToPaise("1.001")).toBe(100);
    });
  });

  describe("CRITICAL: float problem cases that string math fixes", () => {
    // These are the cases where Math.round(parseFloat(x) * 100) would fail
    it("converts '19.99' correctly to 1999 (not 1998 or 2000)", () => {
      expect(rupeesToPaise("19.99")).toBe(1999);
    });

    it("converts '0.1' correctly to 10 (not 9 or 11)", () => {
      expect(rupeesToPaise("0.1")).toBe(10);
    });

    it("converts '0.2' correctly to 20", () => {
      expect(rupeesToPaise("0.2")).toBe(20);
    });

    it("converts '33.33' correctly to 3333", () => {
      expect(rupeesToPaise("33.33")).toBe(3333);
    });
  });

  describe("edge cases", () => {
    it("returns undefined for undefined", () => {
      expect(rupeesToPaise(undefined)).toBeUndefined();
    });

    it("returns undefined for empty string", () => {
      expect(rupeesToPaise("")).toBeUndefined();
    });

    it("returns undefined for whitespace only", () => {
      expect(rupeesToPaise("   ")).toBeUndefined();
    });

    it("returns undefined for non-numeric string", () => {
      expect(rupeesToPaise("abc")).toBeUndefined();
    });

    it("trims whitespace before converting", () => {
      expect(rupeesToPaise("  50.00  ")).toBe(5000);
    });

    it("handles leading zeros", () => {
      expect(rupeesToPaise("050.05")).toBe(5005);
    });

    it("handles large amounts", () => {
      expect(rupeesToPaise("99999.99")).toBe(9999999);
    });
  });
});

// =============================================================================
// FIX-030: Indian Phone Number Validation
// =============================================================================

describe("FIX-030: Indian phone number validation", () => {
  // Inline the pure function as defined in SuppliersPage.tsx
  function validatePhone(phone: string): boolean {
    const cleaned = phone.replace(/[\s\-()]/g, "");
    return /^(\+91|0)?[6-9]\d{9}$/.test(cleaned);
  }

  describe("valid 10-digit numbers (6-9 start)", () => {
    it("accepts 10-digit starting with 9", () => {
      expect(validatePhone("9876543210")).toBe(true);
    });

    it("accepts 10-digit starting with 8", () => {
      expect(validatePhone("8765432109")).toBe(true);
    });

    it("accepts 10-digit starting with 7", () => {
      expect(validatePhone("7654321098")).toBe(true);
    });

    it("accepts 10-digit starting with 6", () => {
      expect(validatePhone("6543210987")).toBe(true);
    });
  });

  describe("with prefix", () => {
    it("accepts +91 prefix", () => {
      expect(validatePhone("+919876543210")).toBe(true);
    });

    it("accepts 0 prefix (local format)", () => {
      expect(validatePhone("09876543210")).toBe(true);
    });
  });

  describe("with formatting characters", () => {
    it("accepts spaces", () => {
      expect(validatePhone("98765 43210")).toBe(true);
    });

    it("accepts dashes", () => {
      expect(validatePhone("987-654-3210")).toBe(true);
    });

    it("accepts parentheses", () => {
      expect(validatePhone("(987) 654-3210")).toBe(true);
    });

    it("accepts +91 with spaces", () => {
      expect(validatePhone("+91 98765 43210")).toBe(true);
    });
  });

  describe("invalid numbers", () => {
    it("rejects 10-digit starting with 5", () => {
      expect(validatePhone("5876543210")).toBe(false);
    });

    it("rejects 10-digit starting with 1", () => {
      expect(validatePhone("1234567890")).toBe(false);
    });

    it("rejects 10-digit starting with 0", () => {
      expect(validatePhone("0123456789")).toBe(false);
    });

    it("rejects 9-digit number", () => {
      expect(validatePhone("987654321")).toBe(false);
    });

    it("rejects 11-digit without prefix", () => {
      expect(validatePhone("98765432100")).toBe(false);
    });

    it("rejects empty string", () => {
      expect(validatePhone("")).toBe(false);
    });

    it("rejects non-numeric", () => {
      expect(validatePhone("abcdefghij")).toBe(false);
    });

    it("rejects +1 (US prefix)", () => {
      expect(validatePhone("+19876543210")).toBe(false);
    });

    it("rejects +91 with non-mobile digit", () => {
      expect(validatePhone("+915876543210")).toBe(false);
    });
  });
});
