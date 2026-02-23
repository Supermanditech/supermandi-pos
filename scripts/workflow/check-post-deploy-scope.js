#!/usr/bin/env node
/**
 * Scope verifier for post-deploy canonical execution set.
 * Source of truth:
 * - RELEASES/AUDIT_R1234_FINAL_CANONICAL_DEDUPE_2026-02-23.json
 * - workflow/tickets/*.json
 */

const fs = require('fs');
const path = require('path');

const strict = process.argv.includes('--strict');
const root = process.cwd();
const canonicalFile = path.join(
  root,
  'RELEASES',
  'AUDIT_R1234_FINAL_CANONICAL_DEDUPE_2026-02-23.json'
);
const ticketsDir = path.join(root, 'workflow', 'tickets');

if (!fs.existsSync(canonicalFile)) {
  console.error(`[SCOPE-CHECK] Missing canonical file: ${canonicalFile}`);
  process.exit(2);
}
if (!fs.existsSync(ticketsDir)) {
  console.error(`[SCOPE-CHECK] Missing tickets directory: ${ticketsDir}`);
  process.exit(2);
}

const canonical = JSON.parse(fs.readFileSync(canonicalFile, 'utf8'));
const canonicalIds = canonical?.canonicalTickets?.allFinal || [];
const canonicalTotal = canonicalIds.length;

const ticketFiles = fs
  .readdirSync(ticketsDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => path.join(ticketsDir, f));

const byId = new Map();
for (const file of ticketFiles) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (data.ticketId) {
      byId.set(data.ticketId, { status: data.status || 'unknown', file });
    }
  } catch (err) {
    console.warn(`[SCOPE-CHECK] Skipping unreadable ticket JSON: ${file}`);
  }
}

const closed = new Set(['done', 'locked', 'cancelled']);
const openByStatus = {};
const missingTicketFiles = [];
const openTicketIds = [];
const closedTicketIds = [];

for (const id of canonicalIds) {
  const rec = byId.get(id);
  if (!rec) {
    missingTicketFiles.push(id);
    continue;
  }
  if (closed.has(rec.status)) {
    closedTicketIds.push(id);
  } else {
    openTicketIds.push(id);
    openByStatus[rec.status] = (openByStatus[rec.status] || 0) + 1;
  }
}

const result = {
  reference:
    'POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203',
  canonicalTotal,
  expectedCanonicalTotal: 203,
  mappedRound4Rows: canonical?.totals?.round4Rows || null,
  missingTicketFiles: missingTicketFiles.length,
  openTickets: openTicketIds.length,
  closedTickets: closedTicketIds.length,
  openByStatus,
  sampleMissingTicketFiles: missingTicketFiles.slice(0, 25),
  sampleOpenTicketIds: openTicketIds.slice(0, 25),
  canClaimAllCompleted:
    canonicalTotal === 203 &&
    missingTicketFiles.length === 0 &&
    openTicketIds.length === 0,
};

console.log(JSON.stringify(result, null, 2));

if (strict && !result.canClaimAllCompleted) {
  process.exit(1);
}
