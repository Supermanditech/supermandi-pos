#!/usr/bin/env node
/**
 * Merge R7 lane branches into current branch with strict dedupe checks.
 *
 * Usage:
 *   node scripts/workflow/merge-r7-lanes.js --base <commit>
 *   node scripts/workflow/merge-r7-lanes.js --base <commit> --with-monitor
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const PLAN_FILE = path.join(ROOT, 'workflow', 'state', 'r7_lane_plan.json');

function run(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: 'utf8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
}

function runInherit(cmd) {
  execSync(cmd, { cwd: ROOT, stdio: 'inherit' });
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let base = null;
  let withMonitor = false;
  for (let i = 0; i < args.length; i += 1) {
    const arg = args[i];
    if (arg === '--base') {
      base = args[i + 1] || null;
      i += 1;
      continue;
    }
    if (arg === '--with-monitor') {
      withMonitor = true;
    }
  }
  return { base, withMonitor };
}

function ensureCleanTree() {
  const out = run('git status --porcelain');
  if (out) {
    throw new Error('Working tree is not clean. Commit/stash changes before merge.');
  }
}

function ensureOnMain() {
  const branch = run('git branch --show-current');
  if (branch !== 'main') {
    throw new Error(`Run merges from main branch only. Current: ${branch}`);
  }
}

function aheadCount(baseRef, branch) {
  const out = run(`git rev-list --count "${baseRef}..${branch}"`);
  return Number(out || 0);
}

function main() {
  const { base, withMonitor } = parseArgs();
  const plan = readJson(PLAN_FILE);
  const baseRef = base || plan?.sourceOfTruth?.headCommit || run('git rev-parse HEAD');
  const lanes = Object.values(plan.lanes || {});

  if (lanes.length === 0) {
    throw new Error('No lanes found in workflow/state/r7_lane_plan.json');
  }

  ensureOnMain();
  ensureCleanTree();

  console.log('[precheck] strict dedupe verification...');
  runInherit(`node scripts/workflow/verify-r7-lane-dedupe.js --base ${baseRef}`);

  const mergeOrder = ['lane/r7-backend', 'lane/r7-pos', 'lane/r7-ret', 'lane/r7-sa', 'lane/r7-sup'];
  const branchSet = new Set(lanes.map((lane) => lane.branch));
  const orderedBranches = mergeOrder.filter((branch) => branchSet.has(branch));
  for (const lane of lanes) {
    if (!orderedBranches.includes(lane.branch)) orderedBranches.push(lane.branch);
  }

  for (const branch of orderedBranches) {
    const commitsAhead = aheadCount(baseRef, branch);
    if (commitsAhead === 0) {
      console.log(`[skip] ${branch} has no commits ahead of base (${baseRef})`);
      continue;
    }

    console.log(`[merge] ${branch} (${commitsAhead} commit(s) ahead of base)`);
    runInherit(`git merge --no-ff --no-edit "${branch}"`);
    runInherit('pnpm workflow:validate');
  }

  if (withMonitor) {
    runInherit('pnpm workflow:monitor');
  }

  console.log('[post] reconcile implementation queue from ticket statuses');
  runInherit('node scripts/workflow/reconcile-implementation-queue.js');
  runInherit('pnpm workflow:validate');
  console.log('[done] lane merge flow complete');
}

main();
