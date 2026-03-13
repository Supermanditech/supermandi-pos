/**
 * MenuScreen i18n coverage tests — STG-172 through STG-197 + STG-189
 *
 * Validates:
 * 1. No hardcoded English strings remain in MenuScreen.tsx (outside __DEV__ blocks)
 * 2. All t() keys used in MenuScreen exist in both en.json and hi.json
 * 3. No defaultValue fallbacks remain
 * 4. No positional fallback patterns remain (t('key', 'fallback'))
 * 5. Jargon renames applied correctly in en.json values
 * 6. HTML entities replaced with literal characters
 */
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "../..");
const MENU_SCREEN_PATH = path.join(ROOT, "screens/MenuScreen.tsx");
const EN_PATH = path.join(ROOT, "i18n/locales/en.json");
const HI_PATH = path.join(ROOT, "i18n/locales/hi.json");

const menuSource = fs.readFileSync(MENU_SCREEN_PATH, "utf8");
const enJson = JSON.parse(fs.readFileSync(EN_PATH, "utf8"));
const hiJson = JSON.parse(fs.readFileSync(HI_PATH, "utf8"));

// Helper: extract non-DEV source (strip __DEV__ blocks)
function stripDevBlocks(source: string): string {
  // Remove lines inside __DEV__ conditionals — simplified heuristic:
  // We mark content between {__DEV__ && ( and the matching closing )} as DEV
  let result = "";
  let devDepth = 0;
  const lines = source.split("\n");
  for (const line of lines) {
    if (/__DEV__/.test(line)) {
      devDepth++;
    }
    if (devDepth === 0) {
      result += line + "\n";
    }
    // Track closing braces for DEV blocks (simplified)
    if (devDepth > 0 && /^\s*\)\}\s*$/.test(line.trim())) {
      devDepth = Math.max(0, devDepth - 1);
    }
  }
  return result;
}

// Helper: get all nested keys from a JSON object with a prefix
function getAllKeys(obj: Record<string, unknown>, prefix = ""): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys.push(...getAllKeys(value as Record<string, unknown>, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

// Helper: get value by dot-notation key
function getNestedValue(obj: Record<string, unknown>, key: string): unknown {
  const parts = key.split(".");
  let current: unknown = obj;
  for (const part of parts) {
    if (current === null || current === undefined || typeof current !== "object") return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

const nonDevSource = stripDevBlocks(menuSource);

// Extract all t() calls from MenuScreen
const tCallPattern = /t\(\s*['"]([^'"]+)['"]/g;
const usedKeys: string[] = [];
let match: RegExpExecArray | null;
while ((match = tCallPattern.exec(menuSource)) !== null) {
  usedKeys.push(match[1]);
}
const uniqueUsedKeys = [...new Set(usedKeys)];

// Extract menu.* keys specifically
const menuKeys = uniqueUsedKeys.filter((k) => k.startsWith("menu."));

const enKeys = new Set(getAllKeys(enJson));
const hiKeys = new Set(getAllKeys(hiJson));

describe("MenuScreen i18n — STG-172: No hardcoded English strings", () => {
  // Hardcoded strings that should have been replaced with t() calls
  const hardcodedPatterns = [
    { pattern: />\s*Return \/ Refund\s*</, label: "Return / Refund" },
    { pattern: />\s*Process returns and issue refunds\s*</, label: "Process returns subtitle" },
    { pattern: />\s*Opening Stock\s*</, label: "Opening Stock" },
    { pattern: />\s*Initialize stock for new products\s*</, label: "Opening Stock subtitle" },
    { pattern: />\s*Customers & Credit\s*</, label: "Customers & Credit section" },
    { pattern: />\s*Khata \(Credit Book\)\s*</, label: "Khata" },
    { pattern: />\s*Track credit and payments\s*</, label: "Khata subtitle" },
    { pattern: />\s*Customer profiles and purchase history\s*</, label: "Customers subtitle" },
    { pattern: />\s*Customer Management\s*</, label: "Customer Management" },
    { pattern: />\s*Add, edit, and manage customer profiles\s*</, label: "Customer Management subtitle" },
    { pattern: />\s*Overdue Dues\s*</, label: "Overdue Dues (should be Overdue Payments)" },
    { pattern: />\s*AI & Intelligence\s*</, label: "AI & Intelligence section" },
    { pattern: />\s*AI Insights\s*</, label: "AI Insights" },
    { pattern: />\s*Alerts, forecasts, slow movers, expiry tracking\s*</, label: "AI subtitle (old jargon)" },
    { pattern: />\s*Bulk Purchase Credit\s*</, label: "Bulk Purchase Credit" },
    { pattern: />\s*Browse and apply for credit offers\s*</, label: "Bulk Purchase Credit subtitle (old jargon)" },
    { pattern: />\s*Messages\s*</, label: "Messages section" },
    { pattern: />\s*Chat\s*</, label: "Chat" },
    { pattern: />\s*Message suppliers and support\s*</, label: "Chat subtitle" },
    { pattern: />\s*WhatsApp Support\s*</, label: "WhatsApp Support" },
    { pattern: />\s*Chat with SuperMandi support team\s*</, label: "WhatsApp Support subtitle" },
    { pattern: />\s*Daily Report\s*</, label: "Daily Report" },
    { pattern: />\s*View, print, and share daily sales report\s*</, label: "Daily Report subtitle" },
    { pattern: />\s*Operations\s*</, label: "Operations section" },
    { pattern: />\s*Daily Closing\s*</, label: "Daily Closing" },
    { pattern: />\s*Z-Report and cash reconciliation\s*</, label: "Daily Closing subtitle (old jargon)" },
    { pattern: />\s*Shift Management\s*</, label: "Shift Management" },
    { pattern: />\s*Start, end, and view shift history\s*</, label: "Shift subtitle (old jargon)" },
    { pattern: />\s*Switch Staff\s*</, label: "Switch Staff" },
    { pattern: />\s*Printer Settings\s*</, label: "Printer Settings" },
    { pattern: />\s*Paper width, auto-print, copies\s*</, label: "Printer Settings subtitle" },
    { pattern: />\s*Theme\s*</, label: "Theme" },
    { pattern: />\s*Dark mode\s*</, label: "Dark mode" },
    { pattern: />\s*Light mode\s*</, label: "Light mode" },
  ];

  for (const { pattern, label } of hardcodedPatterns) {
    it(`should not have hardcoded "${label}"`, () => {
      expect(nonDevSource).not.toMatch(pattern);
    });
  }
});

describe("MenuScreen i18n — STG-173: No defaultValue fallbacks", () => {
  it("should not contain any defaultValue fallback patterns", () => {
    expect(nonDevSource).not.toMatch(/t\([^)]*defaultValue/);
  });
});

describe("MenuScreen i18n — STG-174: No positional fallback patterns", () => {
  it("should not contain positional fallback t('key', 'string') patterns", () => {
    // Match t('...', '...') but not t('...', { ... })
    expect(nonDevSource).not.toMatch(/t\(\s*'[^']+'\s*,\s*'[^']+'\s*\)/);
  });
});

describe("MenuScreen i18n — STG-177: Sync strings use t()", () => {
  it('should use t() for Sync label, not hardcoded "Sync"', () => {
    // The status label for Sync should be t('menu.syncLabel')
    expect(nonDevSource).not.toMatch(/>Sync</);
  });

  it("sync keys exist in en.json", () => {
    expect(enKeys.has("menu.syncLabel")).toBe(true);
    expect(enKeys.has("menu.syncComplete")).toBe(true);
    expect(enKeys.has("menu.syncFailed")).toBe(true);
    expect(enKeys.has("menu.syncFailedRetry")).toBe(true);
    expect(enKeys.has("menu.syncing")).toBe(true);
    expect(enKeys.has("menu.syncNow")).toBe(true);
  });

  it("sync keys exist in hi.json", () => {
    expect(hiKeys.has("menu.syncLabel")).toBe(true);
    expect(hiKeys.has("menu.syncFailedRetry")).toBe(true);
  });
});

describe("MenuScreen i18n — STG-180: Switch Staff Alert uses t()", () => {
  it("should not have hardcoded Switch Staff alert text", () => {
    expect(nonDevSource).not.toMatch(/Alert\.alert\(\s*"Switch Staff"/);
    expect(nonDevSource).not.toMatch(/Logged in as \$/);
  });

  it("switch staff keys exist in both locales", () => {
    for (const key of ["menu.switchStaffTitle", "menu.switchStaffMessage", "menu.switchButton"]) {
      expect(enKeys.has(key)).toBe(true);
      expect(hiKeys.has(key)).toBe(true);
    }
  });
});

describe("MenuScreen i18n — STG-184: Support alerts use t()", () => {
  it("should not have hardcoded support alert text", () => {
    expect(nonDevSource).not.toMatch(/"Support Unavailable"/);
    expect(nonDevSource).not.toMatch(/"WhatsApp Not Found"/);
  });

  it("support alert keys exist in both locales", () => {
    for (const key of [
      "menu.supportUnavailableTitle",
      "menu.supportUnavailableMessage",
      "menu.whatsappNotFoundTitle",
      "menu.whatsappNotFoundMessage",
    ]) {
      expect(enKeys.has(key)).toBe(true);
      expect(hiKeys.has(key)).toBe(true);
    }
  });
});

describe("MenuScreen i18n — STG-185: WhatsApp message template uses t()", () => {
  it("should not have hardcoded WhatsApp message", () => {
    expect(nonDevSource).not.toMatch(/Hi SuperMandi Support/);
  });

  it("whatsappSupportMessage key exists with interpolation", () => {
    const enValue = getNestedValue(enJson, "menu.whatsappSupportMessage") as string;
    expect(enValue).toContain("{{storeName}}");
    expect(enValue).toContain("{{deviceLabel}}");

    const hiValue = getNestedValue(hiJson, "menu.whatsappSupportMessage") as string;
    expect(hiValue).toContain("{{storeName}}");
    expect(hiValue).toContain("{{deviceLabel}}");
  });
});

describe("MenuScreen i18n — STG-188: Payment labels use t()", () => {
  it("should not have hardcoded Cash:/UPI:/Card: labels", () => {
    expect(nonDevSource).not.toMatch(/>Cash: \{/);
    expect(nonDevSource).not.toMatch(/>UPI: \{/);
    expect(nonDevSource).not.toMatch(/>Card: \{/);
  });

  it("payment label keys exist in both locales", () => {
    for (const key of ["menu.cashLabel", "menu.upiLabel", "menu.cardLabel"]) {
      expect(enKeys.has(key)).toBe(true);
      expect(hiKeys.has(key)).toBe(true);
    }
  });
});

describe("MenuScreen i18n — STG-189: Help & Support uses literal ampersand", () => {
  it("should use t('menu.helpSupport') not hardcoded string with HTML entity", () => {
    expect(nonDevSource).not.toMatch(/Help &amp; Support/);
    expect(nonDevSource).not.toMatch(/"Help & Support"/);
    expect(nonDevSource).not.toMatch(/{'Help & Support'}/);
  });

  it("en.json uses literal ampersand not HTML entity", () => {
    const value = getNestedValue(enJson, "menu.helpSupport") as string;
    expect(value).toBe("Help & Support");
    expect(value).not.toContain("&amp;");
  });
});

describe("MenuScreen i18n — STG-154: BNPL Dues jargon rename", () => {
  it('en.json menu.bnplDues should be "Credit Purchases"', () => {
    expect(getNestedValue(enJson, "menu.bnplDues")).toBe("Credit Purchases");
  });

  it('en.json menu.bnplDuesSubtitle should be "View pending payments for stock bought on credit"', () => {
    expect(getNestedValue(enJson, "menu.bnplDuesSubtitle")).toBe(
      "View pending payments for stock bought on credit"
    );
  });

  it("hi.json has corresponding translations", () => {
    expect(hiKeys.has("menu.bnplDues")).toBe(true);
    expect(hiKeys.has("menu.bnplDuesSubtitle")).toBe(true);
  });
});

describe("MenuScreen i18n — STG-155: Stock Inward jargon rename", () => {
  it('en.json menu.stockInward should be "Add New Stock"', () => {
    expect(getNestedValue(enJson, "menu.stockInward")).toBe("Add New Stock");
  });

  it('en.json menu.stockInwardSubtitle should be "Record goods received from suppliers"', () => {
    expect(getNestedValue(enJson, "menu.stockInwardSubtitle")).toBe(
      "Record goods received from suppliers"
    );
  });
});

describe("MenuScreen i18n — STG-158: Overdue Dues jargon rename", () => {
  it('en.json menu.overdueDues should be "Overdue Payments"', () => {
    expect(getNestedValue(enJson, "menu.overdueDues")).toBe("Overdue Payments");
  });
});

describe("MenuScreen i18n — STG-193: Daily Closing subtitle jargon rename", () => {
  it('en.json menu.dailyClosingSubtitle should be "End-of-day sales summary and cash count"', () => {
    expect(getNestedValue(enJson, "menu.dailyClosingSubtitle")).toBe(
      "End-of-day sales summary and cash count"
    );
  });
});

describe("MenuScreen i18n — STG-194: Shift Management subtitle jargon rename", () => {
  it('en.json menu.shiftManagementSubtitle should be "Track staff working hours"', () => {
    expect(getNestedValue(enJson, "menu.shiftManagementSubtitle")).toBe(
      "Track staff working hours"
    );
  });
});

describe("MenuScreen i18n — STG-195: AI section header jargon rename", () => {
  it('en.json menu.aiSection should be "Smart Insights"', () => {
    expect(getNestedValue(enJson, "menu.aiSection")).toBe("Smart Insights");
  });
});

describe("MenuScreen i18n — STG-196: AI subtitle jargon rename", () => {
  it("en.json menu.aiInsightsSubtitle should use plain language", () => {
    expect(getNestedValue(enJson, "menu.aiInsightsSubtitle")).toBe(
      "See what's selling, expiring, and what to restock"
    );
  });
});

describe("MenuScreen i18n — STG-197: Bulk Purchase Credit subtitle jargon rename", () => {
  it("en.json menu.bulkPurchaseCreditSubtitle should use plain language", () => {
    expect(getNestedValue(enJson, "menu.bulkPurchaseCreditSubtitle")).toBe(
      "Get stock now, pay later with bulk financing"
    );
  });
});

describe("MenuScreen i18n — All t() keys exist in both locales", () => {
  const menuKeysFromSource = uniqueUsedKeys.filter((k) => k.startsWith("menu."));

  for (const key of menuKeysFromSource) {
    it(`en.json has key "${key}"`, () => {
      expect(enKeys.has(key)).toBe(true);
    });

    it(`hi.json has key "${key}"`, () => {
      expect(hiKeys.has(key)).toBe(true);
    });
  }
});
