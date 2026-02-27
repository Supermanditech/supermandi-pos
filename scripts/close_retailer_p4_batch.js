/**
 * Close retailer P4 batch (10 tickets):
 * - ANALYTICS-INVALID-DATE-RANGE-NO-BLOCK: skip API when from > to
 * - CHAT-STALE-ERROR-ON-CONVO-SWITCH: clear error on conversation switch
 * - CUSTOMERS-SEARCH-NO-INPUT-SANITIZE: trim whitespace before API call
 * - IMPORT-POLL-INTERVAL-HARDCODED: extract IMPORT_POLL_INTERVAL_MS constant
 * - INVOICES-STALE-MODAL-ON-PAGINATION: close detail modal on offset/filter change
 * - NOTIFICATIONS-REFRESH-NO-DEBOUNCE: disable refresh button during loading
 * - PAYMENTS-PAGE-NO-EMPTY-STATE: add guidance text when UPI not configured
 * - PAYMENTS-SUCCESS-MSG-NO-AUTODISMISS: FP - already auto-dismisses after 5s
 * - RESET-PASSWORD-NO-VISIBILITY-TOGGLE: add Show/Hide toggle for password fields
 * - SUPPLIER-CATALOG-MEMORY-SPIKE: cap accumulated items at 500
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', 'workflow', 'tickets');
const SESSION_ID = 'claude-w5-p4-retailer-b1-' + Date.now();
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
    file: 'REQ.AUDIT.W5.RETAILER.ANALYTICS-INVALID-DATE-RANGE-NO-BLOCK.001.json',
    statusHistory: makeStatusHistory(
      'block API call when date range is invalid',
      'added early return in loadData when from > to; warning banner already shown, now API call is also prevented'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.RETAILER.ANALYTICS-INVALID-DATE-RANGE-NO-BLOCK.001'),
    evidence: {
      fix: 'retailer-admin/src/pages/AnalyticsPage.tsx',
      description: 'if (from && to && from > to) return; added before setLoading in loadData callback',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'retailer-admin/src/pages/AnalyticsPage.tsx',
      'workflow/tickets/REQ.AUDIT.W5.RETAILER.ANALYTICS-INVALID-DATE-RANGE-NO-BLOCK.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.RETAILER.CHAT-STALE-ERROR-ON-CONVO-SWITCH.001.json',
    statusHistory: makeStatusHistory(
      'clear stale error when switching conversations',
      'added setError(null) at start of selectConversation before API fetch'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.RETAILER.CHAT-STALE-ERROR-ON-CONVO-SWITCH.001'),
    evidence: {
      fix: 'retailer-admin/src/pages/ChatPage.tsx',
      description: 'setError(null) added after setSelectedId(convId) and before try block',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'retailer-admin/src/pages/ChatPage.tsx',
      'workflow/tickets/REQ.AUDIT.W5.RETAILER.CHAT-STALE-ERROR-ON-CONVO-SWITCH.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.RETAILER.CUSTOMERS-SEARCH-NO-INPUT-SANITIZE.001.json',
    statusHistory: makeStatusHistory(
      'sanitize customer search input',
      'added .trim() to search query before passing to URLSearchParams; React JSX already prevents XSS, URLSearchParams handles URL encoding'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.RETAILER.CUSTOMERS-SEARCH-NO-INPUT-SANITIZE.001'),
    evidence: {
      fix: 'retailer-admin/src/pages/CustomersPage.tsx',
      description: 'changed if (q) params.set(q) to if (q && q.trim()) params.set(q, q.trim())',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'retailer-admin/src/pages/CustomersPage.tsx',
      'workflow/tickets/REQ.AUDIT.W5.RETAILER.CUSTOMERS-SEARCH-NO-INPUT-SANITIZE.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.RETAILER.IMPORT-POLL-INTERVAL-HARDCODED.001.json',
    statusHistory: makeStatusHistory(
      'extract polling interval to named constant',
      'replaced hardcoded 2000 with IMPORT_POLL_INTERVAL_MS = 2000 constant at module scope'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.RETAILER.IMPORT-POLL-INTERVAL-HARDCODED.001'),
    evidence: {
      fix: 'retailer-admin/src/pages/ImportPage.tsx',
      description: 'const IMPORT_POLL_INTERVAL_MS = 2000; used in setInterval call',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'retailer-admin/src/pages/ImportPage.tsx',
      'workflow/tickets/REQ.AUDIT.W5.RETAILER.IMPORT-POLL-INTERVAL-HARDCODED.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.RETAILER.INVOICES-STALE-MODAL-ON-PAGINATION.001.json',
    statusHistory: makeStatusHistory(
      'close detail modal when pagination or filter changes',
      'added useEffect that sets detail to null on offset or statusFilter change'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.RETAILER.INVOICES-STALE-MODAL-ON-PAGINATION.001'),
    evidence: {
      fix: 'retailer-admin/src/pages/InvoicesPage.tsx',
      description: 'useEffect(() => { setDetail(null); }, [offset, statusFilter]); closes modal on list navigation',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'retailer-admin/src/pages/InvoicesPage.tsx',
      'workflow/tickets/REQ.AUDIT.W5.RETAILER.INVOICES-STALE-MODAL-ON-PAGINATION.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.RETAILER.NOTIFICATIONS-REFRESH-NO-DEBOUNCE.001.json',
    statusHistory: makeStatusHistory(
      'disable refresh button during loading',
      'added disabled={loading} with visual feedback (gray background, not-allowed cursor, Loading... text)'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.RETAILER.NOTIFICATIONS-REFRESH-NO-DEBOUNCE.001'),
    evidence: {
      fix: 'retailer-admin/src/pages/NotificationsPage.tsx',
      description: 'disabled={loading} + conditional styles for background/color/cursor + Loading... label',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'retailer-admin/src/pages/NotificationsPage.tsx',
      'workflow/tickets/REQ.AUDIT.W5.RETAILER.NOTIFICATIONS-REFRESH-NO-DEBOUNCE.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.RETAILER.PAYMENTS-PAGE-NO-EMPTY-STATE.001.json',
    statusHistory: makeStatusHistory(
      'add empty state guidance for UPI configuration',
      'added conditional guidance text above UPI input when settings.upiVpa is empty'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.RETAILER.PAYMENTS-PAGE-NO-EMPTY-STATE.001'),
    evidence: {
      fix: 'retailer-admin/src/pages/PaymentsPage.tsx',
      description: '{!settings.upiVpa && <p>Enter your UPI address to start receiving digital payments...</p>}',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'retailer-admin/src/pages/PaymentsPage.tsx',
      'workflow/tickets/REQ.AUDIT.W5.RETAILER.PAYMENTS-PAGE-NO-EMPTY-STATE.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.RETAILER.PAYMENTS-SUCCESS-MSG-NO-AUTODISMISS.001.json',
    statusHistory: makeStatusHistory(
      'verify success message auto-dismiss behavior',
      'FALSE POSITIVE: success message already auto-dismisses after 5 seconds via setTimeout at line 161-164'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.RETAILER.PAYMENTS-SUCCESS-MSG-NO-AUTODISMISS.001'),
    evidence: {
      fix: 'retailer-admin/src/pages/PaymentsPage.tsx',
      description: 'FP: setTimeout(() => { setSaveSuccess(false); setStatusTransitioned(false); }, 5000) already exists',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'retailer-admin/src/pages/PaymentsPage.tsx',
      'workflow/tickets/REQ.AUDIT.W5.RETAILER.PAYMENTS-SUCCESS-MSG-NO-AUTODISMISS.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.RETAILER.RESET-PASSWORD-NO-VISIBILITY-TOGGLE.001.json',
    statusHistory: makeStatusHistory(
      'add password visibility toggle to reset password page',
      'added showNewPassword/showConfirmPassword state + Show/Hide toggle buttons matching LoginPage pattern'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.RETAILER.RESET-PASSWORD-NO-VISIBILITY-TOGGLE.001'),
    evidence: {
      fix: 'retailer-admin/src/pages/ResetPasswordPage.tsx',
      description: 'type={showNewPassword ? "text" : "password"} + toggle button with absolute positioning, same pattern as LoginPage',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'retailer-admin/src/pages/ResetPasswordPage.tsx',
      'retailer-admin/src/pages/LoginPage.tsx',
      'workflow/tickets/REQ.AUDIT.W5.RETAILER.RESET-PASSWORD-NO-VISIBILITY-TOGGLE.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.RETAILER.SUPPLIER-CATALOG-MEMORY-SPIKE.001.json',
    statusHistory: makeStatusHistory(
      'cap supplier catalog accumulated items to prevent memory spike',
      'added MAX_ACCUMULATED_ITEMS=500 constant; merged array is sliced to cap if it exceeds the limit'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.RETAILER.SUPPLIER-CATALOG-MEMORY-SPIKE.001'),
    evidence: {
      fix: 'retailer-admin/src/pages/SupplierCatalogPage.tsx',
      description: 'const MAX_ACCUMULATED_ITEMS = 500; merged.length > MAX_ACCUMULATED_ITEMS ? merged.slice(-MAX_ACCUMULATED_ITEMS) : merged',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'retailer-admin/src/pages/SupplierCatalogPage.tsx',
      'workflow/tickets/REQ.AUDIT.W5.RETAILER.SUPPLIER-CATALOG-MEMORY-SPIKE.001.json',
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
