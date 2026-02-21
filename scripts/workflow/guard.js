#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const WORKFLOW_DIR = path.join(ROOT_DIR, 'workflow');
const STATE_FILE = path.join(WORKFLOW_DIR, 'state', 'workflow_state.json');
const FREEZE_FILE = path.join(WORKFLOW_DIR, 'state', 'freeze_manifest.json');
const STAGING_BATCH_FILE = path.join(WORKFLOW_DIR, 'state', 'staging_batch.json');
const LEGACY_CONFLICTS_FILE = path.join(WORKFLOW_DIR, 'legacy_conflicts.json');
const TICKETS_DIR = path.join(WORKFLOW_DIR, 'tickets');
const SCREENS_DIR = path.join(WORKFLOW_DIR, 'screens');

const MODES = new Set([
  'LIVE_FIX',
  'FREEZE_CANDIDATE',
  'FREEZE_READY',
  'PROD_PROMOTE',
  'PROD_LOCKED',
]);
const REQUIRED_LAYERS = [
  'ui',
  'ux',
  'professional_polish',
  'wiring',
  'navigation',
  'api',
  'backend',
  'db',
  'migration',
  'gcp_parity',
];
const TICKET_STATUS_VALUES = new Set([
  'todo',
  'in_progress',
  'ready_for_operator_test',
  'operator_failed',
  'ready_for_impact_retest',
  'impact_retest_failed',
  'ready_for_lock',
  'locked',
  'cancelled',
]);
const ACTIVE_TICKET_STATUSES = new Set([
  'todo',
  'in_progress',
  'ready_for_operator_test',
  'operator_failed',
  'ready_for_impact_retest',
  'impact_retest_failed',
  'ready_for_lock',
]);
const WIP_TICKET_STATUSES = new Set([
  'in_progress',
  'ready_for_operator_test',
  'operator_failed',
  'ready_for_impact_retest',
  'impact_retest_failed',
  'ready_for_lock',
]);
const SCREEN_STATUS_VALUES = new Set([
  'not_started',
  'in_audit',
  'in_fix',
  'ready_for_certification',
  'certified',
  'reopened',
]);
const REQUIRED_SERVICES = new Set([
  'api-gateway',
  'main-backend',
  'retailer-admin',
  'supplier-portal',
  'superadmin',
  'landing',
]);
const READY_STATUSES = new Set([
  'ready_for_operator_test',
  'ready_for_impact_retest',
  'ready_for_lock',
  'locked',
]);
const LOCK_READY_STATUSES = new Set([
  'ready_for_lock',
  'locked',
]);
const REQUIRED_SESSION_BOOT_FILES = [
  'workflow/state/workflow_state.json',
  'workflow/schemas/ticket.schema.json',
  'workflow/schemas/screen_state.schema.json',
  'workflow/state/staging_batch.json',
];
const INVARIANT_KEYS = [
  'sellPurchaseIsolation',
  'deterministicScanIntentResolution',
  'frontendBackendStateParity',
  'offlineFirstSafeSync',
  'idempotentTransactionProcessing',
  'atomicDatabaseWrites',
  'strictSchemaValidation',
  'zeroSilentFailures',
  'structuredAuditLogging',
];
const INVARIANT_STATUS_VALUES = new Set(['pending', 'pass', 'fail', 'na']);

function usage() {
  console.log(`
Workflow guard usage:

  node scripts/workflow/guard.js validate-state
  node scripts/workflow/guard.js sync-state
  node scripts/workflow/guard.js validate-ticket --file <ticket.json>
  node scripts/workflow/guard.js validate-screen --file <screen.json>
  node scripts/workflow/guard.js validate-freeze [--file <manifest.json>] [--strict] [--sha <sha>]
  node scripts/workflow/guard.js validate-batch [--file <staging_batch.json>]
  node scripts/workflow/guard.js legacy-audit [--strict]
  node scripts/workflow/guard.js ticket-transition --file <ticket.json> --to <status> --actor <claude|operator> --reason "<text>"
  node scripts/workflow/guard.js screen-transition --file <screen.json> --to <status> --actor <claude|operator> --reason "<text>"
  node scripts/workflow/guard.js pre-staging-deploy
  node scripts/workflow/guard.js pre-promote --sha <sha>
  node scripts/workflow/guard.js mode --set <LIVE_FIX|FREEZE_CANDIDATE|FREEZE_READY|PROD_PROMOTE|PROD_LOCKED>
  node scripts/workflow/guard.js resolve-contradiction --id <CC-XXX>
`);
}

function fail(message) {
  console.error(`[WORKFLOW_GUARD] FAIL: ${message}`);
  process.exit(1);
}

function ok(message) {
  console.log(`[WORKFLOW_GUARD] OK: ${message}`);
}

function getWorkflowActor() {
  return (process.env.WORKFLOW_ACTOR || '').trim().toLowerCase();
}

function requireWorkflowActor(expectedActor, actionName) {
  const actual = getWorkflowActor();
  if (actual !== expectedActor) {
    fail(`${actionName} requires WORKFLOW_ACTOR=${expectedActor}`);
  }
}

function resolveTransitionSessionId(state, actionName) {
  const rules = state?.rules?.sessionRules || {};
  const requireSessionId = rules.requireSessionIdForTransitions === true;
  const envVar = isNonEmptyString(rules.sessionIdEnvVar) ? rules.sessionIdEnvVar : 'WORKFLOW_SESSION_ID';
  const sessionId = (process.env[envVar] || '').trim();

  if (requireSessionId && !sessionId) {
    fail(`${actionName} requires ${envVar} to be set`);
  }
  return sessionId || 'SESSION-UNSPECIFIED';
}

function readJson(filePath) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    fail(`Cannot read JSON file ${path.relative(ROOT_DIR, filePath)}: ${error.message}`);
  }
}

function writeJson(filePath, payload) {
  const serialized = `${JSON.stringify(payload, null, 2)}\n`;
  fs.writeFileSync(filePath, serialized, 'utf8');
}

function getArg(args, flag) {
  const idx = args.indexOf(flag);
  if (idx === -1 || idx + 1 >= args.length) {
    return '';
  }
  return args[idx + 1];
}

function listJsonFiles(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  return fs
    .readdirSync(dirPath)
    .filter((fileName) => fileName.toLowerCase().endsWith('.json'))
    .map((fileName) => path.join(dirPath, fileName));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isBoolean(value) {
  return typeof value === 'boolean';
}

function isClosedTicketStatus(status) {
  return status === 'locked' || status === 'cancelled';
}

function getTicketTransitions(state) {
  return state?.rules?.ticketStateMachine?.transitions || [];
}

function getScreenTransitions(state) {
  return state?.rules?.screenStateMachine?.transitions || [];
}

function isTransitionAllowed(transitions, from, to, actor) {
  return transitions.some((entry) => entry.from === from && entry.to === to && entry.actor === actor);
}

function validateStatusHistory(history, currentStatus, transitions, label, allowedActors) {
  const errors = [];
  if (!Array.isArray(history)) {
    errors.push(`${label}: statusHistory must be an array`);
    return errors;
  }
  if (history.length === 0) {
    return errors;
  }

  for (let idx = 0; idx < history.length; idx += 1) {
    const step = history[idx];
    if (!step || typeof step !== 'object') {
      errors.push(`${label}: statusHistory[${idx}] must be an object`);
      continue;
    }
    if (!isNonEmptyString(step.from) || !isNonEmptyString(step.to)) {
      errors.push(`${label}: statusHistory[${idx}] requires non-empty from/to`);
    }
    if (!allowedActors.has(step.actor)) {
      errors.push(`${label}: statusHistory[${idx}] actor must be one of ${[...allowedActors].join(', ')}`);
    }
    if (!isNonEmptyString(step.reason) || step.reason.trim().length < 3) {
      errors.push(`${label}: statusHistory[${idx}] reason must be at least 3 chars`);
    }
    if (!isNonEmptyString(step.at)) {
      errors.push(`${label}: statusHistory[${idx}] at must be set`);
    }
    if (!isNonEmptyString(step.sessionId)) {
      errors.push(`${label}: statusHistory[${idx}] sessionId is required`);
    }
    if (!isTransitionAllowed(transitions, step.from, step.to, step.actor)) {
      errors.push(
        `${label}: illegal status transition in history at index ${idx}: ${step.from} -> ${step.to} by ${step.actor}`
      );
    }

    if (!isNonEmptyString(step.prevHash)) {
      errors.push(`${label}: statusHistory[${idx}] prevHash is required`);
    }
    if (!isNonEmptyString(step.hash)) {
      errors.push(`${label}: statusHistory[${idx}] hash is required`);
    }
    if (idx === 0 && step.prevHash !== 'GENESIS') {
      errors.push(`${label}: statusHistory[0].prevHash must be GENESIS`);
    }
    if (idx > 0) {
      const prev = history[idx - 1];
      if (step.prevHash !== prev.hash) {
        errors.push(`${label}: statusHistory[${idx}] prevHash must match previous hash`);
      }
    }
    if (isNonEmptyString(step.hash)) {
      const expectedHash = computeHistoryHash(step);
      if (step.hash !== expectedHash) {
        errors.push(`${label}: statusHistory[${idx}] hash mismatch`);
      }
    }
  }

  const last = history[history.length - 1];
  if (last && last.to !== currentStatus) {
    errors.push(`${label}: statusHistory last.to (${last.to}) must match current status (${currentStatus})`);
  }
  return errors;
}

function computeHistoryHash(step) {
  const payload = `${step.from}|${step.to}|${step.actor}|${step.sessionId}|${step.at}|${step.reason}|${step.prevHash}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

function isUrlLike(value) {
  return typeof value === 'string' && /^https?:\/\//i.test(value);
}

function pathExistsFromRepo(value) {
  if (!isNonEmptyString(value)) return false;
  const normalized = value.replace(/\//g, path.sep);
  const full = path.isAbsolute(normalized) ? normalized : path.join(ROOT_DIR, normalized);
  return fs.existsSync(full);
}

function surfaceExpectedPath(surface) {
  switch (surface) {
    case 'retailer_web':
      return '/retailer';
    case 'supplier_web':
      return '/supplier';
    case 'superadmin_web':
      return '/admin';
    case 'pos':
    case 'backend':
    case 'shared':
    default:
      return '/api';
  }
}

function surfacePrimaryService(surface) {
  switch (surface) {
    case 'retailer_web':
      return 'retailer-admin';
    case 'supplier_web':
      return 'supplier-portal';
    case 'superadmin_web':
      return 'superadmin';
    case 'pos':
      return 'api-gateway';
    case 'backend':
      return 'main-backend';
    default:
      return '';
  }
}

function isLocalUrl(value) {
  if (!isNonEmptyString(value)) {
    return false;
  }
  return /localhost|127\.0\.0\.1|0\.0\.0\.0|192\.168\.|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\./i.test(value);
}

function isHttpsUrl(value) {
  return isNonEmptyString(value) && /^https:\/\//i.test(value);
}

function parseIsoTimestamp(value) {
  if (!isNonEmptyString(value)) {
    return null;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed;
}

function validateLiveTicketIntakeGate(ticket, label, state) {
  const errors = [];
  const rules = state?.rules?.liveTicketIntakeRules;
  if (!rules || rules.enabled !== true) {
    return errors;
  }

  const statuses = Array.isArray(rules.enforceForStatuses) && rules.enforceForStatuses.length > 0
    ? new Set(rules.enforceForStatuses)
    : new Set(['todo']);
  if (!statuses.has(ticket.status)) {
    return errors;
  }

  const enforceFromRaw = rules.enforceFrom;
  const enforceFrom = parseIsoTimestamp(enforceFromRaw);
  if (enforceFromRaw && enforceFrom === null) {
    errors.push(`${label}: rules.liveTicketIntakeRules.enforceFrom must be a valid timestamp when provided`);
    return errors;
  }

  const deployAtRaw = rules.lastSuccessfulStagingDeployAt;
  const deployAt = parseIsoTimestamp(deployAtRaw);
  if (deployAt === null) {
    errors.push(`${label}: rules.liveTicketIntakeRules.lastSuccessfulStagingDeployAt must be a valid timestamp`);
    return errors;
  }

  const createdAtRaw = ticket?.timestamps?.createdAt;
  const createdAt = parseIsoTimestamp(createdAtRaw);
  if (createdAt === null) {
    errors.push(`${label}: timestamps.createdAt must be a valid timestamp for live ticket intake`);
  } else if (enforceFrom !== null && createdAt < enforceFrom) {
    return errors;
  } else if (createdAt < deployAt) {
    errors.push(
      `${label}: live ticket intake requires timestamps.createdAt >= ${deployAtRaw} (ticket has ${createdAtRaw})`
    );
  }

  if (rules.requireValidatedDeploymentRef === true) {
    if (!isNonEmptyString(ticket?.operatorChecks?.validatedDeploymentRef)) {
      errors.push(`${label}: live ticket intake requires operatorChecks.validatedDeploymentRef`);
    }
  }

  const requiredRef = (rules.lastSuccessfulStagingDeployRef || '').trim();
  if (rules.requireDeploymentRefMatch === true && requiredRef) {
    const actualRef = (ticket?.operatorChecks?.validatedDeploymentRef || '').trim();
    if (!actualRef) {
      errors.push(`${label}: live ticket intake requires operatorChecks.validatedDeploymentRef`);
    } else if (actualRef !== requiredRef) {
      errors.push(
        `${label}: live ticket intake requires operatorChecks.validatedDeploymentRef=${requiredRef} (found ${actualRef})`
      );
    }
  }

  const requiredSha = (rules.lastSuccessfulStagingCommitSha || '').trim();
  if (rules.requireStagingCommitShaEvidence === true && requiredSha) {
    const allEvidence = [
      ...(Array.isArray(ticket?.evidence?.apiProof) ? ticket.evidence.apiProof : []),
      ...(Array.isArray(ticket?.evidence?.parityProof) ? ticket.evidence.parityProof : []),
      ...(Array.isArray(ticket?.truthDeclaration?.evidence) ? ticket.truthDeclaration.evidence : []),
      ...(Array.isArray(ticket?.gitDiscipline?.evidence) ? ticket.gitDiscipline.evidence : []),
    ]
      .filter((item) => isNonEmptyString(item))
      .join(' ')
      .toLowerCase();
    if (!allEvidence.includes(requiredSha.toLowerCase())) {
      errors.push(`${label}: live ticket intake evidence must reference staging commit ${requiredSha}`);
    }
  }

  if (rules.requireCloudRunRevisionIds === true) {
    if (!Array.isArray(ticket?.gcpParity?.cloudRunRevisionIds) || ticket.gcpParity.cloudRunRevisionIds.length === 0) {
      errors.push(`${label}: live ticket intake requires gcpParity.cloudRunRevisionIds`);
    }
  }

  if (rules.requireRuntimeEvidence === true) {
    const hasRuntimeEvidence =
      (Array.isArray(ticket?.evidence?.apiProof) && ticket.evidence.apiProof.length > 0) ||
      (Array.isArray(ticket?.evidence?.parityProof) && ticket.evidence.parityProof.length > 0) ||
      (Array.isArray(ticket?.truthDeclaration?.evidence) && ticket.truthDeclaration.evidence.length > 0);
    if (!hasRuntimeEvidence) {
      errors.push(`${label}: live ticket intake requires runtime evidence in evidence.apiProof/parityProof or truthDeclaration.evidence`);
    }
  }

  if (rules.requireProductionDataTested === true && ticket?.truthDeclaration?.productionDataTested !== true) {
    errors.push(`${label}: live ticket intake requires truthDeclaration.productionDataTested=true`);
  }

  return errors;
}

function validateEvidenceRefsExist(evidenceRefs, label, fieldName) {
  const errors = [];
  if (!Array.isArray(evidenceRefs)) {
    errors.push(`${label}: ${fieldName} must be an array`);
    return errors;
  }
  for (const ref of evidenceRefs) {
    if (!isNonEmptyString(ref)) {
      errors.push(`${label}: ${fieldName} contains empty reference`);
      continue;
    }
    if (isUrlLike(ref)) {
      if (!isHttpsUrl(ref)) {
        errors.push(`${label}: ${fieldName} URL evidence must use https: ${ref}`);
        continue;
      }
      if (isLocalUrl(ref)) {
        errors.push(`${label}: ${fieldName} URL evidence cannot be local/private: ${ref}`);
        continue;
      }
      continue;
    }
    if (!pathExistsFromRepo(ref)) {
      errors.push(`${label}: ${fieldName} reference does not exist in repo: ${ref}`);
    }
  }
  return errors;
}

function computeMaxScreensFromPolicy(policy, riskFlags) {
  let maxScreens = Number(policy?.baseScreensPerBatch ?? 3);
  const backendLike = Boolean(riskFlags?.touchesBackend || riskFlags?.touchesSharedApi);
  const dbLike = Boolean(riskFlags?.touchesDb || riskFlags?.touchesMigration || riskFlags?.touchesUrlMapOrIngress);
  const posAndBackend = Boolean(riskFlags?.touchesPos && backendLike);

  if (backendLike) {
    maxScreens = Math.min(maxScreens, Number(policy?.maxScreensWhenBackendOrSharedApiChanged ?? 2));
  }
  if (dbLike) {
    maxScreens = Math.min(maxScreens, Number(policy?.maxScreensWhenDbOrMigrationOrUrlMapChanged ?? 1));
  }
  if (posAndBackend) {
    maxScreens = Math.min(maxScreens, Number(policy?.maxScreensWhenPosAndBackendChangedTogether ?? 1));
  }
  return Math.max(maxScreens, 1);
}

function validateBatchObject(batch, state, ticketMap) {
  const errors = [];
  const label = 'staging batch';
  const required = [
    'batchId',
    'targetEnvironment',
    'targetProject',
    'targetRegion',
    'commitSha',
    'deploymentRef',
    'screenIds',
    'ticketIds',
    'riskFlags',
    'expectedCloudRunServices',
    'operatorReady',
    'claudeReady',
    'immutableImagesPinned',
    'secretVersionsPinned',
    'migrationSafety',
  ];
  for (const field of required) {
    if (!(field in batch)) {
      errors.push(`${label}: missing required field "${field}"`);
    }
  }

  if (!isNonEmptyString(batch.batchId)) {
    errors.push(`${label}: batchId is required`);
  }
  if (batch.targetEnvironment !== 'staging') {
    errors.push(`${label}: targetEnvironment must be "staging"`);
  }
  if (!isNonEmptyString(batch.targetProject)) {
    errors.push(`${label}: targetProject is required`);
  }
  if (!isNonEmptyString(batch.targetRegion)) {
    errors.push(`${label}: targetRegion is required`);
  }
  if (!isNonEmptyString(batch.commitSha) || batch.commitSha.trim().length < 7) {
    errors.push(`${label}: commitSha must be set (>=7 chars)`);
  }
  if (!isNonEmptyString(batch.deploymentRef)) {
    errors.push(`${label}: deploymentRef is required`);
  }
  if (!Array.isArray(batch.screenIds) || batch.screenIds.length === 0) {
    errors.push(`${label}: screenIds must be a non-empty array`);
  }
  if (!Array.isArray(batch.ticketIds) || batch.ticketIds.length === 0) {
    errors.push(`${label}: ticketIds must be a non-empty array`);
  }
  if (!batch.riskFlags || typeof batch.riskFlags !== 'object') {
    errors.push(`${label}: riskFlags must be an object`);
  }
  if (!Array.isArray(batch.expectedCloudRunServices) || batch.expectedCloudRunServices.length === 0) {
    errors.push(`${label}: expectedCloudRunServices must be non-empty`);
  }
  if (batch.operatorReady !== true) {
    errors.push(`${label}: operatorReady must be true`);
  }
  if (batch.claudeReady !== true) {
    errors.push(`${label}: claudeReady must be true`);
  }
  if (batch.immutableImagesPinned !== true) {
    errors.push(`${label}: immutableImagesPinned must be true`);
  }
  if (batch.secretVersionsPinned !== true) {
    errors.push(`${label}: secretVersionsPinned must be true`);
  }

  if (!batch.migrationSafety || typeof batch.migrationSafety !== 'object') {
    errors.push(`${label}: migrationSafety must be an object`);
  }

  const workspaceProject = state?.gcpTopology?.codingWorkspace?.project;
  const workspaceRegion = state?.gcpTopology?.codingWorkspace?.region;
  if (isNonEmptyString(workspaceProject) && batch.targetProject !== workspaceProject) {
    errors.push(`${label}: targetProject must match workflow project (${workspaceProject})`);
  }
  if (isNonEmptyString(workspaceRegion) && batch.targetRegion !== workspaceRegion) {
    errors.push(`${label}: targetRegion must match workflow region (${workspaceRegion})`);
  }

  const policy = state.rules?.deploymentBatchPolicy || {};
  const maxScreens = computeMaxScreensFromPolicy(policy, batch.riskFlags || {});
  if (Array.isArray(batch.screenIds) && batch.screenIds.length > maxScreens) {
    errors.push(`${label}: screenIds count ${batch.screenIds.length} exceeds allowed max ${maxScreens} for current risk flags`);
  }
  const hardMaxTickets = Number(policy?.hardMaxTicketsPerBatch ?? 25);
  if (Array.isArray(batch.ticketIds) && batch.ticketIds.length > hardMaxTickets) {
    errors.push(`${label}: ticketIds count ${batch.ticketIds.length} exceeds hard max ${hardMaxTickets}`);
  }

  const expectedServices = new Set(batch.expectedCloudRunServices || []);
  for (const svc of expectedServices) {
    if (!REQUIRED_SERVICES.has(svc)) {
      errors.push(`${label}: expectedCloudRunServices contains unknown service ${svc}`);
    }
  }

  const touchesMigration = Boolean(batch.riskFlags?.touchesDb || batch.riskFlags?.touchesMigration);
  const migrationSafety = batch.migrationSafety || {};
  if (touchesMigration) {
    if (migrationSafety.required !== true) {
      errors.push(`${label}: migrationSafety.required must be true when DB/migration risk flags are set`);
    }
    if (!isNonEmptyString(migrationSafety.planRef)) {
      errors.push(`${label}: migrationSafety.planRef is required for DB/migration batch`);
    }
    if (!Array.isArray(migrationSafety.dryRunEvidence) || migrationSafety.dryRunEvidence.length === 0) {
      errors.push(`${label}: migrationSafety.dryRunEvidence is required for DB/migration batch`);
    } else {
      errors.push(...validateEvidenceRefsExist(migrationSafety.dryRunEvidence, label, 'migrationSafety.dryRunEvidence'));
    }
    if (!isNonEmptyString(migrationSafety.backupId)) {
      errors.push(`${label}: migrationSafety.backupId is required for DB/migration batch`);
    }
    if (migrationSafety.operatorApproved !== true) {
      errors.push(`${label}: migrationSafety.operatorApproved must be true for DB/migration batch`);
    }
    if (migrationSafety.completed !== true) {
      errors.push(`${label}: migrationSafety.completed must be true before staging deploy`);
    }
  } else if (migrationSafety.required === true) {
    errors.push(`${label}: migrationSafety.required cannot be true when DB/migration flags are false`);
  }

  for (const ticketId of batch.ticketIds || []) {
    const ticket = ticketMap.get(ticketId);
    if (!ticket) {
      errors.push(`${label}: unknown ticket in batch: ${ticketId}`);
      continue;
    }
    if (ticket.status !== 'ready_for_operator_test') {
      errors.push(`${label}: ticket ${ticketId} must be ready_for_operator_test before staging deploy (current ${ticket.status})`);
    }
    if (!batch.screenIds.includes(ticket.screenId)) {
      errors.push(`${label}: ticket ${ticketId} screenId ${ticket.screenId} is not included in batch.screenIds`);
    }
    if (!isNonEmptyString(ticket.claudeChecks?.stagingDeploymentRef) || ticket.claudeChecks.stagingDeploymentRef !== batch.deploymentRef) {
      errors.push(`${label}: ticket ${ticketId} must use same deploymentRef (${batch.deploymentRef})`);
    }
    for (const svc of ticket.impact?.impactedServices || []) {
      if (!expectedServices.has(svc)) {
        errors.push(`${label}: expectedCloudRunServices missing impacted service ${svc} from ticket ${ticketId}`);
      }
    }
  }

  return errors;
}

function validateLegacyConflicts(options = {}) {
  const strict = Boolean(options.strict);
  const errors = [];
  const warnings = [];
  if (!fs.existsSync(LEGACY_CONFLICTS_FILE)) {
    return { errors, warnings };
  }

  const legacy = readJson(LEGACY_CONFLICTS_FILE);
  const items = Array.isArray(legacy.items) ? legacy.items : [];
  for (const item of items) {
    const status = item.status || 'open';
    const enforcement = item.enforcement || 'warn';
    if (status === 'resolved') {
      continue;
    }
    const line = `${item.id} (${item.path}): ${item.conflict}`;
    if (enforcement === 'block' || strict) {
      errors.push(`legacy conflict unresolved: ${line}`);
    } else {
      warnings.push(`legacy conflict unresolved: ${line}`);
    }
  }
  return { errors, warnings };
}

function getTopLevelParentTicket(ticket, ticketMap) {
  let current = ticket;
  let guard = 0;
  while (current && isNonEmptyString(current.parentTicketId) && guard < 20) {
    const next = ticketMap.get(current.parentTicketId);
    if (!next) {
      return null;
    }
    current = next;
    guard += 1;
  }
  return current || null;
}

function validateTicketOrderingAndHierarchy(ticketMap, state) {
  const errors = [];
  const rules = state?.rules?.ticketRules || {};
  const maxSubTicketsPerParent = Number(rules.maxSubTicketsPerParent ?? 10);
  const enforceTopLevelOrder = rules.enforceTopLevelOrder !== false;
  const blockSubTicketStartIfParentNotActive = rules.blockSubTicketStartIfParentNotActive !== false;

  const ticketsByScreen = new Map();
  const topLevelOrderMapByScreen = new Map();

  for (const ticket of ticketMap.values()) {
    if (!ticketsByScreen.has(ticket.screenId)) {
      ticketsByScreen.set(ticket.screenId, []);
    }
    ticketsByScreen.get(ticket.screenId).push(ticket);

    if (!isNonEmptyString(ticket.parentTicketId)) {
      if (!topLevelOrderMapByScreen.has(ticket.screenId)) {
        topLevelOrderMapByScreen.set(ticket.screenId, new Map());
      }
      const perScreenOrderMap = topLevelOrderMapByScreen.get(ticket.screenId);
      const existing = perScreenOrderMap.get(ticket.orderInScreen);
      if (existing) {
        errors.push(
          `top-level order collision on screen ${ticket.screenId}: orderInScreen=${ticket.orderInScreen} used by ${existing} and ${ticket.ticketId}`
        );
      } else {
        perScreenOrderMap.set(ticket.orderInScreen, ticket.ticketId);
      }
    }

    if (Array.isArray(ticket.subTicketIds) && ticket.subTicketIds.length > maxSubTicketsPerParent) {
      errors.push(
        `ticket ${ticket.ticketId} has ${ticket.subTicketIds.length} subTicketIds > maxSubTicketsPerParent=${maxSubTicketsPerParent}`
      );
    }
  }

  for (const ticket of ticketMap.values()) {
    if (isNonEmptyString(ticket.parentTicketId)) {
      const parent = ticketMap.get(ticket.parentTicketId);
      if (!parent) {
        errors.push(`ticket ${ticket.ticketId} parentTicketId points to missing ticket ${ticket.parentTicketId}`);
      } else {
        if (parent.screenId !== ticket.screenId) {
          errors.push(`ticket ${ticket.ticketId} parent ${parent.ticketId} must be on same screen`);
        }
        if (!Array.isArray(parent.subTicketIds) || !parent.subTicketIds.includes(ticket.ticketId)) {
          errors.push(`ticket ${ticket.ticketId} must be listed in parent ${parent.ticketId}.subTicketIds`);
        }
        if (Number.isInteger(parent.orderInScreen) && Number.isInteger(ticket.orderInScreen)) {
          if (ticket.orderInScreen < parent.orderInScreen) {
            errors.push(`ticket ${ticket.ticketId} orderInScreen cannot be lower than parent ${parent.ticketId}`);
          }
        }
        if (blockSubTicketStartIfParentNotActive && WIP_TICKET_STATUSES.has(ticket.status)) {
          if (parent.status === 'todo' || isClosedTicketStatus(parent.status)) {
            errors.push(`ticket ${ticket.ticketId} cannot be WIP while parent ${parent.ticketId} is ${parent.status}`);
          }
        }
      }
    }

    for (const childId of ticket.subTicketIds || []) {
      const child = ticketMap.get(childId);
      if (!child) {
        errors.push(`ticket ${ticket.ticketId} has missing sub-ticket ${childId}`);
        continue;
      }
      if (child.parentTicketId !== ticket.ticketId) {
        errors.push(`ticket ${ticket.ticketId} sub-ticket ${childId} must reference parentTicketId=${ticket.ticketId}`);
      }
      if (child.screenId !== ticket.screenId) {
        errors.push(`ticket ${ticket.ticketId} and sub-ticket ${childId} must be on same screen`);
      }
      if (Number.isInteger(child.orderInScreen) && Number.isInteger(ticket.orderInScreen)) {
        if (child.orderInScreen < ticket.orderInScreen) {
          errors.push(`sub-ticket ${childId} cannot have lower orderInScreen than parent ${ticket.ticketId}`);
        }
      }
      if (isClosedTicketStatus(ticket.status) && !isClosedTicketStatus(child.status)) {
        errors.push(`parent ticket ${ticket.ticketId} cannot be ${ticket.status} while sub-ticket ${childId} is ${child.status}`);
      }
      if ((READY_STATUSES.has(ticket.status) || ticket.status === 'locked') && !isClosedTicketStatus(child.status)) {
        errors.push(`ticket ${ticket.ticketId} in ${ticket.status} requires sub-ticket ${childId} to be locked/cancelled`);
      }
    }
  }

  if (enforceTopLevelOrder) {
    for (const [screenId, tickets] of ticketsByScreen.entries()) {
      const topLevelTickets = tickets
        .filter((item) => !isNonEmptyString(item.parentTicketId))
        .sort((a, b) => {
          if (a.orderInScreen !== b.orderInScreen) {
            return a.orderInScreen - b.orderInScreen;
          }
          return a.ticketId.localeCompare(b.ticketId);
        });

      let firstOpenTopLevel = null;
      for (const top of topLevelTickets) {
        if (!firstOpenTopLevel && !isClosedTicketStatus(top.status)) {
          firstOpenTopLevel = top;
        }
      }

      for (const top of topLevelTickets) {
        if (!firstOpenTopLevel) {
          continue;
        }
        if (top.ticketId === firstOpenTopLevel.ticketId) {
          continue;
        }
        if (WIP_TICKET_STATUSES.has(top.status)) {
          errors.push(
            `screen ${screenId}: top-level ticket ${top.ticketId} cannot be WIP until ${firstOpenTopLevel.ticketId} is locked/cancelled`
          );
        }
      }

      if (firstOpenTopLevel) {
        for (const ticket of tickets) {
          if (!isNonEmptyString(ticket.parentTicketId)) {
            continue;
          }
          if (!WIP_TICKET_STATUSES.has(ticket.status)) {
            continue;
          }
          const topParent = getTopLevelParentTicket(ticket, ticketMap);
          if (!topParent) {
            continue;
          }
          if (topParent.ticketId !== firstOpenTopLevel.ticketId) {
            errors.push(
              `screen ${screenId}: sub-ticket ${ticket.ticketId} cannot be WIP before top-level ticket ${firstOpenTopLevel.ticketId} is closed`
            );
          }
        }
      }
    }
  }

  return errors;
}

function tryExec(command) {
  try {
    const output = execSync(command, {
      cwd: ROOT_DIR,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { ok: true, output: (output || '').trim() };
  } catch (error) {
    return {
      ok: false,
      output: ((error.stdout || '') + (error.stderr || '')).trim(),
    };
  }
}

function parseCsvEnv(envValue) {
  if (!isNonEmptyString(envValue)) {
    return [];
  }
  return envValue
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getAllowedOperatorPrincipals(state) {
  const envConfigured = parseCsvEnv(process.env.WORKFLOW_ALLOWED_OPERATOR_PRINCIPALS || '');
  if (envConfigured.length > 0) {
    return envConfigured;
  }
  const configured = state?.roles?.operator?.identity?.allowedPrincipals;
  if (!Array.isArray(configured)) {
    return [];
  }
  return configured
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
}

function getRequiredExecutionContext(state) {
  const envConfigured = (process.env.WORKFLOW_REQUIRED_EXECUTION_CONTEXT || '').trim();
  if (envConfigured) {
    return envConfigured;
  }
  const configured = state?.roles?.operator?.productionPolicy?.requiredExecutionContext;
  if (typeof configured === 'string' && configured.trim()) {
    return configured.trim();
  }
  return 'pipeline';
}

function getRequiredPipelineSignals(state) {
  const envConfigured = parseCsvEnv(process.env.WORKFLOW_REQUIRED_PIPELINE_SIGNALS || '');
  if (envConfigured.length > 0) {
    return envConfigured;
  }
  const configured = state?.roles?.operator?.productionPolicy?.requiredPipelineSignals;
  if (Array.isArray(configured)) {
    const cleaned = configured
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean);
    if (cleaned.length > 0) {
      return cleaned;
    }
  }
  return ['GITHUB_ACTIONS', 'CLOUD_BUILD_BUILD_ID', 'WORKFLOW_PIPELINE_RUN_ID'];
}

function resolveActiveOperatorPrincipal() {
  const explicit = (process.env.WORKFLOW_OPERATOR_PRINCIPAL || '').trim();
  if (explicit) {
    return explicit;
  }
  const account = tryExec('gcloud config get-value account');
  if (!account.ok) {
    return '';
  }
  const value = (account.output || '').trim();
  if (!value || value === '(unset)') {
    return '';
  }
  return value;
}

function validateOperatorProductionBoundary(state, actionName) {
  const errors = [];
  const requiredContext = getRequiredExecutionContext(state);
  const actualContext = (process.env.WORKFLOW_EXECUTION_CONTEXT || '').trim();
  if (actualContext !== requiredContext) {
    errors.push(`${actionName} requires WORKFLOW_EXECUTION_CONTEXT=${requiredContext}`);
  }

  if (requiredContext === 'pipeline') {
    const signals = getRequiredPipelineSignals(state);
    const hasSignal = signals.some((signal) => {
      const value = process.env[signal];
      if (!value) return false;
      return value !== 'false' && value !== '0';
    });
    if (!hasSignal) {
      errors.push(`${actionName} requires one active pipeline signal: ${signals.join(', ')}`);
    }
  }

  const allowedPrincipals = getAllowedOperatorPrincipals(state);
  if (allowedPrincipals.length === 0) {
    errors.push(`${actionName} blocked: no allowed operator principals configured`);
    return errors;
  }

  const activePrincipal = resolveActiveOperatorPrincipal();
  if (!activePrincipal) {
    errors.push(`${actionName} blocked: unable to resolve operator principal`);
    return errors;
  }

  const normalizedActive = activePrincipal.toLowerCase();
  const normalizedAllowed = allowedPrincipals.map((principal) => principal.toLowerCase());
  if (!normalizedAllowed.includes(normalizedActive)) {
    errors.push(
      `${actionName} blocked: principal "${activePrincipal}" is not in allowed operator principals`
    );
  }

  return errors;
}

function normalizeRepoPath(filePath) {
  if (!isNonEmptyString(filePath)) {
    return '';
  }
  return filePath
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\.\/+/, '')
    .replace(/^"+|"+$/g, '');
}

function extractPathsFromPorcelainLine(line) {
  if (!isNonEmptyString(line) || line.length < 4) {
    return [];
  }
  const raw = line.slice(3).trim();
  if (!raw) {
    return [];
  }
  const normalizedRaw = normalizeRepoPath(raw);
  if (normalizedRaw.includes(' -> ')) {
    return normalizedRaw
      .split(' -> ')
      .map((part) => normalizeRepoPath(part))
      .filter(Boolean);
  }
  return [normalizedRaw];
}

function getAllowedDirtyPathsForStaging(state) {
  const rules = state?.rules?.gitDiscipline || {};
  const allowed = new Set();
  const configured = Array.isArray(rules.allowedDirtyFilesBeforeStagingDeploy)
    ? rules.allowedDirtyFilesBeforeStagingDeploy
    : [];
  for (const entry of configured) {
    if (isNonEmptyString(entry)) {
      allowed.add(normalizeRepoPath(entry));
    }
  }
  const allowDirtyBatchManifest = rules.allowDirtyStagingBatchManifest !== false;
  if (allowDirtyBatchManifest) {
    const batchPath = state?.paths?.stagingBatchFile || path.relative(ROOT_DIR, STAGING_BATCH_FILE).replace(/\\/g, '/');
    allowed.add(normalizeRepoPath(batchPath));
  }
  return allowed;
}

function collectBlockingDirtyLines(statusOutput, allowedDirtyPaths) {
  const blocking = [];
  if (!isNonEmptyString(statusOutput)) {
    return blocking;
  }
  const lines = statusOutput
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean);
  for (const line of lines) {
    const paths = extractPathsFromPorcelainLine(line);
    if (paths.length === 0) {
      blocking.push(line);
      continue;
    }
    const allAllowed = paths.every((entry) => allowedDirtyPaths.has(entry));
    if (!allAllowed) {
      blocking.push(line);
    }
  }
  return blocking;
}

function validateGitWorkspaceForStaging(state) {
  const errors = [];
  const rules = state?.rules?.gitDiscipline || {};
  const requireClean = rules.requireCleanWorktreeBeforeStagingDeploy !== false;
  const blockDetachedHead = rules.blockDetachedHead !== false;
  const blockConflictMarkers = rules.blockConflictMarkers !== false;

  const insideRepo = tryExec('git rev-parse --is-inside-work-tree');
  if (!insideRepo.ok || insideRepo.output !== 'true') {
    errors.push('git discipline: repository context missing (not inside git work tree)');
    return errors;
  }

  if (blockDetachedHead) {
    const branch = tryExec('git rev-parse --abbrev-ref HEAD');
    if (!branch.ok || !isNonEmptyString(branch.output)) {
      errors.push('git discipline: unable to resolve current branch');
    } else if (branch.output === 'HEAD') {
      errors.push('git discipline: detached HEAD is not allowed for staging deploy');
    }
  }

  if (requireClean) {
    // Use execSync directly instead of tryExec because tryExec.trim() destroys
    // the leading whitespace in porcelain format (e.g. ' M file' becomes 'M file',
    // causing extractPathsFromPorcelainLine to mis-parse the path).
    let rawStatus = '';
    let statusOk = true;
    try {
      rawStatus = execSync('git status --porcelain', {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }) || '';
    } catch (_e) {
      statusOk = false;
    }
    if (!statusOk) {
      errors.push('git discipline: failed to read git status');
    } else if (isNonEmptyString(rawStatus.trimEnd())) {
      const allowedDirtyPaths = getAllowedDirtyPathsForStaging(state);
      const blocking = collectBlockingDirtyLines(rawStatus, allowedDirtyPaths);
      if (blocking.length > 0) {
        errors.push('git discipline: worktree must be clean before staging deploy');
        errors.push(`git discipline: blocking changes:\n  ${blocking.join('\n  ')}`);
      }
    }
  }

  if (blockConflictMarkers) {
    const grep = tryExec('git grep -n -E "^(<<<<<<<|>>>>>>>)" -- .');
    if (grep.ok && isNonEmptyString(grep.output)) {
      errors.push('git discipline: conflict markers found in repository files');
    }
  }

  return errors;
}

function validateTruthDeclaration(ticket, label, status) {
  const errors = [];
  const section = ticket.truthDeclaration;
  if (!section || typeof section !== 'object') {
    errors.push(`${label}: truthDeclaration must be an object`);
    return errors;
  }

  const boolFields = [
    'mockDataUsed',
    'mockApisUsed',
    'mockUsageApproved',
    'productionDataTested',
    'disclosedToOperator',
  ];
  for (const field of boolFields) {
    if (!isBoolean(section[field])) {
      errors.push(`${label}: truthDeclaration.${field} must be boolean`);
    }
  }
  if (!isNonEmptyString(section.notes)) {
    errors.push(`${label}: truthDeclaration.notes must be a non-empty string`);
  }
  if (!Array.isArray(section.evidence)) {
    errors.push(`${label}: truthDeclaration.evidence must be an array`);
  }

  if (READY_STATUSES.has(status)) {
    if (section.disclosedToOperator !== true) {
      errors.push(`${label}: status ${status} requires truthDeclaration.disclosedToOperator=true`);
    }
    if (section.productionDataTested !== true) {
      errors.push(`${label}: status ${status} requires truthDeclaration.productionDataTested=true`);
    }
    if (!Array.isArray(section.evidence) || section.evidence.length === 0) {
      errors.push(`${label}: status ${status} requires truthDeclaration.evidence`);
    } else {
      errors.push(...validateEvidenceRefsExist(section.evidence, label, 'truthDeclaration.evidence'));
    }
  }

  if (READY_STATUSES.has(status)) {
    if (section.mockDataUsed !== false) {
      errors.push(`${label}: status ${status} requires truthDeclaration.mockDataUsed=false`);
    }
    if (section.mockApisUsed !== false) {
      errors.push(`${label}: status ${status} requires truthDeclaration.mockApisUsed=false`);
    }
    if (section.mockUsageApproved !== false) {
      errors.push(`${label}: status ${status} requires truthDeclaration.mockUsageApproved=false`);
    }
  }

  if ((section.mockDataUsed === true || section.mockApisUsed === true) && section.mockUsageApproved !== true) {
    errors.push(`${label}: mock usage requires truthDeclaration.mockUsageApproved=true`);
  }
  if (section.mockUsageApproved === true && section.mockDataUsed !== true && section.mockApisUsed !== true) {
    errors.push(`${label}: truthDeclaration.mockUsageApproved cannot be true when no mock usage is declared`);
  }

  return errors;
}

function validateExternalIntegrations(ticket, label, status) {
  const errors = [];
  const section = ticket.externalIntegrations;
  if (!section || typeof section !== 'object') {
    errors.push(`${label}: externalIntegrations must be an object`);
    return errors;
  }

  if (!isBoolean(section.touched)) {
    errors.push(`${label}: externalIntegrations.touched must be boolean`);
  }
  if (!Array.isArray(section.items)) {
    errors.push(`${label}: externalIntegrations.items must be an array`);
    return errors;
  }
  if (!isBoolean(section.operatorDisclosureDone)) {
    errors.push(`${label}: externalIntegrations.operatorDisclosureDone must be boolean`);
  }
  if (!isBoolean(section.allValidated)) {
    errors.push(`${label}: externalIntegrations.allValidated must be boolean`);
  }

  if (section.touched === true && section.items.length === 0) {
    errors.push(`${label}: externalIntegrations.touched=true requires non-empty items`);
  }
  if (section.touched === false && section.items.length > 0) {
    errors.push(`${label}: externalIntegrations.items must be empty when touched=false`);
  }

  const seenKeys = new Set();
  for (let idx = 0; idx < section.items.length; idx += 1) {
    const item = section.items[idx];
    const itemLabel = `${label}: externalIntegrations.items[${idx}]`;
    if (!item || typeof item !== 'object') {
      errors.push(`${itemLabel} must be an object`);
      continue;
    }
    if (!isNonEmptyString(item.integrationKey)) {
      errors.push(`${itemLabel}.integrationKey must be set`);
    } else if (seenKeys.has(item.integrationKey)) {
      errors.push(`${itemLabel}.integrationKey duplicate: ${item.integrationKey}`);
    } else {
      seenKeys.add(item.integrationKey);
    }
    if (!isNonEmptyString(item.provider)) {
      errors.push(`${itemLabel}.provider must be set`);
    }
    if (!['staging', 'production'].includes(item.environment)) {
      errors.push(`${itemLabel}.environment must be staging or production`);
    }
    if (!isHttpsUrl(item.baseUrl)) {
      errors.push(`${itemLabel}.baseUrl must be https URL`);
    }
    if (!isNonEmptyString(item.credentialSecretRef)) {
      errors.push(`${itemLabel}.credentialSecretRef must be set`);
    }
    if (!isNonEmptyString(item.apiVersion)) {
      errors.push(`${itemLabel}.apiVersion must be set`);
    }
    if (!Array.isArray(item.contractEvidence)) {
      errors.push(`${itemLabel}.contractEvidence must be array`);
    }
    if (!Array.isArray(item.stagingEvidence)) {
      errors.push(`${itemLabel}.stagingEvidence must be array`);
    }
    if (!isBoolean(item.validated)) {
      errors.push(`${itemLabel}.validated must be boolean`);
    }

    if (READY_STATUSES.has(status)) {
      if (!Array.isArray(item.contractEvidence) || item.contractEvidence.length === 0) {
        errors.push(`${itemLabel}.contractEvidence is required for status ${status}`);
      } else {
        errors.push(...validateEvidenceRefsExist(item.contractEvidence, label, `externalIntegrations.items[${idx}].contractEvidence`));
      }
      if (!Array.isArray(item.stagingEvidence) || item.stagingEvidence.length === 0) {
        errors.push(`${itemLabel}.stagingEvidence is required for status ${status}`);
      } else {
        errors.push(...validateEvidenceRefsExist(item.stagingEvidence, label, `externalIntegrations.items[${idx}].stagingEvidence`));
      }
    }
    if (LOCK_READY_STATUSES.has(status) && item.validated !== true) {
      errors.push(`${itemLabel}.validated must be true for status ${status}`);
    }
  }

  if (READY_STATUSES.has(status) && section.touched === true && section.operatorDisclosureDone !== true) {
    errors.push(`${label}: status ${status} requires externalIntegrations.operatorDisclosureDone=true when touched=true`);
  }
  if (LOCK_READY_STATUSES.has(status) && section.touched === true && section.allValidated !== true) {
    errors.push(`${label}: status ${status} requires externalIntegrations.allValidated=true when touched=true`);
  }

  if (section.touched === true) {
    const impacted = new Set(ticket.impact?.impactedServices || []);
    if (!impacted.has('api-gateway') && !impacted.has('main-backend')) {
      errors.push(`${label}: external integrations touched but impactedServices missing api-gateway/main-backend`);
    }
  }

  return errors;
}

function validateBuildMapping(ticket, label, status) {
  const errors = [];
  const section = ticket.buildMapping;
  if (!section || typeof section !== 'object') {
    errors.push(`${label}: buildMapping must be an object`);
    return errors;
  }

  const expectedPath = surfaceExpectedPath(ticket.surface);
  const expectedService = surfacePrimaryService(ticket.surface);

  if (!isNonEmptyString(section.expectedSurface)) {
    errors.push(`${label}: buildMapping.expectedSurface must be set`);
  } else if (section.expectedSurface !== ticket.surface) {
    errors.push(`${label}: buildMapping.expectedSurface must match ticket.surface`);
  }

  if (!isNonEmptyString(section.expectedBasePath)) {
    errors.push(`${label}: buildMapping.expectedBasePath must be set`);
  } else if (section.expectedBasePath !== expectedPath) {
    errors.push(`${label}: buildMapping.expectedBasePath must be ${expectedPath} for surface ${ticket.surface}`);
  }

  if (!isNonEmptyString(section.expectedPrimaryService)) {
    errors.push(`${label}: buildMapping.expectedPrimaryService must be set`);
  } else if (expectedService && section.expectedPrimaryService !== expectedService) {
    errors.push(`${label}: buildMapping.expectedPrimaryService must be ${expectedService} for surface ${ticket.surface}`);
  }

  if (!Array.isArray(section.actualCloudRunServices)) {
    errors.push(`${label}: buildMapping.actualCloudRunServices must be array`);
  } else if (expectedService && !section.actualCloudRunServices.includes(expectedService)) {
    errors.push(`${label}: buildMapping.actualCloudRunServices must include ${expectedService}`);
  }

  if (!isBoolean(section.urlMappingValidated)) {
    errors.push(`${label}: buildMapping.urlMappingValidated must be boolean`);
  }
  if (!isBoolean(section.correctBuildTargetValidated)) {
    errors.push(`${label}: buildMapping.correctBuildTargetValidated must be boolean`);
  }
  if (!Array.isArray(section.stagingRouteEvidence)) {
    errors.push(`${label}: buildMapping.stagingRouteEvidence must be array`);
  }

  if (READY_STATUSES.has(status)) {
    if (section.urlMappingValidated !== true) {
      errors.push(`${label}: status ${status} requires buildMapping.urlMappingValidated=true`);
    }
    if (section.correctBuildTargetValidated !== true) {
      errors.push(`${label}: status ${status} requires buildMapping.correctBuildTargetValidated=true`);
    }
    if (!Array.isArray(section.stagingRouteEvidence) || section.stagingRouteEvidence.length === 0) {
      errors.push(`${label}: status ${status} requires buildMapping.stagingRouteEvidence`);
    } else {
      errors.push(...validateEvidenceRefsExist(section.stagingRouteEvidence, label, 'buildMapping.stagingRouteEvidence'));
    }
  }

  const parityServices = new Set(ticket.gcpParity?.cloudRunServices || []);
  for (const svc of section.actualCloudRunServices || []) {
    if (!parityServices.has(svc)) {
      errors.push(`${label}: buildMapping.actualCloudRunServices contains ${svc} not present in gcpParity.cloudRunServices`);
    }
  }

  return errors;
}

function validateDependencyDisclosure(ticket, label, status) {
  const errors = [];
  const section = ticket.dependencyDisclosure;
  if (!section || typeof section !== 'object') {
    errors.push(`${label}: dependencyDisclosure must be an object`);
    return errors;
  }

  const arrayFields = [
    'internalDependencies',
    'externalDependencies',
    'pendingDependencies',
    'blockers',
  ];
  for (const field of arrayFields) {
    if (!Array.isArray(section[field])) {
      errors.push(`${label}: dependencyDisclosure.${field} must be array`);
    }
  }
  if (!isBoolean(section.disclosedToOperator)) {
    errors.push(`${label}: dependencyDisclosure.disclosedToOperator must be boolean`);
  }
  if (!isBoolean(section.operatorAcknowledged)) {
    errors.push(`${label}: dependencyDisclosure.operatorAcknowledged must be boolean`);
  }
  if (!isNonEmptyString(section.notes)) {
    errors.push(`${label}: dependencyDisclosure.notes must be non-empty`);
  }

  if (READY_STATUSES.has(status) && section.disclosedToOperator !== true) {
    errors.push(`${label}: status ${status} requires dependencyDisclosure.disclosedToOperator=true`);
  }
  if (READY_STATUSES.has(status)) {
    if (Array.isArray(section.pendingDependencies) && section.pendingDependencies.length > 0) {
      errors.push(`${label}: status ${status} cannot have dependencyDisclosure.pendingDependencies`);
    }
    if (Array.isArray(section.blockers) && section.blockers.length > 0) {
      errors.push(`${label}: status ${status} cannot have dependencyDisclosure.blockers`);
    }
  }
  if (LOCK_READY_STATUSES.has(status) && section.operatorAcknowledged !== true) {
    errors.push(`${label}: status ${status} requires dependencyDisclosure.operatorAcknowledged=true`);
  }

  return errors;
}

function validateReadinessSection(ticket, label, status) {
  const errors = [];
  const section = ticket.readiness;
  if (!section || typeof section !== 'object') {
    errors.push(`${label}: readiness must be an object`);
    return errors;
  }

  if (!isBoolean(section.productionGradeClaimed)) {
    errors.push(`${label}: readiness.productionGradeClaimed must be boolean`);
  }
  if (!Array.isArray(section.pendingInternal)) {
    errors.push(`${label}: readiness.pendingInternal must be array`);
  }
  if (!Array.isArray(section.pendingExternal)) {
    errors.push(`${label}: readiness.pendingExternal must be array`);
  }
  if (!Array.isArray(section.pendingOps)) {
    errors.push(`${label}: readiness.pendingOps must be array`);
  }
  if (!isBoolean(section.blocked)) {
    errors.push(`${label}: readiness.blocked must be boolean`);
  }
  if (!isNonEmptyString(section.summary)) {
    errors.push(`${label}: readiness.summary must be non-empty`);
  }

  if (READY_STATUSES.has(status) && section.productionGradeClaimed !== true) {
    errors.push(`${label}: status ${status} requires readiness.productionGradeClaimed=true`);
  }

  if (section.productionGradeClaimed === true) {
    if (Array.isArray(section.pendingInternal) && section.pendingInternal.length > 0) {
      errors.push(`${label}: readiness.productionGradeClaimed=true requires no pendingInternal items`);
    }
    if (Array.isArray(section.pendingExternal) && section.pendingExternal.length > 0) {
      errors.push(`${label}: readiness.productionGradeClaimed=true requires no pendingExternal items`);
    }
    if (Array.isArray(section.pendingOps) && section.pendingOps.length > 0) {
      errors.push(`${label}: readiness.productionGradeClaimed=true requires no pendingOps items`);
    }
    if (section.blocked !== false) {
      errors.push(`${label}: readiness.productionGradeClaimed=true requires readiness.blocked=false`);
    }
  }

  return errors;
}

function validateGitDisciplineSection(ticket, label, status) {
  const errors = [];
  const section = ticket.gitDiscipline;
  if (!section || typeof section !== 'object') {
    errors.push(`${label}: gitDiscipline must be an object`);
    return errors;
  }

  if (!isNonEmptyString(section.workBranch)) {
    errors.push(`${label}: gitDiscipline.workBranch must be set`);
  }
  if (!isNonEmptyString(section.changeScope)) {
    errors.push(`${label}: gitDiscipline.changeScope must be set`);
  }
  if (!isNonEmptyString(section.lastValidatedCommit)) {
    errors.push(`${label}: gitDiscipline.lastValidatedCommit must be set`);
  }
  if (!isBoolean(section.noMixedScope)) {
    errors.push(`${label}: gitDiscipline.noMixedScope must be boolean`);
  }
  if (!isBoolean(section.noConflictMarkers)) {
    errors.push(`${label}: gitDiscipline.noConflictMarkers must be boolean`);
  }
  if (!['not_required', 'pending', 'passed', 'failed'].includes(section.ciGateStatus)) {
    errors.push(`${label}: gitDiscipline.ciGateStatus must be not_required/pending/passed/failed`);
  }
  if (!Array.isArray(section.evidence)) {
    errors.push(`${label}: gitDiscipline.evidence must be an array`);
  }

  if (READY_STATUSES.has(status)) {
    if (section.noMixedScope !== true) {
      errors.push(`${label}: status ${status} requires gitDiscipline.noMixedScope=true`);
    }
    if (section.noConflictMarkers !== true) {
      errors.push(`${label}: status ${status} requires gitDiscipline.noConflictMarkers=true`);
    }
    if (!Array.isArray(section.evidence) || section.evidence.length === 0) {
      errors.push(`${label}: status ${status} requires gitDiscipline.evidence`);
    } else {
      errors.push(...validateEvidenceRefsExist(section.evidence, label, 'gitDiscipline.evidence'));
    }
  }

  if (LOCK_READY_STATUSES.has(status) && section.ciGateStatus === 'failed') {
    errors.push(`${label}: status ${status} cannot have gitDiscipline.ciGateStatus=failed`);
  }

  return errors;
}

function validateSessionBootSection(ticket, label, status) {
  const errors = [];
  const section = ticket.sessionBoot;
  if (!section || typeof section !== 'object') {
    errors.push(`${label}: sessionBoot must be an object`);
    return errors;
  }

  if (section.bootstrappedBy !== 'claude') {
    errors.push(`${label}: sessionBoot.bootstrappedBy must be "claude"`);
  }
  if (!isNonEmptyString(section.bootstrappedAt)) {
    errors.push(`${label}: sessionBoot.bootstrappedAt must be set`);
  }
  if (!isNonEmptyString(section.runbookVersion)) {
    errors.push(`${label}: sessionBoot.runbookVersion must be set`);
  }
  if (!isNonEmptyString(section.memoryStateRef)) {
    errors.push(`${label}: sessionBoot.memoryStateRef must be set`);
  }
  if (!Array.isArray(section.requiredFilesRead)) {
    errors.push(`${label}: sessionBoot.requiredFilesRead must be an array`);
    return errors;
  }

  const readSet = new Set(
    section.requiredFilesRead
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
  );
  for (const requiredFile of REQUIRED_SESSION_BOOT_FILES) {
    if (!readSet.has(requiredFile)) {
      errors.push(`${label}: sessionBoot.requiredFilesRead missing ${requiredFile}`);
    }
  }

  if (status !== 'todo') {
    if (!isNonEmptyString(section.bootstrappedAt)) {
      errors.push(`${label}: status ${status} requires sessionBoot.bootstrappedAt`);
    }
    if (!isNonEmptyString(section.runbookVersion)) {
      errors.push(`${label}: status ${status} requires sessionBoot.runbookVersion`);
    }
    if (!isNonEmptyString(section.memoryStateRef)) {
      errors.push(`${label}: status ${status} requires sessionBoot.memoryStateRef`);
    }
  }

  return errors;
}

function isInvariantRequiredForTicket(ticket, invariantKey) {
  const surface = ticket.surface;
  const layers = ticket.layers || {};
  const backendTouch = layers.backend === 'pass';
  const apiTouch = layers.api === 'pass';
  const dbTouch = layers.db === 'pass' || layers.migration === 'pass';
  const backendLikeSurface = surface === 'pos' || surface === 'backend' || surface === 'shared';

  switch (invariantKey) {
    case 'sellPurchaseIsolation':
      return backendLikeSurface;
    case 'deterministicScanIntentResolution':
      return backendLikeSurface;
    case 'frontendBackendStateParity':
      return true;
    case 'offlineFirstSafeSync':
      return backendLikeSurface;
    case 'idempotentTransactionProcessing':
      return backendLikeSurface;
    case 'atomicDatabaseWrites':
      return dbTouch || backendTouch;
    case 'strictSchemaValidation':
      return apiTouch || backendTouch || surface === 'backend' || surface === 'shared';
    case 'zeroSilentFailures':
      return true;
    case 'structuredAuditLogging':
      return true;
    default:
      return false;
  }
}

function validateProductionInvariants(ticket, label, status) {
  const errors = [];
  const section = ticket.productionInvariants;
  if (!section || typeof section !== 'object') {
    errors.push(`${label}: productionInvariants must be an object`);
    return errors;
  }

  for (const key of INVARIANT_KEYS) {
    const item = section[key];
    if (!item || typeof item !== 'object') {
      errors.push(`${label}: productionInvariants.${key} must be an object`);
      continue;
    }
    if (!INVARIANT_STATUS_VALUES.has(item.status)) {
      errors.push(`${label}: productionInvariants.${key}.status must be pending/pass/fail/na`);
    }
    if (!Array.isArray(item.evidence)) {
      errors.push(`${label}: productionInvariants.${key}.evidence must be an array`);
    }
    if (!isNonEmptyString(item.notes)) {
      errors.push(`${label}: productionInvariants.${key}.notes must be set`);
    }

    if (item.status === 'pass') {
      if (!Array.isArray(item.evidence) || item.evidence.length === 0) {
        errors.push(`${label}: productionInvariants.${key}.status=pass requires evidence`);
      } else {
        errors.push(...validateEvidenceRefsExist(item.evidence, label, `productionInvariants.${key}.evidence`));
      }
    }

    const required = isInvariantRequiredForTicket(ticket, key);
    if (READY_STATUSES.has(status)) {
      if (item.status === 'pending') {
        errors.push(`${label}: status ${status} cannot keep productionInvariants.${key}.status=pending`);
      }
      if (item.status === 'fail') {
        errors.push(`${label}: status ${status} cannot have productionInvariants.${key}.status=fail`);
      }
      if (required && item.status !== 'pass') {
        errors.push(`${label}: status ${status} requires productionInvariants.${key}.status=pass`);
      }
      if (!required && item.status === 'pass' && (!Array.isArray(item.evidence) || item.evidence.length === 0)) {
        errors.push(`${label}: productionInvariants.${key}.status=pass must include evidence`);
      }
    }
  }

  return errors;
}

function validateTicketGatesByStatus(ticket, label) {
  const errors = [];
  const claude = ticket.claudeChecks || {};
  const operator = ticket.operatorChecks || {};
  const status = ticket.status;
  const expectedPath = surfaceExpectedPath(ticket.surface);
  const expectedPrimaryService = surfacePrimaryService(ticket.surface);

  if (!isBoolean(claude.screenVisualizedWithOperator)) {
    errors.push(`${label}: claudeChecks.screenVisualizedWithOperator must be boolean`);
  }
  if (!isBoolean(operator.stagingTestExecuted)) {
    errors.push(`${label}: operatorChecks.stagingTestExecuted must be boolean`);
  }
  if (!isBoolean(operator.testedOnLaptopBrowser)) {
    errors.push(`${label}: operatorChecks.testedOnLaptopBrowser must be boolean`);
  }
  if (!isBoolean(operator.testedOnRedmi)) {
    errors.push(`${label}: operatorChecks.testedOnRedmi must be boolean`);
  }
  errors.push(...validateTruthDeclaration(ticket, label, status));
  errors.push(...validateExternalIntegrations(ticket, label, status));
  errors.push(...validateBuildMapping(ticket, label, status));
  errors.push(...validateDependencyDisclosure(ticket, label, status));
  errors.push(...validateReadinessSection(ticket, label, status));
  errors.push(...validateGitDisciplineSection(ticket, label, status));
  errors.push(...validateSessionBootSection(ticket, label, status));
  errors.push(...validateProductionInvariants(ticket, label, status));

  if (Number.isInteger(operator.blockingIssueCount) && operator.blockingIssueCount === 0) {
    if (operator.noBlockingIssueRemaining !== true) {
      errors.push(`${label}: operatorChecks.noBlockingIssueRemaining must be true when blockingIssueCount=0`);
    }
  }
  if (Number.isInteger(operator.blockingIssueCount) && operator.blockingIssueCount > 0) {
    if (operator.noBlockingIssueRemaining !== false) {
      errors.push(`${label}: operatorChecks.noBlockingIssueRemaining must be false when blockingIssueCount>0`);
    }
  }

  const claudeCoreChecks = [
    'screenVisualizedWithOperator',
    'codeQualityChecksPassed',
    'regressionChecklistPassed',
    'apiContractChecked',
    'navigationChecked',
    'envAndBasePathChecked',
    'migrationSafetyChecked',
    'rollbackPlanReady',
    'stagingDeployPassed',
  ];

  if (status !== 'todo' && claude.screenVisualizedWithOperator !== true) {
    errors.push(`${label}: status ${status} requires claudeChecks.screenVisualizedWithOperator=true`);
  }

  if (READY_STATUSES.has(status)) {
    for (const key of claudeCoreChecks) {
      if (claude[key] !== true) {
        errors.push(`${label}: status ${status} requires claudeChecks.${key}=true`);
      }
    }
    if (!isNonEmptyString(claude.stagingDeploymentRef)) {
      errors.push(`${label}: status ${status} requires claudeChecks.stagingDeploymentRef`);
    }
    if (claude.cloudWorkspaceValidated !== true) {
      errors.push(`${label}: status ${status} requires claudeChecks.cloudWorkspaceValidated=true`);
    }
    if (!isNonEmptyString(claude.cloudWorkspaceRef)) {
      errors.push(`${label}: status ${status} requires claudeChecks.cloudWorkspaceRef`);
    }
    if (!ticket.gcpParity || ticket.gcpParity.stagingValidated !== true) {
      errors.push(`${label}: status ${status} requires gcpParity.stagingValidated=true`);
    }
    if (ticket.gcpParity?.basePathChecked !== true) {
      errors.push(`${label}: status ${status} requires gcpParity.basePathChecked=true`);
    }
    if (ticket.gcpParity?.envParityChecked !== true) {
      errors.push(`${label}: status ${status} requires gcpParity.envParityChecked=true`);
    }
    if (ticket.gcpParity?.routingChecked !== true) {
      errors.push(`${label}: status ${status} requires gcpParity.routingChecked=true`);
    }
    if (ticket.gcpParity?.apiContractChecked !== true) {
      errors.push(`${label}: status ${status} requires gcpParity.apiContractChecked=true`);
    }
    if (ticket.gcpParity?.artifactDigestPinned !== true) {
      errors.push(`${label}: status ${status} requires gcpParity.artifactDigestPinned=true`);
    }
    if (!Array.isArray(ticket.gcpParity?.cloudRunRevisionIds) || ticket.gcpParity.cloudRunRevisionIds.length === 0) {
      errors.push(`${label}: status ${status} requires non-empty gcpParity.cloudRunRevisionIds`);
    }
    if (!Array.isArray(ticket.gcpParity?.stagingUrls) || ticket.gcpParity.stagingUrls.length === 0) {
      errors.push(`${label}: status ${status} requires gcpParity.stagingUrls`);
    } else {
      for (const url of ticket.gcpParity.stagingUrls) {
        if (isLocalUrl(url)) {
          errors.push(`${label}: status ${status} cannot use local URL in gcpParity.stagingUrls: ${url}`);
        }
      }
    }
    if (!Array.isArray(ticket.evidence?.afterVisual) || ticket.evidence.afterVisual.length === 0) {
      errors.push(`${label}: status ${status} requires evidence.afterVisual`);
    }
    if (!Array.isArray(ticket.evidence?.parityProof) || ticket.evidence.parityProof.length === 0) {
      errors.push(`${label}: status ${status} requires evidence.parityProof`);
    }
    errors.push(...validateEvidenceRefsExist(ticket.evidence?.afterVisual || [], label, 'evidence.afterVisual'));
    errors.push(...validateEvidenceRefsExist(ticket.evidence?.parityProof || [], label, 'evidence.parityProof'));

    if (expectedPrimaryService) {
      const impacted = new Set(ticket.impact?.impactedServices || []);
      if (!impacted.has(expectedPrimaryService)) {
        errors.push(`${label}: status ${status} requires impact.impactedServices to include ${expectedPrimaryService}`);
      }
      const parity = new Set(ticket.gcpParity?.cloudRunServices || []);
      if (!parity.has(expectedPrimaryService)) {
        errors.push(`${label}: status ${status} requires gcpParity.cloudRunServices to include ${expectedPrimaryService}`);
      }
    }
  }

  if (['ready_for_impact_retest', 'ready_for_lock', 'locked'].includes(status)) {
    const operatorCoreChecks = [
      'stagingTestExecuted',
      'testedOnRealTarget',
      'issuesReproduced',
      'fixVerified',
      'noBlockingIssueRemaining',
      'evidenceAttached',
    ];
    for (const key of operatorCoreChecks) {
      if (operator[key] !== true) {
        errors.push(`${label}: status ${status} requires operatorChecks.${key}=true`);
      }
    }
    if (!Number.isInteger(operator.blockingIssueCount) || operator.blockingIssueCount < 0) {
      errors.push(`${label}: operatorChecks.blockingIssueCount must be >= 0`);
    }
    if (operator.blockingIssueCount > 0) {
      errors.push(`${label}: status ${status} cannot have operatorChecks.blockingIssueCount > 0`);
    }

    if (!Array.isArray(operator.stagingUrlsTested) || operator.stagingUrlsTested.length === 0) {
      errors.push(`${label}: status ${status} requires operatorChecks.stagingUrlsTested`);
    } else {
      const hasExpected = operator.stagingUrlsTested.some((url) => isNonEmptyString(url) && url.includes(expectedPath));
      if (!hasExpected) {
        errors.push(`${label}: operatorChecks.stagingUrlsTested must include expected path "${expectedPath}" for surface ${ticket.surface}`);
      }
      for (const url of operator.stagingUrlsTested) {
        if (isLocalUrl(url)) {
          errors.push(`${label}: status ${status} cannot use local URL in operatorChecks.stagingUrlsTested: ${url}`);
        }
      }
    }

    if (!isNonEmptyString(operator.validatedDeploymentRef)) {
      errors.push(`${label}: status ${status} requires operatorChecks.validatedDeploymentRef`);
    } else if (isNonEmptyString(claude.stagingDeploymentRef) && operator.validatedDeploymentRef !== claude.stagingDeploymentRef) {
      errors.push(`${label}: operatorChecks.validatedDeploymentRef must match claudeChecks.stagingDeploymentRef`);
    }

    if (!Array.isArray(operator.validatedCloudRunRevisionIds) || operator.validatedCloudRunRevisionIds.length === 0) {
      errors.push(`${label}: status ${status} requires operatorChecks.validatedCloudRunRevisionIds`);
    } else {
      const knownRevisions = new Set(ticket.gcpParity?.cloudRunRevisionIds || []);
      for (const rev of operator.validatedCloudRunRevisionIds) {
        if (!knownRevisions.has(rev)) {
          errors.push(`${label}: operatorChecks.validatedCloudRunRevisionIds contains unknown revision ${rev}`);
        }
      }
    }

    if (ticket.surface === 'pos' && operator.testedOnRedmi !== true) {
      errors.push(`${label}: status ${status} for POS requires operatorChecks.testedOnRedmi=true`);
    }
    if (['retailer_web', 'supplier_web', 'superadmin_web'].includes(ticket.surface) && operator.testedOnLaptopBrowser !== true) {
      errors.push(`${label}: status ${status} for web surface requires operatorChecks.testedOnLaptopBrowser=true`);
    }
    if ((ticket.surface === 'backend' || ticket.surface === 'shared') && operator.testedOnRealTarget === true) {
      const hasAnyRealTarget = operator.testedOnLaptopBrowser === true || operator.testedOnRedmi === true;
      if (!hasAnyRealTarget) {
        errors.push(`${label}: backend/shared ticket marked testedOnRealTarget=true but no concrete target flag is true`);
      }
    }
  }

  if (status === 'operator_failed') {
    if (!Number.isInteger(operator.blockingIssueCount) || operator.blockingIssueCount <= 0) {
      errors.push(`${label}: operator_failed requires operatorChecks.blockingIssueCount > 0`);
    }
  }

  if (status === 'impact_retest_failed') {
    if (!ticket.impact || ticket.impact.impactRetestStatus !== 'failed') {
      errors.push(`${label}: impact_retest_failed requires impact.impactRetestStatus=failed`);
    }
  }

  return errors;
}

function validateTicketObject(ticket, label, state) {
  const errors = [];
  const requiredFields = [
    'ticketId',
    'screenId',
    'surface',
    'riskClass',
    'title',
    'status',
    'severity',
    'layers',
    'gcpParity',
    'impact',
    'operator',
    'claudeChecks',
    'sessionBoot',
    'operatorChecks',
    'statusHistory',
    'evidence',
    'timestamps',
    'truthDeclaration',
    'externalIntegrations',
    'buildMapping',
    'dependencyDisclosure',
    'productionInvariants',
    'readiness',
    'gitDiscipline',
  ];

  for (const field of requiredFields) {
    if (!(field in ticket)) {
      errors.push(`${label}: missing required field "${field}"`);
    }
  }

  if (!isNonEmptyString(ticket.ticketId)) {
    errors.push(`${label}: ticketId must be a non-empty string`);
  }
  if (!isNonEmptyString(ticket.screenId)) {
    errors.push(`${label}: screenId must be a non-empty string`);
  }
  if (!Number.isInteger(ticket.orderInScreen) || ticket.orderInScreen < 1) {
    errors.push(`${label}: orderInScreen must be integer >= 1`);
  }
  if (!['low', 'medium', 'high', 'critical'].includes(ticket.riskClass)) {
    errors.push(`${label}: riskClass must be one of low/medium/high/critical`);
  }
  if (!TICKET_STATUS_VALUES.has(ticket.status)) {
    errors.push(`${label}: invalid status "${ticket.status}"`);
  }
  if (!ticket.layers || typeof ticket.layers !== 'object') {
    errors.push(`${label}: layers must be an object`);
  } else {
    for (const layer of REQUIRED_LAYERS) {
      const value = ticket.layers[layer];
      if (!['pass', 'fail', 'na'].includes(value)) {
        errors.push(`${label}: layers.${layer} must be "pass", "fail", or "na"`);
      }
    }
  }

  if (!ticket.impact || typeof ticket.impact !== 'object') {
    errors.push(`${label}: impact must be an object`);
  } else {
    if (!Array.isArray(ticket.impact.impactedScreens) || ticket.impact.impactedScreens.length === 0) {
      errors.push(`${label}: impact.impactedScreens must be a non-empty array`);
    }
    if (!Array.isArray(ticket.impact.impactedServices) || ticket.impact.impactedServices.length === 0) {
      errors.push(`${label}: impact.impactedServices must be a non-empty array`);
    }
    if (!['pending', 'passed', 'failed', 'na'].includes(ticket.impact.impactRetestStatus)) {
      errors.push(`${label}: impact.impactRetestStatus must be pending/passed/failed/na`);
    }
  }

  if (!ticket.operator || typeof ticket.operator !== 'object') {
    errors.push(`${label}: operator must be an object`);
  } else {
    if (!isNonEmptyString(ticket.operator.reportedBy)) {
      errors.push(`${label}: operator.reportedBy must be set`);
    }
    if (!Array.isArray(ticket.operator.reproSteps) || ticket.operator.reproSteps.length === 0) {
      errors.push(`${label}: operator.reproSteps must be a non-empty array`);
    }
  }

  if (!ticket.claudeChecks || typeof ticket.claudeChecks !== 'object') {
    errors.push(`${label}: claudeChecks must be an object`);
  } else {
    if (!isBoolean(ticket.claudeChecks.cloudWorkspaceValidated)) {
      errors.push(`${label}: claudeChecks.cloudWorkspaceValidated must be boolean`);
    }
    if (!isNonEmptyString(ticket.claudeChecks.cloudWorkspaceRef)) {
      errors.push(`${label}: claudeChecks.cloudWorkspaceRef must be set`);
    }
  }

  if (!ticket.sessionBoot || typeof ticket.sessionBoot !== 'object') {
    errors.push(`${label}: sessionBoot must be an object`);
  }

  if (!ticket.operatorChecks || typeof ticket.operatorChecks !== 'object') {
    errors.push(`${label}: operatorChecks must be an object`);
  } else {
    if (!Array.isArray(ticket.operatorChecks.stagingUrlsTested)) {
      errors.push(`${label}: operatorChecks.stagingUrlsTested must be an array`);
    }
    if (!Number.isInteger(ticket.operatorChecks.blockingIssueCount) || ticket.operatorChecks.blockingIssueCount < 0) {
      errors.push(`${label}: operatorChecks.blockingIssueCount must be integer >= 0`);
    }
    if (!Number.isInteger(ticket.operatorChecks.nonBlockingIssueCount) || ticket.operatorChecks.nonBlockingIssueCount < 0) {
      errors.push(`${label}: operatorChecks.nonBlockingIssueCount must be integer >= 0`);
    }
    if (!isNonEmptyString(ticket.operatorChecks.validatedDeploymentRef)) {
      errors.push(`${label}: operatorChecks.validatedDeploymentRef must be set`);
    }
    if (!Array.isArray(ticket.operatorChecks.validatedCloudRunRevisionIds)) {
      errors.push(`${label}: operatorChecks.validatedCloudRunRevisionIds must be an array`);
    }
  }

  if (!ticket.productionInvariants || typeof ticket.productionInvariants !== 'object') {
    errors.push(`${label}: productionInvariants must be an object`);
  }

  if (!ticket.gcpParity || typeof ticket.gcpParity !== 'object') {
    errors.push(`${label}: gcpParity must be an object`);
  } else {
    const boolFields = [
      'stagingValidated',
      'basePathChecked',
      'envParityChecked',
      'routingChecked',
      'apiContractChecked',
      'dbConnectivityChecked',
      'artifactDigestPinned',
    ];
    for (const field of boolFields) {
      if (typeof ticket.gcpParity[field] !== 'boolean') {
        errors.push(`${label}: gcpParity.${field} must be boolean`);
      }
    }

    const expectedPath = surfaceExpectedPath(ticket.surface);
    if (Array.isArray(ticket.gcpParity.stagingUrls) && ticket.gcpParity.stagingUrls.length > 0) {
      const hasExpectedPath = ticket.gcpParity.stagingUrls.some((url) => isNonEmptyString(url) && url.includes(expectedPath));
      if (!hasExpectedPath) {
        errors.push(`${label}: gcpParity.stagingUrls must include a URL containing path "${expectedPath}" for surface ${ticket.surface}`);
      }
      if (READY_STATUSES.has(ticket.status)) {
        for (const url of ticket.gcpParity.stagingUrls) {
          if (isLocalUrl(url)) {
            errors.push(`${label}: gcpParity.stagingUrls cannot include local URL ${url} for status ${ticket.status}`);
          }
        }
      }
    } else if (READY_STATUSES.has(ticket.status)) {
      errors.push(`${label}: status ${ticket.status} requires gcpParity.stagingUrls`);
    }

    if (!Array.isArray(ticket.gcpParity.cloudRunServices) || ticket.gcpParity.cloudRunServices.length === 0) {
      errors.push(`${label}: gcpParity.cloudRunServices must be non-empty array`);
    }
    const impactedServices = new Set(ticket.impact?.impactedServices || []);
    const parityServices = new Set(ticket.gcpParity.cloudRunServices || []);
    for (const svc of impactedServices) {
      if (!parityServices.has(svc)) {
        errors.push(`${label}: gcpParity.cloudRunServices missing impacted service "${svc}"`);
      }
    }
    const primaryService = surfacePrimaryService(ticket.surface);
    if (primaryService) {
      if (!impactedServices.has(primaryService)) {
        errors.push(`${label}: impact.impactedServices must include primary service ${primaryService} for surface ${ticket.surface}`);
      }
      if (!parityServices.has(primaryService)) {
        errors.push(`${label}: gcpParity.cloudRunServices must include primary service ${primaryService} for surface ${ticket.surface}`);
      }
    }
  }

  errors.push(...validateTicketGatesByStatus(ticket, label));
  errors.push(...validateLiveTicketIntakeGate(ticket, label, state));

  const ticketTransitions = getTicketTransitions(state);
  if (ticketTransitions.length > 0) {
    if (ticket.status !== 'todo' && (!Array.isArray(ticket.statusHistory) || ticket.statusHistory.length === 0)) {
      errors.push(`${label}: non-todo ticket requires non-empty statusHistory`);
    }
    errors.push(
      ...validateStatusHistory(
        ticket.statusHistory,
        ticket.status,
        ticketTransitions,
        label,
        new Set(['claude', 'operator'])
      )
    );
  }

  if (ticket.status === 'locked') {
    for (const layer of REQUIRED_LAYERS) {
      if (ticket.layers && ticket.layers[layer] === 'fail') {
        errors.push(`${label}: locked ticket cannot have layers.${layer} = fail`);
      }
    }
    if (!ticket.operator || ticket.operator.finalSignoff !== true) {
      errors.push(`${label}: locked ticket requires operator.finalSignoff=true`);
    }
    if (
      ticket.impact &&
      ticket.impact.impactRetestRequired === true &&
      ticket.impact.impactRetestStatus !== 'passed'
    ) {
      errors.push(`${label}: locked ticket with impactRetestRequired=true must have impactRetestStatus=passed`);
    }
    if (!ticket.gcpParity || ticket.gcpParity.stagingValidated !== true) {
      errors.push(`${label}: locked ticket requires gcpParity.stagingValidated=true`);
    }
  }

  return errors;
}

function validateScreenObject(screen, label, ticketMap, maxActiveTicketsPerScreen, state) {
  const errors = [];
  const requiredFields = ['screenId', 'surface', 'status', 'ticketIds', 'certification', 'statusHistory', 'timestamps'];
  for (const field of requiredFields) {
    if (!(field in screen)) {
      errors.push(`${label}: missing required field "${field}"`);
    }
  }

  if (!isNonEmptyString(screen.screenId)) {
    errors.push(`${label}: screenId must be a non-empty string`);
  }
  if (!SCREEN_STATUS_VALUES.has(screen.status)) {
    errors.push(`${label}: invalid status "${screen.status}"`);
  }
  if (!Array.isArray(screen.ticketIds)) {
    errors.push(`${label}: ticketIds must be an array`);
  } else {
    let activeCount = 0;
    for (const ticketId of screen.ticketIds) {
      const ticket = ticketMap.get(ticketId);
      if (!ticket) {
        errors.push(`${label}: ticketIds includes unknown ticket "${ticketId}"`);
        continue;
      }
      if (WIP_TICKET_STATUSES.has(ticket.status)) {
        activeCount += 1;
      }
    }
    if (activeCount > maxActiveTicketsPerScreen) {
      errors.push(
        `${label}: active tickets ${activeCount} exceed maxActiveTicketsPerScreen=${maxActiveTicketsPerScreen}`
      );
    }
  }

  if (!screen.certification || typeof screen.certification !== 'object') {
    errors.push(`${label}: certification must be an object`);
  } else if (screen.status === 'certified') {
    const requiredCertifiedFlags = [
      'allTicketsLocked',
      'impactRetestPassed',
      'operatorSignoff',
      'stagingParityProof',
    ];
    for (const field of requiredCertifiedFlags) {
      if (screen.certification[field] !== true) {
        errors.push(`${label}: certified screen requires certification.${field}=true`);
      }
    }
    for (const ticketId of screen.ticketIds || []) {
      const ticket = ticketMap.get(ticketId);
      if (ticket && ticket.status !== 'locked') {
        errors.push(`${label}: certified screen cannot include non-locked ticket "${ticketId}"`);
      }
    }
    if (!Array.isArray(screen.certification.regressionMatrixEvidence) || screen.certification.regressionMatrixEvidence.length === 0) {
      errors.push(`${label}: certified screen requires certification.regressionMatrixEvidence`);
    } else {
      errors.push(
        ...validateEvidenceRefsExist(
          screen.certification.regressionMatrixEvidence,
          label,
          'certification.regressionMatrixEvidence'
        )
      );
    }
  } else if (screen.status === 'ready_for_certification') {
    for (const ticketId of screen.ticketIds || []) {
      const ticket = ticketMap.get(ticketId);
      if (ticket && ticket.status !== 'locked') {
        errors.push(`${label}: ready_for_certification requires all linked tickets locked; found ${ticketId}:${ticket.status}`);
      }
    }
  } else if (screen.status === 'reopened') {
    if (!isNonEmptyString(screen.certification.reopenReason)) {
      errors.push(`${label}: reopened screen requires certification.reopenReason`);
    }
  }

  const screenTransitions = getScreenTransitions(state);
  if (screenTransitions.length > 0) {
    if (screen.status !== 'not_started' && (!Array.isArray(screen.statusHistory) || screen.statusHistory.length === 0)) {
      errors.push(`${label}: non-not_started screen requires non-empty statusHistory`);
    }
    errors.push(
      ...validateStatusHistory(
        screen.statusHistory,
        screen.status,
        screenTransitions,
        label,
        new Set(['claude', 'operator'])
      )
    );
  }

  return errors;
}

function validateFreezeManifestObject(manifest, options = {}) {
  const strict = Boolean(options.strict);
  const expectedSha = options.sha;
  const errors = [];

  const requiredTopFields = [
    'schemaVersion',
    'freezeId',
    'source',
    'services',
    'database',
    'cache',
    'pos',
    'cloudDeploy',
    'approvals',
    'verification',
    'lockStatus',
  ];
  for (const field of requiredTopFields) {
    if (!(field in manifest)) {
      errors.push(`freeze manifest missing required field "${field}"`);
    }
  }

  if (!manifest.source || typeof manifest.source !== 'object') {
    errors.push('freeze manifest source must be an object');
  } else {
    if (!isNonEmptyString(manifest.source.gitSha)) {
      errors.push('freeze manifest source.gitSha is required');
    }
    if (expectedSha && manifest.source.gitSha !== expectedSha) {
      errors.push(`freeze manifest SHA mismatch: expected ${expectedSha}, got ${manifest.source.gitSha}`);
    }
  }

  if (!Array.isArray(manifest.services)) {
    errors.push('freeze manifest services must be an array');
  } else {
    const seen = new Set();
    for (const serviceEntry of manifest.services) {
      if (!serviceEntry || typeof serviceEntry !== 'object') {
        errors.push('freeze manifest has invalid service entry');
        continue;
      }
      const serviceName = serviceEntry.service;
      if (!REQUIRED_SERVICES.has(serviceName)) {
        errors.push(`freeze manifest has unexpected service "${serviceName}"`);
      } else {
        seen.add(serviceName);
      }
      if (strict) {
        const strictFields = ['image', 'digest', 'stagingRevision', 'productionTarget'];
        for (const field of strictFields) {
          if (!isNonEmptyString(serviceEntry[field])) {
            errors.push(`freeze manifest service "${serviceName}" missing ${field}`);
          }
        }
      }
    }

    for (const requiredService of REQUIRED_SERVICES) {
      if (!seen.has(requiredService)) {
        errors.push(`freeze manifest missing required service "${requiredService}"`);
      }
    }
  }

  if (strict) {
    if (!manifest.database || !isNonEmptyString(manifest.database.migrationVersion)) {
      errors.push('freeze manifest database.migrationVersion is required in strict mode');
    }
    if (!manifest.database || !isNonEmptyString(manifest.database.migrationChecksum)) {
      errors.push('freeze manifest database.migrationChecksum is required in strict mode');
    }
    if (!manifest.database || !isNonEmptyString(manifest.database.backupId)) {
      errors.push('freeze manifest database.backupId is required in strict mode');
    }
    if (!manifest.cache || manifest.cache.verified !== true) {
      errors.push('freeze manifest cache.verified must be true in strict mode');
    }
    if (!manifest.pos || !isNonEmptyString(manifest.pos.androidArtifactUri)) {
      errors.push('freeze manifest pos.androidArtifactUri is required in strict mode');
    }
    if (!manifest.verification || manifest.verification.stagingSmokePassed !== true) {
      errors.push('freeze manifest verification.stagingSmokePassed must be true in strict mode');
    }
    if (!manifest.verification || manifest.verification.operatorFullSignoff !== true) {
      errors.push('freeze manifest verification.operatorFullSignoff must be true in strict mode');
    }
    if (!manifest.approvals || manifest.approvals.operatorApproved !== true) {
      errors.push('freeze manifest approvals.operatorApproved must be true in strict mode');
    }
    if (!manifest.approvals || !isNonEmptyString(manifest.approvals.operatorPrincipal)) {
      errors.push('freeze manifest approvals.operatorPrincipal is required in strict mode');
    }
    if (!manifest.approvals || manifest.approvals.releaseManagerApproved !== true) {
      errors.push('freeze manifest approvals.releaseManagerApproved must be true in strict mode');
    }
    if (!manifest.approvals || !isNonEmptyString(manifest.approvals.releaseManagerPrincipal)) {
      errors.push('freeze manifest approvals.releaseManagerPrincipal is required in strict mode');
    }
    if (!manifest.cloudDeploy || manifest.cloudDeploy.promotionApproved !== true) {
      errors.push('freeze manifest cloudDeploy.promotionApproved must be true in strict mode');
    }
    if (!manifest.cloudDeploy || !isNonEmptyString(manifest.cloudDeploy.releaseName)) {
      errors.push('freeze manifest cloudDeploy.releaseName is required in strict mode');
    }
    if (manifest.lockStatus !== 'locked') {
      errors.push('freeze manifest lockStatus must be "locked" in strict mode');
    }
  }

  return errors;
}

function loadWorkflowContext() {
  const state = readJson(STATE_FILE);

  const ticketFiles = listJsonFiles(TICKETS_DIR);
  const screenFiles = listJsonFiles(SCREENS_DIR);
  const ticketMap = new Map();
  const screenMap = new Map();
  const errors = [];

  for (const ticketFile of ticketFiles) {
    const ticket = readJson(ticketFile);
    const label = path.relative(ROOT_DIR, ticketFile);
    errors.push(...validateTicketObject(ticket, label, state));
    if (ticketMap.has(ticket.ticketId)) {
      errors.push(`duplicate ticketId found: ${ticket.ticketId}`);
    } else {
      ticketMap.set(ticket.ticketId, ticket);
    }
  }

  errors.push(...validateTicketOrderingAndHierarchy(ticketMap, state));

  const maxActiveTicketsPerScreen = state.rules?.ticketRules?.maxActiveTicketsPerScreen ?? 1;
  for (const screenFile of screenFiles) {
    const screen = readJson(screenFile);
    const label = path.relative(ROOT_DIR, screenFile);
    errors.push(...validateScreenObject(screen, label, ticketMap, maxActiveTicketsPerScreen, state));
    if (screenMap.has(screen.screenId)) {
      errors.push(`duplicate screenId found: ${screen.screenId}`);
    } else {
      screenMap.set(screen.screenId, screen);
    }
  }

  const ticketScreenActiveCounter = new Map();
  for (const ticket of ticketMap.values()) {
    if (!WIP_TICKET_STATUSES.has(ticket.status)) {
      continue;
    }
    const key = ticket.screenId;
    ticketScreenActiveCounter.set(key, (ticketScreenActiveCounter.get(key) || 0) + 1);
  }

  for (const [screenId, activeCount] of ticketScreenActiveCounter.entries()) {
    if (activeCount > maxActiveTicketsPerScreen) {
      errors.push(
        `active ticket limit exceeded for screen "${screenId}": ${activeCount} > ${maxActiveTicketsPerScreen}`
      );
    }
  }

  const maxGlobalWip = Number(state.rules?.ticketRules?.maxWipTicketsGlobal ?? 1);
  const wipTickets = [...ticketMap.values()].filter((ticket) => WIP_TICKET_STATUSES.has(ticket.status));
  if (wipTickets.length > maxGlobalWip) {
    errors.push(`global WIP ticket limit exceeded: ${wipTickets.length} > ${maxGlobalWip}`);
  }

  const maxWipScreensGlobal = Number(state.rules?.ticketRules?.maxWipScreensGlobal ?? 1);
  const wipScreens = new Set(wipTickets.map((ticket) => ticket.screenId));
  if (wipScreens.size > maxWipScreensGlobal) {
    errors.push(`global WIP screen limit exceeded: ${wipScreens.size} > ${maxWipScreensGlobal}`);
  }

  const totalTickets = ticketMap.size;
  const activeTickets = [...ticketMap.values()].filter((ticket) => ACTIVE_TICKET_STATUSES.has(ticket.status)).length;
  const lockedTickets = [...ticketMap.values()].filter((ticket) => ticket.status === 'locked').length;
  const totalScreens = screenMap.size;
  const certifiedScreens = [...screenMap.values()].filter((screen) => screen.status === 'certified').length;

  return {
    state,
    ticketMap,
    screenMap,
    errors,
    metrics: {
      totalTickets,
      activeTickets,
      wipTickets: wipTickets.length,
      lockedTickets,
      totalScreens,
      certifiedScreens,
      allScreensCertified: totalScreens > 0 && totalScreens === certifiedScreens,
    },
  };
}

function validateState(context, options = {}) {
  const state = context.state;
  const errors = [...context.errors];
  const strict = Boolean(options.strict);

  if (!state || typeof state !== 'object') {
    errors.push('workflow state must be an object');
    return errors;
  }

  if (!MODES.has(state.workflowMode)) {
    errors.push(`workflowMode must be one of: ${[...MODES].join(', ')}`);
  }
  if (state.machineEnforcement?.enabled !== true) {
    errors.push('machineEnforcement.enabled must be true');
  }

  const liveTicketIntakeRules = state?.rules?.liveTicketIntakeRules;
  if (liveTicketIntakeRules?.enabled === true) {
    if (!Array.isArray(liveTicketIntakeRules.enforceForStatuses) || liveTicketIntakeRules.enforceForStatuses.length === 0) {
      errors.push('rules.liveTicketIntakeRules.enforceForStatuses must be a non-empty array when enabled=true');
    }
    const deployAt = parseIsoTimestamp(liveTicketIntakeRules.lastSuccessfulStagingDeployAt);
    if (deployAt === null) {
      errors.push('rules.liveTicketIntakeRules.lastSuccessfulStagingDeployAt must be a valid timestamp');
    }
    if (liveTicketIntakeRules.requireDeploymentRefMatch === true && !isNonEmptyString(liveTicketIntakeRules.lastSuccessfulStagingDeployRef)) {
      errors.push('rules.liveTicketIntakeRules.lastSuccessfulStagingDeployRef is required when requireDeploymentRefMatch=true');
    }
  }

  const allowedOperatorPrincipals = getAllowedOperatorPrincipals(state);
  if (allowedOperatorPrincipals.length === 0) {
    errors.push('roles.operator.identity.allowedPrincipals must define at least one operator principal');
  }

  const requiredExecutionContext = getRequiredExecutionContext(state);
  if (!isNonEmptyString(requiredExecutionContext)) {
    errors.push('roles.operator.productionPolicy.requiredExecutionContext must be set');
  }

  const requiredSignals = getRequiredPipelineSignals(state);
  if (requiredExecutionContext === 'pipeline' && requiredSignals.length === 0) {
    errors.push('roles.operator.productionPolicy.requiredPipelineSignals must define at least one signal');
  }

  const firstTicketStarted = state.progress?.firstTicketStarted === true || context.metrics.totalTickets > 0;
  if (firstTicketStarted) {
    const unresolved = (state.criticalContradictions || []).filter(
      (item) => item.mustResolveBeforeFirstTicket === true && item.status !== 'resolved'
    );
    if (unresolved.length > 0) {
      errors.push(
        `unresolved contradictions before first ticket: ${unresolved.map((item) => item.id).join(', ')}`
      );
    }
  }

  if (['FREEZE_READY', 'PROD_PROMOTE', 'PROD_LOCKED'].includes(state.workflowMode)) {
    if (context.metrics.activeTickets > 0) {
      errors.push(`mode ${state.workflowMode} requires zero active tickets (found ${context.metrics.activeTickets})`);
    }
    if (!context.metrics.allScreensCertified) {
      errors.push(`mode ${state.workflowMode} requires all screens certified`);
    }
  }

  if (['PROD_PROMOTE', 'PROD_LOCKED'].includes(state.workflowMode) || strict) {
    const freezeManifest = readJson(FREEZE_FILE);
    const freezeErrors = validateFreezeManifestObject(freezeManifest, { strict: true });
    for (const error of freezeErrors) {
      errors.push(error);
    }
  }

  const legacyAudit = validateLegacyConflicts({ strict: false });
  for (const error of legacyAudit.errors) {
    errors.push(error);
  }
  for (const warning of legacyAudit.warnings) {
    console.warn(`[WORKFLOW_GUARD] WARN: ${warning}`);
  }

  return errors;
}

function syncStateSummary(context) {
  const state = context.state;
  const metrics = context.metrics;
  if (!state.summary || typeof state.summary !== 'object') {
    state.summary = {};
  }
  state.summary.totalTickets = metrics.totalTickets;
  state.summary.activeTickets = metrics.activeTickets;
  state.summary.wipTickets = metrics.wipTickets;
  state.summary.lockedTickets = metrics.lockedTickets;
  state.summary.totalScreens = metrics.totalScreens;
  state.summary.certifiedScreens = metrics.certifiedScreens;
  if (!state.progress || typeof state.progress !== 'object') {
    state.progress = {};
  }
  state.progress.firstTicketStarted = metrics.totalTickets > 0;
  state.updatedAt = new Date().toISOString();
  writeJson(STATE_FILE, state);
}

function ensureValidStateOrFail(options = {}) {
  const context = loadWorkflowContext();
  const errors = validateState(context, options);
  if (errors.length > 0) {
    fail(`state validation failed:\n- ${errors.join('\n- ')}`);
  }
  return context;
}

function commandValidateState() {
  const context = ensureValidStateOrFail();
  ok(
    `state validated: mode=${context.state.workflowMode}, tickets=${context.metrics.totalTickets}, screens=${context.metrics.totalScreens}`
  );
}

function commandSyncState() {
  const context = ensureValidStateOrFail();
  syncStateSummary(context);
  ok('state summary synchronized');
}

function commandValidateTicket(args) {
  const fileArg = getArg(args, '--file');
  if (!fileArg) {
    fail('validate-ticket requires --file <ticket.json>');
  }
  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(ROOT_DIR, fileArg);
  const ticket = readJson(filePath);
  const context = ensureValidStateOrFail();
  const errors = validateTicketObject(ticket, path.relative(ROOT_DIR, filePath), context.state);
  if (errors.length > 0) {
    fail(`ticket validation failed:\n- ${errors.join('\n- ')}`);
  }
  ok(`ticket validated: ${ticket.ticketId}`);
}

function commandValidateScreen(args) {
  const fileArg = getArg(args, '--file');
  if (!fileArg) {
    fail('validate-screen requires --file <screen.json>');
  }
  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(ROOT_DIR, fileArg);
  const screen = readJson(filePath);
  const context = ensureValidStateOrFail();
  const maxActive = context.state.rules?.ticketRules?.maxActiveTicketsPerScreen ?? 1;
  const errors = validateScreenObject(
    screen,
    path.relative(ROOT_DIR, filePath),
    context.ticketMap,
    maxActive,
    context.state
  );
  if (errors.length > 0) {
    fail(`screen validation failed:\n- ${errors.join('\n- ')}`);
  }
  ok(`screen validated: ${screen.screenId}`);
}

function commandValidateFreeze(args) {
  const fileArg = getArg(args, '--file');
  const strict = args.includes('--strict');
  const expectedSha = getArg(args, '--sha');
  const filePath = fileArg
    ? (path.isAbsolute(fileArg) ? fileArg : path.join(ROOT_DIR, fileArg))
    : FREEZE_FILE;
  const manifest = readJson(filePath);
  const errors = validateFreezeManifestObject(manifest, {
    strict,
    sha: expectedSha || undefined,
  });
  if (errors.length > 0) {
    fail(`freeze manifest validation failed:\n- ${errors.join('\n- ')}`);
  }
  ok(`freeze manifest validated${strict ? ' (strict)' : ''}`);
}

function commandValidateBatch(args) {
  const context = ensureValidStateOrFail();
  const fileArg = getArg(args, '--file');
  const batchPath = fileArg
    ? (path.isAbsolute(fileArg) ? fileArg : path.join(ROOT_DIR, fileArg))
    : (context.state.paths?.stagingBatchFile
      ? path.join(ROOT_DIR, context.state.paths.stagingBatchFile)
      : STAGING_BATCH_FILE);

  const batch = readJson(batchPath);
  const errors = validateBatchObject(batch, context.state, context.ticketMap);
  if (errors.length > 0) {
    fail(`staging batch validation failed:\n- ${errors.join('\n- ')}`);
  }

  const maxScreens = computeMaxScreensFromPolicy(context.state.rules?.deploymentBatchPolicy || {}, batch.riskFlags || {});
  ok(
    `staging batch validated: ${path.relative(ROOT_DIR, batchPath)} (screens=${batch.screenIds.length}, tickets=${batch.ticketIds.length}, maxScreens=${maxScreens})`
  );
}

function commandLegacyAudit(args) {
  const strict = args.includes('--strict');
  const audit = validateLegacyConflicts({ strict });
  if (audit.warnings.length > 0) {
    for (const warning of audit.warnings) {
      console.warn(`[WORKFLOW_GUARD] WARN: ${warning}`);
    }
  }
  if (audit.errors.length > 0) {
    fail(`legacy audit failed:\n- ${audit.errors.join('\n- ')}`);
  }
  ok(`legacy audit passed${strict ? ' (strict)' : ''}`);
}

function commandTicketTransition(args) {
  const fileArg = getArg(args, '--file');
  const to = getArg(args, '--to');
  const actor = getArg(args, '--actor');
  const reason = getArg(args, '--reason');

  if (!fileArg || !to || !actor || !reason) {
    fail('ticket-transition requires --file, --to, --actor, and --reason');
  }
  if (!['claude', 'operator'].includes(actor)) {
    fail('ticket-transition actor must be claude or operator');
  }
  const workflowActor = getWorkflowActor();
  if (workflowActor && workflowActor !== actor) {
    fail(`ticket-transition actor mismatch: WORKFLOW_ACTOR=${workflowActor}, --actor=${actor}`);
  }

  const context = ensureValidStateOrFail();
  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(ROOT_DIR, fileArg);
  const ticket = readJson(filePath);
  const from = ticket.status;
  const transitions = getTicketTransitions(context.state);

  if (!isTransitionAllowed(transitions, from, to, actor)) {
    fail(`illegal ticket transition ${from} -> ${to} by ${actor}`);
  }

  ticket.status = to;
  if (!Array.isArray(ticket.statusHistory)) {
    ticket.statusHistory = [];
  }
  const previousHash =
    ticket.statusHistory.length > 0 && isNonEmptyString(ticket.statusHistory[ticket.statusHistory.length - 1].hash)
      ? ticket.statusHistory[ticket.statusHistory.length - 1].hash
      : 'GENESIS';
  const event = {
    from,
    to,
    actor,
    sessionId: resolveTransitionSessionId(context.state, 'ticket-transition'),
    at: new Date().toISOString(),
    reason,
    prevHash: previousHash,
  };
  event.hash = computeHistoryHash(event);
  ticket.statusHistory.push({
    ...event,
  });
  if (!ticket.timestamps || typeof ticket.timestamps !== 'object') {
    ticket.timestamps = {};
  }
  ticket.timestamps.updatedAt = new Date().toISOString();
  if (to === 'locked') {
    ticket.timestamps.lockedAt = new Date().toISOString();
  }

  const validationErrors = validateTicketObject(ticket, path.relative(ROOT_DIR, filePath), context.state);
  if (validationErrors.length > 0) {
    fail(`ticket-transition validation failed:\n- ${validationErrors.join('\n- ')}`);
  }

  writeJson(filePath, ticket);

  const refreshed = loadWorkflowContext();
  const stateErrors = validateState(refreshed);
  if (stateErrors.length > 0) {
    fail(`ticket-transition state failed after write:\n- ${stateErrors.join('\n- ')}`);
  }
  syncStateSummary(refreshed);
  ok(`ticket transition applied: ${path.relative(ROOT_DIR, filePath)} ${from} -> ${to} by ${actor}`);
}

function commandScreenTransition(args) {
  const fileArg = getArg(args, '--file');
  const to = getArg(args, '--to');
  const actor = getArg(args, '--actor');
  const reason = getArg(args, '--reason');

  if (!fileArg || !to || !actor || !reason) {
    fail('screen-transition requires --file, --to, --actor, and --reason');
  }
  if (!['claude', 'operator'].includes(actor)) {
    fail('screen-transition actor must be claude or operator');
  }
  const workflowActor = getWorkflowActor();
  if (workflowActor && workflowActor !== actor) {
    fail(`screen-transition actor mismatch: WORKFLOW_ACTOR=${workflowActor}, --actor=${actor}`);
  }

  const context = ensureValidStateOrFail();
  const filePath = path.isAbsolute(fileArg) ? fileArg : path.join(ROOT_DIR, fileArg);
  const screen = readJson(filePath);
  const from = screen.status;
  const transitions = getScreenTransitions(context.state);

  if (!isTransitionAllowed(transitions, from, to, actor)) {
    fail(`illegal screen transition ${from} -> ${to} by ${actor}`);
  }

  screen.status = to;
  if (!Array.isArray(screen.statusHistory)) {
    screen.statusHistory = [];
  }
  const previousHash =
    screen.statusHistory.length > 0 && isNonEmptyString(screen.statusHistory[screen.statusHistory.length - 1].hash)
      ? screen.statusHistory[screen.statusHistory.length - 1].hash
      : 'GENESIS';
  const event = {
    from,
    to,
    actor,
    sessionId: resolveTransitionSessionId(context.state, 'screen-transition'),
    at: new Date().toISOString(),
    reason,
    prevHash: previousHash,
  };
  event.hash = computeHistoryHash(event);
  screen.statusHistory.push({
    ...event,
  });
  if (!screen.timestamps || typeof screen.timestamps !== 'object') {
    screen.timestamps = {};
  }
  screen.timestamps.updatedAt = new Date().toISOString();

  const maxActive = context.state.rules?.ticketRules?.maxActiveTicketsPerScreen ?? 1;
  const validationErrors = validateScreenObject(
    screen,
    path.relative(ROOT_DIR, filePath),
    context.ticketMap,
    maxActive,
    context.state
  );
  if (validationErrors.length > 0) {
    fail(`screen-transition validation failed:\n- ${validationErrors.join('\n- ')}`);
  }

  writeJson(filePath, screen);

  const refreshed = loadWorkflowContext();
  const stateErrors = validateState(refreshed);
  if (stateErrors.length > 0) {
    fail(`screen-transition state failed after write:\n- ${stateErrors.join('\n- ')}`);
  }
  syncStateSummary(refreshed);
  ok(`screen transition applied: ${path.relative(ROOT_DIR, filePath)} ${from} -> ${to} by ${actor}`);
}

function commandPreStagingDeploy() {
  const context = ensureValidStateOrFail();
  const mode = context.state.workflowMode;
  const allowed = context.state.rules?.deploymentRules?.allowedStagingModes || [];
  if (!allowed.includes(mode)) {
    fail(`staging deploy is blocked for mode ${mode}. Allowed: ${allowed.join(', ')}`);
  }

  const gitDisciplineErrors = validateGitWorkspaceForStaging(context.state);
  if (gitDisciplineErrors.length > 0) {
    fail(`staging deploy blocked by git discipline:\n- ${gitDisciplineErrors.join('\n- ')}`);
  }

  const requireBatchManifest = context.state.rules?.deploymentBatchPolicy?.requireBatchManifestForStagingDeploy === true;
  if (requireBatchManifest) {
    const batchPath = context.state.paths?.stagingBatchFile
      ? path.join(ROOT_DIR, context.state.paths.stagingBatchFile)
      : STAGING_BATCH_FILE;
    const batch = readJson(batchPath);
    const batchErrors = validateBatchObject(batch, context.state, context.ticketMap);
    if (batchErrors.length > 0) {
      fail(`staging deploy blocked by batch policy:\n- ${batchErrors.join('\n- ')}`);
    }

    const gitSha = tryExec('git rev-parse --short HEAD');
    if (gitSha.ok && isNonEmptyString(gitSha.output)) {
      const declared = (batch.commitSha || '').trim();
      if (declared !== gitSha.output) {
        fail(`staging deploy blocked: staging_batch commitSha (${declared}) must match current HEAD (${gitSha.output})`);
      }
    }
  }

  ok(`staging deploy allowed in mode ${mode}`);
}

function commandPrePromote(args) {
  const sha = getArg(args, '--sha');
  if (!sha) {
    fail('pre-promote requires --sha <sha>');
  }
  requireWorkflowActor('operator', 'pre-promote');
  const context = ensureValidStateOrFail();
  const boundaryErrors = validateOperatorProductionBoundary(context.state, 'pre-promote');
  if (boundaryErrors.length > 0) {
    fail(`pre-promote operator boundary checks failed:\n- ${boundaryErrors.join('\n- ')}`);
  }
  if (!['FREEZE_READY', 'PROD_PROMOTE'].includes(context.state.workflowMode)) {
    fail(`pre-promote requires mode FREEZE_READY or PROD_PROMOTE, current mode is ${context.state.workflowMode}`);
  }
  const manifest = readJson(FREEZE_FILE);
  const errors = validateFreezeManifestObject(manifest, { strict: true, sha });
  if (errors.length > 0) {
    fail(`pre-promote freeze checks failed:\n- ${errors.join('\n- ')}`);
  }
  const activePrincipal = resolveActiveOperatorPrincipal();
  const approvedPrincipal = (manifest?.approvals?.operatorPrincipal || '').trim();
  if (isNonEmptyString(approvedPrincipal) && activePrincipal.toLowerCase() !== approvedPrincipal.toLowerCase()) {
    fail(
      `pre-promote blocked: active principal (${activePrincipal}) does not match freeze approvals.operatorPrincipal (${approvedPrincipal})`
    );
  }
  ok(`pre-promote passed for sha ${sha}`);
}

function commandSetMode(args) {
  const target = getArg(args, '--set');
  if (!target) {
    fail('mode command requires --set <MODE>');
  }
  if (!MODES.has(target)) {
    fail(`unknown mode: ${target}`);
  }

  const context = ensureValidStateOrFail();
  const current = context.state.workflowMode;
  const transitions = {
    LIVE_FIX: ['FREEZE_CANDIDATE'],
    FREEZE_CANDIDATE: ['LIVE_FIX', 'FREEZE_READY'],
    FREEZE_READY: ['LIVE_FIX', 'PROD_PROMOTE'],
    PROD_PROMOTE: ['FREEZE_READY', 'PROD_LOCKED'],
    PROD_LOCKED: ['LIVE_FIX'],
  };
  if (!transitions[current].includes(target)) {
    fail(`invalid mode transition: ${current} -> ${target}`);
  }
  if (['PROD_PROMOTE', 'PROD_LOCKED'].includes(target)) {
    requireWorkflowActor('operator', `mode transition to ${target}`);
    const boundaryErrors = validateOperatorProductionBoundary(context.state, `mode transition to ${target}`);
    if (boundaryErrors.length > 0) {
      fail(`mode transition blocked:\n- ${boundaryErrors.join('\n- ')}`);
    }
  }

  if (target === 'FREEZE_CANDIDATE' && context.metrics.activeTickets > 0) {
    fail(`cannot enter FREEZE_CANDIDATE with active tickets=${context.metrics.activeTickets}`);
  }
  if (target === 'FREEZE_READY') {
    if (context.metrics.activeTickets > 0) {
      fail(`cannot enter FREEZE_READY with active tickets=${context.metrics.activeTickets}`);
    }
    if (!context.metrics.allScreensCertified) {
      fail('cannot enter FREEZE_READY until all screens are certified');
    }
    const freezeManifest = readJson(FREEZE_FILE);
    const freezeErrors = validateFreezeManifestObject(freezeManifest, { strict: true });
    if (freezeErrors.length > 0) {
      fail(`cannot enter FREEZE_READY due to freeze manifest issues:\n- ${freezeErrors.join('\n- ')}`);
    }
  }
  if (target === 'PROD_PROMOTE') {
    const freezeManifest = readJson(FREEZE_FILE);
    const freezeErrors = validateFreezeManifestObject(freezeManifest, { strict: true });
    if (freezeErrors.length > 0) {
      fail(`cannot enter PROD_PROMOTE due to freeze manifest issues:\n- ${freezeErrors.join('\n- ')}`);
    }
  }

  context.state.workflowMode = target;
  context.state.updatedAt = new Date().toISOString();
  writeJson(STATE_FILE, context.state);
  ok(`mode transition applied: ${current} -> ${target}`);
}

function commandResolveContradiction(args) {
  const id = getArg(args, '--id');
  if (!id) {
    fail('resolve-contradiction requires --id <CC-XXX>');
  }
  const context = ensureValidStateOrFail();
  const contradiction = (context.state.criticalContradictions || []).find((item) => item.id === id);
  if (!contradiction) {
    fail(`contradiction not found: ${id}`);
  }
  contradiction.status = 'resolved';
  contradiction.resolvedAt = new Date().toISOString();
  context.state.updatedAt = new Date().toISOString();
  writeJson(STATE_FILE, context.state);
  ok(`contradiction resolved: ${id}`);
}

function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  if (!command || ['-h', '--help', 'help'].includes(command)) {
    usage();
    process.exit(0);
  }

  switch (command) {
    case 'validate-state':
      commandValidateState();
      break;
    case 'sync-state':
      commandSyncState();
      break;
    case 'validate-ticket':
      commandValidateTicket(args);
      break;
    case 'validate-screen':
      commandValidateScreen(args);
      break;
    case 'validate-freeze':
      commandValidateFreeze(args);
      break;
    case 'validate-batch':
      commandValidateBatch(args);
      break;
    case 'legacy-audit':
      commandLegacyAudit(args);
      break;
    case 'ticket-transition':
      commandTicketTransition(args);
      break;
    case 'screen-transition':
      commandScreenTransition(args);
      break;
    case 'pre-staging-deploy':
      commandPreStagingDeploy();
      break;
    case 'pre-promote':
      commandPrePromote(args);
      break;
    case 'mode':
      commandSetMode(args);
      break;
    case 'resolve-contradiction':
      commandResolveContradiction(args);
      break;
    default:
      fail(`unknown command: ${command}`);
  }
}

main();
