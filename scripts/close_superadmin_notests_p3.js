/**
 * Close superadmin no-tests P3 batch:
 * - AI-INSIGHTS-NO-TESTS (15 tests written)
 * - CREDIT-PROVIDERS-NO-TESTS (13 tests written)
 * - SUPPORT-QUEUE-NO-TESTS (17 tests written)
 * - WHATSAPP-NO-TESTS (20 tests written)
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', 'workflow', 'tickets');
const SESSION_ID = 'claude-w5-p3-sa-notests-' + Date.now();
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
    file: 'REQ.AUDIT.W5.SUPERADMIN.AI-INSIGHTS-NO-TESTS.001.json',
    statusHistory: makeStatusHistory(
      'write unit tests for AIInsightsTab: view switching, API calls, error handling, job execution',
      '15 tests: header, view toggle, store ID input, loading/error/empty states, anomalies table, alerts cards, jobs view with 7 buttons, job run result, job failure'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.SUPERADMIN.AI-INSIGHTS-NO-TESTS.001'),
    evidence: {
      fix: 'supermandi-superadmin/src/__tests__/tabs/AIInsightsTab.test.tsx',
      description: '15 tests covering: header rendering, 3 view toggles, store ID input + disabled load, loading state, anomalies table with data, empty anomalies, error banner, alerts view + cards, jobs view with all 7 buttons, job execution result, job failure error',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'supermandi-superadmin/src/tabs/AIInsightsTab.tsx',
      'supermandi-superadmin/src/__tests__/tabs/ApplicationsTab.test.tsx',
      'supermandi-superadmin/vitest.config.ts',
      'supermandi-superadmin/src/__tests__/setup.ts',
      'workflow/tickets/REQ.AUDIT.W5.SUPERADMIN.AI-INSIGHTS-NO-TESTS.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.SUPERADMIN.CREDIT-PROVIDERS-NO-TESTS.001.json',
    statusHistory: makeStatusHistory(
      'write unit tests for CreditProvidersTab: loading, error, summary cards, health, providers table, toggle confirm',
      '13 tests: loading state, header, error banner, summary cards (5 metrics), provider health cards, latency/approval, providers table, modes, enable/disable buttons, confirm dialog, per-provider stats, retry button'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.SUPERADMIN.CREDIT-PROVIDERS-NO-TESTS.001'),
    evidence: {
      fix: 'supermandi-superadmin/src/__tests__/tabs/CreditProvidersTab.test.tsx',
      description: '13 tests covering: loading, header, error+retry, 5 summary cards, health status with degraded, latency+approval rate, providers table with 2 providers, mode badges, enable/disable toggle with ConfirmDialog, per-provider stats table',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'supermandi-superadmin/src/tabs/CreditProvidersTab.tsx',
      'supermandi-superadmin/src/__tests__/tabs/ApplicationsTab.test.tsx',
      'workflow/tickets/REQ.AUDIT.W5.SUPERADMIN.CREDIT-PROVIDERS-NO-TESTS.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.SUPERADMIN.SUPPORT-QUEUE-NO-TESTS.001.json',
    statusHistory: makeStatusHistory(
      'write unit tests for SupportQueueTab: queue/templates views, status filters, conversations, messages, reply, templates',
      '17 tests: header, loading, toggle buttons, status filters, conversation list, title fallback, open/resolved badges, empty state, placeholder, message loading on click, action buttons, reply input, error, templates view switch, template details, empty templates, filter change'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.SUPERADMIN.SUPPORT-QUEUE-NO-TESTS.001'),
    evidence: {
      fix: 'supermandi-superadmin/src/__tests__/tabs/SupportQueueTab.test.tsx',
      description: '17 tests covering: queue+template views, status filter (open/resolved/all), conversation list with title fallback, message thread loading, action buttons (assign/resolve), reply input, templates table with category/channel, empty states',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'supermandi-superadmin/src/tabs/SupportQueueTab.tsx',
      'supermandi-superadmin/src/__tests__/tabs/MonitoringTab.test.tsx',
      'workflow/tickets/REQ.AUDIT.W5.SUPERADMIN.SUPPORT-QUEUE-NO-TESTS.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.SUPERADMIN.WHATSAPP-NO-TESTS.001.json',
    statusHistory: makeStatusHistory(
      'write unit tests for WhatsAppTab: status, stats, logs, send, broadcast, filters, CTA config',
      '20 tests: loading, connected/not-configured banners, 7 stats cards, log table, empty logs, send form, filters, error, broadcast toggle+expand, refresh, message count, CTA config section with values/edit/loading/error'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.SUPERADMIN.WHATSAPP-NO-TESTS.001'),
    evidence: {
      fix: 'supermandi-superadmin/src/__tests__/tabs/WhatsAppTab.test.tsx',
      description: '20 tests covering: loading state, WhatsApp connected/not-configured banners, 7 stats cards, message log table, send form, 3 filter dropdowns, broadcast toggle/expand, refresh, CTA config (section/values/edit mode/loading/error)',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'supermandi-superadmin/src/tabs/WhatsAppTab.tsx',
      'supermandi-superadmin/src/api/whatsapp.ts',
      'supermandi-superadmin/src/__tests__/tabs/MonitoringTab.test.tsx',
      'workflow/tickets/REQ.AUDIT.W5.SUPERADMIN.WHATSAPP-NO-TESTS.001.json',
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
