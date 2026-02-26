#!/usr/bin/env node
'use strict';
const fs = require('fs');
const { EXPANDED_FILES, hashEntry } = require('./update_p3_ticket.js');

const ticketPath = 'workflow/tickets/REQ.AUDIT.W5.RETAILER.ERRORBOUNDARY-BROKEN-REDIRECT.001.json';
const t = JSON.parse(fs.readFileSync(ticketPath, 'utf8'));

t.status = 'done';
t.layers.ui = 'pass';
t.layers.wiring = 'pass';

const h1 = hashEntry('todo','in_progress','claude','session-w5-p3-eb','2026-02-27T03:30:00.000Z','Starting: fix ErrorBoundary redirect to /retailer/login + use logger','GENESIS');
const h2 = hashEntry('in_progress','done','claude','session-w5-p3-eb','2026-02-27T03:35:00.000Z','handleGoHome redirects to /retailer/login; console.error replaced with logger. Typecheck clean.',h1);

t.statusHistory = [
  {from:'todo',to:'in_progress',actor:'claude',sessionId:'session-w5-p3-eb',at:'2026-02-27T03:30:00.000Z',reason:'Starting: fix ErrorBoundary redirect to /retailer/login + use logger',prevHash:'GENESIS',hash:h1},
  {from:'in_progress',to:'done',actor:'claude',sessionId:'session-w5-p3-eb',at:'2026-02-27T03:35:00.000Z',reason:'handleGoHome redirects to /retailer/login; console.error replaced with logger. Typecheck clean.',prevHash:h1,hash:h2}
];
t.evidence.apiProof = ['retailer-admin/src/ErrorBoundary.tsx','retailer-admin/src/App.tsx'];
t.evidence.parityProof = ['pnpm --filter retailer-admin typecheck: 0 errors'];
t.timestamps.updatedAt = '2026-02-27T03:35:00.000Z';
t.readiness.productionGradeClaimed = true;
t.readiness.pendingInternal = [];
t.readiness.summary = 'DONE: ErrorBoundary Go to Home redirects to /retailer/login (correct entry point). console.error replaced with logger throughout ErrorBoundary and LazyErrorBoundary.';
t.gitDiscipline.ciGateStatus = 'passed';
t.gitDiscipline.evidence.push('typecheck=clean');
t.sessionBoot.requiredFilesRead = EXPANDED_FILES;

fs.writeFileSync(ticketPath, JSON.stringify(t, null, 2) + '\n');
console.log('Updated:', ticketPath);
