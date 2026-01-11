#!/usr/bin/env node
/**
 * WIP GATE - Work In Progress Detection
 *
 * This script ensures NO work-in-progress is left behind before building APK.
 * It performs a comprehensive check of local vs git state.
 *
 * HARD BLOCKS:
 * 1. Uncommitted changes (staged or unstaged)
 * 2. Untracked files in src/ (new code not added to git)
 * 3. Unpushed commits (local ahead of origin)
 * 4. Detached HEAD state
 *
 * This ensures the APK is ALWAYS built from the latest committed & pushed code.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let errors = [];
let warnings = [];

function fail(message) {
  errors.push(message);
  console.error(`${RED}[BLOCK]${RESET} ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.log(`${YELLOW}[WARN]${RESET} ${message}`);
}

function pass(message) {
  console.log(`${GREEN}[PASS]${RESET} ${message}`);
}

function info(message) {
  console.log(`${CYAN}[INFO]${RESET} ${message}`);
}

function execGit(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (e) {
    return '';
  }
}

console.log('\n' + '='.repeat(50));
console.log('  WIP GATE - Work In Progress Detection');
console.log('='.repeat(50) + '\n');

const projectRoot = path.join(__dirname, '..');
process.chdir(projectRoot);

// CHECK 1: Uncommitted changes (staged)
console.log('Check 1: Staged changes...');
const staged = execGit('git diff --cached --name-only');
if (staged) {
  const files = staged.split('\n').filter(f => f);
  fail(`${files.length} file(s) staged but not committed:`);
  files.forEach(f => console.log(`  - ${f}`));
} else {
  pass('No staged changes');
}

// CHECK 2: Uncommitted changes (unstaged)
console.log('\nCheck 2: Unstaged changes...');
const unstaged = execGit('git diff --name-only');
if (unstaged) {
  const files = unstaged.split('\n').filter(f => f);
  fail(`${files.length} file(s) modified but not staged:`);
  files.forEach(f => console.log(`  - ${f}`));
} else {
  pass('No unstaged changes');
}

// CHECK 3: Untracked files in critical directories
console.log('\nCheck 3: Untracked source files...');
const untracked = execGit('git ls-files --others --exclude-standard');
if (untracked) {
  const files = untracked.split('\n').filter(f => f);
  // Only block on source code files, warn on others
  const sourceFiles = files.filter(f =>
    f.startsWith('src/') ||
    f.startsWith('scripts/') ||
    f.endsWith('.ts') ||
    f.endsWith('.tsx') ||
    f.endsWith('.js') ||
    f.endsWith('.json') && !f.includes('node_modules')
  );
  const otherFiles = files.filter(f => !sourceFiles.includes(f));

  if (sourceFiles.length > 0) {
    fail(`${sourceFiles.length} untracked source file(s) - add to git or .gitignore:`);
    sourceFiles.forEach(f => console.log(`  - ${f}`));
  } else {
    pass('No untracked source files');
  }

  if (otherFiles.length > 0) {
    warn(`${otherFiles.length} untracked non-source file(s) (not blocking):`);
    otherFiles.slice(0, 5).forEach(f => console.log(`  - ${f}`));
    if (otherFiles.length > 5) {
      console.log(`  ... and ${otherFiles.length - 5} more`);
    }
  }
} else {
  pass('No untracked files');
}

// CHECK 4: Branch status
console.log('\nCheck 4: Branch status...');
const branch = execGit('git rev-parse --abbrev-ref HEAD');
if (branch === 'HEAD') {
  fail('Detached HEAD state - checkout a branch before building');
} else {
  pass(`On branch: ${branch}`);
}

// CHECK 5: Unpushed commits
console.log('\nCheck 5: Unpushed commits...');
try {
  const unpushed = execGit(`git log origin/${branch}..HEAD --oneline`);
  if (unpushed) {
    const commits = unpushed.split('\n').filter(c => c);
    fail(`${commits.length} commit(s) not pushed to origin/${branch}:`);
    commits.forEach(c => console.log(`  - ${c}`));
  } else {
    pass('All commits pushed to origin');
  }
} catch (e) {
  warn('Cannot check unpushed commits - no remote tracking branch');
}

// CHECK 6: Remote sync status
console.log('\nCheck 6: Remote sync...');
try {
  execSync('git fetch origin --dry-run 2>&1', { encoding: 'utf8' });
  const behind = execGit(`git log HEAD..origin/${branch} --oneline`);
  if (behind) {
    const commits = behind.split('\n').filter(c => c);
    warn(`${commits.length} commit(s) on origin not in local - consider pulling`);
  } else {
    pass('Local is up to date with origin');
  }
} catch (e) {
  warn('Cannot check remote sync - network issue?');
}

// BUILD MANIFEST
console.log('\n' + '-'.repeat(50));
console.log('  BUILD MANIFEST');
console.log('-'.repeat(50));

const currentCommit = execGit('git rev-parse HEAD');
const shortCommit = execGit('git rev-parse --short HEAD');
const commitMsg = execGit('git log -1 --format=%s');
const commitDate = execGit('git log -1 --format=%ci');
const commitAuthor = execGit('git log -1 --format=%an');

console.log(`\nCommit: ${shortCommit}`);
console.log(`Message: ${commitMsg}`);
console.log(`Author: ${commitAuthor}`);
console.log(`Date: ${commitDate}`);
console.log(`Branch: ${branch}`);

// Write build manifest
const manifest = {
  commit: shortCommit,
  fullCommit: currentCommit,
  message: commitMsg,
  author: commitAuthor,
  date: commitDate,
  branch: branch,
  buildTime: new Date().toISOString(),
  wipGatePassed: errors.length === 0
};

const manifestPath = path.join(projectRoot, '.build-manifest.json');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
info(`Build manifest written to .build-manifest.json`);

// SUMMARY
console.log('\n' + '='.repeat(50));
if (errors.length === 0) {
  console.log(`${GREEN}  WIP GATE PASSED - All changes committed${RESET}`);
  console.log('='.repeat(50));
  if (warnings.length > 0) {
    console.log(`\n${YELLOW}${warnings.length} warning(s) - review above${RESET}\n`);
  }
  process.exit(0);
} else {
  console.log(`${RED}  WIP GATE FAILED - ${errors.length} issue(s) found${RESET}`);
  console.log('='.repeat(50));
  console.log(`
${RED}BUILD BLOCKED${RESET}

You have work-in-progress that is not committed to git.
The APK must be built from committed code to ensure:
  1. All fixes are included
  2. The build is reproducible
  3. The code can be tracked and rolled back

${YELLOW}To fix:${RESET}
  git add .
  git commit -m "your message"
  git push origin ${branch}

Then run the build again.
`);
  process.exit(1);
}
