#!/usr/bin/env node
/**
 * Updates CLAUDE_CURRENT_STATE.json for R5 ticketization completion.
 * - Bumps version to 57.0
 * - Updates currentPhase
 * - Updates lastUpdated
 * - Adds R5 ticketization summary to ticketStatus (172 new R5.* entries)
 */
const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '..', '..', 'RELEASES', 'CLAUDE_CURRENT_STATE.json');
const TRACE_FILE = path.join(__dirname, '..', '..', 'workflow', 'state', 'r5_ticketization_trace.json');

const state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
const trace = JSON.parse(fs.readFileSync(TRACE_FILE, 'utf8'));

// Bump version
state.version = '57.0';
state.lastUpdated = new Date().toISOString();
state.currentPhase = 'R5_TICKETIZATION_COMPLETE: 172 net-new R5 audit tickets created (478 total). Deploy hold active. Implementation pending.';
state.currentTicket = 'NONE';

// Add all 172 R5 ticket IDs to ticketStatus as WORKFLOW_DONE (ticketized, not implemented)
for (const ticketId of trace.ticketIds) {
  state.ticketStatus[ticketId] = 'WORKFLOW_DONE';
}

fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n');

console.log(`State file updated to v${state.version}`);
console.log(`Added ${trace.ticketIds.length} R5 ticket entries to ticketStatus`);
console.log(`Total ticketStatus entries: ${Object.keys(state.ticketStatus).length}`);
console.log(`Phase: ${state.currentPhase}`);
