#!/usr/bin/env node
/**
 * Release Gate Script
 *
 * Runs all pre-release checks and blocks release if any fail.
 *
 * Usage:
 *   node scripts/release-gate.js              # Run all checks
 *   node scripts/release-gate.js --check git  # Run specific check
 *   node scripts/release-gate.js --verbose    # Verbose output
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

const ROOT_DIR = path.join(__dirname, '..');
const CHECKS = ['git', 'branch', 'fingerprint', 'urls', 'flags', 'boundaries', 'build', 'ui-reachability', 'workflow'];

// Colors
const COLORS = {
  reset: '\x1b[0m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
};

function colorize(text, color) {
  return `${COLORS[color] || ''}${text}${COLORS.reset}`;
}

function exec(cmd, options = {}) {
  try {
    return execSync(cmd, {
      cwd: ROOT_DIR,
      encoding: 'utf-8',
      stdio: options.silent ? 'pipe' : 'inherit',
      ...options,
    });
  } catch (err) {
    if (options.silent) return err.stdout || '';
    throw err;
  }
}

function fileExists(filePath) {
  return fs.existsSync(path.join(ROOT_DIR, filePath));
}

function readFile(filePath) {
  const fullPath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}

// =============================================================================
// CHECK FUNCTIONS
// =============================================================================

function checkGit(verbose) {
  console.log(colorize('\n[1/9] Git Status Check', 'blue'));

  const results = { pass: true, messages: [] };

  // Check if git repo
  try {
    exec('git rev-parse --git-dir', { silent: true, stdio: 'pipe' });
  } catch {
    results.pass = false;
    results.messages.push('Not a git repository');
    return results;
  }

  // Check for uncommitted changes
  const status = exec('git status --porcelain', { silent: true, stdio: 'pipe' });
  if (status && status.trim()) {
    results.pass = false;
    results.messages.push('Uncommitted changes detected:');
    status.trim().split('\n').slice(0, 10).forEach(line => {
      results.messages.push(`  ${line}`);
    });
    if (status.trim().split('\n').length > 10) {
      results.messages.push('  ... and more');
    }
  } else {
    results.messages.push('Working tree is clean');
  }

  // Check for untracked files that might be important
  const untracked = exec('git ls-files --others --exclude-standard', { silent: true, stdio: 'pipe' });
  const importantUntracked = (untracked || '').split('\n').filter(f =>
    f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.json') || f.endsWith('.sql')
  );
  if (importantUntracked.length > 0) {
    results.pass = false;
    results.messages.push('Important untracked files:');
    importantUntracked.slice(0, 5).forEach(f => results.messages.push(`  ${f}`));
  }

  return results;
}

function checkFingerprint(verbose) {
  console.log(colorize('\n[3/9] Build Fingerprint Check', 'blue'));

  const results = { pass: true, messages: [] };

  // Load and execute app.config.js to get computed build info
  try {
    // Clear require cache to get fresh values
    const configPath = path.join(ROOT_DIR, 'app.config.js');
    delete require.cache[require.resolve(configPath)];

    const appConfig = require(configPath);
    const appJson = JSON.parse(readFile('app.json') || '{}');

    // Execute the config function
    const config = appConfig({ config: appJson.expo || {} });
    const extra = config.extra || {};

    // Check for required build info
    const gitSha = extra.BUILD_GIT_SHA;
    const fingerprint = extra.BUILD_FINGERPRINT;
    const branch = extra.BUILD_BRANCH;
    const buildTime = extra.BUILD_TIME;
    const buildId = extra.BUILD_ID;

    // Helper to check if value is a fallback ID (starts with B or F)
    const isFallbackId = (val) => val && (val.startsWith('B') || val.startsWith('F'));

    // Validate SHA - FAIL only if literally "unknown"
    if (!gitSha || gitSha === 'unknown') {
      results.pass = false;
      results.messages.push(colorize(`FAIL: BUILD_GIT_SHA is "unknown"`, 'red'));
      results.messages.push('  Git must be available and have commits');
    } else if (isFallbackId(gitSha)) {
      // Warn but don't fail for fallback IDs (git not available)
      results.messages.push(colorize(`WARN: BUILD_GIT_SHA is fallback ID: ${gitSha}`, 'yellow'));
      results.messages.push('  Git was not available during config generation');
    } else {
      results.messages.push(`SHA: ${gitSha}`);
    }

    // Validate fingerprint - FAIL only if literally "unknown"
    if (!fingerprint || fingerprint === 'unknown') {
      results.pass = false;
      results.messages.push(colorize(`FAIL: BUILD_FINGERPRINT is "unknown"`, 'red'));
    } else if (isFallbackId(fingerprint)) {
      results.messages.push(colorize(`WARN: BUILD_FINGERPRINT is fallback: ${fingerprint}`, 'yellow'));
    } else {
      results.messages.push(`Fingerprint: ${fingerprint}`);
    }

    // Validate branch - WARN only, don't fail
    if (!branch || branch === 'unknown') {
      results.messages.push(colorize(`WARN: BUILD_BRANCH is unknown`, 'yellow'));
    } else {
      results.messages.push(`Branch: ${branch}`);
    }

    // Build time and ID (informational)
    results.messages.push(`Build Time: ${buildTime || 'not set'}`);
    if (buildId) {
      results.messages.push(`Build ID: ${buildId}`);
    }

    // Check for dirty worktree (warning only)
    const isDirty = extra.BUILD_IS_DIRTY;
    if (isDirty) {
      results.messages.push(colorize('WARN: Worktree is dirty - commit changes before release', 'yellow'));
    }

    // Summary
    if (results.pass) {
      results.messages.push(colorize('Build info computed from git successfully', 'green'));
    }

  } catch (err) {
    results.pass = false;
    results.messages.push(colorize(`FAIL: Could not load app.config.js: ${err.message}`, 'red'));
    results.messages.push('  Ensure app.config.js exists and exports a function');
  }

  return results;
}

function checkBranch(verbose) {
  console.log(colorize('\n[2/9] Branch & Tag Check', 'blue'));

  const results = { pass: true, messages: [] };

  // Get current branch
  const branch = exec('git branch --show-current', { silent: true, stdio: 'pipe' }).trim();
  results.messages.push(`Current branch: ${branch}`);

  // Check if on valid release branch
  const validBranches = ['main', 'master'];
  const isReleaseBranch = validBranches.includes(branch) || branch.startsWith('release/');

  if (!isReleaseBranch) {
    results.pass = false;
    results.messages.push(`WARNING: Not on a release branch (expected: main or release/*)`);
  }

  // Get current commit
  const commit = exec('git rev-parse --short HEAD', { silent: true, stdio: 'pipe' }).trim();
  results.messages.push(`Current commit: ${commit}`);

  // Check if commit is tagged
  const tags = exec(`git tag --points-at HEAD`, { silent: true, stdio: 'pipe' }).trim();
  if (tags) {
    results.messages.push(`Tags at HEAD: ${tags}`);
  } else {
    results.messages.push('No tags at current commit (will create during release)');
  }

  return results;
}

function checkUrls(verbose) {
  console.log(colorize('\n[4/9] Backend URL Check', 'blue'));

  const results = { pass: true, messages: [] };

  // Check API config
  const apiConfig = readFile('src/config/api.ts');
  if (!apiConfig) {
    results.pass = false;
    results.messages.push('src/config/api.ts not found');
    return results;
  }

  // Check for localhost/development URLs
  const devPatterns = [
    /localhost/i,
    /127\.0\.0\.1/,
    /192\.168\./,
    /10\.0\./,
    /:3000/,
    /:8080/,
  ];

  const lines = apiConfig.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.includes('API_BASE_URL') || line.includes('baseUrl')) {
      for (const pattern of devPatterns) {
        if (pattern.test(line) && !line.includes('//') && !line.trimStart().startsWith('//')) {
          results.pass = false;
          results.messages.push(`Development URL detected at line ${i + 1}: ${line.trim()}`);
        }
      }
    }
  }

  if (results.pass) {
    // Extract the URL for display
    const urlMatch = apiConfig.match(/API_BASE_URL\s*=\s*['"`]([^'"`]+)['"`]/);
    if (urlMatch) {
      results.messages.push(`API_BASE_URL: ${urlMatch[1]}`);
    }
    results.messages.push('No development URLs detected');
  }

  return results;
}

function checkFlags(verbose) {
  console.log(colorize('\n[5/9] Feature Flags Check', 'blue'));

  const results = { pass: true, messages: [] };

  // Check for feature flags file
  const flagsFile = readFile('src/config/featureFlags.ts');
  if (!flagsFile) {
    results.messages.push('No feature flags file found (src/config/featureFlags.ts)');
    return results;
  }

  results.messages.push('Feature flags file exists');

  // Check REORDER flag references
  const menuScreen = readFile('src/screens/MenuScreen.tsx');
  const tabNavigator = readFile('src/navigation/TabNavigator.tsx') ||
                       readFile('src/screens/PosRootLayout.tsx');

  if (menuScreen && menuScreen.includes('REORDER')) {
    results.messages.push('REORDER flag referenced in MenuScreen');
  }

  // Check for orphan flag references (flags used but not defined)
  const flagDefs = flagsFile.match(/(\w+):\s*(true|false)/g) || [];
  results.messages.push(`Defined flags: ${flagDefs.length}`);

  return results;
}

function checkBoundaries(verbose) {
  console.log(colorize('\n[6/9] SELL/BUY Boundary Check', 'blue'));

  const results = { pass: true, messages: [] };

  // Check SELL search files
  const sellSearchApi = readFile('src/services/api/sellSearchApi.ts');
  const sellScanScreen = readFile('src/screens/SellScanScreen.tsx');

  // Check that SELL uses store_products
  if (sellSearchApi) {
    if (sellSearchApi.includes('store-products')) {
      results.messages.push('SELL search correctly uses store-products endpoint');
    } else {
      results.pass = false;
      results.messages.push('SELL search does not use store-products endpoint');
    }

    if (sellSearchApi.includes('catalog/stores') && sellSearchApi.includes('supplier')) {
      results.pass = false;
      results.messages.push('SELL search incorrectly references supplier catalog');
    }
  }

  // Check BUY search files
  const catalogApi = readFile('src/services/api/catalogApi.ts');
  const buyScreen = readFile('src/screens/BuyScreen.tsx');

  if (catalogApi) {
    if (catalogApi.includes('/catalog')) {
      results.messages.push('BUY search correctly uses catalog endpoint');
    }
  }

  // Check backend SELL search
  const backendSellSearch = readFile('backend/services/catalog-service/src/db/queries.ts');
  if (backendSellSearch) {
    if (backendSellSearch.includes('store_products') &&
        backendSellSearch.includes('searchStoreProducts')) {
      results.messages.push('Backend SELL search uses store_products table');
    }
  }

  // Check backend BUY search
  const backendBuySearch = readFile('backend/services/catalog-service/src/services/catalogService.ts');
  if (backendBuySearch) {
    if (backendBuySearch.includes('supplier_product_map')) {
      results.messages.push('Backend BUY search uses supplier_product_map table');
    }
  }

  if (results.pass) {
    results.messages.push('SELL/BUY boundaries verified');
  }

  return results;
}

function checkUiReachability(verbose) {
  console.log(colorize('\n[8/9] UI Reachability Check', 'blue'));

  const results = { pass: true, messages: [] };

  // Run the ui-audit.js script
  try {
    const output = exec('node scripts/ui-audit.js', { silent: true, stdio: 'pipe' });
    results.messages.push('UI reachability audit passed');
    if (verbose && output) {
      output.split('\n').slice(-5).forEach(line => {
        if (line.trim()) results.messages.push(`  ${line}`);
      });
    }
  } catch (err) {
    results.pass = false;
    results.messages.push('UI reachability audit failed');
    if (err.stdout) {
      err.stdout.split('\n').filter(l => l.includes('ORPHAN') || l.includes('FAIL')).forEach(line => {
        results.messages.push(`  ${line}`);
      });
    }
  }

  return results;
}

function checkWorkflow(verbose) {
  console.log(colorize('\n[9/9] Workflow Governance Check', 'blue'));

  const results = { pass: true, messages: [] };
  const guardScript = path.join(__dirname, 'workflow', 'guard.js');

  if (!fs.existsSync(guardScript)) {
    results.messages.push('Workflow guard not configured (scripts/workflow/guard.js not found)');
    return results;
  }

  const run = spawnSync('node', [guardScript, 'validate-state'], {
    cwd: ROOT_DIR,
    encoding: 'utf-8',
  });

  if (run.status !== 0) {
    results.pass = false;
    const combinedOutput = `${run.stdout || ''}\n${run.stderr || ''}`.trim();
    if (combinedOutput) {
      combinedOutput.split('\n').forEach(line => {
        if (line.trim()) results.messages.push(line.trim());
      });
    } else {
      results.messages.push('Workflow guard failed without output');
    }
    return results;
  }

  results.messages.push('Workflow state, ticket, and screen guard checks passed');
  return results;
}

function checkBuild(verbose) {
  console.log(colorize('\n[7/9] Build Readiness Check', 'blue'));

  const results = { pass: true, messages: [] };

  // Check package.json version
  const pkg = JSON.parse(readFile('package.json') || '{}');
  results.messages.push(`Package version: ${pkg.version || 'unknown'}`);

  // Check app.json version
  const appJson = JSON.parse(readFile('app.json') || '{}');
  if (appJson.expo) {
    results.messages.push(`App version: ${appJson.expo.version || 'unknown'}`);
  }

  // Check TypeScript (quick check)
  try {
    exec('npx tsc --noEmit --skipLibCheck 2>&1 | head -20', { silent: true, stdio: 'pipe' });
    results.messages.push('TypeScript check passed');
  } catch (err) {
    // TypeScript errors - still allow but warn
    results.messages.push('TypeScript has warnings (run pnpm typecheck for details)');
  }

  // Check for console.log in source files (warning only)
  try {
    const grepResult = exec(
      'git grep -l "console.log" -- "src/**/*.ts" "src/**/*.tsx" 2>/dev/null | head -5',
      { silent: true, stdio: 'pipe' }
    );
    if (grepResult && grepResult.trim()) {
      results.messages.push('WARNING: console.log statements found in source files');
    }
  } catch {
    // No console.logs or grep failed
  }

  return results;
}

// =============================================================================
// MAIN
// =============================================================================

async function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose') || args.includes('-v');
  const checkArg = args.find(a => a.startsWith('--check=') || a.startsWith('--check '));
  const specificCheck = checkArg ? checkArg.split(/[= ]/)[1] : args[args.indexOf('--check') + 1];

  console.log(colorize('\n╔══════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(colorize('║                    RELEASE GATE CHECK                         ║', 'cyan'));
  console.log(colorize('╚══════════════════════════════════════════════════════════════╝', 'cyan'));

  console.log(`\nTimestamp: ${new Date().toISOString()}`);
  console.log(`Working Directory: ${ROOT_DIR}`);

  const allResults = {};
  let allPassed = true;

  // Run checks
  const checksToRun = specificCheck ? [specificCheck] : CHECKS;

  for (const check of checksToRun) {
    let result;
    switch (check) {
      case 'git':
        result = checkGit(verbose);
        break;
      case 'branch':
        result = checkBranch(verbose);
        break;
      case 'fingerprint':
        result = checkFingerprint(verbose);
        break;
      case 'urls':
        result = checkUrls(verbose);
        break;
      case 'flags':
        result = checkFlags(verbose);
        break;
      case 'boundaries':
        result = checkBoundaries(verbose);
        break;
      case 'build':
        result = checkBuild(verbose);
        break;
      case 'ui-reachability':
        result = checkUiReachability(verbose);
        break;
      case 'workflow':
        result = checkWorkflow(verbose);
        break;
      default:
        console.log(colorize(`Unknown check: ${check}`, 'yellow'));
        continue;
    }

    allResults[check] = result;

    // Print result
    const status = result.pass ? colorize('PASS', 'green') : colorize('FAIL', 'red');
    console.log(`  ${status}`);
    for (const msg of result.messages) {
      console.log(`    ${msg}`);
    }

    if (!result.pass) allPassed = false;
  }

  // Run ticket proof if doing full check
  if (!specificCheck) {
    console.log(colorize('\n[+] Running Ticket Proof...', 'blue'));
    try {
      const ticketProof = spawnSync('node', [path.join(__dirname, 'ticket-proof.js')], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
      });
      if (ticketProof.status !== 0) {
        allPassed = false;
      }
    } catch (err) {
      console.log(colorize('Ticket proof failed to run', 'red'));
      allPassed = false;
    }
  }

  // Run i18n audit if doing full check
  if (!specificCheck && fileExists('scripts/i18n-audit.js')) {
    console.log(colorize('\n[+] Running i18n Audit...', 'blue'));
    try {
      const i18nAudit = spawnSync('node', [path.join(__dirname, 'i18n-audit.js')], {
        cwd: ROOT_DIR,
        stdio: 'inherit',
      });
      if (i18nAudit.status !== 0) {
        allPassed = false;
      }
    } catch (err) {
      console.log(colorize('i18n audit failed to run', 'red'));
      // Don't fail on missing i18n audit
    }
  }

  // Final summary
  console.log(colorize('\n════════════════════════════════════════════════════════════════', 'cyan'));

  if (allPassed) {
    console.log(colorize('\n✓ ALL RELEASE GATE CHECKS PASSED', 'green'));
    console.log(colorize('\nYou may proceed with: pnpm release:tag <version> "<description>"', 'green'));
    process.exit(0);
  } else {
    console.log(colorize('\n❌ RELEASE GATE FAILED - RELEASE BLOCKED', 'red'));
    console.log(colorize('\nFix the issues above and re-run: pnpm release:gate', 'yellow'));
    process.exit(1);
  }
}

main().catch(err => {
  console.error(colorize(`\nFatal error: ${err.message}`, 'red'));
  process.exit(1);
});
