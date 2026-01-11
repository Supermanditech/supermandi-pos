#!/usr/bin/env node
/**
 * VM Deployment script with mandatory checks
 *
 * This script:
 * 1. Verifies release status
 * 2. Checks that APK was tested
 * 3. Deploys to Google VM
 *
 * Usage: node scripts/deploy-vm.js
 */

const { execSync } = require('child_process');
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
  log(CYAN, '  SuperMandi POS VM Deployment');
  console.log('='.repeat(50) + '\n');

  // Step 1: Check release status
  log(CYAN, '[1/4] Checking release status...\n');

  const statusPath = path.join(process.cwd(), '.release-status.json');
  if (!fs.existsSync(statusPath)) {
    log(RED, 'No release status file found!');
    log(YELLOW, 'Run "npm run build:release" first to create a tested build.');
    process.exit(1);
  }

  const status = JSON.parse(fs.readFileSync(statusPath, 'utf8'));
  const currentCommit = execSync('git rev-parse --short HEAD').toString().trim();

  console.log('Release Status:');
  console.log(`  Commit: ${status.commit}`);
  console.log(`  Tag: ${status.tag}`);
  console.log(`  Checklist: ${status.checklist_completed ? 'COMPLETED' : 'NOT COMPLETED'}`);
  console.log(`  Tested by: ${status.tester}`);
  console.log(`  Tested devices: ${status.tested_devices?.join(', ') || 'none'}`);
  console.log(`  Date: ${status.date}`);
  console.log('');

  // Verify checklist was completed
  if (!status.checklist_completed) {
    log(RED, 'Checklist not completed!');
    log(YELLOW, 'Run "npm run build:release" and complete all checks first.');
    process.exit(1);
  }

  // Verify commit matches
  if (status.commit !== currentCommit) {
    log(YELLOW, `Warning: Current commit (${currentCommit}) differs from tested commit (${status.commit})`);
    const proceed = await prompt('Deploy anyway? (y/n): ');
    if (proceed !== 'y') {
      log(YELLOW, 'Deployment cancelled. Run "npm run build:release" to test current commit.');
      process.exit(0);
    }
  }

  // Verify devices were tested
  if (!status.tested_devices || status.tested_devices.length < 2) {
    log(YELLOW, 'Warning: Less than 2 devices tested');
    const proceed = await prompt('Deploy anyway? (y/n): ');
    if (proceed !== 'y') {
      log(YELLOW, 'Deployment cancelled. Test on more devices first.');
      process.exit(0);
    }
  }

  // Step 2: Confirm deployment
  log(CYAN, '[2/4] Confirming deployment...\n');

  const confirm = await prompt('Deploy to Google VM? (y/n): ');
  if (confirm !== 'y') {
    log(YELLOW, 'Deployment cancelled.');
    process.exit(0);
  }

  // Step 3: Push to git (if not already pushed)
  log(CYAN, '\n[3/4] Ensuring changes are pushed...\n');

  try {
    const gitStatus = execSync('git status --porcelain').toString().trim();
    if (gitStatus) {
      log(YELLOW, 'Uncommitted changes detected:');
      console.log(gitStatus);
      const commitFirst = await prompt('Commit these changes first? (y/n): ');
      if (commitFirst === 'y') {
        log(YELLOW, 'Please commit manually with a descriptive message, then run deploy again.');
        process.exit(0);
      }
    }

    // Push to remote
    log(YELLOW, 'Pushing to origin/main...');
    execSync('git push origin main', { stdio: 'inherit' });
    log(GREEN, 'Push successful!');
  } catch (e) {
    log(RED, 'Git push failed!');
    console.error(e.message);
    process.exit(1);
  }

  // Step 4: Deploy to VM
  log(CYAN, '\n[4/4] Deploying to Google VM...\n');

  try {
    const sshCmd = `ssh supermandi-vm "cd ~/supermandi-pos && git fetch --all --tags && git pull origin main && echo '=== Deployed Commit ===' && git log -1 --oneline"`;

    log(YELLOW, 'Connecting to VM...');
    execSync(sshCmd, { stdio: 'inherit' });

    // Restart backend if needed
    log(YELLOW, '\nRestarting backend service...');
    execSync('ssh supermandi-vm "cd ~/supermandi-pos/backend && npm install && pm2 restart all && pm2 list"', { stdio: 'inherit' });

    log(GREEN, '\nDeployment successful!');
  } catch (e) {
    log(RED, 'Deployment failed!');
    console.error(e.message);
    process.exit(1);
  }

  // Summary
  console.log('\n' + '='.repeat(50));
  log(GREEN, '  DEPLOYMENT COMPLETE');
  console.log('='.repeat(50));
  console.log(`
Deployed to: Google VM (supermandi-vm)
Commit: ${currentCommit}
Tag: ${status.tag}

Post-deployment verification:
1. Check PM2 logs: ssh supermandi-vm "pm2 logs backend --lines 50"
2. Verify API health: curl https://your-api-url/health
3. Test a scan on a connected device
`);

  // Update status with deployment info
  status.deployed_to_vm = true;
  status.vm_deploy_time = new Date().toISOString();
  fs.writeFileSync(statusPath, JSON.stringify(status, null, 2));
}

main().catch(console.error);
