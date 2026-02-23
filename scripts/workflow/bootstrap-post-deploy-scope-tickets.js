#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const SCOPE_REF = 'POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203';
const DEFAULT_CANONICAL_FILE = path.join(
  ROOT_DIR,
  'RELEASES',
  'AUDIT_R1234_FINAL_CANONICAL_DEDUPE_2026-02-23.json'
);
const DEFAULT_TEMPLATE_FILE = path.join(ROOT_DIR, 'workflow', 'templates', 'ticket.example.json');
const DEFAULT_WORKFLOW_STATE_FILE = path.join(ROOT_DIR, 'workflow', 'state', 'workflow_state.json');
const DEFAULT_TICKETS_DIR = path.join(ROOT_DIR, 'workflow', 'tickets');

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function parseArgs(argv) {
  const args = {
    write: false,
    canonicalFile: DEFAULT_CANONICAL_FILE,
    templateFile: DEFAULT_TEMPLATE_FILE,
    workflowStateFile: DEFAULT_WORKFLOW_STATE_FILE,
    ticketsDir: DEFAULT_TICKETS_DIR,
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--write') {
      args.write = true;
      continue;
    }
    if (token === '--canonical-file' && argv[i + 1]) {
      args.canonicalFile = path.isAbsolute(argv[i + 1]) ? argv[i + 1] : path.join(ROOT_DIR, argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--template-file' && argv[i + 1]) {
      args.templateFile = path.isAbsolute(argv[i + 1]) ? argv[i + 1] : path.join(ROOT_DIR, argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--workflow-state-file' && argv[i + 1]) {
      args.workflowStateFile = path.isAbsolute(argv[i + 1]) ? argv[i + 1] : path.join(ROOT_DIR, argv[i + 1]);
      i += 1;
      continue;
    }
    if (token === '--tickets-dir' && argv[i + 1]) {
      args.ticketsDir = path.isAbsolute(argv[i + 1]) ? argv[i + 1] : path.join(ROOT_DIR, argv[i + 1]);
      i += 1;
    }
  }
  return args;
}

function humanizeTicketId(ticketId) {
  return ticketId
    .replace(/^LIVE\./, '')
    .replace(/\.001$/, '')
    .split(/[._-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

function normalizeFindingTitle(rawFinding, fallbackTicketId) {
  if (!isNonEmptyString(rawFinding)) {
    return humanizeTicketId(fallbackTicketId);
  }
  const title = rawFinding
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!isNonEmptyString(title)) {
    return humanizeTicketId(fallbackTicketId);
  }
  return title.length > 140 ? `${title.slice(0, 137)}...` : title;
}

function deriveSurface(ticketId) {
  const id = (ticketId || '').toUpperCase();
  if (
    id.startsWith('LIVE.RET.') ||
    id.startsWith('LIVE.RETAILER.') ||
    id.includes('.RETAILER.')
  ) {
    return 'retailer_web';
  }
  if (
    id.startsWith('LIVE.SUP.') ||
    id.startsWith('LIVE.SUPPLIER.') ||
    id.includes('.SUPPLIER.')
  ) {
    return 'supplier_web';
  }
  if (
    id.startsWith('LIVE.SA.') ||
    id.startsWith('LIVE.SUPERADMIN.') ||
    id.includes('.SUPERADMIN.')
  ) {
    return 'superadmin_web';
  }
  if (
    id.startsWith('LIVE.POS.') ||
    id.startsWith('LIVE.SHIFTS.') ||
    id.startsWith('LIVE.STOCKIN.') ||
    id.startsWith('LIVE.SYNC.')
  ) {
    return 'pos';
  }
  if (
    id.startsWith('LIVE.GW.') ||
    id.startsWith('LIVE.BE.') ||
    id.startsWith('LIVE.API.') ||
    id.startsWith('LIVE.DB.') ||
    id.startsWith('LIVE.CONFIG.') ||
    id.startsWith('LIVE.SECRETS.') ||
    id.startsWith('LIVE.WEBHOOK.') ||
    id.startsWith('LIVE.XF.') ||
    id.startsWith('LIVE.REPORTS.') ||
    id.startsWith('LIVE.AI.')
  ) {
    return 'backend';
  }
  return 'shared';
}

function deriveRiskClass(severity) {
  switch ((severity || '').toUpperCase()) {
    case 'P0':
      return 'critical';
    case 'P1':
      return 'high';
    case 'P2':
      return 'medium';
    default:
      return 'low';
  }
}

function deriveUrls(surface) {
  switch (surface) {
    case 'retailer_web':
      return ['https://staging.supermandi.tech/retailer/'];
    case 'supplier_web':
      return ['https://staging.supermandi.tech/supplier/'];
    case 'superadmin_web':
      return ['https://staging.supermandi.tech/admin/'];
    case 'pos':
      return ['https://staging.supermandi.tech/api/v1/pos/health'];
    case 'backend':
      return ['https://staging.supermandi.tech/api/v1/health'];
    default:
      return ['https://staging.supermandi.tech/'];
  }
}

function deriveServices(surface) {
  switch (surface) {
    case 'retailer_web':
      return ['retailer-admin', 'api-gateway', 'main-backend'];
    case 'supplier_web':
      return ['supplier-portal', 'api-gateway', 'main-backend'];
    case 'superadmin_web':
      return ['superadmin', 'api-gateway', 'main-backend'];
    case 'pos':
      return ['api-gateway', 'main-backend'];
    case 'backend':
      return ['api-gateway', 'main-backend'];
    default:
      return ['landing', 'api-gateway'];
  }
}

function deriveBasePath(surface) {
  switch (surface) {
    case 'retailer_web':
      return '/retailer';
    case 'supplier_web':
      return '/supplier';
    case 'superadmin_web':
      return '/admin';
    case 'pos':
      return '/api/v1/pos';
    case 'backend':
      return '/api/v1';
    default:
      return '/';
  }
}

function buildTicket({
  template,
  ticketId,
  severity,
  title,
  requiredFilesRead,
}) {
  const ticket = JSON.parse(JSON.stringify(template));
  const surface = deriveSurface(ticketId);
  const services = deriveServices(surface);
  const urls = deriveUrls(surface);
  const basePath = deriveBasePath(surface);
  const now = new Date().toISOString();

  ticket.ticketId = ticketId;
  ticket.screenId = ticketId;
  ticket.orderInScreen = 1;
  ticket.surface = surface;
  ticket.riskClass = deriveRiskClass(severity);
  ticket.title = title;
  ticket.description =
    `Scope ${SCOPE_REF}. Implement ticket to 100% production grade with runtime staging parity evidence.`;
  ticket.status = 'todo';
  ticket.severity = ['P0', 'P1', 'P2', 'P3'].includes(severity) ? severity : 'P2';
  ticket.parentTicketId = null;
  ticket.subTicketIds = [];

  ticket.layers = {
    ui: 'fail',
    ux: 'fail',
    professional_polish: 'fail',
    wiring: 'fail',
    navigation: 'fail',
    api: 'fail',
    backend: 'fail',
    db: 'fail',
    migration: 'fail',
    gcp_parity: 'fail',
  };

  ticket.gcpParity = {
    stagingValidated: false,
    stagingUrls: urls,
    cloudRunServices: services,
    basePathChecked: false,
    envParityChecked: false,
    routingChecked: false,
    apiContractChecked: false,
    dbConnectivityChecked: false,
    artifactDigestPinned: false,
    cloudRunRevisionIds: [],
  };

  ticket.impact = {
    impactedScreens: [ticket.screenId],
    impactedServices: services,
    impactRetestRequired: true,
    impactRetestStatus: 'pending',
  };

  ticket.operator = {
    reportedBy: 'operator',
    reproSteps: [
      `Review and execute fix for ${ticketId}.`,
      'Validate runtime behavior on staging after implementation.',
    ],
    finalSignoff: false,
    signoffAt: '',
  };

  ticket.claudeChecks = {
    screenVisualizedWithOperator: false,
    codeQualityChecksPassed: false,
    regressionChecklistPassed: false,
    apiContractChecked: false,
    navigationChecked: false,
    envAndBasePathChecked: false,
    migrationSafetyChecked: false,
    rollbackPlanReady: false,
    stagingDeployPassed: false,
    stagingDeploymentRef: 'github://run/22305359033',
    cloudWorkspaceValidated: false,
    cloudWorkspaceRef: 'projects/supermandi-backend/locations/asia-south1/workstations/ws-livefix-01',
  };

  ticket.sessionBoot = {
    bootstrappedBy: 'claude',
    bootstrappedAt: now,
    runbookVersion: 'workflow-v1.0.0',
    memoryStateRef: 'workflow/state/workflow_state.json',
    requiredFilesRead,
  };

  ticket.operatorChecks = {
    stagingTestExecuted: false,
    testedOnRealTarget: false,
    testedOnLaptopBrowser: false,
    testedOnRedmi: false,
    stagingUrlsTested: urls,
    issuesReproduced: false,
    fixVerified: false,
    blockingIssueCount: 0,
    nonBlockingIssueCount: 0,
    noBlockingIssueRemaining: false,
    evidenceAttached: false,
    validatedDeploymentRef: 'github://run/22305359033',
    validatedCloudRunRevisionIds: [],
  };

  ticket.statusHistory = [];
  ticket.evidence = {
    beforeVisual: [],
    afterVisual: [],
    apiProof: [],
    parityProof: [],
  };
  ticket.timestamps = {
    createdAt: now,
    updatedAt: now,
    lockedAt: null,
  };

  ticket.truthDeclaration = {
    mockDataUsed: false,
    mockApisUsed: false,
    mockUsageApproved: false,
    productionDataTested: false,
    disclosedToOperator: false,
    notes: `Execution scope ${SCOPE_REF}; runtime staging evidence mandatory.`,
    evidence: [],
  };

  ticket.externalIntegrations = {
    touched: false,
    items: [],
    operatorDisclosureDone: false,
    allValidated: false,
  };

  ticket.buildMapping = {
    expectedSurface: surface,
    expectedBasePath: basePath,
    expectedPrimaryService: services[0],
    actualCloudRunServices: services,
    urlMappingValidated: false,
    correctBuildTargetValidated: false,
    stagingRouteEvidence: [],
  };

  ticket.dependencyDisclosure = {
    internalDependencies: [],
    externalDependencies: [],
    pendingDependencies: [],
    blockers: [],
    disclosedToOperator: false,
    operatorAcknowledged: false,
    notes: `Track blockers explicitly for ${SCOPE_REF}.`,
  };

  ticket.productionInvariants = {
    sellPurchaseIsolation: { status: 'pending', evidence: [], notes: 'Pending verification.' },
    deterministicScanIntentResolution: { status: 'pending', evidence: [], notes: 'Pending verification.' },
    frontendBackendStateParity: { status: 'pending', evidence: [], notes: 'Pending verification.' },
    offlineFirstSafeSync: { status: 'pending', evidence: [], notes: 'Pending verification.' },
    idempotentTransactionProcessing: { status: 'pending', evidence: [], notes: 'Pending verification.' },
    atomicDatabaseWrites: { status: 'pending', evidence: [], notes: 'Pending verification.' },
    strictSchemaValidation: { status: 'pending', evidence: [], notes: 'Pending verification.' },
    zeroSilentFailures: { status: 'pending', evidence: [], notes: 'Pending verification.' },
    structuredAuditLogging: { status: 'pending', evidence: [], notes: 'Pending verification.' },
  };

  ticket.readiness = {
    productionGradeClaimed: false,
    pendingInternal: [`${ticketId}: implementation pending`],
    pendingExternal: [],
    pendingOps: [],
    blocked: false,
    summary: `NOT COMPLETE — ${SCOPE_REF} ticket pending implementation and staging runtime validation.`,
  };

  ticket.gitDiscipline = {
    workBranch: 'live-fix/post-deploy-scope-badc3fbe',
    changeScope: ticketId,
    lastValidatedCommit: 'pending',
    noMixedScope: false,
    noConflictMarkers: false,
    ciGateStatus: 'pending',
    evidence: [],
  };

  return ticket;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!fs.existsSync(args.canonicalFile)) {
    console.error(`[SCOPE-BOOTSTRAP] Missing canonical file: ${args.canonicalFile}`);
    process.exit(1);
  }
  if (!fs.existsSync(args.templateFile)) {
    console.error(`[SCOPE-BOOTSTRAP] Missing template file: ${args.templateFile}`);
    process.exit(1);
  }
  if (!fs.existsSync(args.workflowStateFile)) {
    console.error(`[SCOPE-BOOTSTRAP] Missing workflow state file: ${args.workflowStateFile}`);
    process.exit(1);
  }
  fs.mkdirSync(args.ticketsDir, { recursive: true });

  const canonical = readJson(args.canonicalFile);
  const template = readJson(args.templateFile);
  const workflowState = readJson(args.workflowStateFile);
  const requiredFilesRead =
    workflowState?.rules?.sessionRules?.requiredFilesReadAtSessionStart ||
    template?.sessionBoot?.requiredFilesRead ||
    [];

  const canonicalIds = canonical?.canonicalTickets?.allFinal || [];
  const severityById = canonical?.canonicalSeverity || {};
  const rowMappings = Array.isArray(canonical?.rowMappings) ? canonical.rowMappings : [];
  const firstFindingByCanonicalId = new Map();
  for (const row of rowMappings) {
    if (!isNonEmptyString(row?.canonicalTicketId)) {
      continue;
    }
    if (!firstFindingByCanonicalId.has(row.canonicalTicketId)) {
      firstFindingByCanonicalId.set(row.canonicalTicketId, row.finding || '');
    }
  }

  let existingCount = 0;
  let createCount = 0;
  const createdFiles = [];

  for (const ticketId of canonicalIds) {
    if (!isNonEmptyString(ticketId)) {
      continue;
    }
    const filePath = path.join(args.ticketsDir, `${ticketId}.json`);
    if (fs.existsSync(filePath)) {
      existingCount += 1;
      continue;
    }
    createCount += 1;
    if (!args.write) {
      continue;
    }
    const severity = isNonEmptyString(severityById[ticketId]) ? severityById[ticketId] : 'P2';
    const title = normalizeFindingTitle(firstFindingByCanonicalId.get(ticketId), ticketId);
    const ticket = buildTicket({
      template,
      ticketId,
      severity,
      title,
      requiredFilesRead,
    });
    writeJson(filePath, ticket);
    createdFiles.push(path.relative(ROOT_DIR, filePath).replace(/\\/g, '/'));
  }

  const result = {
    reference: SCOPE_REF,
    canonicalTotal: canonicalIds.length,
    existingTicketFiles: existingCount,
    missingTicketFiles: createCount,
    writeMode: args.write,
    createdCount: createdFiles.length,
    createdFilesSample: createdFiles.slice(0, 25),
  };

  console.log(JSON.stringify(result, null, 2));
}

main();
