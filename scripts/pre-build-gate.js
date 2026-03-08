#!/usr/bin/env node
/**
 * PRE-BUILD GATE - Runs before gradle build
 *
 * This script is called by gradle before assembleRelease.
 * It performs HARD BLOCKS that cannot be bypassed.
 *
 * Checks:
 * 0. WIP GATE - All work must be committed to git (MOST IMPORTANT)
 * 1. Artifact phase must be explicitly unlocked in machine state
 * 2. TypeScript must compile
 * 3. Scan debounce must be >= 800ms
 * 4. Cart must start expanded (not collapsed)
 * 5. Menu text must always be visible
 * 6. Button sizes must be >= 26px
 * 7. Sell price check in onboarding
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let errors = [];

function fail(message) {
  errors.push(message);
  console.error(`${RED}[BLOCK]${RESET} ${message}`);
}

function pass(message) {
  console.log(`${GREEN}[PASS]${RESET} ${message}`);
}

console.log('\n========================================');
console.log('  PRE-BUILD GATE - Mandatory Checks');
console.log('========================================\n');

// CHECK 0: WIP GATE - Must run first!
console.log('Check 0: Work-In-Progress Gate...');
console.log('(Ensuring all work is committed to git)\n');
try {
  execSync('node scripts/wip-gate.js', { stdio: 'inherit', cwd: path.join(__dirname, '..') });
  pass('WIP Gate passed - all work committed');
} catch (e) {
  fail('WIP Gate failed - commit all changes before building');
  // Exit immediately - no point checking code if it's not committed
  console.log('\n========================================');
  console.log(`${RED}  BUILD BLOCKED - Commit your work first${RESET}`);
  console.log('========================================\n');
  process.exit(1);
}

console.log('\n--- Code Quality Checks ---\n');

// CHECK 1: Artifact lock
console.log('Check 1: Artifact phase lock...');
try {
  execSync('node scripts/enforce-artifact-phase-lock.js --mode=apk', {
    stdio: 'inherit',
    cwd: path.join(__dirname, '..'),
  });
  pass('Artifact phase explicitly unlocked');
} catch (e) {
  fail('Artifact phase lock is active - APK build forbidden by canonical machine state');
  console.log('\n========================================');
  console.log(`${RED}  BUILD BLOCKED - Artifact phase locked${RESET}`);
  console.log('========================================\n');
  process.exit(1);
}

// CHECK 2: TypeScript
console.log('Check 2: TypeScript compilation...');
try {
  execSync('npx tsc --noEmit', { stdio: 'pipe', cwd: path.join(__dirname, '..') });
  pass('TypeScript compiles');
} catch (e) {
  fail('TypeScript has errors - fix before building');
}

// CHECK 3: Scan debounce (GL-CRIT-0045: unified duplicate detection window)
console.log('Check 3: Scan debounce window...');
const handleScanPath = path.join(__dirname, '..', 'src/services/scan/handleScan.ts');
if (fs.existsSync(handleScanPath)) {
  const content = fs.readFileSync(handleScanPath, 'utf8');
  // GL-CRIT-0045: Duplicate detection was consolidated into DUPLICATE_WINDOW_MS
  // (previously split across DEFAULT_DUPLICATE_GUARD_MS and other windows)
  const match = content.match(/DUPLICATE_WINDOW_MS\s*=\s*(\d+)/);
  if (match) {
    const ms = parseInt(match[1]);
    if (ms >= 800) {
      pass(`Scan debounce: ${ms}ms`);
    } else {
      fail(`Scan debounce ${ms}ms is too low - must be >= 800ms`);
    }
  } else {
    fail('Cannot find DUPLICATE_WINDOW_MS in handleScan.ts');
  }
} else {
  fail('handleScan.ts not found');
}

// CHECK 4: Cart starts expanded
console.log('Check 4: Cart expansion state...');
const sellScanPath = path.join(__dirname, '..', 'src/screens/SellScanScreen.tsx');
if (fs.existsSync(sellScanPath)) {
  const content = fs.readFileSync(sellScanPath, 'utf8');

  // Look for the cart opening useEffect
  // Should have: sheetTranslateY.setValue(0) and sheetSnapRef.current = "expanded"
  const hasExpandedDefault = content.includes('sheetSnapRef.current = "expanded"');
  const hasCollapsedConditional = /startExpanded\s*\?.*collapsed/.test(content) ||
                                   /isSmallScreen\s*\?.*collapsed/.test(content);

  if (hasExpandedDefault && !hasCollapsedConditional) {
    pass('Cart starts expanded');
  } else if (hasCollapsedConditional) {
    fail('Cart has conditional collapsed state - must always start expanded');
  } else {
    fail('Cannot verify cart expansion - check SellScanScreen.tsx manually');
  }
} else {
  fail('SellScanScreen.tsx not found');
}

// CHECK 5: Menu text visibility
console.log('Check 5: Menu text visibility...');
const posRootPath = path.join(__dirname, '..', 'src/screens/PosRootLayout.tsx');
if (fs.existsSync(posRootPath)) {
  const content = fs.readFileSync(posRootPath, 'utf8');

  if (content.includes('showMenuText = true')) {
    pass('Menu text always visible');
  } else if (content.includes('showMenuText = !compactTabs')) {
    fail('Menu text hidden on some screens - set showMenuText = true');
  } else {
    fail('Cannot verify Menu text visibility - check PosRootLayout.tsx');
  }
} else {
  fail('PosRootLayout.tsx not found');
}

// CHECK 6: Button sizes
console.log('Check 6: Button touch target sizes...');
if (fs.existsSync(sellScanPath)) {
  const content = fs.readFileSync(sellScanPath, 'utf8');

  const qtyMatch = content.match(/qtyButton:\s*\{[^}]*width:\s*(\d+)/);
  const backMatch = content.match(/backButton:\s*\{[^}]*width:\s*(\d+)/);

  let buttonOk = true;

  if (qtyMatch) {
    const size = parseInt(qtyMatch[1]);
    if (size >= 26) {
      pass(`Qty button size: ${size}px`);
    } else {
      fail(`Qty button ${size}px too small - must be >= 26px`);
      buttonOk = false;
    }
  }

  if (backMatch) {
    const size = parseInt(backMatch[1]);
    if (size >= 30) {
      pass(`Back button size: ${size}px`);
    } else {
      fail(`Back button ${size}px too small - must be >= 30px`);
      buttonOk = false;
    }
  }
}

// CHECK 7: Sell price validation in onboarding
console.log('Check 7: Stock onboarding sell price check...');
if (fs.existsSync(handleScanPath)) {
  const content = fs.readFileSync(handleScanPath, 'utf8');

  if (content.includes('hasSellPrice') ||
      (content.includes('sell_price') && content.includes('return true'))) {
    pass('Stock onboarding checks sell price');
  } else {
    fail('Stock onboarding may not check for missing sell price');
  }
}

// SUMMARY
console.log('\n========================================');
if (errors.length === 0) {
  console.log(`${GREEN}  ALL CHECKS PASSED - BUILD ALLOWED${RESET}`);
  console.log('========================================\n');
  process.exit(0);
} else {
  console.log(`${RED}  ${errors.length} CHECK(S) FAILED - BUILD BLOCKED${RESET}`);
  console.log('========================================\n');
  console.log('Fix the above issues before building.\n');
  process.exit(1);
}
