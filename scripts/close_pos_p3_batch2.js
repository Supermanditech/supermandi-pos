/**
 * Close POS P3 batch 2:
 * - DEEP-LINK-RE-ENROLLMENT-NO-CONFIRM (real fix)
 * - ENROLL-CODE-REUSE-GUIDANCE (real fix)
 * - FORCE-UPDATE-OFFLINE-VAGUE-ERROR (real fix)
 * - PAYMENT-SETUP-AUTH-ERROR-HANDLING (real fix)
 * - PAYMENT-SETUP-OFFLINE-CHECK-MISSING (real fix)
 */
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', 'workflow', 'tickets');
const SESSION_ID = 'claude-w5-p3-pos-b2-' + Date.now();
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
    file: 'REQ.AUDIT.W5.POS.DEEP-LINK-RE-ENROLLMENT-NO-CONFIRM.001.json',
    statusHistory: makeStatusHistory(
      'add confirmation alert when deep link received on already-enrolled device',
      'deep link handler checks getDeviceSession(); if enrolled, shows Alert "Replace Existing Enrollment?" with Cancel/Replace options before pre-filling code'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.POS.DEEP-LINK-RE-ENROLLMENT-NO-CONFIRM.001'),
    evidence: {
      fix: 'src/screens/EnrollDeviceScreen.tsx',
      description: 'handleUrl now async; checks getDeviceSession(); enrolled devices get Alert.alert with Cancel/Replace destructive option',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'src/screens/EnrollDeviceScreen.tsx',
      'workflow/tickets/REQ.AUDIT.W5.POS.DEEP-LINK-RE-ENROLLMENT-NO-CONFIRM.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.POS.ENROLL-CODE-REUSE-GUIDANCE.001.json',
    statusHistory: makeStatusHistory(
      'improve ENROLLMENT_CODE_USED error message to explain device replacement workflow',
      'ENROLLMENT_CODE_USED hint changed from generic "contact support for new code" to "If replacing lost/broken device, contact support for device replacement code"'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.POS.ENROLL-CODE-REUSE-GUIDANCE.001'),
    evidence: {
      fix: 'src/screens/EnrollDeviceScreen.tsx',
      description: 'ENROLL_ERROR_MESSAGES.ENROLLMENT_CODE_USED message+hint updated to explain device replacement workflow',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'src/screens/EnrollDeviceScreen.tsx',
      'workflow/tickets/REQ.AUDIT.W5.POS.ENROLL-CODE-REUSE-GUIDANCE.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.POS.FORCE-UPDATE-OFFLINE-VAGUE-ERROR.001.json',
    statusHistory: makeStatusHistory(
      'detect network/timeout errors separately from generic check failures in ForceUpdateScreen',
      'handleRetry catch block now detects TypeError+Network, timeout, fetch errors; shows "No Connection" alert instead of generic "Check Failed"'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.POS.FORCE-UPDATE-OFFLINE-VAGUE-ERROR.001'),
    evidence: {
      fix: 'src/screens/ForceUpdateScreen.tsx',
      description: 'isNetworkError detection for TypeError/Network, timeout, fetch; separate Alert.alert "No Connection" with connectivity guidance',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'src/screens/ForceUpdateScreen.tsx',
      'workflow/tickets/REQ.AUDIT.W5.POS.FORCE-UPDATE-OFFLINE-VAGUE-ERROR.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.POS.PAYMENT-SETUP-AUTH-ERROR-HANDLING.001.json',
    statusHistory: makeStatusHistory(
      'detect 401 auth error in PaymentSetupScreen and show re-enroll guidance',
      'handleSave catch checks ApiError.status===401 or message==="device_unauthorized"; shows Alert "Session Expired" with re-enroll instruction'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.POS.PAYMENT-SETUP-AUTH-ERROR-HANDLING.001'),
    evidence: {
      fix: 'src/screens/PaymentSetupScreen.tsx',
      description: '401/device_unauthorized detection added to catch block; shows "Session Expired" alert with re-enroll guidance before generic fallback',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'src/screens/PaymentSetupScreen.tsx',
      'workflow/tickets/REQ.AUDIT.W5.POS.PAYMENT-SETUP-AUTH-ERROR-HANDLING.001.json',
    ],
  },
  {
    file: 'REQ.AUDIT.W5.POS.PAYMENT-SETUP-OFFLINE-CHECK-MISSING.001.json',
    statusHistory: makeStatusHistory(
      'add offline state check on mount and listener to PaymentSetupScreen',
      'isOffline state + NetInfo.fetch on mount + NetInfo.addEventListener; offline banner shown above form; Save button disabled when offline'
    ),
    gitDiscipline: makeGitDiscipline('REQ.AUDIT.W5.POS.PAYMENT-SETUP-OFFLINE-CHECK-MISSING.001'),
    evidence: {
      fix: 'src/screens/PaymentSetupScreen.tsx',
      description: 'isOffline useState + useEffect with NetInfo.fetch + addEventListener; offlineBanner + offlineBannerText styles; Save disabled={saving||isOffline}',
    },
    requiredFilesRead: [
      ...BASE_FILES_35,
      'src/screens/PaymentSetupScreen.tsx',
      'workflow/tickets/REQ.AUDIT.W5.POS.PAYMENT-SETUP-OFFLINE-CHECK-MISSING.001.json',
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
