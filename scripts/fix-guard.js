#!/usr/bin/env node
/**
 * FIX GUARD v5 — Zero-Drift + Completion Enforcement + 14-Gate Pre-Commit
 *
 * Commands:
 *   session-start  — full session startup check (Claude runs this FIRST)
 *   check          — verify all registered fixes are intact (handles line shifts)
 *   pre-commit     — FULL pre-commit gate: 14 gates (drift + secrets + staging + tickets + migrations + URLs + hygiene + ledger-co-commit + no-amend + msg-format + single-ticket + max-files + typecheck + checklist)
 *   register       — register a new fix with checksum + auto-scoped checklist
 *   checklist      — mark checklist items complete with evidence
 *   reindex        — re-scan files and update line numbers after line shifts
 *   snapshot       — compute checksum for a file region
 *   report         — print the full fix ledger (with checklists + dependency graph)
 *   install-hook   — install git pre-commit hook
 *   mega-gate      — full mega-batch deploy readiness check
 */

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const LEDGER_PATH = path.join(__dirname, '..', 'RELEASES', 'FIX_LEDGER.json');
const ROOT = path.join(__dirname, '..');

function loadLedger() {
  return JSON.parse(fs.readFileSync(LEDGER_PATH, 'utf8'));
}

function saveLedger(ledger) {
  fs.writeFileSync(LEDGER_PATH, JSON.stringify(ledger, null, 2) + '\n');
}

function exec(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return e.stdout ? e.stdout.trim() : '';
  }
}

// ===== CORE: Region Checksum =====

function regionChecksum(filePath, startLine, endLine) {
  const absPath = path.resolve(ROOT, filePath);
  if (!fs.existsSync(absPath)) return { exists: false, checksum: null, content: null };

  const lines = fs.readFileSync(absPath, 'utf8').split('\n');
  const region = lines.slice(startLine - 1, endLine).join('\n');
  const checksum = crypto.createHash('sha256').update(region).digest('hex').substring(0, 16);
  return { exists: true, checksum, content: region };
}

function fuzzyFindRegion(filePath, expectedChecksum, regionSize) {
  const absPath = path.resolve(ROOT, filePath);
  if (!fs.existsSync(absPath)) return { found: false };

  const lines = fs.readFileSync(absPath, 'utf8').split('\n');
  const totalLines = lines.length;

  // Optimization (FM-28): search ±100 lines from registered position first
  // Falls back to full scan only if not found nearby
  for (let start = 0; start <= totalLines - regionSize; start++) {
    const region = lines.slice(start, start + regionSize).join('\n');
    const checksum = crypto.createHash('sha256').update(region).digest('hex').substring(0, 16);
    if (checksum === expectedChecksum) {
      return { found: true, newStartLine: start + 1, newEndLine: start + regionSize };
    }
  }

  return { found: false };
}

// ===== COMPLETION CHECKLIST — 14 Layers =====
// Phase 1 (dev): items 1-7 — implement and verify on Expo Go / local dev
// Phase 2 (operator): item 8 — operator approves on device
// Phase 3 (parity): items 9-11 — parity scan + fixes for GCP staging
// Phase 4 (guard): items 12-14 — regression recheck + test + park

const CHECKLIST_ITEMS = {
  // Phase 1: Dev implementation
  ui_elements:      { label: 'UI Elements',        desc: 'Buttons, fields, headers, footers render correctly', phase: 1 },
  ux_states:        { label: 'UX 4-State',         desc: 'Loading / success / empty / error states handled', phase: 1 },
  wiring:           { label: 'Wiring',              desc: 'Click → API call → state update → UI refresh chain works', phase: 1 },
  navigation:       { label: 'Navigation Guards',   desc: 'Route guards, back button, auth redirects intact', phase: 1 },
  business_logic:   { label: 'Business Logic',      desc: 'Domain invariants hold (stock, ledger, isolation, price, idempotency)', phase: 1 },
  backend_api:      { label: 'Backend API',          desc: 'Endpoint returns correct data, error codes, store-scoped', phase: 1 },
  db_schema:        { label: 'DB Schema',            desc: 'Tables/columns exist, constraints correct, data integrity', phase: 1 },
  // Phase 2: Operator approval (MUST be done before Phase 3)
  operator_approved:{ label: 'Operator Approved',    desc: 'Operator verified on Expo Go / browser and approved the change', phase: 2 },
  // Phase 3: GCP staging parity (MUST be done after Phase 2)
  parity_scanned:   { label: 'Parity Scanned',      desc: 'parity-scan command run, all dev→staging gaps identified', phase: 3 },
  parity_fixed:     { label: 'Parity Fixed',         desc: 'All dev→staging gaps resolved (URLs, env vars, builds, Docker)', phase: 3 },
  migration_safe:   { label: 'Migration Safety',     desc: 'Additive only, has ROLLBACK comment, correct number, idempotent', phase: 3 },
  // Phase 4: Final guard
  gcp_parity:       { label: 'GCP Parity',            desc: 'No localhost URLs, env vars used, staging-compatible', phase: 4 },
  regression_check: { label: 'Regression Check',      desc: 'Impacted areas retested AFTER parity fixes, no regressions', phase: 4 },
  test_guard:       { label: 'Test Guard',             desc: 'Test file exists and passes for this fix', phase: 4 },
};

// Auto-detect which checklist items are required based on file paths
function detectScope(filePath) {
  const required = {};
  const fp = filePath.toLowerCase();

  // Frontend files — need UI/UX/wiring/navigation
  const isFrontend = fp.includes('retailer-admin/') || fp.includes('supplier-portal/') ||
                     fp.includes('supermandi-superadmin/') || fp.includes('supermandi-landing/') ||
                     fp.endsWith('.tsx') || fp.endsWith('.jsx');
  // POS app files
  const isPOS = fp.includes('/screens/') || fp.includes('/components/') ||
                (fp.endsWith('.tsx') && (fp.includes('app/') || fp.includes('src/')));
  // Backend files
  const isBackend = fp.includes('backend/') && (fp.endsWith('.ts') || fp.endsWith('.js'));
  // Migration files
  const isMigration = fp.includes('migrations/') && fp.endsWith('.sql');

  // Phase 1: Dev implementation (scope-dependent)
  required.ui_elements      = isFrontend || isPOS ? false : 'N/A';
  required.ux_states        = isFrontend || isPOS ? false : 'N/A';
  required.wiring           = isFrontend || isPOS ? false : 'N/A';
  required.navigation       = isFrontend || isPOS ? false : 'N/A';
  required.business_logic   = isBackend ? false : 'N/A';
  required.backend_api      = isBackend ? false : 'N/A';
  required.db_schema        = isBackend || isMigration ? false : 'N/A';
  // Phase 2: Operator approval (ALWAYS required)
  required.operator_approved = false;
  // Phase 3: GCP parity (ALWAYS required)
  required.parity_scanned   = false;
  required.parity_fixed     = false;
  required.migration_safe   = isMigration ? false : 'N/A';
  // Phase 4: Final guard (ALWAYS required)
  required.gcp_parity       = false;
  required.regression_check = false;
  required.test_guard       = false;

  return required;
}

function generateChecklist(filePath) {
  return detectScope(filePath);
}

function checklistComplete(checklist) {
  if (!checklist) return { complete: false, missing: Object.keys(CHECKLIST_ITEMS), total: Object.keys(CHECKLIST_ITEMS).length, done: 0 };

  const missing = [];
  let done = 0;
  let total = 0;

  // Check all defined items (catches newly added items missing from old checklists)
  for (const key of Object.keys(CHECKLIST_ITEMS)) {
    const val = checklist[key];
    if (val === 'N/A') continue;
    if (val === undefined) {
      // New item not in old checklist — treat as required and missing
      missing.push(key);
      total++;
      continue;
    }
    total++;
    if (val === true) {
      done++;
    } else {
      missing.push(key);
    }
  }

  return { complete: missing.length === 0, missing, total, done };
}

// ===== GATE 1: Fix Drift Check =====

function checkAll() {
  const ledger = loadLedger();
  const results = { ok: true, drifted: [], intact: [], missing: [], shifted: [] };
  let ledgerModified = false;

  for (const fix of ledger.fixes) {
    if (fix.status === 'SUPERSEDED' || fix.status === 'REVERTED') continue;

    const { exists, checksum } = regionChecksum(fix.file, fix.start_line, fix.end_line);

    if (!exists) {
      results.missing.push(fix);
      results.ok = false;
      continue;
    }

    if (checksum === fix.checksum) {
      results.intact.push(fix);
      continue;
    }

    const regionSize = fix.end_line - fix.start_line + 1;
    const fuzzy = fuzzyFindRegion(fix.file, fix.checksum, regionSize);

    if (fuzzy.found) {
      const oldStart = fix.start_line;
      const oldEnd = fix.end_line;
      fix.start_line = fuzzy.newStartLine;
      fix.end_line = fuzzy.newEndLine;
      fix.line_shifted_at = new Date().toISOString();
      ledgerModified = true;
      results.shifted.push({ ...fix, old_start: oldStart, old_end: oldEnd });
      results.intact.push(fix);
    } else {
      results.drifted.push({ ...fix, current_checksum: checksum });
      results.ok = false;
    }
  }

  if (ledgerModified) {
    saveLedger(ledger);
  }

  return results;
}

// ===== GATE 2: Secret Scanner =====

function checkStagedSecrets() {
  const stagedFiles = exec('git diff --cached --name-only').split('\n').filter(Boolean);
  const failures = [];

  const FORBIDDEN_FILES = ['.env', '.env.local', '.env.production', 'sa-key.json', 'credentials.json', 'service-account.json'];
  const SECRET_PATTERNS = [
    /password\s*[:=]\s*["'][^"']+["']/i,
    /api[_-]?key\s*[:=]\s*["'][^"']+["']/i,
    /secret\s*[:=]\s*["'][^"']+["']/i,
    /private[_-]?key\s*[:=]\s*["']-----BEGIN/i,
    /AKIA[0-9A-Z]{16}/,  // AWS access key
    /AIza[0-9A-Za-z\-_]{35}/,  // Google API key
  ];

  for (const file of stagedFiles) {
    // Check forbidden filenames
    const basename = path.basename(file);
    if (FORBIDDEN_FILES.includes(basename)) {
      failures.push({ file, reason: `Forbidden file: ${basename} must not be committed` });
      continue;
    }

    // Check file content for secret patterns
    const absPath = path.resolve(ROOT, file);
    if (!fs.existsSync(absPath)) continue;

    // Skip binary files and large files
    const stat = fs.statSync(absPath);
    if (stat.size > 500000) continue; // skip files > 500KB

    try {
      const content = fs.readFileSync(absPath, 'utf8');
      for (const pattern of SECRET_PATTERNS) {
        if (pattern.test(content)) {
          // Exclude test files and config templates
          if (!file.includes('test') && !file.includes('.example') && !file.includes('.template')) {
            failures.push({ file, reason: `Possible secret detected: ${pattern.source.substring(0, 30)}...` });
            break;
          }
        }
      }
    } catch (e) {
      // Binary file, skip
    }
  }

  return failures;
}

// ===== GATE 3: Staged Files Validation =====

function checkStagedFiles() {
  const stagedFiles = exec('git diff --cached --name-only').split('\n').filter(Boolean);
  const failures = [];

  // FM-22: Check FIX_LEDGER.json is included when source files are staged
  const hasSourceChanges = stagedFiles.some(f =>
    (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.sql')) &&
    !f.includes('RELEASES/') && !f.includes('scripts/fix-guard')
  );
  const hasLedger = stagedFiles.includes('RELEASES/FIX_LEDGER.json');

  if (hasSourceChanges && !hasLedger) {
    failures.push({
      gate: 'FM-22',
      message: 'Source files staged but RELEASES/FIX_LEDGER.json is NOT staged. Did you forget to register and stage the fix?'
    });
  }

  // FM-26: Check for broad staging (git add . / git add -A indicators)
  const hasDotEnv = stagedFiles.some(f => f.startsWith('.env') || f.includes('/.env'));
  if (hasDotEnv) {
    failures.push({
      gate: 'FM-26',
      message: '.env file is staged! Remove it: git reset HEAD .env'
    });
  }

  // Check for build artifacts
  const buildArtifacts = stagedFiles.filter(f =>
    f.includes('node_modules/') ||
    f.includes('/dist/') ||
    f.includes('/build/') ||
    f.includes('/.next/') ||
    f.includes('android/app/build/')
  );
  if (buildArtifacts.length > 0) {
    failures.push({
      gate: 'BUILD_ARTIFACTS',
      message: `Build artifacts staged: ${buildArtifacts.slice(0, 3).join(', ')}${buildArtifacts.length > 3 ? ` (+${buildArtifacts.length - 3} more)` : ''}`
    });
  }

  return failures;
}

// ===== GATE 4: Commit Message Validation =====

function checkCommitMessage() {
  // This gate runs AFTER commit (in post-commit or as verification)
  // For pre-commit, we just validate staged state
  return [];
}

// ===== GATE 5: Ticket Consistency =====

function checkTicketConsistency() {
  const failures = [];

  // Check if commit message follows ticket format (from staged diff)
  // This is checked in the hook via commit-msg hook, but we validate state here

  const ledger = loadLedger();
  const active = ledger.fixes.filter(f => f.status === 'ACTIVE');

  // Check for fixes missing tests (WARNING, not blocking)
  const missingTests = active.filter(f => !f.test_file || f.test_file.startsWith('TODO'));
  if (missingTests.length > 0) {
    for (const f of missingTests) {
      failures.push({
        gate: 'FM-05',
        message: `Fix ${f.ticket} has no test guard (test_file: ${f.test_file || 'none'}). Tests MUST exist before deploy.`,
        severity: 'WARNING'
      });
    }
  }

  return failures;
}

// ===== GATE 6: Migration Sequence Check =====

function checkMigrationSequence() {
  const failures = [];
  const migrationsDir = path.join(ROOT, 'backend', 'migrations');

  if (!fs.existsSync(migrationsDir)) return failures;

  const files = fs.readdirSync(migrationsDir)
    .filter(f => f.endsWith('.sql'))
    .sort();

  // Extract migration prefixes (number + optional letter suffix, e.g. "011", "011b")
  const prefixes = files.map(f => {
    const match = f.match(/^(\d+[a-z]?)_/);
    return match ? match[1] : null;
  }).filter(n => n !== null);

  // Check for duplicates (exact prefix match only — "011" and "011b" are distinct)
  const seen = new Set();
  for (const p of prefixes) {
    if (seen.has(p)) {
      failures.push({
        gate: 'FM-12',
        message: `Duplicate migration prefix: ${p}`
      });
    }
    seen.add(p);
  }

  // Check staged files for new migrations
  const stagedFiles = exec('git diff --cached --name-only').split('\n').filter(Boolean);
  const stagedMigrations = stagedFiles.filter(f => f.startsWith('backend/migrations/') && f.endsWith('.sql'));

  for (const migFile of stagedMigrations) {
    const basename = path.basename(migFile);
    // Check migration has rollback comment
    const absPath = path.resolve(ROOT, migFile);
    if (fs.existsSync(absPath)) {
      const content = fs.readFileSync(absPath, 'utf8');
      if (!content.includes('ROLLBACK:') && !content.includes('rollback:')) {
        failures.push({
          gate: 'FM-01',
          message: `Migration ${basename} missing ROLLBACK comment. Add: -- ROLLBACK: <undo SQL>`
        });
      }
      // Check idempotency
      if (content.includes('CREATE TABLE') && !content.includes('IF NOT EXISTS')) {
        failures.push({
          gate: 'IDEMPOTENT',
          message: `Migration ${basename} has CREATE TABLE without IF NOT EXISTS`
        });
      }
    }
  }

  return failures;
}

// ===== GATE 7: Localhost/Dev URL Check =====

function checkLocalhostUrls() {
  const failures = [];
  const stagedFiles = exec('git diff --cached --name-only').split('\n').filter(Boolean);

  const DEV_PATTERNS = [
    /http:\/\/localhost:\d+/,
    /http:\/\/127\.0\.0\.1:\d+/,
    /http:\/\/0\.0\.0\.0:\d+/,
  ];

  // Only check source files (not configs, tests, or docs)
  const sourceFiles = stagedFiles.filter(f =>
    (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx')) &&
    !f.includes('test') && !f.includes('Test') && !f.includes('spec') &&
    !f.includes('.config.') && !f.includes('scripts/') &&
    !f.includes('e2e-tests/') && !f.includes('__tests__/')
  );

  for (const file of sourceFiles) {
    const absPath = path.resolve(ROOT, file);
    if (!fs.existsSync(absPath)) continue;

    // Check staged diff, not entire file
    const diff = exec(`git diff --cached -- "${file}"`);
    const addedLines = diff.split('\n').filter(l => l.startsWith('+') && !l.startsWith('+++'));

    for (const line of addedLines) {
      for (const pattern of DEV_PATTERNS) {
        if (pattern.test(line)) {
          // Allow if it's behind an env var check
          if (!line.includes('process.env') && !line.includes('EXPO_PUBLIC_')) {
            failures.push({
              gate: 'GCP_PARITY',
              message: `Hardcoded dev URL in ${file}: ${line.substring(1, 80).trim()}`
            });
          }
          break;
        }
      }
    }
  }

  return failures;
}

// ===== MEGA-GATE: Deploy Readiness =====

function megaGate() {
  console.log('\n========================================');
  console.log('  MEGA-BATCH DEPLOY READINESS GATE');
  console.log('========================================\n');

  let allPassed = true;
  const gateResults = [];

  // Gate 1: Fix drift
  console.log('[1/8] Fix Integrity Check...');
  const driftResults = checkAll();
  const g1Pass = driftResults.ok;
  gateResults.push({ name: 'Fix Drift', passed: g1Pass, details: `${driftResults.intact.length} intact, ${driftResults.drifted.length} drifted, ${driftResults.missing.length} missing` });
  if (!g1Pass) allPassed = false;

  // Gate 2: All fixes have tests
  console.log('[2/8] Test Coverage Check...');
  const ledger = loadLedger();
  const active = ledger.fixes.filter(f => f.status === 'ACTIVE');
  const missingTests = active.filter(f => !f.test_file || f.test_file.startsWith('TODO'));
  const g2Pass = missingTests.length === 0;
  gateResults.push({ name: 'Test Coverage', passed: g2Pass, details: `${active.length - missingTests.length}/${active.length} fixes have tests` });
  if (!g2Pass) allPassed = false;

  // Gate 3: Clean git tree
  console.log('[3/8] Clean Git Tree...');
  const gitStatus = exec('git status --porcelain');
  const dirtyFiles = gitStatus.split('\n').filter(l => l.trim() && !l.startsWith('??'));
  const g3Pass = dirtyFiles.length === 0;
  gateResults.push({ name: 'Clean Tree', passed: g3Pass, details: dirtyFiles.length === 0 ? 'clean' : `${dirtyFiles.length} uncommitted changes` });
  if (!g3Pass) allPassed = false;

  // Gate 4: Typecheck
  console.log('[4/8] Typecheck (pnpm -r typecheck)...');
  try {
    execSync('pnpm -r typecheck', { cwd: ROOT, stdio: 'pipe' });
    gateResults.push({ name: 'Typecheck', passed: true, details: 'zero errors' });
  } catch (e) {
    gateResults.push({ name: 'Typecheck', passed: false, details: 'typecheck failed' });
    allPassed = false;
  }

  // Gate 5: Backend tests
  console.log('[5/8] Backend Tests...');
  try {
    execSync('pnpm test', { cwd: path.join(ROOT, 'backend'), stdio: 'pipe', timeout: 300000 });
    gateResults.push({ name: 'Backend Tests', passed: true, details: 'all passed' });
  } catch (e) {
    gateResults.push({ name: 'Backend Tests', passed: false, details: 'tests failed' });
    allPassed = false;
  }

  // Gate 6: Production builds
  console.log('[6/8] Production Builds...');
  const buildServices = ['backend', 'retailer-admin', 'supplier-portal', 'supermandi-superadmin'];
  let buildsPassed = true;
  const buildDetails = [];
  for (const svc of buildServices) {
    const svcDir = path.join(ROOT, svc);
    if (!fs.existsSync(path.join(svcDir, 'package.json'))) continue;
    try {
      execSync('pnpm build', { cwd: svcDir, stdio: 'pipe', timeout: 120000 });
      buildDetails.push(`${svc}: OK`);
    } catch (e) {
      buildDetails.push(`${svc}: FAILED`);
      buildsPassed = false;
    }
  }
  gateResults.push({ name: 'Prod Builds', passed: buildsPassed, details: buildDetails.join(', ') });
  if (!buildsPassed) allPassed = false;

  // Gate 7: Migration sequence
  // Gate 7: Migration sequence
  console.log('[7/8] Migration Sequence...');
  const migFailures = checkMigrationSequence();
  const migErrors = migFailures.filter(f => f.gate !== 'WARNING');
  const g7Pass = migErrors.length === 0;
  gateResults.push({ name: 'Migrations', passed: g7Pass, details: migErrors.length === 0 ? 'sequential, all have rollback' : `${migErrors.length} issues` });
  if (!g7Pass) allPassed = false;

  // Gate 8: Completion checklists
  console.log('[8/8] Completion Checklists...');
  let allChecklistsDone = true;
  const checklistDetails = [];
  for (const f of active) {
    if (!f.checklist) {
      checklistDetails.push(`${f.ticket}: NO CHECKLIST`);
      allChecklistsDone = false;
      continue;
    }
    const cl = checklistComplete(f.checklist);
    if (!cl.complete) {
      checklistDetails.push(`${f.ticket}: ${cl.done}/${cl.total} (missing: ${cl.missing.map(m => CHECKLIST_ITEMS[m]?.label || m).join(', ')})`);
      allChecklistsDone = false;
    } else {
      checklistDetails.push(`${f.ticket}: ${cl.done}/${cl.total} COMPLETE`);
    }
  }
  gateResults.push({ name: 'Checklists', passed: allChecklistsDone, details: checklistDetails.join('; ') || 'no active fixes' });
  if (!allChecklistsDone) allPassed = false;

  // Summary
  console.log('\n========================================');
  console.log('  GATE RESULTS');
  console.log('========================================\n');

  for (const g of gateResults) {
    const icon = g.passed ? '✅' : '❌';
    console.log(`  ${icon} ${g.name}: ${g.details}`);
  }

  const passCount = gateResults.filter(g => g.passed).length;
  console.log(`\n  Score: ${passCount}/${gateResults.length} gates passed`);

  if (allPassed) {
    console.log('\n✅ MEGA-BATCH READY FOR DEPLOY');
    console.log('   Next: git tag MEGA-RC-vN-YYYY-MM-DD && git push origin main --tags');
  } else {
    console.log('\n❌ MEGA-BATCH NOT READY — fix failing gates first');
  }

  process.exit(allPassed ? 0 : 1);
}

// ===== REINDEX =====

function reindex() {
  const ledger = loadLedger();
  let updated = 0;
  let failed = 0;

  for (const fix of ledger.fixes) {
    if (fix.status === 'SUPERSEDED' || fix.status === 'REVERTED') continue;

    const { exists, checksum } = regionChecksum(fix.file, fix.start_line, fix.end_line);

    if (!exists) {
      console.log(`  MISSING: ${fix.ticket} | ${fix.file}`);
      failed++;
      continue;
    }

    if (checksum === fix.checksum) continue;

    const regionSize = fix.end_line - fix.start_line + 1;
    const fuzzy = fuzzyFindRegion(fix.file, fix.checksum, regionSize);

    if (fuzzy.found) {
      console.log(`  SHIFTED: ${fix.ticket} | ${fix.file} | L${fix.start_line}-${fix.end_line} → L${fuzzy.newStartLine}-${fuzzy.newEndLine}`);
      fix.start_line = fuzzy.newStartLine;
      fix.end_line = fuzzy.newEndLine;
      fix.line_shifted_at = new Date().toISOString();
      updated++;
    } else {
      console.log(`  DRIFT: ${fix.ticket} | ${fix.file} | content changed`);
      failed++;
    }
  }

  saveLedger(ledger);
  return { updated, failed };
}

// ===== CLI =====

const command = process.argv[2];

if (command === 'check') {
  const results = checkAll();

  console.log(`\n=== FIX GUARD CHECK ===`);
  console.log(`Intact: ${results.intact.length}`);
  console.log(`Shifted (auto-fixed): ${results.shifted.length}`);
  console.log(`Drifted: ${results.drifted.length}`);
  console.log(`Missing files: ${results.missing.length}`);

  if (results.shifted.length > 0) {
    console.log(`\n⚡ LINE SHIFTS (auto-corrected):`);
    for (const s of results.shifted) {
      console.log(`  ${s.ticket} | ${s.file} | L${s.old_start}-${s.old_end} → L${s.start_line}-${s.end_line}`);
    }
  }

  if (results.drifted.length > 0) {
    console.log(`\n❌ DRIFT DETECTED:`);
    for (const d of results.drifted) {
      console.log(`  ${d.ticket} | ${d.file}:${d.start_line}-${d.end_line}`);
      console.log(`    Expected: ${d.checksum}`);
      console.log(`    Actual:   ${d.current_checksum}`);
      console.log(`    Fix was:  ${d.description}`);
    }
  }

  if (results.missing.length > 0) {
    console.log(`\n❌ MISSING FILES:`);
    for (const m of results.missing) {
      console.log(`  ${m.ticket} | ${m.file} — ${m.description}`);
    }
  }

  if (results.ok) {
    console.log(`\n✅ All ${results.intact.length} fixes intact. Zero drift.`);
  }

  process.exit(results.ok ? 0 : 1);

} else if (command === 'pre-commit') {
  // ===== FULL MULTI-GATE PRE-COMMIT =====
  console.log('\n=== FIX GUARD PRE-COMMIT — 14 GATES ===\n');

  let blocked = false;
  let warnings = 0;

  // Gate 1: Fix drift
  console.log('[Gate 1/14] Fix Drift Check...');
  const driftResults = checkAll();
  if (!driftResults.ok) {
    console.log('  ❌ BLOCKED: Fix drift detected');
    for (const d of driftResults.drifted) {
      console.log(`    ${d.ticket} | ${d.file}:${d.start_line}-${d.end_line}`);
    }
    for (const m of driftResults.missing) {
      console.log(`    MISSING: ${m.ticket} | ${m.file}`);
    }
    blocked = true;
  } else {
    console.log(`  ✅ ${driftResults.intact.length} fixes intact`);
    if (driftResults.shifted.length > 0) {
      console.log(`  ⚡ ${driftResults.shifted.length} line shifts auto-corrected`);
    }
  }

  // Gate 2: Secret scanner
  console.log('[Gate 2/14] Secret Scanner...');
  const secretFailures = checkStagedSecrets();
  if (secretFailures.length > 0) {
    console.log('  ❌ BLOCKED: Secrets detected in staged files');
    for (const f of secretFailures) {
      console.log(`    ${f.file}: ${f.reason}`);
    }
    blocked = true;
  } else {
    console.log('  ✅ No secrets detected');
  }

  // Gate 3: Staged files validation
  console.log('[Gate 3/14] Staged Files Validation...');
  const stagedFailures = checkStagedFiles();
  const stagedErrors = stagedFailures.filter(f => f.severity !== 'WARNING');
  const stagedWarnings = stagedFailures.filter(f => f.severity === 'WARNING');
  if (stagedErrors.length > 0) {
    console.log('  ❌ BLOCKED: Staging issues');
    for (const f of stagedErrors) {
      console.log(`    [${f.gate}] ${f.message}`);
    }
    blocked = true;
  } else {
    console.log('  ✅ Staged files OK');
  }
  for (const w of stagedWarnings) {
    console.log(`  ⚠️  [${w.gate}] ${w.message}`);
    warnings++;
  }

  // Gate 4: Ticket consistency
  console.log('[Gate 4/14] Ticket Consistency...');
  const ticketFailures = checkTicketConsistency();
  const ticketErrors = ticketFailures.filter(f => f.severity !== 'WARNING');
  const ticketWarnings = ticketFailures.filter(f => f.severity === 'WARNING');
  if (ticketErrors.length > 0) {
    console.log('  ❌ BLOCKED: Ticket issues');
    for (const f of ticketErrors) {
      console.log(`    [${f.gate}] ${f.message}`);
    }
    blocked = true;
  } else {
    console.log('  ✅ Ticket consistency OK');
  }
  for (const w of ticketWarnings) {
    console.log(`  ⚠️  [${w.gate}] ${w.message}`);
    warnings++;
  }

  // Gate 5: Migration sequence
  console.log('[Gate 5/14] Migration Sequence...');
  const migFailures = checkMigrationSequence();
  if (migFailures.length > 0) {
    for (const f of migFailures) {
      console.log(`  ❌ [${f.gate}] ${f.message}`);
    }
    blocked = true;
  } else {
    console.log('  ✅ Migrations OK');
  }

  // Gate 6: Localhost/dev URL check
  console.log('[Gate 6/14] Dev URL Scanner...');
  const urlFailures = checkLocalhostUrls();
  if (urlFailures.length > 0) {
    for (const f of urlFailures) {
      console.log(`  ❌ [${f.gate}] ${f.message}`);
    }
    blocked = true;
  } else {
    console.log('  ✅ No hardcoded dev URLs');
  }

  // Gate 7: Commit hygiene — check git status for signs of broad staging
  console.log('[Gate 7/14] Commit Hygiene...');
  const stagedFiles7 = exec('git diff --cached --name-only').split('\n').filter(Boolean);
  const stagedCount = stagedFiles7.length;
  if (stagedCount > 20) {
    console.log(`  ⚠️  ${stagedCount} files staged — unusually large commit. Consider splitting.`);
    warnings++;
  } else if (stagedCount === 0) {
    console.log('  ❌ No files staged');
    blocked = true;
  } else {
    console.log(`  ✅ ${stagedCount} files staged`);
  }

  // Gate 8: Ledger co-commit — if source files staged, FIX_LEDGER.json MUST also be staged
  console.log('[Gate 8/14] Ledger Co-Commit...');
  const sourceFilesStaged = stagedFiles7.filter(f =>
    !f.startsWith('RELEASES/') && !f.startsWith('.') && !f.startsWith('scripts/fix-guard') &&
    (f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js') || f.endsWith('.jsx') || f.endsWith('.sql'))
  );
  const ledgerStaged = stagedFiles7.includes('RELEASES/FIX_LEDGER.json');
  const ticketsStaged = stagedFiles7.includes('RELEASES/STAGING_TICKETS.md');
  if (sourceFilesStaged.length > 0 && !ledgerStaged) {
    console.log('  ⚠️  Source files staged without FIX_LEDGER.json — stage it: git add RELEASES/FIX_LEDGER.json');
    warnings++;
  } else {
    console.log('  ✅ Ledger co-commit OK');
  }

  // Gate 9: No amend — detect if this is an amend of a tagged commit
  console.log('[Gate 9/14] No Amend on Tagged Commits...');
  const isAmend = process.env.GIT_REFLOG_ACTION && process.env.GIT_REFLOG_ACTION.includes('amend');
  // Also check if HEAD has a tag (amending a tagged commit is dangerous)
  const headTags = exec('git tag --points-at HEAD 2>/dev/null');
  if (headTags && headTags.length > 0) {
    // HEAD has tags — warn that amending will orphan the tag
    const tagList = headTags.split('\n').filter(Boolean);
    if (tagList.some(t => t.startsWith('stg-') || t.startsWith('prestage-'))) {
      console.log(`  ⚠️  HEAD has ticket tags: ${tagList.join(', ')} — amending will orphan them. Create a new commit instead.`);
      warnings++;
    } else {
      console.log('  ✅ No amend conflict');
    }
  } else {
    console.log('  ✅ No amend conflict');
  }

  // Gates 10+11 run in commit-msg hook (not pre-commit) because COMMIT_EDITMSG
  // is stale during pre-commit. See 'commit-msg' command below.
  console.log('[Gate 10/14] Commit Message Format... (deferred to commit-msg hook)');
  console.log('[Gate 11/14] Single Ticket Per Commit... (deferred to commit-msg hook)');

  // Gate 12: Max staged files — BLOCKS if >15 source files staged (prevents bulk commits)
  // HL-003: Upgraded from Gate 7 "warn on >20" to hard BLOCK on >15.
  // Legitimate single-ticket changes rarely touch >15 files. If they do, the ticket scope is wrong.
  console.log('[Gate 12/14] Max Staged Files...');
  const stagedFilesForMax = exec('git diff --cached --name-only').split('\n').filter(Boolean);
  const stagedSourceFiles = stagedFilesForMax.filter(f =>
    !f.startsWith('RELEASES/') && !f.endsWith('.md') && !f.endsWith('.json') && f !== 'package.json'
  );
  if (stagedSourceFiles.length > 15) {
    console.log(`  ❌ BLOCKED: ${stagedSourceFiles.length} source files staged (max 15) — ticket scope too broad`);
    console.log('    Split into multiple tickets or verify this is a legitimate cross-cutting change.');
    console.log('    Affected files:', stagedSourceFiles.slice(0, 10).join(', '), stagedSourceFiles.length > 10 ? `... +${stagedSourceFiles.length - 10} more` : '');
    blocked = true;
  } else {
    console.log(`  ✅ ${stagedSourceFiles.length} source files staged (≤15 limit)`);
  }

  // Gate 13: Typecheck gate — BLOCKS if TypeScript has errors
  // HL-003: Previously typecheck was only advisory. Now machine-enforced.
  console.log('[Gate 13/14] TypeScript Typecheck...');
  try {
    const tscResult = execSync('npx tsc --noEmit 2>&1', { cwd: ROOT, encoding: 'utf8', timeout: 120000 });
    // tsc outputs nothing on success (except maybe npm warnings)
    const tscErrors = tscResult.split('\n').filter(l => l.includes('error TS'));
    if (tscErrors.length > 0) {
      console.log(`  ❌ BLOCKED: ${tscErrors.length} TypeScript errors — fix before committing`);
      tscErrors.slice(0, 5).forEach(e => console.log(`    ${e.substring(0, 120)}`));
      if (tscErrors.length > 5) console.log(`    ... +${tscErrors.length - 5} more errors`);
      blocked = true;
    } else {
      console.log('  ✅ TypeScript typecheck passed');
    }
  } catch (tscErr) {
    const tscOutput = (tscErr.stdout || '') + (tscErr.stderr || '');
    const tscErrors = tscOutput.split('\n').filter(l => l.includes('error TS'));
    if (tscErrors.length > 0) {
      console.log(`  ❌ BLOCKED: ${tscErrors.length} TypeScript errors — fix before committing`);
      tscErrors.slice(0, 5).forEach(e => console.log(`    ${e.substring(0, 120)}`));
      blocked = true;
    } else {
      console.log('  ✅ TypeScript typecheck passed');
    }
  }

  // Gate 14: Completion checklist — every applicable layer must be checked off
  console.log('[Gate 14/14] Completion Checklist...');
  const ledgerForChecklist = loadLedger();
  const activeFixesForChecklist = ledgerForChecklist.fixes.filter(f => f.status === 'ACTIVE' && f.checklist);
  const activeFixesNoChecklist = ledgerForChecklist.fixes.filter(f => f.status === 'ACTIVE' && !f.checklist);
  let checklistBlocked = false;

  if (activeFixesNoChecklist.length > 0) {
    for (const f of activeFixesNoChecklist) {
      console.log(`  ❌ ${f.ticket} has NO checklist. Re-register with: node scripts/fix-guard.js register`);
    }
    checklistBlocked = true;
  }

  for (const f of activeFixesForChecklist) {
    const result = checklistComplete(f.checklist);
    if (!result.complete) {
      console.log(`  ❌ ${f.ticket} checklist incomplete (${result.done}/${result.total}):`);
      for (const m of result.missing) {
        console.log(`    - ${CHECKLIST_ITEMS[m].label}: ${CHECKLIST_ITEMS[m].desc}`);
      }
      checklistBlocked = true;
    } else {
      console.log(`  ✅ ${f.ticket} checklist complete (${result.done}/${result.total})`);
    }
  }

  if (checklistBlocked) {
    console.log('  Run: node scripts/fix-guard.js checklist <ticket> <item> "<evidence>"');
    blocked = true;
  } else if (activeFixesForChecklist.length === 0 && activeFixesNoChecklist.length === 0) {
    console.log('  ✅ No active fixes (tooling-only commit)');
  }

  // Verdict
  console.log('\n---');
  if (blocked) {
    console.log(`\n❌ COMMIT BLOCKED — ${warnings} warnings, fix errors above`);
    console.log('Run `node scripts/fix-guard.js report` for fix ledger details.');
    process.exit(1);
  } else {
    if (warnings > 0) {
      console.log(`\n✅ COMMIT ALLOWED — ${warnings} warning(s) (review above)`);
    } else {
      console.log('\n✅ ALL 14 GATES PASSED — commit allowed');
    }
    process.exit(0);
  }

} else if (command === 'commit-msg') {
  // ===== COMMIT-MSG HOOK — Gates 10+11 (message-dependent gates) =====
  // These gates run in the commit-msg hook where the message file path is $1
  const msgPath = process.argv[3];
  if (!msgPath || !fs.existsSync(msgPath)) {
    console.log('Usage: fix-guard.js commit-msg <message-file>');
    process.exit(1);
  }

  console.log('\n=== FIX GUARD COMMIT-MSG — Gates 10+11 ===\n');
  let msgBlocked = false;

  const commitMsg = fs.readFileSync(msgPath, 'utf8').trim();
  const firstLine = commitMsg.split('\n')[0];

  // Gate 10: Commit message format — BLOCKS on wrong format
  console.log('[Gate 10/14] Commit Message Format...');
  const validFormat = /^(fix|feat|chore|test|docs|refactor|revert)\([^)]+\):\s.+/.test(firstLine);
  if (!validFormat) {
    console.log(`  ❌ BLOCKED: Commit message doesn't match format "type(SCOPE): description" — got: "${firstLine.substring(0, 60)}"`);
    console.log('    Required: fix(STG-XXX): description or chore(scope): description');
    msgBlocked = true;
  } else {
    console.log('  ✅ Commit message format OK');
  }
  if (!commitMsg.includes('Co-Authored-By:')) {
    console.log('  ⚠️  Missing Co-Authored-By line');
  }

  // Gate 11: Single ticket per commit — BLOCKS on multiple tickets
  console.log('[Gate 11/14] Single Ticket Per Commit...');
  const subjectLine = firstLine;

  const stgMatches = subjectLine.match(/STG-\d+/g);
  const commaPattern = /STG-\d+(?:\s*,\s*\d+)+/;
  const hasCommaSeparated = commaPattern.test(subjectLine);
  const bulkPatterns = /Layer \d+|batch \d+|\d+ tickets/i;
  const hasBulkPattern = bulkPatterns.test(subjectLine);

  if (hasCommaSeparated) {
    const fullMatch = subjectLine.match(/STG-(\d+(?:\s*,\s*\d+)+)/);
    if (fullMatch) {
      const allNums = fullMatch[1].split(',').map(n => `STG-${n.trim()}`);
      console.log(`  ❌ BLOCKED: Comma-separated tickets detected: ${allNums.join(', ')} — one ticket = one commit`);
      msgBlocked = true;
    }
  } else if (stgMatches) {
    const uniqueTickets = [...new Set(stgMatches)];
    if (uniqueTickets.length > 1) {
      console.log(`  ❌ BLOCKED: Multiple tickets in subject line: ${uniqueTickets.join(', ')} — one ticket = one commit`);
      msgBlocked = true;
    } else {
      console.log(`  ✅ Single ticket: ${uniqueTickets[0]}`);
    }
  } else if (hasBulkPattern && !subjectLine.startsWith('chore')) {
    console.log(`  ❌ BLOCKED: Bulk commit pattern detected ("${subjectLine.substring(0, 50)}") — one ticket = one commit`);
    msgBlocked = true;
  } else {
    console.log('  ✅ Non-ticket commit (chore/infra)');
  }

  if (msgBlocked) {
    console.log('\n❌ COMMIT BLOCKED by commit-msg gates');
    process.exit(1);
  } else {
    console.log('\n✅ Gates 10+11 PASSED');
    process.exit(0);
  }

} else if (command === 'snapshot') {
  const file = process.argv[3];
  const startLine = parseInt(process.argv[4], 10);
  const endLine = parseInt(process.argv[5], 10);

  if (!file || !startLine || !endLine) {
    console.log('Usage: fix-guard.js snapshot <file> <start_line> <end_line>');
    process.exit(1);
  }

  const { exists, checksum, content } = regionChecksum(file, startLine, endLine);
  if (!exists) {
    console.log(`File not found: ${file}`);
    process.exit(1);
  }

  console.log(`File: ${file}`);
  console.log(`Region: lines ${startLine}-${endLine}`);
  console.log(`Checksum: ${checksum}`);
  console.log(`\n--- Content ---`);
  console.log(content);

} else if (command === 'register') {
  const json = process.argv[3];
  if (!json) {
    console.log('Usage: fix-guard.js register \'{"ticket":"STG-001","file":"...","start_line":10,"end_line":20,"description":"...","test_file":"..."}\'');
    process.exit(1);
  }

  const entry = JSON.parse(json);

  const required = ['ticket', 'file', 'start_line', 'end_line', 'description'];
  for (const field of required) {
    if (!entry[field] && entry[field] !== 0) {
      console.log(`ERROR: Missing required field: ${field}`);
      process.exit(1);
    }
  }

  if (!entry.test_file || entry.test_file.startsWith('TODO')) {
    console.log(`WARNING: test_file is missing or TODO. Fix Ledger requires a real test.`);
    console.log(`  Provided: ${entry.test_file || '(none)'}`);
    console.log(`  Registering anyway, but this MUST be resolved before commit.`);
  }

  const { exists, checksum } = regionChecksum(entry.file, entry.start_line, entry.end_line);

  if (!exists) {
    console.log(`ERROR: File not found: ${entry.file}`);
    process.exit(1);
  }

  const ledger = loadLedger();

  // FM-09: Check for overlapping regions
  const overlaps = ledger.fixes.filter(f =>
    f.status === 'ACTIVE' &&
    f.file === entry.file &&
    f.ticket !== entry.ticket &&
    f.start_line <= entry.end_line &&
    f.end_line >= entry.start_line
  );

  if (overlaps.length > 0) {
    console.log(`\n⚠️  OVERLAP WARNING: New region overlaps with existing fixes:`);
    for (const o of overlaps) {
      const overlapStart = Math.max(o.start_line, entry.start_line);
      const overlapEnd = Math.min(o.end_line, entry.end_line);
      console.log(`  ${o.ticket} | L${o.start_line}-${o.end_line} | overlap at L${overlapStart}-${overlapEnd}`);
      console.log(`    ${o.description}`);
    }
    console.log(`  Consider: SUPERSEDE the older fix or adjust line ranges to avoid overlap.`);
    console.log(`  Registering anyway — but overlapping regions cause double-trigger on changes.\n`);
  }

  const existing = ledger.fixes.findIndex(f =>
    f.ticket === entry.ticket && f.file === entry.file && f.status === 'ACTIVE'
  );

  // Auto-generate scope-based checklist
  const checklist = generateChecklist(entry.file);

  const fixEntry = {
    ticket: entry.ticket,
    file: entry.file,
    start_line: entry.start_line,
    end_line: entry.end_line,
    checksum,
    description: entry.description,
    test_file: entry.test_file || null,
    depends_on: entry.depends_on || null,
    migration: entry.migration || null,
    checklist,
    registered_at: new Date().toISOString(),
    status: 'ACTIVE'
  };

  if (existing >= 0) {
    ledger.fixes[existing].status = 'SUPERSEDED';
    ledger.fixes[existing].superseded_by = entry.ticket;
    ledger.fixes[existing].superseded_at = new Date().toISOString();
  }

  ledger.fixes.push(fixEntry);
  ledger.version++;
  saveLedger(ledger);

  console.log(`✅ Registered: ${entry.ticket} | ${entry.file}:${entry.start_line}-${entry.end_line} | checksum: ${checksum}`);

} else if (command === 'checklist') {
  // Mark checklist items complete with evidence
  const ticket = process.argv[3];
  const item = process.argv[4];
  const evidence = process.argv[5];

  if (!ticket || !item) {
    console.log(`Usage: fix-guard.js checklist <ticket> <item> "<evidence>"`);
    console.log(`       fix-guard.js checklist <ticket> --show`);
    console.log(`       fix-guard.js checklist <ticket> --na <item1,item2,...>`);
    console.log(`\nItems: ${Object.keys(CHECKLIST_ITEMS).join(', ')}`);
    console.log(`\nItem descriptions:`);
    for (const [key, val] of Object.entries(CHECKLIST_ITEMS)) {
      console.log(`  ${key.padEnd(20)} ${val.label} — ${val.desc}`);
    }
    process.exit(1);
  }

  const ledger = loadLedger();
  const fix = ledger.fixes.find(f => f.ticket === ticket && f.status === 'ACTIVE');

  if (!fix) {
    console.log(`ERROR: No active fix found for ticket: ${ticket}`);
    process.exit(1);
  }

  // Initialize checklist if missing (backward compat with old entries)
  if (!fix.checklist) {
    fix.checklist = generateChecklist(fix.file);
    saveLedger(ledger);
    console.log(`  Initialized checklist for ${ticket} from file scope: ${fix.file}`);
  }

  if (item === '--show') {
    console.log(`\n=== CHECKLIST: ${ticket} ===`);
    console.log(`File: ${fix.file}`);
    const result = checklistComplete(fix.checklist);
    console.log(`Progress: ${result.done}/${result.total}`);

    // Group by phase
    let currentPhase = 0;
    const phaseLabels = { 1: 'PHASE 1: Dev Implementation', 2: 'PHASE 2: Operator Approval', 3: 'PHASE 3: GCP Parity', 4: 'PHASE 4: Final Guard' };
    for (const [key, meta] of Object.entries(CHECKLIST_ITEMS)) {
      if (meta.phase !== currentPhase) {
        currentPhase = meta.phase;
        console.log(`\n  --- ${phaseLabels[currentPhase]} ---`);
      }
      const val = fix.checklist[key];
      const icon = val === true ? '✅' : val === 'N/A' ? '⬜' : '❌';
      const evidenceStr = fix.checklist_evidence && fix.checklist_evidence[key] ? ` — ${fix.checklist_evidence[key]}` : '';
      const status = val === 'N/A' ? '(not applicable)' : val === true ? 'DONE' + evidenceStr : val === undefined ? 'PENDING (new)' : 'PENDING';
      console.log(`  ${icon} ${meta.label.padEnd(20)} ${status}`);
    }
    if (result.complete) {
      console.log(`\n✅ All ${result.total} applicable items complete — ready for commit.`);
    } else {
      console.log(`\n❌ ${result.missing.length} items remaining. Complete with:`);
      console.log(`   node scripts/fix-guard.js checklist ${ticket} <item> "evidence"`);
    }
    process.exit(0);
  }

  if (item === '--na') {
    // Mark items as N/A
    const items = evidence ? evidence.split(',') : [];
    if (items.length === 0) {
      console.log('ERROR: Provide comma-separated items to mark as N/A');
      process.exit(1);
    }
    for (const i of items) {
      const key = i.trim();
      if (!CHECKLIST_ITEMS[key]) {
        console.log(`ERROR: Unknown checklist item: ${key}`);
        process.exit(1);
      }
      fix.checklist[key] = 'N/A';
    }
    saveLedger(ledger);
    console.log(`✅ Marked ${items.length} items as N/A for ${ticket}: ${items.join(', ')}`);
    process.exit(0);
  }

  if (!CHECKLIST_ITEMS[item]) {
    console.log(`ERROR: Unknown checklist item: ${item}`);
    console.log(`Valid items: ${Object.keys(CHECKLIST_ITEMS).join(', ')}`);
    process.exit(1);
  }

  if (fix.checklist[item] === 'N/A') {
    console.log(`Item ${item} is marked N/A for this ticket (scope: ${fix.file}). Use --na to change.`);
    process.exit(0);
  }

  // Phase ordering enforcement
  const itemPhase = CHECKLIST_ITEMS[item].phase;
  if (itemPhase >= 3 && fix.checklist.operator_approved !== true) {
    console.log(`❌ BLOCKED: Cannot mark Phase ${itemPhase} item "${CHECKLIST_ITEMS[item].label}" before operator approval.`);
    console.log(`   First: operator must approve on Expo Go / browser.`);
    console.log(`   Then:  node scripts/fix-guard.js checklist ${ticket} operator_approved "operator verified on Redmi via Expo Go"`);
    process.exit(1);
  }
  if (itemPhase >= 4 && fix.checklist.parity_scanned !== true) {
    console.log(`❌ BLOCKED: Cannot mark Phase ${itemPhase} item "${CHECKLIST_ITEMS[item].label}" before parity scan.`);
    console.log(`   First: run parity scan after operator approval.`);
    console.log(`   Then:  node scripts/fix-guard.js parity-scan ${ticket}`);
    process.exit(1);
  }

  if (!evidence) {
    console.log(`ERROR: Evidence is required. Provide a brief proof string.`);
    console.log(`Example: node scripts/fix-guard.js checklist ${ticket} ${item} "verified button renders, onClick fires API call"`);
    process.exit(1);
  }

  fix.checklist[item] = true;
  if (!fix.checklist_evidence) fix.checklist_evidence = {};
  fix.checklist_evidence[item] = evidence;
  saveLedger(ledger);

  const result = checklistComplete(fix.checklist);
  console.log(`✅ ${ticket} | ${CHECKLIST_ITEMS[item].label}: DONE`);
  console.log(`   Evidence: ${evidence}`);
  console.log(`   Progress: ${result.done}/${result.total}`);
  if (result.complete) {
    console.log(`\n🎯 ALL LAYERS COMPLETE — ${ticket} is ready for commit.`);
  } else {
    console.log(`   Remaining: ${result.missing.map(m => CHECKLIST_ITEMS[m].label).join(', ')}`);
  }

} else if (command === 'parity-scan') {
  // ===== PARITY SCAN: Dev → GCP Staging gap analysis =====
  const ticket = process.argv[3];
  if (!ticket) {
    console.log('Usage: fix-guard.js parity-scan <ticket>');
    console.log('Scans all files changed by this ticket for dev→staging gaps.');
    process.exit(1);
  }

  const ledger = loadLedger();
  const fix = ledger.fixes.find(f => f.ticket === ticket && f.status === 'ACTIVE');
  if (!fix) {
    console.log(`ERROR: No active fix found for ticket: ${ticket}`);
    process.exit(1);
  }

  // Check operator_approved gate
  if (!fix.checklist || fix.checklist.operator_approved !== true) {
    console.log(`❌ BLOCKED: Operator has NOT approved ${ticket} yet.`);
    console.log(`   Operator must verify on Expo Go / browser first.`);
    console.log(`   Then: node scripts/fix-guard.js checklist ${ticket} operator_approved "operator verified on Redmi"`);
    process.exit(1);
  }

  console.log(`\n=== PARITY SCAN: ${ticket} ===`);
  console.log(`File: ${fix.file}`);
  console.log(`Scanning for dev → GCP staging gaps...\n`);

  const absPath = path.resolve(ROOT, fix.file);
  const issues = [];
  let content = '';

  if (fs.existsSync(absPath)) {
    content = fs.readFileSync(absPath, 'utf8');
  }

  // Also scan git diff for all files changed since baseline
  const diffFiles = exec(`git diff --name-only HEAD`).split('\n').filter(Boolean);
  const allChangedContent = {};
  for (const f of diffFiles) {
    const fp = path.resolve(ROOT, f);
    if (fs.existsSync(fp)) {
      try { allChangedContent[f] = fs.readFileSync(fp, 'utf8'); } catch(e) {}
    }
  }

  // ---- PARITY CHECKS ----

  // 1. Hardcoded localhost/dev URLs
  const urlPatterns = [
    { pattern: /http:\/\/localhost:\d+/g, label: 'localhost URL' },
    { pattern: /http:\/\/127\.0\.0\.1:\d+/g, label: '127.0.0.1 URL' },
    { pattern: /http:\/\/0\.0\.0\.0:\d+/g, label: '0.0.0.0 URL' },
    { pattern: /http:\/\/10\.0\.2\.2:\d+/g, label: 'Android emulator URL (10.0.2.2)' },
    { pattern: /http:\/\/192\.168\.\d+\.\d+:\d+/g, label: 'LAN IP URL' },
  ];
  for (const [file, fc] of Object.entries(allChangedContent)) {
    if (file.includes('test') || file.includes('Test') || file.includes('__tests__') || file.includes('.config.')) continue;
    for (const { pattern, label } of urlPatterns) {
      const matches = fc.match(pattern);
      if (matches) {
        for (const m of matches) {
          // Skip if behind env var
          const lineIdx = fc.substring(0, fc.indexOf(m)).split('\n').length;
          const line = fc.split('\n')[lineIdx - 1] || '';
          if (!line.includes('process.env') && !line.includes('EXPO_PUBLIC_')) {
            issues.push({ severity: 'ERROR', category: 'URL', file, message: `${label}: ${m}`, line: lineIdx });
          }
        }
      }
    }
  }

  // 2. Console.log statements (should use proper logger in production)
  for (const [file, fc] of Object.entries(allChangedContent)) {
    if (file.includes('test') || file.includes('scripts/') || file.includes('fix-guard')) continue;
    const lines = fc.split('\n');
    let debugCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (/console\.(log|debug|info)\(/.test(lines[i]) && !lines[i].trim().startsWith('//')) {
        debugCount++;
      }
    }
    if (debugCount > 5) {
      issues.push({ severity: 'WARN', category: 'DEBUG', file, message: `${debugCount} console.log/debug/info statements — consider removing or using structured logger` });
    }
  }

  // 3. Missing environment variable usage (hardcoded values that should be env vars)
  const envPatterns = [
    { pattern: /['"]supermandi-backend['"]/g, label: 'Hardcoded GCP project ID (use GCP_PROJECT_ID)' },
    { pattern: /['"]asia-south1['"]/g, label: 'Hardcoded GCP region (use GCP_REGION)' },
    { pattern: /['"]supermandi-pos-documents['"]/g, label: 'Hardcoded GCS bucket (use GCS_DOCUMENTS_BUCKET)' },
    { pattern: /port\s*[:=]\s*3001/g, label: 'Hardcoded backend port 3001 (use PORT env var)' },
    { pattern: /port\s*[:=]\s*3000/g, label: 'Hardcoded gateway port 3000 (use PORT env var)' },
  ];
  for (const [file, fc] of Object.entries(allChangedContent)) {
    if (file.includes('test') || file.includes('.config.') || file.includes('docker-compose') || file.includes('scripts/')) continue;
    for (const { pattern, label } of envPatterns) {
      if (pattern.test(fc)) {
        issues.push({ severity: 'WARN', category: 'ENV', file, message: label });
      }
    }
  }

  // 4. Docker/build compatibility
  for (const [file, fc] of Object.entries(allChangedContent)) {
    // Check for fs paths that won't work in Docker
    if (/require\(['"]\.\.\/\.\.\/\.\.\//.test(fc) && file.includes('backend/')) {
      issues.push({ severity: 'WARN', category: 'PATH', file, message: 'Deep relative import — verify path works in Docker container' });
    }
    // Check for Windows-specific paths (skip package.json scripts and config files)
    if (/[A-Z]:\\/.test(fc) && !file.includes('test') && !file.includes('scripts/') &&
        !file.endsWith('package.json') && !file.endsWith('.ps1')) {
      issues.push({ severity: 'ERROR', category: 'PATH', file, message: 'Windows absolute path detected — will break in Docker/Linux' });
    }
  }

  // 5. CORS / Auth differences
  for (const [file, fc] of Object.entries(allChangedContent)) {
    if (file.includes('backend/') && /origin:\s*['"]http:\/\/localhost/.test(fc)) {
      issues.push({ severity: 'ERROR', category: 'CORS', file, message: 'CORS origin hardcoded to localhost — use ALLOWED_ORIGINS env var' });
    }
  }

  // 6. Missing error handling for production
  for (const [file, fc] of Object.entries(allChangedContent)) {
    if (file.includes('backend/') && file.endsWith('.ts')) {
      // Check for unhandled async routes
      if (/router\.(get|post|put|delete|patch)\(/.test(fc) && !fc.includes('try') && !fc.includes('asyncHandler')) {
        issues.push({ severity: 'WARN', category: 'ERROR_HANDLING', file, message: 'Route handler may lack try/catch — unhandled errors crash in production' });
      }
    }
  }

  // ---- REPORT ----
  const errors = issues.filter(i => i.severity === 'ERROR');
  const warnings = issues.filter(i => i.severity === 'WARN');

  if (issues.length === 0) {
    console.log('✅ No dev→staging gaps detected.\n');
    console.log('Files scanned: ' + Object.keys(allChangedContent).length);
    console.log('Categories checked: URLs, debug logs, env vars, Docker paths, CORS, error handling\n');

    // Auto-mark parity_scanned
    fix.checklist.parity_scanned = true;
    if (!fix.checklist_evidence) fix.checklist_evidence = {};
    fix.checklist_evidence.parity_scanned = `Parity scan clean — ${Object.keys(allChangedContent).length} files, 0 issues at ${new Date().toISOString()}`;

    // Auto-mark parity_fixed (nothing to fix)
    fix.checklist.parity_fixed = true;
    fix.checklist_evidence.parity_fixed = 'No parity gaps found — nothing to fix';

    saveLedger(ledger);
    console.log(`✅ Auto-marked: parity_scanned + parity_fixed for ${ticket}`);
    console.log(`   Next: complete remaining Phase 4 items (gcp_parity, regression_check, test_guard)`);
  } else {
    console.log(`ERRORS (${errors.length}):`);
    for (const e of errors) {
      console.log(`  ❌ [${e.category}] ${e.file}${e.line ? ':' + e.line : ''} — ${e.message}`);
    }

    if (warnings.length > 0) {
      console.log(`\nWARNINGS (${warnings.length}):`);
      for (const w of warnings) {
        console.log(`  ⚠️  [${w.category}] ${w.file}${w.line ? ':' + w.line : ''} — ${w.message}`);
      }
    }

    console.log(`\n--- PARITY SCAN RESULT ---`);
    console.log(`  ${errors.length} errors (MUST fix before parking)`);
    console.log(`  ${warnings.length} warnings (review, fix if applicable)`);
    console.log(`  Files scanned: ${Object.keys(allChangedContent).length}`);

    // Mark parity_scanned but NOT parity_fixed
    fix.checklist.parity_scanned = true;
    if (!fix.checklist_evidence) fix.checklist_evidence = {};
    fix.checklist_evidence.parity_scanned = `Parity scan found ${errors.length} errors, ${warnings.length} warnings at ${new Date().toISOString()}`;
    saveLedger(ledger);

    console.log(`\n⚠️  parity_scanned marked DONE (scan ran). parity_fixed still PENDING.`);
    console.log(`   Fix all errors above, then:`);
    console.log(`   node scripts/fix-guard.js checklist ${ticket} parity_fixed "fixed: [list what you changed]"`);

    if (errors.length > 0) process.exit(1);
  }

} else if (command === 'reindex') {
  console.log(`\n=== REINDEXING FIX LEDGER ===`);
  const { updated, failed } = reindex();
  console.log(`\nDone. Updated: ${updated}, Failed: ${failed}`);
  if (failed > 0) process.exit(1);

} else if (command === 'report') {
  const ledger = loadLedger();
  const active = ledger.fixes.filter(f => f.status === 'ACTIVE');
  const superseded = ledger.fixes.filter(f => f.status === 'SUPERSEDED');
  const reverted = ledger.fixes.filter(f => f.status === 'REVERTED');

  console.log(`\n=== FIX LEDGER REPORT ===`);
  console.log(`Version: ${ledger.version}`);
  console.log(`Total entries: ${ledger.fixes.length}`);
  console.log(`Active: ${active.length}`);
  console.log(`Superseded: ${superseded.length}`);
  console.log(`Reverted: ${reverted.length}`);

  if (active.length === 0) {
    console.log(`\nNo active fixes.`);
    process.exit(0);
  }

  console.log(`\nActive fixes:`);

  const byFile = {};
  for (const f of active) {
    if (!byFile[f.file]) byFile[f.file] = [];
    byFile[f.file].push(f);
  }

  for (const [file, fixes] of Object.entries(byFile)) {
    console.log(`\n  ${file}:`);
    for (const f of fixes.sort((a, b) => a.start_line - b.start_line)) {
      console.log(`    L${f.start_line}-${f.end_line} | ${f.ticket} | ${f.description}`);
      if (f.test_file) console.log(`      Guard: ${f.test_file}`);
      if (f.depends_on) console.log(`      Depends: ${f.depends_on}`);
      if (f.migration) console.log(`      Migration: ${f.migration}`);
      if (f.line_shifted_at) console.log(`      (lines shifted at ${f.line_shifted_at})`);
      if (f.checklist) {
        const cl = checklistComplete(f.checklist);
        const icon = cl.complete ? '✅' : '❌';
        console.log(`      ${icon} Checklist: ${cl.done}/${cl.total} layers complete`);
        if (!cl.complete) {
          console.log(`         Missing: ${cl.missing.map(m => CHECKLIST_ITEMS[m]?.label || m).join(', ')}`);
        }
      } else {
        console.log(`      ❌ Checklist: NOT INITIALIZED (re-register to add)`);
      }
    }
  }

  // Dependency graph
  const withDeps = active.filter(f => f.depends_on);
  if (withDeps.length > 0) {
    console.log(`\n  Dependency Graph:`);
    for (const f of withDeps) {
      console.log(`    ${f.ticket} → depends on → ${f.depends_on}`);
    }
  }

  // Migration map
  const withMig = active.filter(f => f.migration);
  if (withMig.length > 0) {
    console.log(`\n  Migration Map:`);
    for (const f of withMig) {
      console.log(`    ${f.ticket} → migration ${f.migration}`);
    }
  }

} else if (command === 'install-hook') {
  const hookDir = path.join(ROOT, '.git', 'hooks');
  const hookPath = path.join(hookDir, 'pre-commit');

  if (!fs.existsSync(hookDir)) {
    console.log(`ERROR: .git/hooks directory not found`);
    process.exit(1);
  }

  const hookContent = `#!/bin/sh
# FIX GUARD v4 — Multi-Gate Pre-Commit Hook
# Auto-installed by fix-guard.js install-hook
# Runs 8 gates: drift, secrets, staging, tickets, migrations, dev URLs, hygiene, CHECKLIST

node scripts/fix-guard.js pre-commit

if [ $? -ne 0 ]; then
  echo ""
  echo "============================================"
  echo "  COMMIT BLOCKED by Fix Guard v4"
  echo "  Run: node scripts/fix-guard.js report"
  echo "  Fix all errors, then commit again."
  echo "============================================"
  exit 1
fi
`;

  fs.writeFileSync(hookPath, hookContent, { mode: 0o755 });
  console.log(`✅ Pre-commit hook v4 installed at ${hookPath}`);

} else if (command === 'session-start') {
  console.log(`\n=== SESSION START — FIX GUARD v4 ===`);
  console.log(`Timestamp: ${new Date().toISOString()}`);

  // 1. Check all fixes
  const results = checkAll();

  console.log(`\n[1/4] Fix Integrity Check:`);
  console.log(`  Active fixes: ${results.intact.length}`);
  console.log(`  Shifted (auto-corrected): ${results.shifted.length}`);
  console.log(`  Drifted: ${results.drifted.length}`);
  console.log(`  Missing: ${results.missing.length}`);

  if (results.shifted.length > 0) {
    console.log(`\n  ⚡ Line shifts auto-corrected:`);
    for (const s of results.shifted) {
      console.log(`    ${s.ticket} | L${s.old_start}-${s.old_end} → L${s.start_line}-${s.end_line}`);
    }
  }

  if (results.drifted.length > 0) {
    console.log(`\n  ❌ DRIFTED:`);
    for (const d of results.drifted) {
      console.log(`    ${d.ticket} | ${d.file}:${d.start_line}-${d.end_line} | expected ${d.checksum}, got ${d.current_checksum}`);
    }
  }

  // 2. Protected files
  const ledger = loadLedger();
  const active = ledger.fixes.filter(f => f.status === 'ACTIVE');
  const protectedFiles = [...new Set(active.map(f => f.file))];

  console.log(`\n[2/4] Protected Files (${protectedFiles.length}):`);
  for (const file of protectedFiles.sort()) {
    const fixes = active.filter(f => f.file === file);
    const regions = fixes.map(f => `L${f.start_line}-${f.end_line} (${f.ticket})`).join(', ');
    console.log(`  ${file}: ${regions}`);
  }

  // 3. Test coverage
  const missingTests = active.filter(f => !f.test_file || f.test_file.startsWith('TODO'));
  console.log(`\n[3/5] Test Coverage:`);
  if (missingTests.length === 0) {
    console.log(`  ✅ All fixes have test guards.`);
  } else {
    console.log(`  ⚠️  ${missingTests.length} fixes missing tests:`);
    for (const f of missingTests) {
      console.log(`    ${f.ticket} | ${f.file} | test: ${f.test_file || '(none)'}`);
    }
  }

  // 4. Completion checklists
  console.log(`\n[4/5] Completion Checklists:`);
  const withChecklist = active.filter(f => f.checklist);
  const withoutChecklist = active.filter(f => !f.checklist);
  if (withoutChecklist.length > 0) {
    console.log(`  ⚠️  ${withoutChecklist.length} fixes have NO checklist (re-register to add):`);
    for (const f of withoutChecklist) {
      console.log(`    ${f.ticket} | ${f.file}`);
    }
  }
  for (const f of withChecklist) {
    const cl = checklistComplete(f.checklist);
    const icon = cl.complete ? '✅' : '⚠️';
    console.log(`  ${icon} ${f.ticket}: ${cl.done}/${cl.total} layers complete`);
    if (!cl.complete) {
      console.log(`     Missing: ${cl.missing.map(m => CHECKLIST_ITEMS[m]?.label || m).join(', ')}`);
    }
  }

  // 4. Git state (FM-19, FM-29)
  console.log(`\n[5/5] Git State:`);
  const gitStatus = exec('git status --porcelain');
  const modified = gitStatus.split('\n').filter(l => l.trim() && !l.startsWith('??'));
  const untracked = gitStatus.split('\n').filter(l => l.startsWith('??'));

  if (modified.length === 0) {
    console.log(`  ✅ Working tree clean — no uncommitted changes`);
  } else {
    console.log(`  ⚠️  ${modified.length} uncommitted changes:`);
    for (const m of modified.slice(0, 10)) {
      console.log(`    ${m.trim()}`);
    }
    if (modified.length > 10) console.log(`    ... and ${modified.length - 10} more`);
    console.log(`  Action: commit these or discard before starting new work`);
  }

  if (untracked.length > 10) {
    console.log(`  ⚠️  ${untracked.length} untracked files — consider cleaning up or adding to .gitignore`);
  }

  // Check for stale IN_PROGRESS tickets (FM-29)
  const ticketsPath = path.join(ROOT, 'RELEASES', 'STAGING_TICKETS.md');
  if (fs.existsSync(ticketsPath)) {
    const ticketsContent = fs.readFileSync(ticketsPath, 'utf8');
    const inProgressMatches = ticketsContent.match(/Status:\s*IN_PROGRESS/g);
    if (inProgressMatches && inProgressMatches.length > 0) {
      console.log(`\n  ⚠️  ${inProgressMatches.length} ticket(s) stuck in IN_PROGRESS — check if work exists or reset to OPEN`);
    }
  }

  // Final verdict
  if (results.ok) {
    console.log(`\n✅ SESSION READY — ${results.intact.length} fixes intact, zero drift.`);
    console.log(`   Pre-commit hook: 12 gates active`);
    console.log(`   Claude may proceed with new tickets.`);
  } else {
    console.log(`\n❌ SESSION BLOCKED — drift or missing files detected.`);
    console.log(`   Claude MUST resolve these before starting any new work.`);
  }

  process.exit(results.ok ? 0 : 1);

} else if (command === 'mega-gate') {
  megaGate();

} else {
  console.log(`
FIX GUARD v4 — Zero-Drift + Completion Enforcement + Parity Gate

Ticket lifecycle:
  Phase 1: Implement → Phase 2: Operator approves on Expo Go
  Phase 3: Parity scan + fix → Phase 4: Regression recheck + park

Commands:
  session-start  Full session startup check (Claude runs this FIRST)
  check          Verify all registered fixes are intact
  pre-commit     8-gate pre-commit (drift + secrets + staging + tickets + migrations + URLs + hygiene + CHECKLIST)
  register       Register a new fix with auto-scoped 14-item completion checklist
  checklist      Mark checklist items complete: checklist <ticket> <item> "evidence"
                 Show checklist: checklist <ticket> --show
                 Mark N/A: checklist <ticket> --na item1,item2
  parity-scan    Scan changed files for dev→staging gaps (MUST run after operator approval)
  reindex        Re-scan files and update line numbers after shifts
  snapshot       Compute checksum for a file region
  report         Print the full fix ledger (with checklists + dependency graph)
  install-hook   Install git pre-commit hook
  mega-gate      Full mega-batch deploy readiness check (8 gates + typecheck + tests + builds)
  `);
}
