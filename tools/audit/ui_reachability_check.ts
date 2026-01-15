#!/usr/bin/env npx tsx
/**
 * UI Reachability Check - UI-AUDIT-007
 *
 * Automated regression gate for UI reachability.
 * Verifies:
 * 1. All screens in src/screens/ are registered or embedded
 * 2. Feature-gated screens have proper guards
 * 3. Essential operations are not incorrectly gated
 * 4. No orphaned screens exist
 *
 * Run: npx tsx tools/audit/ui_reachability_check.ts
 * Exit codes:
 *   0 = Pass
 *   1 = Fail
 */

import * as fs from "fs";
import * as path from "path";

// =============================================================================
// CONFIGURATION
// =============================================================================

const ROOT_DIR = path.join(__dirname, "..", "..");
const SCREENS_DIR = path.join(ROOT_DIR, "src", "screens");
const DEPRECATED_DIR = path.join(SCREENS_DIR, "deprecated");
const APP_TSX = path.join(ROOT_DIR, "App.tsx");
const POS_ROOT_LAYOUT = path.join(SCREENS_DIR, "PosRootLayout.tsx");
const MENU_SCREEN = path.join(SCREENS_DIR, "MenuScreen.tsx");

// Screens embedded in PosRootLayout (not Stack.Screen)
const EMBEDDED_SCREENS = [
  "MenuScreen.tsx",
  "SellScanScreen.tsx",
  "BuyScreen.tsx",
  "ReorderScreen.tsx",
];

// Layout containers (not standalone screens)
const LAYOUT_SCREENS = ["PosRootLayout.tsx"];

// Feature-gated screens and their required flags
const FEATURE_GATED_SCREENS: Record<string, string> = {
  OrderHistory: "buy",
  OrderDetail: "buy",
  GRN: "buy",
  ReorderSettings: "reorder",
  ReorderPolicies: "reorder",
  UiShowcase: "qa_menu",
};

// Essential screens that must NEVER be gated
const ESSENTIAL_ALWAYS_VISIBLE = [
  "Inward",
  "SalesHistory",
  "BillDetail",
  "BarcodeSheet",
  "PurchaseHistory",
  "SalesStatement",
  "StockStatement",
];

// =============================================================================
// TYPES
// =============================================================================

interface AuditResult {
  passed: boolean;
  errors: string[];
  warnings: string[];
  stats: {
    totalScreens: number;
    registeredScreens: number;
    embeddedScreens: number;
    deprecatedScreens: number;
    gatedScreens: number;
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getScreenFiles(): string[] {
  const files = fs.readdirSync(SCREENS_DIR);
  return files.filter((f) => {
    if (!f.endsWith(".tsx")) return false;
    const stat = fs.statSync(path.join(SCREENS_DIR, f));
    return stat.isFile();
  });
}

function getDeprecatedScreens(): string[] {
  if (!fs.existsSync(DEPRECATED_DIR)) return [];
  const files = fs.readdirSync(DEPRECATED_DIR);
  return files.filter((f) => f.endsWith(".tsx"));
}

function getRegisteredScreens(): string[] {
  const appContent = fs.readFileSync(APP_TSX, "utf8");
  const matches = appContent.matchAll(/Stack\.Screen\s+name="([^"]+)"/g);
  return Array.from(matches, (m) => m[1]);
}

function checkFeatureGating(): string[] {
  const errors: string[] = [];
  const appContent = fs.readFileSync(APP_TSX, "utf8");

  // Check that gated screens use FeatureGate
  for (const [screen, flag] of Object.entries(FEATURE_GATED_SCREENS)) {
    if (screen === "UiShowcase") continue; // Special case - gated at Stack.Screen level

    const wrapperPattern = new RegExp(`${screen}Wrapper[\\s\\S]*?<FeatureGate[\\s\\S]*?feature="${flag}"`, "g");
    const hasGate = wrapperPattern.test(appContent);

    if (!hasGate) {
      errors.push(`${screen} should be wrapped with FeatureGate(feature="${flag}")`);
    }
  }

  return errors;
}

function checkEssentialGating(): string[] {
  const errors: string[] = [];
  const menuContent = fs.readFileSync(MENU_SCREEN, "utf8");

  // Check that essential operations are NOT gated behind buyEnabled/reorderEnabled
  for (const screen of ESSENTIAL_ALWAYS_VISIBLE) {
    // Look for patterns like: {buyEnabled && ... goTo{Screen}
    const buyGatePattern = new RegExp(`\\{buyEnabled\\s*&&[^}]*goTo${screen}`, "gs");
    const reorderGatePattern = new RegExp(`\\{reorderEnabled\\s*&&[^}]*goTo${screen}`, "gs");

    if (buyGatePattern.test(menuContent)) {
      errors.push(`${screen} is incorrectly gated behind buyEnabled`);
    }
    if (reorderGatePattern.test(menuContent)) {
      errors.push(`${screen} is incorrectly gated behind reorderEnabled`);
    }
  }

  return errors;
}

function checkOrphanedScreens(screenFiles: string[], registeredScreens: string[]): string[] {
  const errors: string[] = [];

  for (const file of screenFiles) {
    // Skip layout screens
    if (LAYOUT_SCREENS.includes(file)) continue;

    // Skip embedded screens
    if (EMBEDDED_SCREENS.includes(file)) continue;

    // Extract screen name (FooScreen.tsx -> Foo, FooScreenV2.tsx -> Foo)
    const screenName = file
      .replace("Screen.tsx", "")
      .replace("ScreenV2.tsx", "");

    // Check if registered
    const isRegistered = registeredScreens.some(
      (name) => name === screenName || name === screenName.replace(/V\d+$/, "")
    );

    if (!isRegistered) {
      errors.push(`${file} is not registered in App.tsx (expected route: "${screenName}")`);
    }
  }

  return errors;
}

// =============================================================================
// MAIN AUDIT
// =============================================================================

function runAudit(): AuditResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  console.log("═".repeat(60));
  console.log("UI REACHABILITY CHECK - UI-AUDIT-007");
  console.log("═".repeat(60));
  console.log("");

  // 1. Get screen inventory
  const screenFiles = getScreenFiles();
  const deprecatedScreens = getDeprecatedScreens();
  const registeredScreens = getRegisteredScreens();

  console.log(`📁 Screen files: ${screenFiles.length}`);
  console.log(`📝 Registered routes: ${registeredScreens.length}`);
  console.log(`📦 Embedded in tabs: ${EMBEDDED_SCREENS.length}`);
  console.log(`🗑️  Deprecated: ${deprecatedScreens.length}`);
  console.log("");

  // 2. Check orphaned screens
  console.log("─".repeat(60));
  console.log("Checking for orphaned screens...");
  console.log("─".repeat(60));

  const orphanErrors = checkOrphanedScreens(screenFiles, registeredScreens);
  if (orphanErrors.length > 0) {
    errors.push(...orphanErrors);
    orphanErrors.forEach((e) => console.log(`❌ ${e}`));
  } else {
    console.log("✅ No orphaned screens found");
  }
  console.log("");

  // 3. Check feature gating
  console.log("─".repeat(60));
  console.log("Checking feature gate consistency...");
  console.log("─".repeat(60));

  const gatingErrors = checkFeatureGating();
  if (gatingErrors.length > 0) {
    errors.push(...gatingErrors);
    gatingErrors.forEach((e) => console.log(`❌ ${e}`));
  } else {
    console.log("✅ All feature-gated screens have proper guards");
  }
  console.log("");

  // 4. Check essential operations
  console.log("─".repeat(60));
  console.log("Checking essential operation accessibility...");
  console.log("─".repeat(60));

  const essentialErrors = checkEssentialGating();
  if (essentialErrors.length > 0) {
    errors.push(...essentialErrors);
    essentialErrors.forEach((e) => console.log(`❌ ${e}`));
  } else {
    console.log("✅ Essential operations are always accessible");
  }
  console.log("");

  // 5. Results
  console.log("═".repeat(60));
  console.log("AUDIT RESULTS");
  console.log("═".repeat(60));

  const stats = {
    totalScreens: screenFiles.length,
    registeredScreens: registeredScreens.length,
    embeddedScreens: EMBEDDED_SCREENS.length,
    deprecatedScreens: deprecatedScreens.length,
    gatedScreens: Object.keys(FEATURE_GATED_SCREENS).length,
  };

  if (warnings.length > 0) {
    console.log(`\n⚠️  Warnings (${warnings.length}):`);
    warnings.forEach((w) => console.log(`   ${w}`));
  }

  if (errors.length > 0) {
    console.log(`\n❌ Errors (${errors.length}):`);
    errors.forEach((e) => console.log(`   ${e}`));
    console.log("\n🔴 AUDIT FAILED - Fix errors before release");
  } else {
    console.log("\n✅ AUDIT PASSED - All screens reachable and properly gated");
  }

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

// =============================================================================
// ENTRY POINT
// =============================================================================

const result = runAudit();
process.exit(result.passed ? 0 : 1);
