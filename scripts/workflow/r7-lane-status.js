#!/usr/bin/env node
/**
 * Summarize R7 lane progress from workflow/state/r7_lane_plan.json.
 *
 * Usage:
 *   node scripts/workflow/r7-lane-status.js
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const PLAN_FILE = path.join(ROOT, 'workflow', 'state', 'r7_lane_plan.json');
const TICKETS_DIR = path.join(ROOT, 'workflow', 'tickets');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readTicketStatus(ticketId) {
  const file = path.join(TICKETS_DIR, `${ticketId}.json`);
  if (!fs.existsSync(file)) return 'missing';
  try {
    const json = readJson(file);
    const status = typeof json.status === 'string' ? json.status.trim() : '';
    return status || 'missing_status';
  } catch (_error) {
    return 'invalid_json';
  }
}

function summarizeLane(lane) {
  const counts = {
    todo: 0,
    in_progress: 0,
    ready_for_operator_test: 0,
    blocked: 0,
    done: 0,
    missing: 0,
    missing_status: 0,
    invalid_json: 0,
    other: 0,
  };

  for (const ticketId of lane.ticketIds || []) {
    const status = readTicketStatus(ticketId);
    if (Object.prototype.hasOwnProperty.call(counts, status)) {
      counts[status] += 1;
    } else {
      counts.other += 1;
    }
  }

  const total = (lane.ticketIds || []).length;
  const completed = counts.done;
  const pending = total - completed;
  return { total, completed, pending, counts };
}

function printLane(laneId, lane, summary) {
  console.log(`\n[${laneId}]`);
  console.log(`branch=${lane.branch} worktree=${lane.worktree}`);
  console.log(
    `total=${summary.total} done=${summary.completed} pending=${summary.pending} `
    + `todo=${summary.counts.todo} in_progress=${summary.counts.in_progress} `
    + `ready_for_operator_test=${summary.counts.ready_for_operator_test} blocked=${summary.counts.blocked}`
  );
  if (summary.counts.missing || summary.counts.missing_status || summary.counts.invalid_json || summary.counts.other) {
    console.log(
      `quality: missing=${summary.counts.missing} missing_status=${summary.counts.missing_status} `
      + `invalid_json=${summary.counts.invalid_json} other=${summary.counts.other}`
    );
  }
}

function main() {
  const plan = readJson(PLAN_FILE);
  const lanes = Object.entries(plan.lanes || {});

  if (lanes.length === 0) {
    throw new Error('No lanes found in r7_lane_plan.json');
  }

  console.log('=== R7 Lane Status ===');
  console.log(`base=${plan.sourceOfTruth?.headCommit || 'unknown'} generatedAt=${plan.generatedAt || 'unknown'}`);

  let grandTotal = 0;
  let grandDone = 0;
  let grandPending = 0;

  for (const [laneId, lane] of lanes) {
    const summary = summarizeLane(lane);
    printLane(laneId, lane, summary);
    grandTotal += summary.total;
    grandDone += summary.completed;
    grandPending += summary.pending;
  }

  console.log('\n---');
  console.log(`R7 overall: total=${grandTotal} done=${grandDone} pending=${grandPending}`);
}

main();
