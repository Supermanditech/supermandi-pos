#!/usr/bin/env node
/**
 * Build R7 regeneration progress checkpoint from summary totals + recovered detail sets.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const FRONT_SUMMARY = path.join(
  ROOT,
  'workflow',
  'state',
  'subagent_checkpoints',
  'R7_frontend_summary.json'
);
const BACK_SUMMARY = path.join(
  ROOT,
  'workflow',
  'state',
  'subagent_checkpoints',
  'R7_backend_cross_summary.json'
);
const SEED_DEDUPE = path.join(
  ROOT,
  'workflow',
  'state',
  'subagent_checkpoints',
  'R7_top_findings_seed_dedupe_203_172_116.json'
);
const OUT_FILE = path.join(
  ROOT,
  'workflow',
  'state',
  'subagent_checkpoints',
  'R7_regeneration_progress.json'
);

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function headSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return null;
  }
}

function main() {
  const front = readJson(FRONT_SUMMARY);
  const back = readJson(BACK_SUMMARY);
  const seed = fs.existsSync(SEED_DEDUPE) ? readJson(SEED_DEDUPE) : null;

  const total = back.grandTotals.grandTotal.total;
  const recovered = seed ? seed.totalFindings : 0;
  const netNewRecovered = seed ? seed.summary.NET_NEW : 0;

  const out = {
    generatedAt: new Date().toISOString(),
    headSha: headSha(),
    source: {
      frontendSummary: path.relative(ROOT, FRONT_SUMMARY),
      backendCrossSummary: path.relative(ROOT, BACK_SUMMARY),
      seedDedupe: seed ? path.relative(ROOT, SEED_DEDUPE) : null,
    },
    totals: {
      r7TotalFindings: total,
      recoveredDetailedFindings: recovered,
      netNewWithinRecovered: netNewRecovered,
      remainingDetailedFindingsToRecover: total - recovered,
    },
    severityTotals: back.grandTotals.grandTotal,
    notes: [
      'Recovered set currently reflects summary-derived top findings only.',
      'Full per-finding detailed dataset is still required for complete R7 ticketization.',
      'Dedupe policy is strict: canonical203 + R5(172) + R6(116).',
    ],
  };

  fs.writeFileSync(OUT_FILE, `${JSON.stringify(out, null, 2)}\n`, 'utf8');
  console.log(`Wrote: ${path.relative(ROOT, OUT_FILE)}`);
  console.log(`R7 total: ${total}`);
  console.log(`Recovered detailed findings: ${recovered}`);
  console.log(`Remaining to recover: ${total - recovered}`);
}

main();

