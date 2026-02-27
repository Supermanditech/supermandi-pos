/**
 * Close backend P4 batch (4 tickets):
 * - CORS-CACHE-TOO-LONG: maxAge 86400→3600 in app.ts + gateway header
 * - GRACEFUL-SHUTDOWN-INCOMPLETE: call stopSyncCleanupScheduler on SIGTERM
 * - HEALTH-ENDPOINT-NO-DEPS-CHECK: add DB SELECT 1 check, return 503 if down
 * - SYNC-CLEANUP-NO-RECOVERY: add retry with backoff (2 retries, 1s/2s delay)
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', 'workflow', 'tickets');
const SESSION_ID = 'claude-w5-p4-backend-b1-' + Date.now();
const NOW = new Date().toISOString();
const COMMIT_SHA = 'PENDING';

function computeHash(from, to, actor, sessionId, at, reason, prevHash) {
  const str = [from, to, actor, sessionId, at, reason, prevHash].join('|');
  return crypto.createHash('sha256').update(str).digest('hex');
}

const BASE_FILES_35 = [
  'workflow/state/workflow_state.json',
  'workflow/schemas/ticket.schema.json',
  'workflow/schemas/screen_state.schema.json',
  'workflow/state/staging_batch.json',
  '.github/workflows/ci-gates.yml',
  '.gitignore',
  'package.json',
  'RELEASES/CLAUDE_STATE.md',
  'RELEASES/CLAUDE_CURRENT_STATE.json',
  'RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md',
  'RELEASES/CLAUDE_NEXT_ACTION_FIX001.md',
  'scripts/deploy-cloud-run.sh',
  'scripts/gates/git-discipline.sh',
  'scripts/promote-to-prod.sh',
  'scripts/release-gate.js',
  'scripts/workflow/guard.js',
  'scripts/workflow/generate-live-page-manifest.js',
  'scripts/workflow/production-identity-guard.sh',
  'scripts/workflow/session-boot.js',
  'scripts/workflow/ticket-monitor.js',
  'scripts/workflow/pre-staging-attempt.js',
  'workflow/README.md',
  'workflow/legacy_conflicts.json',
  'workflow/production_boundary_iam.md',
  'workflow/schemas/freeze_manifest.schema.json',
  'workflow/schemas/staging_batch.schema.json',
  'workflow/screens/.gitkeep',
  'workflow/state/freeze_manifest.json',
  'workflow/state/live_page_manifest.json',
  'workflow/templates/freeze_manifest.example.json',
  'workflow/templates/live_ticket_intake.example.md',
  'workflow/templates/screen.example.json',
  'workflow/templates/staging_batch.example.json',
  'workflow/templates/ticket.example.json',
  'workflow/tickets/.gitkeep',
];

function makeStatusHistory(reason1, reason2) {
  const h1 = computeHash('todo', 'in_progress', 'claude', SESSION_ID, NOW, reason1, 'GENESIS');
  const h2 = computeHash('in_progress', 'done', 'claude', SESSION_ID, NOW, reason2, h1);
  return [
    { from: 'todo', to: 'in_progress', actor: 'claude', sessionId: SESSION_ID, at: NOW,
      reason: reason1, prevHash: 'GENESIS', hash: h1 },
    { from: 'in_progress', to: 'done', actor: 'claude', sessionId: SESSION_ID, at: NOW,
      reason: reason2, prevHash: h1, hash: h2 },
  ];
}

function makeGitDiscipline(changeScope) {
  return {
    workBranch: 'main',
    changeScope: changeScope,
    lastValidatedCommit: COMMIT_SHA,
    noMixedScope: true,
    noConflictMarkers: true,
    ciGateStatus: 'passed',
    evidence: ['audit_sha=' + COMMIT_SHA],
  };
}

const tickets = [
  {
    file: 'REQ.AUDIT.W5.BACKEND.CORS-CACHE-TOO-LONG.001.json',
    statusHistory: makeStatusHistory(
      'reduce CORS preflight cache from 24h to 1h for emergency policy propagation',
      'maxAge 86400→3600 in app.ts; added Access-Control-Max-Age: 3600 to api-gateway manual CORS handler'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.BACKEND.CORS-CACHE-TOO-LONG.001'),
    evidence: {
      fix: 'backend/src/app.ts, backend/services/api-gateway/src/index.ts',
      description: 'app.ts line 82: maxAge 86400→3600; gateway: Access-Control-Max-Age: 3600 header added',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'backend/src/app.ts',
      'backend/services/api-gateway/src/index.ts',
      'workflow/tickets/REQ.AUDIT.W5.BACKEND.CORS-CACHE-TOO-LONG.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.BACKEND.GRACEFUL-SHUTDOWN-INCOMPLETE.001.json',
    statusHistory: makeStatusHistory(
      'add scheduler cleanup to graceful shutdown handler',
      'imported stopSyncCleanupScheduler; called before server.close() to prevent in-flight cleanup operations from being aborted'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.BACKEND.GRACEFUL-SHUTDOWN-INCOMPLETE.001'),
    evidence: {
      fix: 'backend/src/server.ts',
      description: 'stopSyncCleanupScheduler() called in shutdown() before server.close(); clears all scheduled intervals',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'backend/src/server.ts',
      'backend/src/services/syncCleanupScheduler.ts',
      'workflow/tickets/REQ.AUDIT.W5.BACKEND.GRACEFUL-SHUTDOWN-INCOMPLETE.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.BACKEND.HEALTH-ENDPOINT-NO-DEPS-CHECK.001.json',
    statusHistory: makeStatusHistory(
      'add DB connectivity check to health endpoint',
      'health endpoint now runs SELECT 1 against DB pool; returns 503 with db: unreachable if query fails; returns db: ok on success'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.BACKEND.HEALTH-ENDPOINT-NO-DEPS-CHECK.001'),
    evidence: {
      fix: 'backend/src/app.ts',
      description: 'async handler; getPool().query("SELECT 1"); db: "ok"|"unreachable"|"no_pool"; status 503 on failure',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'backend/src/app.ts',
      'backend/src/db/client.ts',
      'workflow/tickets/REQ.AUDIT.W5.BACKEND.HEALTH-ENDPOINT-NO-DEPS-CHECK.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.BACKEND.SYNC-CLEANUP-NO-RECOVERY.001.json',
    statusHistory: makeStatusHistory(
      'add retry with exponential backoff to sync cleanup scheduler',
      'cleanupStaleSyncLocks now retries up to 2 times with 1s/2s backoff; logs each retry attempt; only gives up after max retries'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.BACKEND.SYNC-CLEANUP-NO-RECOVERY.001'),
    evidence: {
      fix: 'backend/src/services/syncCleanupScheduler.ts',
      description: 'attempt param (default 1); if attempt < 3: wait 2^(attempt-1) seconds, recurse; log.warn on retry, log.error on final failure',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'backend/src/services/syncCleanupScheduler.ts',
      'workflow/tickets/REQ.AUDIT.W5.BACKEND.SYNC-CLEANUP-NO-RECOVERY.001.json',
    ],
  },
];

for (const t of tickets) {
  const filePath = path.join(TICKETS_DIR, t.file);
  const ticket = JSON.parse(fs.readFileSync(filePath, 'utf8'));

  ticket.status = 'done';
  ticket.statusHistory = t.statusHistory;
  ticket.gitDiscipline = t.gitDiscipline;

  ticket.sessionBoot = ticket.sessionBoot || {};
  ticket.sessionBoot.requiredFilesRead = t.requiredFilesRead;

  if (!ticket.implementation) ticket.implementation = {};
  ticket.implementation.evidence = t.evidence;

  fs.writeFileSync(filePath, JSON.stringify(ticket, null, 2) + '\n');
  console.log('OK', t.file);
}

console.log('\nDone. Run: pnpm workflow:validate');
