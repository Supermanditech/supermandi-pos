#!/usr/bin/env node
/**
 * Strict dedupe/ownership verification across lane branches before merge.
 *
 * Checks:
 * - A lane only modifies ticket files it owns per r7_lane_plan.json.
 * - No ticket file is modified by more than one lane.
 * - Reports non-ticket file overlaps across lanes (warning, not hard-fail).
 *
 * Usage:
 *   node scripts/workflow/verify-r7-lane-dedupe.js --base <commit>
 */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = process.cwd();
const PLAN_FILE = path.join(ROOT, 'workflow', 'state', 'r7_lane_plan.json');

function run(cmd) {
  return execSync(cmd, { encoding: 'utf8' }).trim();
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function parseArgs() {
  const args = process.argv.slice(2);
  let base = null;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base') base = args[i + 1] || null;
  }
  return { base };
}

function getChangedFiles(base, branch) {
  const out = run(`git diff --name-only "${base}..${branch}"`);
  if (!out) return [];
  return out.split('\n').filter(Boolean);
}

function ticketIdFromPath(file) {
  const m = file.match(/^workflow\/tickets\/(.+)\.json$/);
  return m ? m[1] : null;
}

function main() {
  const { base } = parseArgs();
  const plan = readJson(PLAN_FILE);
  const baseRef = base || plan?.sourceOfTruth?.headCommit || run('git rev-parse HEAD');
  const lanes = Object.values(plan.lanes || {});

  const ticketOwners = new Map();
  for (const lane of lanes) {
    for (const id of lane.ticketIds || []) {
      if (ticketOwners.has(id)) {
        throw new Error(`duplicate ownership in plan: ${id}`);
      }
      ticketOwners.set(id, lane.laneId);
    }
  }

  const ticketTouchedBy = new Map();
  const codeTouchedBy = new Map();
  const ownershipViolations = [];

  for (const lane of lanes) {
    const files = getChangedFiles(baseRef, lane.branch);
    for (const file of files) {
      const ticketId = ticketIdFromPath(file);
      if (ticketId) {
        const owner = ticketOwners.get(ticketId);
        if (owner !== lane.laneId) {
          ownershipViolations.push(
            `${lane.laneId} changed unowned ticket ${ticketId} (owner: ${owner || 'none'})`
          );
        }
        if (!ticketTouchedBy.has(ticketId)) ticketTouchedBy.set(ticketId, []);
        ticketTouchedBy.get(ticketId).push(lane.laneId);
      } else {
        if (!codeTouchedBy.has(file)) codeTouchedBy.set(file, []);
        codeTouchedBy.get(file).push(lane.laneId);
      }
    }
  }

  const ticketOverlapViolations = [];
  for (const [ticketId, lanesTouched] of ticketTouchedBy.entries()) {
    const uniq = [...new Set(lanesTouched)];
    if (uniq.length > 1) {
      ticketOverlapViolations.push(
        `ticket overlap: ${ticketId} touched by ${uniq.join(', ')}`
      );
    }
  }

  const codeOverlaps = [];
  for (const [file, lanesTouched] of codeTouchedBy.entries()) {
    const uniq = [...new Set(lanesTouched)];
    if (uniq.length > 1) {
      codeOverlaps.push(`${file} :: ${uniq.join(', ')}`);
    }
  }

  console.log(`Base: ${baseRef}`);
  console.log(`Lanes: ${lanes.map((l) => l.laneId).join(', ')}`);
  console.log(`Ownership violations: ${ownershipViolations.length}`);
  console.log(`Ticket overlaps: ${ticketOverlapViolations.length}`);
  console.log(`Code overlaps (warn): ${codeOverlaps.length}`);

  if (ownershipViolations.length > 0) {
    console.log('\n[ownership violations]');
    ownershipViolations.forEach((v) => console.log(`- ${v}`));
  }
  if (ticketOverlapViolations.length > 0) {
    console.log('\n[ticket overlaps]');
    ticketOverlapViolations.forEach((v) => console.log(`- ${v}`));
  }
  if (codeOverlaps.length > 0) {
    console.log('\n[code overlaps - manual review required]');
    codeOverlaps.slice(0, 200).forEach((v) => console.log(`- ${v}`));
    if (codeOverlaps.length > 200) {
      console.log(`... truncated ${codeOverlaps.length - 200} more`);
    }
  }

  if (ownershipViolations.length > 0 || ticketOverlapViolations.length > 0) {
    process.exitCode = 1;
  }
}

main();
