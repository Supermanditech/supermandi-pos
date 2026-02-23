#!/usr/bin/env node
/**
 * reiteration-audit.js
 *
 * Strict re-iteration audit for 203 canonical + 1 delta ticket.
 * Outputs: gap analysis, surface audit, git-discipline matrix.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const TICKETS_DIR = path.join(ROOT, 'workflow', 'tickets');
const DEDUPE_FILE = path.join(ROOT, 'RELEASES', 'AUDIT_R1234_FINAL_CANONICAL_DEDUPE_2026-02-23.json');

// Load canonical scope
const dedupe = JSON.parse(fs.readFileSync(DEDUPE_FILE, 'utf8'));

// Extract canonical ticket IDs from the dedupe file
// Structure: canonicalTickets.allFinal is array of 203 ticket ID strings
const canonicalIds = new Set(dedupe.canonicalTickets.allFinal);

// Add delta ticket
canonicalIds.add('LIVE.RETAILER.REGISTER.OTP_SUCCESS_ERROR_CONFLICT.001');

console.log('Canonical IDs loaded:', canonicalIds.size);

// Load all ticket files
const files = fs.readdirSync(TICKETS_DIR).filter(f => f.endsWith('.json'));
const allTickets = {};
for (const file of files) {
  const t = JSON.parse(fs.readFileSync(path.join(TICKETS_DIR, file), 'utf8'));
  allTickets[t.ticketId] = t;
}

console.log('Total ticket files:', files.length);

// === AUDIT 1: Missing tickets (canonical IDs without ticket files) ===
const missingTickets = [];
const presentCanonical = [];
for (const id of canonicalIds) {
  if (!allTickets[id]) {
    missingTickets.push(id);
  } else {
    presentCanonical.push(id);
  }
}

console.log('\n=== MISSING TICKETS ===');
console.log('Missing canonical ticket files:', missingTickets.length);
if (missingTickets.length > 0) {
  missingTickets.forEach(id => console.log('  MISSING:', id));
}

// === AUDIT 2: Gap analysis per canonical ticket ===
const gapTickets = [];
const passTickets = [];
const surfaceAudit = {};
const matrixRows = [];

for (const id of canonicalIds) {
  const t = allTickets[id];
  if (!t) continue;

  const gaps = [];

  // Status check
  if (t.status !== 'done') gaps.push('status=' + t.status);

  // gitDiscipline checks
  if (!t.gitDiscipline) {
    gaps.push('no_gitDiscipline');
  } else {
    if (t.gitDiscipline.ciGateStatus !== 'passed') gaps.push('ciGateStatus=' + t.gitDiscipline.ciGateStatus);
    if (t.gitDiscipline.noMixedScope !== true) gaps.push('noMixedScope=false');
    if (t.gitDiscipline.noConflictMarkers !== true) gaps.push('noConflictMarkers=false');
  }

  // statusHistory check
  const hist = t.statusHistory || [];
  const hasInProgress = hist.some(s => s && s.to === 'in_progress');
  const hasDone = hist.some(s => s && s.to === 'done');
  const hasHashChain = hist.length >= 2 && hist[0].prevHash === 'GENESIS' && hist.every(s => s.hash);

  if (!hasInProgress) gaps.push('no_in_progress_transition');
  if (!hasDone && t.status === 'done') gaps.push('no_done_transition');
  if (!hasHashChain && hist.length >= 2) gaps.push('broken_hash_chain');
  if (hist.length < 2 && t.status === 'done') gaps.push('statusHistory_too_short');

  // operatorChecks
  if (t.operatorChecks) {
    if (t.operatorChecks.blockingIssueCount === 0 && t.operatorChecks.noBlockingIssueRemaining !== true) {
      gaps.push('noBlockingIssueRemaining=false');
    }
  }

  // readiness
  if (t.readiness) {
    if (t.status === 'done' && t.readiness.productionGradeClaimed === true) {
      if (Array.isArray(t.readiness.pendingInternal) && t.readiness.pendingInternal.length > 0) {
        gaps.push('pendingInternal_not_empty');
      }
    }
  }

  // Build matrix row
  const row = {
    ticketId: id,
    status: t.status,
    statusHistoryHashChain: (hasHashChain && hist.length >= 2) ? 'YES' : 'NO',
    ciGateStatus: t.gitDiscipline ? t.gitDiscipline.ciGateStatus : 'missing',
    noMixedScope: t.gitDiscipline ? (t.gitDiscipline.noMixedScope === true ? 'YES' : 'NO') : 'missing',
    noConflictMarkers: t.gitDiscipline ? (t.gitDiscipline.noConflictMarkers === true ? 'YES' : 'NO') : 'missing',
    stagingEvidenceRef: 'N/A',  // Staging not deployed yet
    regressionRetestEvidence: 'N/A',  // Pre-deploy
    verdict: gaps.length === 0 ? 'PASS' : 'FAIL',
    gaps: gaps
  };

  // Check staging evidence
  if (t.gcpParity && Array.isArray(t.gcpParity.stagingUrls) && t.gcpParity.stagingUrls.length > 0) {
    row.stagingEvidenceRef = 'REF_PRESENT';
  }

  matrixRows.push(row);

  if (gaps.length === 0) {
    passTickets.push(id);
  } else {
    gapTickets.push({ id, gaps });
  }

  // Surface audit
  const s = t.surface || 'unknown';
  if (!surfaceAudit[s]) surfaceAudit[s] = { count: 0, done: 0, codeFix: 0, verifiedCorrect: 0, severities: {}, tickets: [] };
  surfaceAudit[s].count++;
  if (t.status === 'done') surfaceAudit[s].done++;

  const resType = t.resolution ? t.resolution.type : 'none';
  if (resType === 'code_fix' || resType === 'code-fix') surfaceAudit[s].codeFix++;
  if (resType === 'verified_correct' || resType === 'verified-correct' || resType === 'already_correct') surfaceAudit[s].verifiedCorrect++;

  const sev = t.severity || 'UNKNOWN';
  surfaceAudit[s].severities[sev] = (surfaceAudit[s].severities[sev] || 0) + 1;
  surfaceAudit[s].tickets.push({ id, status: t.status, resolution: resType, severity: sev });
}

// === PRINT RESULTS ===

console.log('\n=== CANONICAL TICKET AUDIT (203+1) ===');
console.log('Present:', presentCanonical.length);
console.log('Missing:', missingTickets.length);
console.log('PASS:', passTickets.length);
console.log('FAIL:', gapTickets.length);

if (gapTickets.length > 0) {
  console.log('\n=== GAP TICKETS ===');
  gapTickets.forEach(g => console.log('  FAIL:', g.id, '→', g.gaps.join(', ')));
}

console.log('\n=== SURFACE AUDIT ===');
for (const [surface, data] of Object.entries(surfaceAudit).sort((a,b) => b[1].count - a[1].count)) {
  console.log(`${surface}: ${data.count} tickets | ${data.done} done | ${data.codeFix} code-fix | ${data.verifiedCorrect} verified-correct`);
  console.log(`  Severities: ${JSON.stringify(data.severities)}`);
}

console.log('\n=== MATRIX VERDICT SUMMARY ===');
const passCount = matrixRows.filter(r => r.verdict === 'PASS').length;
const failCount = matrixRows.filter(r => r.verdict === 'FAIL').length;
console.log(`PASS: ${passCount} | FAIL: ${failCount}`);

// Write matrix to JSON for artifact generation
const output = {
  generatedAt: new Date().toISOString(),
  headSha: '8389d6bd',
  scope: 'POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203',
  canonicalTotal: canonicalIds.size,
  presentCount: presentCanonical.length,
  missingCount: missingTickets.length,
  passCount,
  failCount,
  missingTickets,
  gapTickets,
  surfaceAudit: Object.fromEntries(
    Object.entries(surfaceAudit).map(([k, v]) => [k, { count: v.count, done: v.done, codeFix: v.codeFix, verifiedCorrect: v.verifiedCorrect, severities: v.severities }])
  ),
  matrix: matrixRows
};

fs.writeFileSync(path.join(ROOT, 'workflow', 'state', 'reiteration_audit_result.json'), JSON.stringify(output, null, 2) + '\n');
console.log('\nAudit result written to workflow/state/reiteration_audit_result.json');
