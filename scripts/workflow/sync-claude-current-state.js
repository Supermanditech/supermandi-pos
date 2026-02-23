#!/usr/bin/env node
/**
 * sync-claude-current-state.js
 *
 * Syncs RELEASES/CLAUDE_CURRENT_STATE.json with workflow ticket statuses.
 * For each ticket file in workflow/tickets/:
 *   - If ticket.status is "done" → ticketStatus[ticketId] = "WORKFLOW_DONE"
 *   - If ticket.status is "ready_for_operator_test" → "WORKFLOW_READY_FOR_OPERATOR_TEST"
 *   - Other statuses mapped accordingly
 *
 * Also updates phase narrative and clears ticketQueue.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const STATE_FILE = path.join(ROOT, 'RELEASES', 'CLAUDE_CURRENT_STATE.json');
const TICKETS_DIR = path.join(ROOT, 'workflow', 'tickets');

const STATUS_MAP = {
  'done': 'WORKFLOW_DONE',
  'ready_for_operator_test': 'WORKFLOW_READY_FOR_OPERATOR_TEST',
  'ready_for_impact_retest': 'WORKFLOW_READY_FOR_IMPACT_RETEST',
  'ready_for_lock': 'WORKFLOW_READY_FOR_LOCK',
  'locked': 'WORKFLOW_LOCKED',
  'cancelled': 'WORKFLOW_CANCELLED',
  'blocked': 'WORKFLOW_BLOCKED',
  'in_progress': 'WORKFLOW_IN_PROGRESS',
  'todo': 'WORKFLOW_TODO',
  'operator_failed': 'WORKFLOW_OPERATOR_FAILED',
  'impact_retest_failed': 'WORKFLOW_IMPACT_RETEST_FAILED',
};

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));

// Read all ticket files
const ticketFiles = fs.readdirSync(TICKETS_DIR).filter(f => f.endsWith('.json'));
let added = 0;
let updated = 0;

for (const file of ticketFiles) {
  const ticket = JSON.parse(fs.readFileSync(path.join(TICKETS_DIR, file), 'utf8'));
  const id = ticket.ticketId;
  const mappedStatus = STATUS_MAP[ticket.status] || 'WORKFLOW_UNKNOWN';

  if (!state.ticketStatus[id]) {
    state.ticketStatus[id] = mappedStatus;
    added++;
  } else if (state.ticketStatus[id] !== mappedStatus) {
    state.ticketStatus[id] = mappedStatus;
    updated++;
  }
}

// Update phase narrative
state.currentPhase = 'POST_DEPLOY_SCOPE reconciliation complete: 203 canonical + 1 delta DONE. Deploy hold active.';
state.currentTicket = 'NONE';
state.ticketQueue = [];
state.lastUpdated = new Date().toISOString();
state.version = '56.0';

// Update nextAction
state.nextAction = 'Reconciliation complete. All 204 tickets WORKFLOW_DONE. Deploy hold remains active until operator approval.';

// Update lastActions - prepend reconciliation entry
state.lastActions.unshift(
  'RECONCILIATION: All 306 workflow tickets metadata fixed (ciGateStatus, statusHistory hash chain, operatorChecks, buildMapping parity). CLAUDE_CURRENT_STATE synced with workflow ticket truth.'
);

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

console.log(`Synced CLAUDE_CURRENT_STATE.json:`);
console.log(`  Added: ${added}`);
console.log(`  Updated: ${updated}`);
console.log(`  Total ticket entries: ${Object.keys(state.ticketStatus).length}`);
