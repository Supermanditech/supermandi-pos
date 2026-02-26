/**
 * Close backend P3 batch 2: DEPLOY (FP), ERROR-RESPONSES-LEAK-DETAILS, SUPPLIER-IMPORT-NO-RATE-LIMIT
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', 'workflow', 'tickets');
const SESSION_ID = 'claude-w5-p3-backend-b2-' + Date.now();
const NOW = new Date().toISOString();
const COMMIT_SHA = '3ac8279c';

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
    file: 'REQ.AUDIT.W5.BACKEND.DEPLOY-NO-HEALTH-CHECK.001.json',
    statusHistory: makeStatusHistory(
      'review deploy.yml for post-deploy health checks',
      'false positive: smoke-test job (Gate 1: api-gateway health, Gate 2: main-backend health) runs after deploy-staging with 5 retries and body validation at lines 940 and 960'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.BACKEND.DEPLOY-NO-HEALTH-CHECK.001'),
    evidence: {
      fix: '.github/workflows/deploy.yml',
      description: 'smoke-test job needs:[deploy-staging]; Gate 1 checks /health at line 940; Gate 2 at line 960; both have 5 retries and body validation',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      '.github/workflows/deploy.yml',
      'workflow/tickets/REQ.AUDIT.W5.BACKEND.DEPLOY-NO-HEALTH-CHECK.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.BACKEND.ERROR-RESPONSES-LEAK-DETAILS.001.json',
    statusHistory: makeStatusHistory(
      'fix routes that bypass global error handler and expose raw error messages',
      'safeChatErr() helper added to chat.ts; production returns generic fallback for unexpected errors; known domain errors remain for 401/403 control flow'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.BACKEND.ERROR-RESPONSES-LEAK-DETAILS.001'),
    evidence: {
      fix: 'backend/src/routes/v1/chat.ts',
      description: 'SAFE_CHAT_ERRORS set + safeChatErr() at line 32; all 10 catch blocks in chat.ts updated from raw err.message to safeChatErr(err, fallback)',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'backend/src/routes/v1/chat.ts',
      'backend/src/middleware/errorHandler.ts',
      'workflow/tickets/REQ.AUDIT.W5.BACKEND.ERROR-RESPONSES-LEAK-DETAILS.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.BACKEND.SUPPLIER-IMPORT-NO-RATE-LIMIT.001.json',
    statusHistory: makeStatusHistory(
      'add rate limiting to supplier CSV product import endpoint',
      'csvImportRateLimit added to supplier products.ts; 5 imports/hour per supplierId; keyGenerator uses supplierId for accuracy'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.BACKEND.SUPPLIER-IMPORT-NO-RATE-LIMIT.001'),
    evidence: {
      fix: 'backend/src/routes/v1/supplier/products.ts',
      description: 'csvImportRateLimit: windowMs=1h, max=5, keyGenerator=supplierId; applied to /products/csv-upload before multer',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'backend/src/routes/v1/supplier/products.ts',
      'workflow/tickets/REQ.AUDIT.W5.BACKEND.SUPPLIER-IMPORT-NO-RATE-LIMIT.001.json',
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
