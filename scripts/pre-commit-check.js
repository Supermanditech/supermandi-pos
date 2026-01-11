#!/usr/bin/env node
/**
 * Pre-commit validation script
 * Runs before every commit to catch issues early
 *
 * Usage: node scripts/pre-commit-check.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let hasErrors = false;
let hasWarnings = false;

function log(color, prefix, message) {
  console.log(`${color}${prefix}${RESET} ${message}`);
}

function error(message) {
  log(RED, '[ERROR]', message);
  hasErrors = true;
}

function warn(message) {
  log(YELLOW, '[WARN]', message);
  hasWarnings = true;
}

function success(message) {
  log(GREEN, '[OK]', message);
}

function info(message) {
  console.log(`[INFO] ${message}`);
}

console.log('\n========================================');
console.log('  SuperMandi POS Pre-Commit Checks');
console.log('========================================\n');

// Check 1: TypeScript compilation
info('Checking TypeScript compilation...');
try {
  execSync('npx tsc --noEmit', { stdio: 'pipe' });
  success('TypeScript compiles without errors');
} catch (e) {
  error('TypeScript compilation failed!');
  console.log(e.stdout?.toString() || e.message);
}

// Check 2: Look for hardcoded screen size issues
info('Checking for hardcoded screen sizes...');
const filesToCheck = [
  'src/screens/SellScanScreen.tsx',
  'src/screens/PosRootLayout.tsx',
];

const dangerousPatterns = [
  { pattern: /screenWidth\s*<=\s*\d{3}(?!\d)/, message: 'Hardcoded screen width comparison' },
  { pattern: /screenHeight\s*<=\s*\d{3}(?!\d)/, message: 'Hardcoded screen height comparison' },
  { pattern: /isSmallScreen\s*\?.*collapsed/, message: 'Device-specific collapsed state' },
];

filesToCheck.forEach(file => {
  const filePath = path.join(process.cwd(), file);
  if (fs.existsSync(filePath)) {
    const content = fs.readFileSync(filePath, 'utf8');
    dangerousPatterns.forEach(({ pattern, message }) => {
      if (pattern.test(content)) {
        warn(`${file}: ${message} - ensure this is device-agnostic`);
      }
    });
  }
});

// Check 3: Verify critical UI constants
info('Checking critical UI constants...');
const sellScanPath = path.join(process.cwd(), 'src/screens/SellScanScreen.tsx');
if (fs.existsSync(sellScanPath)) {
  const content = fs.readFileSync(sellScanPath, 'utf8');

  // Cart should always start expanded
  if (content.includes('sheetSnapRef.current = "collapsed"') &&
      !content.includes('// Always start expanded')) {
    warn('Cart may start collapsed on some devices - verify cart opens fully');
  }

  // Check button sizes
  const qtyButtonMatch = content.match(/qtyButton:\s*\{[^}]*width:\s*(\d+)/);
  if (qtyButtonMatch && parseInt(qtyButtonMatch[1]) < 30) {
    warn(`Qty button width (${qtyButtonMatch[1]}px) may be too small for touch`);
  }
}

// Check 4: Verify scan debounce settings
info('Checking scan debounce settings...');
const handleScanPath = path.join(process.cwd(), 'src/services/scan/handleScan.ts');
if (fs.existsSync(handleScanPath)) {
  const content = fs.readFileSync(handleScanPath, 'utf8');

  const guardMatch = content.match(/DEFAULT_DUPLICATE_GUARD_MS\s*=\s*(\d+)/);
  if (guardMatch) {
    const guardMs = parseInt(guardMatch[1]);
    if (guardMs < 800) {
      error(`Duplicate guard window (${guardMs}ms) too short - should be >= 800ms`);
    } else if (guardMs < 1000) {
      warn(`Duplicate guard window (${guardMs}ms) - recommend >= 1000ms`);
    } else {
      success(`Duplicate guard window: ${guardMs}ms`);
    }
  }

  // Check for sell price validation
  if (!content.includes('hasSellPrice') && !content.includes('sell_price')) {
    warn('Stock onboarding may not check for sell price');
  }
}

// Check 5: Menu text visibility
info('Checking Menu text visibility...');
const posRootPath = path.join(process.cwd(), 'src/screens/PosRootLayout.tsx');
if (fs.existsSync(posRootPath)) {
  const content = fs.readFileSync(posRootPath, 'utf8');

  if (content.includes('showMenuText = !compactTabs') ||
      content.includes('showMenuText = false')) {
    warn('Menu text may be hidden on some screen sizes');
  }

  if (content.includes('showMenuText = true')) {
    success('Menu text always visible');
  }
}

// Check 6: No console.log in critical paths
info('Checking for debug statements...');
const srcDir = path.join(process.cwd(), 'src');
let consoleLogCount = 0;
function checkDir(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      checkDir(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(/console\.log\(/g);
      if (matches) {
        consoleLogCount += matches.length;
      }
    }
  });
}
checkDir(srcDir);
if (consoleLogCount > 20) {
  warn(`Found ${consoleLogCount} console.log statements - consider removing for production`);
} else {
  success(`Console.log count: ${consoleLogCount}`);
}

// Summary
console.log('\n========================================');
console.log('  Summary');
console.log('========================================\n');

if (hasErrors) {
  error('Pre-commit checks FAILED - fix errors before committing');
  process.exit(1);
} else if (hasWarnings) {
  warn('Pre-commit checks passed with warnings');
  warn('Review warnings and ensure device-agnostic behavior');
  process.exit(0);
} else {
  success('All pre-commit checks passed!');
  process.exit(0);
}
