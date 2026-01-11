#!/usr/bin/env node
/**
 * BUILD CHECK - Shows what will be included in APK
 *
 * Run this BEFORE building to see:
 * 1. What local changes exist (uncommitted)
 * 2. What commits are ready (not pushed)
 * 3. What will be in the final APK
 *
 * Usage: npm run build:check
 */

const { execSync } = require('child_process');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function exec(cmd) {
  try {
    return execSync(cmd, { encoding: 'utf8', cwd: path.join(__dirname, '..') }).trim();
  } catch (e) {
    return '';
  }
}

console.log('\n' + '='.repeat(60));
console.log(`${CYAN}  BUILD CHECK - What will be in your APK?${RESET}`);
console.log('='.repeat(60));

// Section 1: Local Changes (NOT yet committed)
console.log(`\n${YELLOW}[1] LOCAL CHANGES (in VS Code, NOT committed)${RESET}\n`);

const staged = exec('git diff --cached --name-only');
const unstaged = exec('git diff --name-only');
const untracked = exec('git ls-files --others --exclude-standard');

const stagedFiles = staged ? staged.split('\n').filter(f => f) : [];
const unstagedFiles = unstaged ? unstaged.split('\n').filter(f => f) : [];
const untrackedFiles = untracked ? untracked.split('\n').filter(f => f && (f.startsWith('src/') || f.startsWith('scripts/') || f.endsWith('.ts') || f.endsWith('.tsx') || f.endsWith('.js'))) : [];

const hasLocalChanges = stagedFiles.length > 0 || unstagedFiles.length > 0 || untrackedFiles.length > 0;

if (hasLocalChanges) {
  console.log(`${RED}WARNING: You have local changes NOT in git!${RESET}`);
  console.log(`${RED}These will NOT be included in APK until committed.${RESET}\n`);

  if (stagedFiles.length > 0) {
    console.log('  Staged (ready to commit):');
    stagedFiles.forEach(f => console.log(`    ${GREEN}+ ${f}${RESET}`));
  }

  if (unstagedFiles.length > 0) {
    console.log('  Modified (not staged):');
    unstagedFiles.forEach(f => console.log(`    ${YELLOW}~ ${f}${RESET}`));
  }

  if (untrackedFiles.length > 0) {
    console.log('  New files (not tracked):');
    untrackedFiles.forEach(f => console.log(`    ${RED}? ${f}${RESET}`));
  }

  console.log(`\n${YELLOW}To include these in APK:${RESET}`);
  console.log('  git add .');
  console.log('  git commit -m "your message"');
  console.log('  git push origin main');
} else {
  console.log(`${GREEN}No local changes - all work is committed.${RESET}`);
}

// Section 2: Commits ready but not pushed
console.log(`\n${YELLOW}[2] COMMITS (ready but NOT pushed)${RESET}\n`);

const branch = exec('git rev-parse --abbrev-ref HEAD');
const unpushed = exec(`git log origin/${branch}..HEAD --oneline 2>/dev/null`);
const unpushedCommits = unpushed ? unpushed.split('\n').filter(c => c) : [];

if (unpushedCommits.length > 0) {
  console.log(`${YELLOW}${unpushedCommits.length} commit(s) not pushed to origin:${RESET}`);
  unpushedCommits.forEach(c => console.log(`  ${c}`));
  console.log(`\n${YELLOW}To push:${RESET} git push origin ${branch}`);
} else {
  console.log(`${GREEN}All commits pushed to origin.${RESET}`);
}

// Section 3: What WILL be in APK
console.log(`\n${YELLOW}[3] APK WILL BE BUILT FROM${RESET}\n`);

const currentCommit = exec('git rev-parse --short HEAD');
const commitMsg = exec('git log -1 --format=%s');
const commitDate = exec('git log -1 --format=%cr');
const commitAuthor = exec('git log -1 --format=%an');

console.log(`  Commit:  ${currentCommit}`);
console.log(`  Message: ${commitMsg}`);
console.log(`  Author:  ${commitAuthor}`);
console.log(`  When:    ${commitDate}`);
console.log(`  Branch:  ${branch}`);

// Section 4: Recent changes in this commit
console.log(`\n${YELLOW}[4] FILES CHANGED IN LAST COMMIT${RESET}\n`);

const lastCommitFiles = exec('git diff-tree --no-commit-id --name-only -r HEAD');
if (lastCommitFiles) {
  const files = lastCommitFiles.split('\n').filter(f => f);
  files.forEach(f => console.log(`  ${f}`));
} else {
  console.log('  (no files changed)');
}

// Summary
console.log('\n' + '='.repeat(60));

if (hasLocalChanges) {
  console.log(`${RED}  APK BUILD WILL BE BLOCKED${RESET}`);
  console.log(`${RED}  Commit your local changes first!${RESET}`);
  console.log('='.repeat(60));
  console.log(`
${YELLOW}Quick fix:${RESET}
  git add .
  git commit -m "type(scope): description"
  git push origin ${branch}
  npm run build:release
`);
  process.exit(1);
} else {
  console.log(`${GREEN}  READY TO BUILD APK${RESET}`);
  console.log(`${GREEN}  All local work is committed.${RESET}`);
  console.log('='.repeat(60));
  console.log(`
${CYAN}Next step:${RESET}
  npm run build:release
`);
  process.exit(0);
}
