#!/usr/bin/env node
/**
 * Reconcile workflow_state implementation queue from ticket statuses.
 *
 * Moves done/cancelled tickets from remainingTicketIds -> completedTicketIds.
 * Keeps other statuses in remaining.
 */
const fs = require('fs');
const path = require('path');

const ROOT = process.cwd();
const STATE_FILE = path.join(ROOT, 'workflow', 'state', 'workflow_state.json');
const TICKET_DIR = path.join(ROOT, 'workflow', 'tickets');

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function isClosedStatus(status) {
  return status === 'done' || status === 'cancelled';
}

function main() {
  const state = readJson(STATE_FILE);
  const impl = state?.progress?.liveIteration?.implementation;
  if (!impl) {
    throw new Error('missing progress.liveIteration.implementation block');
  }

  const remaining = Array.isArray(impl.remainingTicketIds) ? impl.remainingTicketIds : [];
  const completedSet = new Set(Array.isArray(impl.completedTicketIds) ? impl.completedTicketIds : []);

  const nextRemaining = [];
  let moved = 0;

  for (const ticketId of remaining) {
    const ticketFile = path.join(TICKET_DIR, `${ticketId}.json`);
    if (!fs.existsSync(ticketFile)) {
      nextRemaining.push(ticketId);
      continue;
    }
    const ticket = readJson(ticketFile);
    if (isClosedStatus(ticket.status)) {
      completedSet.add(ticketId);
      moved += 1;
    } else {
      nextRemaining.push(ticketId);
    }
  }

  impl.remainingTicketIds = nextRemaining;
  impl.completedTicketIds = Array.from(completedSet);
  impl.complete = nextRemaining.length === 0 && impl.completedTicketIds.length > 0;

  const now = new Date().toISOString();
  impl.lastUpdatedAt = now;
  state.updatedAt = now;
  if (state.timestamps && typeof state.timestamps === 'object') {
    state.timestamps.updatedAt = now;
  }
  if (state.lastUpdated) {
    state.lastUpdated = now;
  }

  writeJson(STATE_FILE, state);
  console.log(
    `Reconciled implementation queue: moved=${moved} remaining=${nextRemaining.length} completed=${impl.completedTicketIds.length}`
  );
}

main();
