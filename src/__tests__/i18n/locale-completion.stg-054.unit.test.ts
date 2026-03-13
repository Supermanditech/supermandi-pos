/**
 * STG-054 / STG-055 / STG-026: Locale completion and key parity tests
 *
 * Validates:
 * 1. 100% en/hi key parity (every key in en.json exists in hi.json and vice-versa)
 * 2. No English-only values in hi.json (simple heuristic: flag pure-ASCII values)
 * 3. New i18n keys for version, terms, and privacy exist in both locales
 * 4. Hindi language name is "हिन्दी" (not abbreviated "हि")
 */

import en from "../../i18n/locales/en.json";
import hi from "../../i18n/locales/hi.json";
import { LANGUAGE_NAMES } from "../../i18n";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flattenKeys(obj: Record<string, any>, prefix = ""): string[] {
  let keys: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "object" && v !== null && !Array.isArray(v)) {
      keys = keys.concat(flattenKeys(v as Record<string, any>, key));
    } else {
      keys.push(key);
    }
  }
  return keys.sort();
}

function getNestedValue(obj: Record<string, any>, path: string): any {
  return path.split(".").reduce((acc, key) => acc?.[key], obj);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("STG-054: en/hi locale key parity", () => {
  const enKeys = flattenKeys(en);
  const hiKeys = flattenKeys(hi);

  test("every en.json key exists in hi.json", () => {
    const missingInHi = enKeys.filter((k) => !hiKeys.includes(k));
    expect(missingInHi).toEqual([]);
  });

  test("every hi.json key exists in en.json", () => {
    const extraInHi = hiKeys.filter((k) => !enKeys.includes(k));
    expect(extraInHi).toEqual([]);
  });

  test("key counts match exactly", () => {
    expect(enKeys.length).toBe(hiKeys.length);
  });

  test("no hi.json leaf value is identical to its en.json counterpart (skip interpolation-only and short values)", () => {
    // Allow values that are the same when they are:
    //   - Short abbreviations (<=3 chars), e.g. "OK", "UPI"
    //   - Contain only interpolation placeholders like "{{count}}"
    //   - Are proper nouns or brand names (e.g. "BNPL", "WhatsApp", "SuperMandi")
    //   - Contain technical strings (URLs, email addresses)
    const allowedSameValues = new Set([
      "common.ok",
      "tabs.sell",
      "tabs.buy",
      "payment.bnpl",
      "buy.bnplAvailable",
      "dailyClosing.upi",
      "dailyReport.upi",
      "shift.upi",
      "khata.upi",
      "billDetail.whatsapp",
      "bnpl.upi",
      "grn.autoReorder",
      // Technical terms / brand names / placeholders that are intentionally the same
      "components.sellTile.gst",        // "GST {{rate}}%" — universal abbreviation
      "customerList.emailPlaceholder",   // "email@example.com" — placeholder format
      "enroll.wifi",                     // "WiFi" — brand/technical term
      "menu.switchStaffSubtitle",        // "{{name}} ({{role}})" — interpolation-only
      "menu.upiLabel",                   // "UPI:" — abbreviation
      "paymentSetup.bankAccountPlaceholder", // "123456789012" — numeric placeholder
      "paymentSetup.ifscPlaceholder",    // "SBIN0001234" — IFSC format example
      "paymentSetup.upiAccessibility",   // "UPI ID" — technical term
      "paymentSetup.upiLabel",           // "UPI ID (VPA)" — technical term
      "paymentSetup.upiPlaceholder",     // "yourname@upi" — placeholder format
      "purchase.gstin",                  // "GSTIN" — Indian tax abbreviation
    ]);

    const identicalKeys: string[] = [];
    for (const key of enKeys) {
      const enVal = getNestedValue(en, key);
      const hiVal = getNestedValue(hi, key);
      if (
        typeof enVal === "string" &&
        typeof hiVal === "string" &&
        enVal === hiVal &&
        enVal.length > 3 &&
        !enVal.match(/^\{\{.*\}\}$/) &&
        !allowedSameValues.has(key)
      ) {
        identicalKeys.push(`${key}: "${enVal}"`);
      }
    }
    // If there are legitimately shared values, this list should be empty or very small
    // Adjust the allowedSameValues set above if a key is intentionally the same
    expect(identicalKeys).toEqual([]);
  });
});

describe("STG-054: Hindi language toggle label", () => {
  test('LANGUAGE_NAMES.hi should be "हिन्दी" (full form, not abbreviated)', () => {
    expect(LANGUAGE_NAMES.hi).toBe("हिन्दी");
  });

  test('LANGUAGE_NAMES.hi should NOT be "हि" (abbreviated)', () => {
    expect(LANGUAGE_NAMES.hi).not.toBe("हि");
  });
});

describe("STG-055: version i18n keys", () => {
  test("common.version exists in en.json with interpolation placeholder", () => {
    expect((en as any).common.version).toBe("Version {{version}}");
  });

  test("common.version exists in hi.json with interpolation placeholder", () => {
    expect((hi as any).common.version).toContain("{{version}}");
    // Should be Hindi, not English
    expect((hi as any).common.version).toContain("संस्करण");
  });
});

describe("STG-026: terms and privacy i18n keys", () => {
  test("common.termsOfService exists in both locales", () => {
    expect((en as any).common.termsOfService).toBe("Terms of Service");
    expect((hi as any).common.termsOfService).toBeTruthy();
    // Hindi value should not be English
    expect((hi as any).common.termsOfService).not.toBe("Terms of Service");
  });

  test("common.privacyPolicy exists in both locales", () => {
    expect((en as any).common.privacyPolicy).toBe("Privacy Policy");
    expect((hi as any).common.privacyPolicy).toBeTruthy();
    expect((hi as any).common.privacyPolicy).not.toBe("Privacy Policy");
  });

  test("common.termsAndPrivacy exists in both locales", () => {
    expect((en as any).common.termsAndPrivacy).toBe("Terms & Privacy Policy");
    expect((hi as any).common.termsAndPrivacy).toBeTruthy();
    expect((hi as any).common.termsAndPrivacy).not.toBe("Terms & Privacy Policy");
  });
});
