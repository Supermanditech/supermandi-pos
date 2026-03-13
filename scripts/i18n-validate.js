#!/usr/bin/env node
/**
 * STG-481: i18n key parity validator
 * Reads en.json + hi.json and reports keys missing in either file.
 * Exit 1 if mismatch found.
 *
 * Usage: node scripts/i18n-validate.js
 */

const fs = require('fs');
const path = require('path');

const LOCALES_DIR = path.join(__dirname, '..', 'src', 'i18n', 'locales');
const EN_FILE = path.join(LOCALES_DIR, 'en.json');
const HI_FILE = path.join(LOCALES_DIR, 'hi.json');

function flattenKeys(obj, prefix = '') {
  const keys = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
      keys.push(...flattenKeys(value, fullKey));
    } else {
      keys.push(fullKey);
    }
  }
  return keys;
}

function main() {
  if (!fs.existsSync(EN_FILE)) {
    console.error(`ERROR: ${EN_FILE} not found`);
    process.exit(1);
  }
  if (!fs.existsSync(HI_FILE)) {
    console.error(`ERROR: ${HI_FILE} not found`);
    process.exit(1);
  }

  const en = JSON.parse(fs.readFileSync(EN_FILE, 'utf-8'));
  const hi = JSON.parse(fs.readFileSync(HI_FILE, 'utf-8'));

  const enKeys = new Set(flattenKeys(en));
  const hiKeys = new Set(flattenKeys(hi));

  const missingInHi = [...enKeys].filter(k => !hiKeys.has(k));
  const missingInEn = [...hiKeys].filter(k => !enKeys.has(k));

  let hasErrors = false;

  if (missingInHi.length > 0) {
    console.error(`\n❌ Keys in en.json but MISSING in hi.json (${missingInHi.length}):`);
    missingInHi.forEach(k => console.error(`  - ${k}`));
    hasErrors = true;
  }

  if (missingInEn.length > 0) {
    console.error(`\n❌ Keys in hi.json but MISSING in en.json (${missingInEn.length}):`);
    missingInEn.forEach(k => console.error(`  - ${k}`));
    hasErrors = true;
  }

  if (hasErrors) {
    console.error(`\n❌ i18n parity check FAILED — fix missing keys before committing.`);
    process.exit(1);
  }

  console.log(`✅ i18n parity check passed — ${enKeys.size} keys in both en.json and hi.json.`);
  process.exit(0);
}

main();
