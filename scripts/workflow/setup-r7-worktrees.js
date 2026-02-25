#!/usr/bin/env node
/**
 * Create per-lane git worktrees/branches from workflow/state/r7_lane_plan.json.
 *
 * Usage:
 *   node scripts/workflow/setup-r7-worktrees.js
 *   node scripts/workflow/setup-r7-worktrees.js --base <commit>
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const PLAN_FILE = path.join(ROOT, 'workflow', 'state', 'r7_lane_plan.json');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function branchExists(branch) {
  const out = run(`git branch --list "${branch}"`);
  return out.length > 0;
}

function worktreeExists(worktreePath) {
  const abs = path.join(ROOT, worktreePath);
  return fs.existsSync(abs) && fs.existsSync(path.join(abs, '.git'));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let base = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base') base = args[i + 1] || null;
  }
  return { base };
}

function main() {
  const { base } = parseArgs();
  const plan = readJson(PLAN_FILE);
  const baseRef = base || plan?.sourceOfTruth?.headCommit || run('git rev-parse HEAD');

  fs.mkdirSync(path.join(ROOT, '.worktrees'), { recursive: true });

  const lanes = Object.values(plan.lanes || {});
  for (const lane of lanes) {
    const branch = lane.branch;
    const wt = lane.worktree;
    const absWt = path.join(ROOT, wt);

    if (worktreeExists(wt)) {
      console.log(`[skip] worktree exists: ${wt}`);
      continue;
    }

    if (fs.existsSync(absWt) && !fs.existsSync(path.join(absWt, '.git'))) {
      throw new Error(`path exists but is not a worktree: ${wt}`);
    }

    if (branchExists(branch)) {
      run(`git worktree add "${wt}" "${branch}"`);
      console.log(`[ok] attached existing branch ${branch} -> ${wt}`);
    } else {
      run(`git worktree add -b "${branch}" "${wt}" "${baseRef}"`);
      console.log(`[ok] created branch ${branch} from ${baseRef} -> ${wt}`);
    }
  }
}

main();
