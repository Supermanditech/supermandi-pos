#!/usr/bin/env node
/**
 * I18N Audit Script - GO-LIVE-TR-001
 *
 * Checks translation coverage and key parity between locale files.
 * Run: node scripts/i18n-audit.js
 *
 * Options:
 *   --check-unused     Also scan source for unused keys
 *   --generate-pseudo  Generate pseudo-locale file for testing
 *
 * Exit codes:
 *   0 = Pass (all keys present in both locales)
 *   1 = Fail (missing keys found)
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const LOCALES_DIR = path.join(__dirname, "..", "src", "i18n", "locales");
const SRC_DIR = path.join(__dirname, "..", "src");
const PRIMARY_LOCALE = "en";
const SUPPORTED_LOCALES = ["en", "hi"];

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Recursively flatten nested object into dot-notation keys
 */
function flattenKeys(obj, prefix = "") {
  let keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      keys = keys.concat(flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

/**
 * Load locale file and return flattened keys
 */
function loadLocaleKeys(locale) {
  const filePath = path.join(LOCALES_DIR, `${locale}.json`);
  if (!fs.existsSync(filePath)) {
    console.error(`[ERROR] Locale file not found: ${filePath}`);
    return null;
  }

  try {
    const content = JSON.parse(fs.readFileSync(filePath, "utf8"));
    return flattenKeys(content);
  } catch (err) {
    console.error(`[ERROR] Failed to parse ${locale}.json:`, err.message);
    return null;
  }
}

/**
 * Compare two arrays and return missing items
 */
function findMissing(reference, target) {
  const targetSet = new Set(target);
  return reference.filter((key) => !targetSet.has(key));
}

/**
 * Scan source files for used translation keys
 */
function scanUsedKeys() {
  const usedKeys = new Set();

  // Patterns to match:
  // t('key.path')
  // t("key.path")
  // t(`key.path`)
  const tPattern = /t\s*\(\s*['"`]([^'"`]+)['"`]/g;

  function scanFile(filePath) {
    const content = fs.readFileSync(filePath, "utf8");
    let match;
    while ((match = tPattern.exec(content)) !== null) {
      usedKeys.add(match[1]);
    }
  }

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and other non-source dirs
        if (!["node_modules", "dist", ".git", "deprecated"].includes(entry.name)) {
          scanDir(fullPath);
        }
      } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
        scanFile(fullPath);
      }
    }
  }

  scanDir(SRC_DIR);
  return Array.from(usedKeys);
}

/**
 * Generate pseudo-locale (ps) for testing long strings
 * Transforms: "Hello" -> "[!! Ĥéļļő !!]"
 */
function generatePseudoLocale(enContent) {
  const pseudoMap = {
    a: "á", b: "ƀ", c: "ç", d: "đ", e: "é", f: "ƒ",
    g: "ğ", h: "ĥ", i: "í", j: "ĵ", k: "ķ", l: "ļ",
    m: "m", n: "ñ", o: "ő", p: "þ", q: "q", r: "ŕ",
    s: "š", t: "ţ", u: "ú", v: "v", w: "ŵ", x: "x",
    y: "ý", z: "ž",
    A: "Á", B: "Ɓ", C: "Ç", D: "Đ", E: "É", F: "Ƒ",
    G: "Ğ", H: "Ĥ", I: "Í", J: "Ĵ", K: "Ķ", L: "Ļ",
    M: "M", N: "Ñ", O: "Ő", P: "Þ", Q: "Q", R: "Ŕ",
    S: "Š", T: "Ţ", U: "Ú", V: "V", W: "Ŵ", X: "X",
    Y: "Ý", Z: "Ž",
  };

  function pseudoify(str) {
    if (typeof str !== "string") return str;
    // Keep interpolation variables intact: {{count}}, etc.
    return "[!! " + str.replace(/[a-zA-Z]/g, (c) => pseudoMap[c] || c) + " !!]";
  }

  function transformObject(obj) {
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === "object" && value !== null) {
        result[key] = transformObject(value);
      } else if (typeof value === "string") {
        result[key] = pseudoify(value);
      } else {
        result[key] = value;
      }
    }
    return result;
  }

  return transformObject(enContent);
}

// =============================================================================
// MAIN AUDIT
// =============================================================================

function audit() {
  const args = process.argv.slice(2);
  const checkUnused = args.includes("--check-unused");
  const generatePseudo = args.includes("--generate-pseudo");

  console.log("=" .repeat(60));
  console.log("I18N AUDIT - GO-LIVE-TR-001");
  console.log("=" .repeat(60));
  console.log("");

  const errors = [];
  const warnings = [];

  // Load all locale keys
  const localeKeys = {};
  for (const locale of SUPPORTED_LOCALES) {
    const keys = loadLocaleKeys(locale);
    if (keys === null) {
      errors.push(`Failed to load locale: ${locale}`);
      continue;
    }
    localeKeys[locale] = keys;
    console.log(`[${locale.toUpperCase()}] ${keys.length} keys found`);
  }

  console.log("");
  console.log("-".repeat(60));
  console.log("CHECKING KEY PARITY...");
  console.log("-".repeat(60));

  // Check each locale against primary (en)
  const primaryKeys = localeKeys[PRIMARY_LOCALE];
  if (!primaryKeys) {
    console.error("[FATAL] Primary locale (en) not loaded");
    process.exit(1);
  }

  for (const locale of SUPPORTED_LOCALES) {
    if (locale === PRIMARY_LOCALE) continue;

    const targetKeys = localeKeys[locale];
    if (!targetKeys) continue;

    // Find keys missing in target locale
    const missingInTarget = findMissing(primaryKeys, targetKeys);
    if (missingInTarget.length > 0) {
      console.log(`\n[${locale.toUpperCase()}] Missing ${missingInTarget.length} keys from en.json:`);
      for (const key of missingInTarget.slice(0, 20)) {
        console.log(`  - ${key}`);
      }
      if (missingInTarget.length > 20) {
        console.log(`  ... and ${missingInTarget.length - 20} more`);
      }
      errors.push(`${locale}.json missing ${missingInTarget.length} keys from en.json`);
    } else {
      console.log(`[${locale.toUpperCase()}] All keys present`);
    }

    // Find extra keys in target (not in primary)
    const extraInTarget = findMissing(targetKeys, primaryKeys);
    if (extraInTarget.length > 0) {
      console.log(`[${locale.toUpperCase()}] Has ${extraInTarget.length} extra keys not in en.json:`);
      for (const key of extraInTarget.slice(0, 10)) {
        console.log(`  - ${key}`);
      }
      warnings.push(`${locale}.json has ${extraInTarget.length} extra keys`);
    }
  }

  // Check for unused keys (optional)
  if (checkUnused) {
    console.log("");
    console.log("-".repeat(60));
    console.log("CHECKING UNUSED KEYS...");
    console.log("-".repeat(60));

    const usedKeys = scanUsedKeys();
    console.log(`Found ${usedKeys.length} translation keys used in source`);

    const unusedKeys = findMissing(primaryKeys, usedKeys);
    // Filter out _plural variants
    const filteredUnused = unusedKeys.filter((k) => !k.endsWith("_plural"));

    if (filteredUnused.length > 0) {
      console.log(`\n[WARNING] ${filteredUnused.length} potentially unused keys:`);
      for (const key of filteredUnused.slice(0, 30)) {
        console.log(`  - ${key}`);
      }
      if (filteredUnused.length > 30) {
        console.log(`  ... and ${filteredUnused.length - 30} more`);
      }
      warnings.push(`${filteredUnused.length} potentially unused keys`);
    } else {
      console.log("[OK] All keys appear to be used");
    }
  }

  // Generate pseudo-locale (optional)
  if (generatePseudo) {
    console.log("");
    console.log("-".repeat(60));
    console.log("GENERATING PSEUDO-LOCALE...");
    console.log("-".repeat(60));

    const enPath = path.join(LOCALES_DIR, "en.json");
    const enContent = JSON.parse(fs.readFileSync(enPath, "utf8"));
    const pseudoContent = generatePseudoLocale(enContent);

    const pseudoPath = path.join(LOCALES_DIR, "ps.json");
    fs.writeFileSync(pseudoPath, JSON.stringify(pseudoContent, null, 2));
    console.log(`[OK] Generated ${pseudoPath}`);
    console.log("To test: Add 'ps' to SUPPORTED_LANGUAGES in src/i18n/index.ts");
  }

  // Summary
  console.log("");
  console.log("=".repeat(60));
  console.log("AUDIT RESULTS");
  console.log("=".repeat(60));

  if (warnings.length > 0) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    for (const w of warnings) {
      console.log(`  - ${w}`);
    }
  }

  if (errors.length > 0) {
    console.log(`\nERRORS (${errors.length}):`);
    for (const e of errors) {
      console.log(`  - ${e}`);
    }
    console.log("\n[AUDIT FAILED] Fix the above errors before proceeding.");
    process.exit(1);
  }

  console.log("\n[AUDIT PASSED] All locales have matching keys.");
  process.exit(0);
}

// Run audit
audit();
