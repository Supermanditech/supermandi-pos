#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const statePath = path.join(ROOT, 'workflow/state/workflow_state.json');
const state = JSON.parse(fs.readFileSync(statePath, 'utf8'));

const impl = state.progress.liveIteration.implementation;
const remaining = impl.remainingTicketIds;
const completed = impl.completedTicketIds || [];

const ticketDir = path.join(ROOT, 'workflow/tickets');
const files = fs.readdirSync(ticketDir).filter(f => f.match(/^R7\.(RET|SA|SUP)\./));

const nowDone = [];
for (const f of files) {
  const t = JSON.parse(fs.readFileSync(path.join(ticketDir, f), 'utf8'));
  if (t.status === 'done' && remaining.includes(t.ticketId)) {
    nowDone.push(t.ticketId);
  }
}

console.log('Moving to completed:', nowDone.length);

impl.remainingTicketIds = remaining.filter(id => !nowDone.includes(id));
impl.completedTicketIds = completed.concat(nowDone);
state.updatedAt = '2026-02-26T13:00:00.000Z';

fs.writeFileSync(statePath, JSON.stringify(state, null, 2) + '\n');
console.log('remaining:', impl.remainingTicketIds.length);
console.log('completed:', impl.completedTicketIds.length);
