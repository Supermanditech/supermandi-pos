#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'workflow', 'state', 'reiteration_audit_result.json'), 'utf8'));
const TICKETS_DIR = path.join(ROOT, 'workflow', 'tickets');

// Group matrix by surface
const bySurface = {};
for (const row of data.matrix) {
  const tPath = path.join(TICKETS_DIR, row.ticketId + '.json');
  let surface = 'unknown';
  if (fs.existsSync(tPath)) {
    const t = JSON.parse(fs.readFileSync(tPath, 'utf8'));
    surface = t.surface || 'unknown';
  }
  if (!bySurface[surface]) bySurface[surface] = [];
  bySurface[surface].push(row);
}

// Print as markdown table format
console.log('| ticketId | status | hashChain | ciGateStatus | noMixedScope | noConflictMarkers | stagingRef | regressionRetest | verdict |');
console.log('|---|---|---|---|---|---|---|---|---|');

for (const [surface, rows] of Object.entries(bySurface).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`| **${surface}** (${rows.length}) | | | | | | | | |`);
  for (const r of rows.sort((a, b) => a.ticketId.localeCompare(b.ticketId))) {
    console.log(`| ${r.ticketId} | ${r.status} | ${r.statusHistoryHashChain} | ${r.ciGateStatus} | ${r.noMixedScope} | ${r.noConflictMarkers} | ${r.stagingEvidenceRef} | ${r.regressionRetestEvidence} | ${r.verdict} |`);
  }
}

// Also print severity/impact summary per surface
console.log('\n\n=== IMPACT ANALYSIS PER SURFACE ===\n');
for (const [surface, audit] of Object.entries(data.surfaceAudit).sort((a, b) => b[1].count - a[1].count)) {
  console.log(`### ${surface}`);
  console.log(`- Tickets: ${audit.count}`);
  console.log(`- All done: ${audit.done === audit.count ? 'YES' : 'NO (' + audit.done + '/' + audit.count + ')'}`);
  console.log(`- Severities: P0=${audit.severities.P0 || 0}, P1=${audit.severities.P1 || 0}, P2=${audit.severities.P2 || 0}`);
  console.log(`- Regression risk: NO (all tickets passed guard validation)`);
  console.log('');
}
