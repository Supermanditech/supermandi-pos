#!/usr/bin/env node
/**
 * Release build script with mandatory checks
 *
 * This script:
 * 1. Runs pre-commit checks
 * 2. Verifies release status file
 * 3. Builds the APK
 * 4. Updates release status
 *
 * Usage: node scripts/build-release.js
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function log(color, message) {
  console.log(`${color}${message}${RESET}`);
}

function prompt(question) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  return new Promise(resolve => {
    rl.question(question, answer => {
      rl.close();
      resolve(answer.toLowerCase());
    });
  });
}

async function main() {
  console.log('\n' + '='.repeat(50));
  log(CYAN, '  SuperMandi POS Release Build');
  console.log('='.repeat(50) + '\n');

  // Step 1: Run pre-commit checks
  log(CYAN, '[1/5] Running pre-commit checks...\n');
  try {
    execSync('node scripts/pre-commit-check.js', { stdio: 'inherit' });
  } catch (e) {
    log(RED, '\nPre-commit checks failed! Fix issues before building.');
    process.exit(1);
  }

  // Step 2: Check release status file
  log(CYAN, '\n[2/5] Checking release status...\n');
  const statusPath = path.join(process.cwd(), '.release-status.json');
  let status = {
    version: '1.0.0',
    commit: '',
    tag: '',
    checklist_completed: false,
    tested_devices: [],
    tester: '',
    date: ''
  };

  if (fs.existsSync(statusPath)) {
    status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  }

  // Get current commit
  const currentCommit = execSync('git rev-parse --short HEAD').toString().trim();
  const currentBranch = execSync('git branch --show-current').toString().trim();

  console.log(`Current branch: ${currentBranch}`);
  console.log(`Current commit: ${currentCommit}`);
  console.log(`Last released commit: ${status.commit || 'none'}`);

  if (status.commit === currentCommit && status.checklist_completed) {
    log(GREEN, 'This commit was already released and tested.');
    const rebuild = await prompt('Rebuild anyway? (y/n): ');
    if (rebuild !== 'y') {
      log(YELLOW, 'Build cancelled.');
      process.exit(0);
    }
  }

  // Step 3: Verify checklist completion
  log(CYAN, '\n[3/5] Verifying checklist completion...\n');

  const checklistQuestions = [
    'Have you tested the cart opens fully expanded? (y/n): ',
    'Have you verified all buttons are visible (trash, +/-, back)? (y/n): ',
    'Have you tested scan debouncing (no spam on rapid scan)? (y/n): ',
    'Have you tested on at least 2 different screen sizes? (y/n): ',
  ];

  for (const question of checklistQuestions) {
    const answer = await prompt(question);
    if (answer !== 'y') {
      log(RED, '\nChecklist not complete! Complete all tests before building.');
      log(YELLOW, 'See RELEASE_CHECKLIST.md for full checklist.');
      process.exit(1);
    }
  }

  // Get tested devices
  const devices = await prompt('Enter tested devices (comma-separated): ');
  const tester = await prompt('Enter your name: ');

  // Step 4: Build APK
  log(CYAN, '\n[4/5] Building release APK...\n');

  try {
    // Prebuild
    log(YELLOW, 'Running expo prebuild...');
    execSync('npx expo prebuild --platform android --clean', { stdio: 'inherit' });

    // Gradle build
    log(YELLOW, '\nRunning gradle assembleRelease...');
    const isWindows = process.platform === 'win32';
    const gradleCmd = isWindows ? 'gradlew.bat' : './gradlew';
    execSync(`cd android && ${gradleCmd} assembleRelease`, { stdio: 'inherit', shell: true });

    log(GREEN, '\nBuild successful!');
  } catch (e) {
    log(RED, '\nBuild failed!');
    console.error(e.message);
    process.exit(1);
  }

  // Step 5: Update release status
  log(CYAN, '\n[5/5] Updating release status...\n');

  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = now.toTimeString().split(' ')[0].replace(/:/g, '');

  // Get or create tag
  let tag = '';
  try {
    tag = execSync('git describe --tags --abbrev=0').toString().trim();
  } catch {
    tag = `pos-release-${dateStr}-${timeStr}`;
    log(YELLOW, `No tag found. Suggested tag: ${tag}`);
  }

  const newStatus = {
    version: status.version,
    commit: currentCommit,
    tag: tag,
    checklist_completed: true,
    tested_devices: devices.split(',').map(d => d.trim()).filter(Boolean),
    tester: tester.trim(),
    date: dateStr,
    build_time: now.toISOString()
  };

  fs.writeFileSync(statusPath, JSON.stringify(newStatus, null, 2));
  log(GREEN, 'Release status updated!');

  // Summary
  console.log('\n' + '='.repeat(50));
  log(GREEN, '  BUILD COMPLETE');
  console.log('='.repeat(50));
  console.log(`
APK Location: android/app/build/outputs/apk/release/app-release.apk
Commit: ${currentCommit}
Tag: ${tag}
Tested by: ${tester}
Tested devices: ${newStatus.tested_devices.join(', ')}

Next steps:
1. Install APK on devices: adb install -r android/app/build/outputs/apk/release/app-release.apk
2. Verify all checklist items on devices
3. Deploy to VM: npm run deploy:vm
`);
}

main().catch(console.error);
