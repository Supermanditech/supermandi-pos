#!/usr/bin/env node
/**
 * Release Tag Script
 *
 * Creates a release tag with proper documentation and artifacts.
 *
 * Usage: node scripts/release-tag.js <version> "<description>"
 * Example: node scripts/release-tag.js v3.0.10 "Hindi translations + search parity"
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

const ROOT_DIR = path.join(__dirname, '..');
const RELEASES_DIR = path.join(ROOT_DIR, 'RELEASES');

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
    }).trim();
  } catch (err) {
    if (options.silent) return (err.stdout || '').trim();
    throw err;
  }
}

function readJson(filePath) {
  const fullPath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return JSON.parse(fs.readFileSync(fullPath, 'utf-8'));
}

function readFile(filePath) {
  const fullPath = path.join(ROOT_DIR, filePath);
  if (!fs.existsSync(fullPath)) return null;
  return fs.readFileSync(fullPath, 'utf-8');
}

// =============================================================================
// VALIDATION
// =============================================================================

function validateVersion(version) {
  // Must be semver format: vX.Y.Z or X.Y.Z
  const semverRegex = /^v?\d+\.\d+\.\d+(-[\w.]+)?$/;
  return semverRegex.test(version);
}

function ensureCleanWorkingTree() {
  const status = exec('git status --porcelain', { silent: true });
  if (status) {
    console.log(colorize('ERROR: Working tree is not clean!', 'red'));
    console.log('Uncommitted changes:');
    console.log(status);
    console.log('\nPlease commit or stash changes before creating a release.');
    process.exit(1);
  }
}

function runGateCheck() {
  console.log(colorize('\nRunning release gate checks...', 'blue'));

  const result = spawnSync('node', [path.join(__dirname, 'release-gate.js')], {
    cwd: ROOT_DIR,
    stdio: 'inherit',
  });

  if (result.status !== 0) {
    console.log(colorize('\nERROR: Release gate checks failed!', 'red'));
    console.log('Fix the issues and re-run this command.');
    process.exit(1);
  }
}

// =============================================================================
// RELEASE ARTIFACTS
// =============================================================================

function getTicketSummary() {
  const ticketsData = readJson('docs/TICKETS_DONE.json');
  if (!ticketsData) return { total: 0, tickets: [] };

  const doneTickets = ticketsData.tickets.filter(t => t.status === 'done');
  return {
    total: doneTickets.length,
    tickets: doneTickets.map(t => ({ id: t.id, title: t.title })),
  };
}

function getApiBaseUrl() {
  const apiConfig = readFile('src/config/api.ts');
  if (!apiConfig) return 'unknown';

  const match = apiConfig.match(/API_BASE_URL\s*=\s*['"`]([^'"`]+)['"`]/);
  return match ? match[1] : 'unknown';
}

function generateReleaseNotes(version, description, commit) {
  const ticketSummary = getTicketSummary();
  const apiUrl = getApiBaseUrl();
  const date = new Date().toISOString().split('T')[0];
  const branch = exec('git branch --show-current', { silent: true });

  const ticketList = ticketSummary.tickets
    .map(t => `- [x] ${t.id}: ${t.title}`)
    .join('\n');

  return `# Release ${version}

## Overview
- **Tag:** ${version}
- **Commit:** ${commit}
- **Date:** ${date}
- **Branch:** ${branch}
- **Backend URL:** ${apiUrl}

## Description
${description}

## Ticket Summary
**Total Verified Tickets:** ${ticketSummary.total}

${ticketList || '- No tickets documented'}

## Pre-Release Checks
All checks passed:
- [x] Git status clean
- [x] Correct release branch
- [x] Backend URLs verified
- [x] Feature flags synced
- [x] SELL/BUY boundaries verified
- [x] Ticket proof passed
- [x] i18n audit passed (if applicable)

## Build Instructions

\`\`\`bash
# 1. Push commit + tag (if not done)
git push origin main --follow-tags

# 2. Checkout the release tag
git checkout ${version}

# 3. Build APK (EAS or local)
eas build --platform android --profile production
# OR: cd android && ./gradlew assembleRelease

# 4. Return to main
git checkout main
\`\`\`

## Known Risks
- None documented

## Rollback
If issues arise, rollback to previous version:
\`\`\`bash
git checkout <previous-tag>
# Rebuild APK
\`\`\`

---
Generated by release-tag.js on ${new Date().toISOString()}
`;
}

function createReleaseArtifacts(version, description) {
  // Ensure RELEASES directory exists
  if (!fs.existsSync(RELEASES_DIR)) {
    fs.mkdirSync(RELEASES_DIR, { recursive: true });
  }

  // Get commit SHA
  const commit = exec('git rev-parse HEAD', { silent: true });
  const shortCommit = commit.substring(0, 7);

  // Generate release notes
  const releaseNotes = generateReleaseNotes(version, description, shortCommit);

  // Write release notes
  const releaseFile = path.join(RELEASES_DIR, `${version}.md`);
  fs.writeFileSync(releaseFile, releaseNotes);
  console.log(colorize(`Created: RELEASES/${version}.md`, 'green'));

  // Write RELEASE_TAG.txt
  const releaseTagContent = `TAG=${version}
COMMIT=${commit}
SHORT_COMMIT=${shortCommit}
DATE=${new Date().toISOString()}
DESCRIPTION=${description}
`;
  fs.writeFileSync(path.join(ROOT_DIR, 'RELEASE_TAG.txt'), releaseTagContent);
  console.log(colorize('Created: RELEASE_TAG.txt', 'green'));

  return { commit, shortCommit };
}

// =============================================================================
// GIT OPERATIONS
// =============================================================================

function commitReleaseFiles(version) {
  console.log(colorize('\nCommitting release files...', 'blue'));

  exec('git add RELEASES/ RELEASE_TAG.txt');
  exec(`git commit -m "release(${version}): Create release artifacts"`);

  console.log(colorize('Release files committed', 'green'));
}

function createTag(version, description) {
  console.log(colorize(`\nCreating tag ${version}...`, 'blue'));

  // Create annotated tag
  exec(`git tag -a ${version} -m "${description}"`);

  console.log(colorize(`Tag ${version} created`, 'green'));
}

function pushTagPrompt(version) {
  console.log(colorize('\n═══════════════════════════════════════════════════════════', 'cyan'));
  console.log(colorize('\n✓ RELEASE TAG CREATED SUCCESSFULLY', 'green'));
  console.log(colorize('═══════════════════════════════════════════════════════════', 'cyan'));

  console.log(`
Tag: ${colorize(version, 'bold')}
Commit: ${exec('git rev-parse --short HEAD', { silent: true })}

${colorize('IMPORTANT:', 'yellow')} Build from this tag only!

${colorize('Next steps:', 'bold')}
1. Push commit + tag together:
   ${colorize('git push origin main --follow-tags', 'cyan')}

2. Build APK from tag (detached HEAD is OK):
   ${colorize(`git checkout ${version}`, 'cyan')}
   ${colorize('eas build --platform android --profile production', 'cyan')}
   ${colorize('# OR local: cd android && ./gradlew assembleRelease', 'cyan')}

3. Return to main after build:
   ${colorize('git checkout main', 'cyan')}

${colorize('DO NOT build directly from main branch!', 'red')}
`);
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  let version = args[0];
  let description = args.slice(1).join(' ');

  // Validate arguments
  if (!version) {
    console.log(colorize('Usage: pnpm release:tag <version> "<description>"', 'yellow'));
    console.log(colorize('Example: pnpm release:tag v3.0.10 "Hindi translations + search parity"', 'cyan'));
    process.exit(1);
  }

  // Normalize version (add 'v' prefix if missing)
  if (!version.startsWith('v')) {
    version = `v${version}`;
  }

  if (!validateVersion(version)) {
    console.log(colorize(`ERROR: Invalid version format: ${version}`, 'red'));
    console.log('Expected format: vX.Y.Z (e.g., v3.0.10)');
    process.exit(1);
  }

  if (!description) {
    description = `Release ${version}`;
  }

  console.log(colorize('\n╔══════════════════════════════════════════════════════════════╗', 'cyan'));
  console.log(colorize('║                    CREATE RELEASE TAG                         ║', 'cyan'));
  console.log(colorize('╚══════════════════════════════════════════════════════════════╝', 'cyan'));

  console.log(`\nVersion: ${colorize(version, 'bold')}`);
  console.log(`Description: ${description}`);

  // Step 1: Ensure clean working tree
  console.log(colorize('\n[1/5] Checking working tree...', 'blue'));
  ensureCleanWorkingTree();
  console.log(colorize('Working tree is clean', 'green'));

  // Step 2: Run gate checks
  console.log(colorize('\n[2/5] Running release gate...', 'blue'));
  runGateCheck();

  // Step 3: Create release artifacts
  console.log(colorize('\n[3/5] Creating release artifacts...', 'blue'));
  const { commit, shortCommit } = createReleaseArtifacts(version, description);

  // Step 4: Commit release files
  console.log(colorize('\n[4/5] Committing release files...', 'blue'));
  commitReleaseFiles(version);

  // Step 5: Create tag
  console.log(colorize('\n[5/5] Creating git tag...', 'blue'));
  createTag(version, description);

  // Done - show next steps
  pushTagPrompt(version);
}

main();
