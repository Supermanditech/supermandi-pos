#!/usr/bin/env node
/**
 * BUILD-BLK-01: Patch expo-modules-core ExpoModulesCorePlugin.gradle
 *
 * AGP 8.6 does not auto-register 'release' as a SoftwareComponent.
 * The vanilla ExpoModulesCorePlugin.gradle uses `from components.release`
 * which throws "Could not get unknown property 'release'" on fresh builds.
 *
 * This postinstall script patches line `from components.release` to use
 * a safe null-checked variant so the build does not fail.
 *
 * This patch is idempotent and safe to run multiple times.
 */

const fs = require('fs');
const path = require('path');

const PLUGIN_PATH = path.join(
  __dirname, '..', 'node_modules', 'expo-modules-core',
  'android', 'ExpoModulesCorePlugin.gradle'
);

const ORIGINAL = 'from components.release';
const PATCHED = "from components.findByName('release')";
const MARKER = '// BUILD-BLK-01: patched for AGP 8.6 compatibility';

if (!fs.existsSync(PLUGIN_PATH)) {
  // expo-modules-core not installed yet — skip silently
  process.exit(0);
}

const content = fs.readFileSync(PLUGIN_PATH, 'utf8');

if (content.includes(MARKER)) {
  // Already patched
  process.exit(0);
}

if (!content.includes(ORIGINAL)) {
  // File structure changed — skip to avoid corruption
  console.warn('[postinstall] ExpoModulesCorePlugin.gradle does not contain expected pattern, skipping patch');
  process.exit(0);
}

const patched = content.replace(
  ORIGINAL,
  `${PATCHED} ${MARKER}`
);

fs.writeFileSync(PLUGIN_PATH, patched, 'utf8');
console.log('[postinstall] Patched ExpoModulesCorePlugin.gradle for AGP 8.6 (BUILD-BLK-01)');
