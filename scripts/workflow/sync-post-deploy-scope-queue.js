#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const SCOPE_REF = 'POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203';
const CANONICAL_FILE = path.join(
  ROOT_DIR,
  'RELEASES',
  'AUDIT_R1234_FINAL_CANONICAL_DEDUPE_2026-02-23.json'
);
const WORKFLOW_STATE_FILE = path.join(ROOT_DIR, 'workflow', 'state', 'workflow_state.json');
const TICKETS_DIR = path.join(ROOT_DIR, 'workflow', 'tickets');
const CLOSED_STATUSES = new Set(['done', 'locked', 'cancelled']);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  return {
    write: argv.includes('--write'),
  };
}

function listTicketFiles() {
  if (!fs.existsSync(TICKETS_DIR)) {
    return [];
  }
  return fs
    .readdirSync(TICKETS_DIR)
    .filter((file) => file.toLowerCase().endsWith('.json'))
    .map((file) => path.join(TICKETS_DIR, file));
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const canonical = readJson(CANONICAL_FILE);
  const workflowState = readJson(WORKFLOW_STATE_FILE);
  const canonicalIds = Array.isArray(canonical?.canonicalTickets?.allFinal)
    ? canonical.canonicalTickets.allFinal
    : [];

  const byId = new Map();
  for (const file of listTicketFiles()) {
    const ticket = readJson(file);
    if (ticket.ticketId) {
      byId.set(ticket.ticketId, ticket);
    }
  }

  const missing = [];
  const scopeRemaining = [];
  const scopeCompleted = [];

  for (const ticketId of canonicalIds) {
    const ticket = byId.get(ticketId);
    if (!ticket) {
      missing.push(ticketId);
      continue;
    }
    if (CLOSED_STATUSES.has(ticket.status)) {
      scopeCompleted.push(ticketId);
    } else {
      scopeRemaining.push(ticketId);
    }
  }

  const impl = workflowState?.progress?.liveIteration?.implementation;
  if (!impl || typeof impl !== 'object') {
    throw new Error('workflow_state missing progress.liveIteration.implementation');
  }

  const existingCompleted = Array.isArray(impl.completedTicketIds) ? impl.completedTicketIds : [];
  const existingRemaining = Array.isArray(impl.remainingTicketIds) ? impl.remainingTicketIds : [];

  const mergedCompleted = Array.from(new Set([...existingCompleted, ...scopeCompleted]));
  const scopeIdSet = new Set(canonicalIds);
  const nonScopeRemaining = existingRemaining.filter((id) => !scopeIdSet.has(id));
  const mergedRemaining = Array.from(new Set([...nonScopeRemaining, ...scopeRemaining]));

  const summary = {
    reference: SCOPE_REF,
    canonicalTotal: canonicalIds.length,
    missingTicketFiles: missing.length,
    scopeRemaining: scopeRemaining.length,
    scopeCompleted: scopeCompleted.length,
    mergedRemainingTotal: mergedRemaining.length,
    mergedCompletedTotal: mergedCompleted.length,
    writeMode: args.write,
    missingSample: missing.slice(0, 25),
  };

  if (!args.write) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (missing.length > 0) {
    console.error(JSON.stringify(summary, null, 2));
    console.error('[SCOPE-SYNC] Refusing write: missing canonical ticket JSON files.');
    process.exit(1);
  }

  workflowState.progress.liveIteration.phase = 'implementation';
  workflowState.progress.liveIteration.implementation.remainingTicketIds = mergedRemaining;
  workflowState.progress.liveIteration.implementation.completedTicketIds = mergedCompleted;
  workflowState.progress.liveIteration.implementation.complete = mergedRemaining.length === 0;
  workflowState.progress.liveIteration.implementation.summary =
    `${SCOPE_REF}: remaining=${mergedRemaining.length}, completed=${mergedCompleted.length}`;
  const now = new Date().toISOString();
  workflowState.progress.liveIteration.implementation.lastUpdatedAt = now;
  workflowState.updatedAt = now;
  workflowState.lastUpdated = now;
  workflowState.timestamps = workflowState.timestamps || {};
  workflowState.timestamps.updatedAt = now;

  writeJson(WORKFLOW_STATE_FILE, workflowState);
  console.log(JSON.stringify(summary, null, 2));
}

main();
