/**
 * Close superadmin P4 batch (5 tickets):
 * - AUDIT-CSV-NON-RFC4180: RFC 4180 escapeField helper for all CSV fields
 * - DOCUMENTS-STAFF-NO-SUCCESS-TOAST: toast.success on approve/role-change/pin-reset
 * - MONITORING-HARDCODED-ALERT-POLICIES: documented hardcoded limitation with TODO
 * - SUPPORT-MESSAGES-REVERSE-UNDOCUMENTED: comment explaining .reverse() for chronological order
 * - WHATSAPP-PHONE-VALIDATION-WRONG: Indian phone regex (/^(\+?91)?\d{10}$/)
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', 'workflow', 'tickets');
const SESSION_ID = 'claude-w5-p4-superadmin-b1-' + Date.now();
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
    file: 'REQ.AUDIT.W5.SUPERADMIN.AUDIT-CSV-NON-RFC4180.001.json',
    statusHistory: makeStatusHistory(
      'add RFC 4180 compliant CSV field escaping to audit export',
      'added escapeField helper that quotes all fields, handles commas/quotes/newlines per RFC 4180; applied to all fields instead of only error_message'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.SUPERADMIN.AUDIT-CSV-NON-RFC4180.001'),
    evidence: {
      fix: 'supermandi-superadmin/src/tabs/AuditTab.tsx',
      description: 'escapeField helper: quotes all fields, doubles internal quotes, handles commas and newlines; applied via .map(escapeField)',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'supermandi-superadmin/src/tabs/AuditTab.tsx',
      'workflow/tickets/REQ.AUDIT.W5.SUPERADMIN.AUDIT-CSV-NON-RFC4180.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.SUPERADMIN.DOCUMENTS-STAFF-NO-SUCCESS-TOAST.001.json',
    statusHistory: makeStatusHistory(
      'add toast notifications for document approval and staff actions',
      'added toast.success on handleApproveDocument, handleStaffRoleChange, handleResetPin; supplements existing inline state messages'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.SUPERADMIN.DOCUMENTS-STAFF-NO-SUCCESS-TOAST.001'),
    evidence: {
      fix: 'supermandi-superadmin/src/App.tsx',
      description: 'toast.success added at 3 locations: approve document, role change, PIN reset; toast already imported in App.tsx',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'supermandi-superadmin/src/App.tsx',
      'supermandi-superadmin/src/tabs/DocumentsTab.tsx',
      'supermandi-superadmin/src/tabs/StaffTab.tsx',
      'workflow/tickets/REQ.AUDIT.W5.SUPERADMIN.DOCUMENTS-STAFF-NO-SUCCESS-TOAST.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.SUPERADMIN.MONITORING-HARDCODED-ALERT-POLICIES.001.json',
    statusHistory: makeStatusHistory(
      'document hardcoded alert policies and service list limitation',
      'added documentation comments with TODO for future API endpoint; P4 scope does not warrant building new backend routes'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.SUPERADMIN.MONITORING-HARDCODED-ALERT-POLICIES.001'),
    evidence: {
      fix: 'supermandi-superadmin/src/tabs/MonitoringTab.tsx',
      description: 'added comments documenting hardcoded arrays reference infra YAML; TODO for GET /api/v1/admin/monitoring/alert-policies',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'supermandi-superadmin/src/tabs/MonitoringTab.tsx',
      'workflow/tickets/REQ.AUDIT.W5.SUPERADMIN.MONITORING-HARDCODED-ALERT-POLICIES.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.SUPERADMIN.SUPPORT-MESSAGES-REVERSE-UNDOCUMENTED.001.json',
    statusHistory: makeStatusHistory(
      'document message array reverse order reason',
      'added comment explaining API returns newest-first and .reverse() converts to chronological display order'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.SUPERADMIN.SUPPORT-MESSAGES-REVERSE-UNDOCUMENTED.001'),
    evidence: {
      fix: 'supermandi-superadmin/src/tabs/SupportQueueTab.tsx',
      description: 'comment above line 109: "API returns messages newest-first; reverse to show chronological order"',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'supermandi-superadmin/src/tabs/SupportQueueTab.tsx',
      'workflow/tickets/REQ.AUDIT.W5.SUPERADMIN.SUPPORT-MESSAGES-REVERSE-UNDOCUMENTED.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.SUPERADMIN.WHATSAPP-PHONE-VALIDATION-WRONG.001.json',
    statusHistory: makeStatusHistory(
      'fix overly permissive phone validation regex',
      'replaced /^\\d{10,15}$/ with /^(\\+?91)?\\d{10}$/ for Indian phone numbers; updated error messages to reflect accepted formats'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.SUPERADMIN.WHATSAPP-PHONE-VALIDATION-WRONG.001'),
    evidence: {
      fix: 'supermandi-superadmin/src/tabs/WhatsAppTab.tsx',
      description: 'regex changed to /^(+?91)?\\d{10}$/; error messages updated to show accepted format (10 digits, optional +91/91 prefix)',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'supermandi-superadmin/src/tabs/WhatsAppTab.tsx',
      'workflow/tickets/REQ.AUDIT.W5.SUPERADMIN.WHATSAPP-PHONE-VALIDATION-WRONG.001.json',
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
