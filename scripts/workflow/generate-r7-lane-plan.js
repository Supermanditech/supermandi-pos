#!/usr/bin/env node
/**
 * Generate a deterministic lane plan for parallel R7 execution.
 *
 * Ownership is prefix-based and expanded to explicit ticket IDs to prevent overlap.
 * Output defaults to workflow/state/r7_lane_plan.json.
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const STATE_FILE = path.join(ROOT, 'workflow', 'state', 'workflow_state.json');
const OUT_FILE = path.join(ROOT, 'workflow', 'state', 'r7_lane_plan.json');

const LANE_RULES = [
  {
    laneId: 'lane-r7-backend',
    branch: 'lane/r7-backend',
    worktree: '.worktrees/r7-backend',
    prefixes: ['BE', 'CROSS'],
  },
  {
    laneId: 'lane-r7-pos',
    branch: 'lane/r7-pos',
    worktree: '.worktrees/r7-pos',
    prefixes: ['POS'],
  },
  {
    laneId: 'lane-r7-ret',
    branch: 'lane/r7-ret',
    worktree: '.worktrees/r7-ret',
    prefixes: ['RET'],
  },
  {
    laneId: 'lane-r7-sa',
    branch: 'lane/r7-sa',
    worktree: '.worktrees/r7-sa',
    prefixes: ['SA'],
  },
  {
    laneId: 'lane-r7-sup',
    branch: 'lane/r7-sup',
    worktree: '.worktrees/r7-sup',
    prefixes: ['SUP'],
  },
];

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function prefixFromTicketId(ticketId) {
  const m = ticketId.match(/^R7\.([A-Z]+)\./);
  return m ? m[1] : 'OTHER';
}

function findLaneForPrefix(prefix) {
  return LANE_RULES.find((lane) => lane.prefixes.includes(prefix)) || null;
}

function getHeadCommit() {
  return execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
}

function main() {
  const state = readJson(STATE_FILE);
  const remaining =
    state?.progress?.liveIteration?.implementation?.remainingTicketIds || [];

  const lanes = Object.fromEntries(
    LANE_RULES.map((lane) => [
      lane.laneId,
      {
        laneId: lane.laneId,
        branch: lane.branch,
        worktree: lane.worktree,
        prefixes: lane.prefixes,
        ticketIds: [],
      },
    ])
  );

  const unassigned = [];
  for (const ticketId of remaining) {
    const prefix = prefixFromTicketId(ticketId);
    const lane = findLaneForPrefix(prefix);
    if (!lane) {
      unassigned.push(ticketId);
      continue;
    }
    lanes[lane.laneId].ticketIds.push(ticketId);
  }

  const output = {
    schemaVersion: '1.0.0',
    generatedAt: new Date().toISOString(),
    sourceOfTruth: {
      workflowState: 'workflow/state/workflow_state.json',
      headCommit: getHeadCommit(),
      remainingCount: remaining.length,
    },
    rules: {
      strictNonOverlap: true,
      mergeRequiresOverlapCheck: true,
      mergeRequiresStateReconcile: true,
    },
    lanes,
    unassigned,
  };

  writeJson(OUT_FILE, output);

  const summary = {};
  for (const lane of Object.values(lanes)) {
    summary[lane.laneId] = lane.ticketIds.length;
  }
  console.log('Wrote:', path.relative(ROOT, OUT_FILE));
  console.log('Lane counts:', JSON.stringify(summary));
  console.log('Unassigned:', unassigned.length);
}

main();
