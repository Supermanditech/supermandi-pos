#!/usr/bin/env node
/**
 * UI Visibility Audit Script - UIVIS-006
 *
 * Ensures all screens are registered and reachable.
 * Run: node scripts/ui-audit.js
 *
 * Exit codes:
 *   0 = Pass (all screens registered)
 *   1 = Fail (orphaned or unreachable screens found)
 */

const fs = require("fs");
const path = require("path");

const SCREENS_DIR = path.join(__dirname, "..", "src", "screens");
const DEPRECATED_DIR = path.join(SCREENS_DIR, "deprecated");
const APP_TSX = path.join(__dirname, "..", "App.tsx");
const POS_ROOT_LAYOUT = path.join(SCREENS_DIR, "PosRootLayout.tsx");
const MENU_SCREEN = path.join(SCREENS_DIR, "MenuScreen.tsx");

// Screens that are embedded in PosRootLayout (not registered as Stack.Screen)
const EMBEDDED_SCREENS = [
  "MenuScreen.tsx",
  "SellScanScreen.tsx",
  "BuyScreen.tsx",
  "ReorderScreen.tsx",
];

// Screens that are layout containers (not standalone screens)
const LAYOUT_SCREENS = ["PosRootLayout.tsx"];

// Essential operations that must NOT be gated behind buyEnabled
const ESSENTIAL_ALWAYS_VISIBLE = ["Inward"];

function getScreenFiles() {
  const files = fs.readdirSync(SCREENS_DIR);
  return files.filter((f) => {
    if (!f.endsWith(".tsx")) return false;
    // Skip deprecated folder
    const stat = fs.statSync(path.join(SCREENS_DIR, f));
    return stat.isFile();
  });
}

function getDeprecatedScreens() {
  if (!fs.existsSync(DEPRECATED_DIR)) return [];
  const files = fs.readdirSync(DEPRECATED_DIR);
  return files.filter((f) => f.endsWith(".tsx"));
}

function getRegisteredScreens() {
  const appContent = fs.readFileSync(APP_TSX, "utf8");
  const matches = appContent.matchAll(/Stack\.Screen\s+name="([^"]+)"/g);
  return Array.from(matches, (m) => m[1]);
}

function getImportedScreensInPosRoot() {
  const content = fs.readFileSync(POS_ROOT_LAYOUT, "utf8");
  const matches = content.matchAll(/import\s+\w+\s+from\s+"\.\/(\w+)"/g);
  return Array.from(matches, (m) => m[1] + ".tsx");
}

function checkEssentialGating() {
  const menuContent = fs.readFileSync(MENU_SCREEN, "utf8");
  const errors = [];

  // Check that Stock Inward is NOT gated behind buyEnabled
  // Look for pattern: {buyEnabled && ... goToInward
  const buyEnabledBlocks = menuContent.matchAll(
    /\{buyEnabled\s*&&\s*\([^)]*goToInward/gs
  );
  const buyEnabledMatches = Array.from(buyEnabledBlocks);
  if (buyEnabledMatches.length > 0) {
    errors.push(
      "FAIL: Stock Inward (goToInward) is incorrectly gated behind buyEnabled"
    );
  }

  return errors;
}

function audit() {
  console.log("=".repeat(60));
  console.log("UI VISIBILITY AUDIT - UIVIS-006");
  console.log("=".repeat(60));
  console.log("");

  const errors = [];
  const warnings = [];

  // Get all screen files
  const screenFiles = getScreenFiles();
  console.log(`Found ${screenFiles.length} screen files in src/screens/`);

  // Get deprecated screens
  const deprecatedScreens = getDeprecatedScreens();
  if (deprecatedScreens.length > 0) {
    console.log(`Found ${deprecatedScreens.length} deprecated screens (ignored)`);
    deprecatedScreens.forEach((f) => {
      console.log(`  - deprecated/${f}`);
    });
  }

  // Get registered screens from App.tsx
  const registeredScreens = getRegisteredScreens();
  console.log(`Found ${registeredScreens.length} registered Stack.Screens`);

  // Get imported screens in PosRootLayout
  const embeddedScreens = getImportedScreensInPosRoot();
  console.log(`Found ${embeddedScreens.length} embedded screens in PosRootLayout`);

  console.log("");
  console.log("-".repeat(60));
  console.log("CHECKING SCREEN REGISTRATION...");
  console.log("-".repeat(60));

  // Check each screen file
  for (const file of screenFiles) {
    // Skip layout screens
    if (LAYOUT_SCREENS.includes(file)) {
      console.log(`[LAYOUT] ${file} - is a layout container`);
      continue;
    }

    // Check if embedded in PosRootLayout
    if (EMBEDDED_SCREENS.includes(file) || embeddedScreens.includes(file)) {
      console.log(`[EMBEDDED] ${file} - used in PosRootLayout`);
      continue;
    }

    // Check if registered as Stack.Screen
    // Screen files are named FooScreen.tsx, registered as "Foo"
    const screenName = file.replace("Screen.tsx", "").replace("ScreenV2.tsx", "");
    const isRegistered = registeredScreens.some((name) => {
      return (
        name === screenName ||
        name === screenName.replace(/([A-Z])/g, "$1").trim()
      );
    });

    if (isRegistered) {
      console.log(`[REGISTERED] ${file} -> "${screenName}"`);
    } else {
      errors.push(`ORPHANED: ${file} is not registered in App.tsx or embedded in PosRootLayout`);
      console.log(`[ORPHANED] ${file} - NOT REGISTERED!`);
    }
  }

  console.log("");
  console.log("-".repeat(60));
  console.log("CHECKING FEATURE FLAG GATING...");
  console.log("-".repeat(60));

  const gatingErrors = checkEssentialGating();
  if (gatingErrors.length === 0) {
    console.log("[PASS] Essential operations are not incorrectly gated");
  } else {
    errors.push(...gatingErrors);
    gatingErrors.forEach((e) => console.log(`[FAIL] ${e}`));
  }

  console.log("");
  console.log("=".repeat(60));
  console.log("AUDIT RESULTS");
  console.log("=".repeat(60));

  if (warnings.length > 0) {
    console.log(`\nWARNINGS (${warnings.length}):`);
    warnings.forEach((w) => console.log(`  - ${w}`));
  }

  if (errors.length > 0) {
    console.log(`\nERRORS (${errors.length}):`);
    errors.forEach((e) => console.log(`  - ${e}`));
    console.log("\n[AUDIT FAILED] Fix the above errors before proceeding.");
    process.exit(1);
  }

  console.log("\n[AUDIT PASSED] All screens are registered and reachable.");
  process.exit(0);
}

// Run audit
audit();
