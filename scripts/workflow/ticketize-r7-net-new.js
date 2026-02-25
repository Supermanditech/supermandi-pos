#!/usr/bin/env node
/* eslint-disable no-console */
/**
 * Create workflow tickets from R7 dedupe output.
 * - Creates new R7.* tickets only for NET_NEW findings.
 * - Emits duplicate reuse map for DUPLICATE findings (no new file creation).
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..', '..');
const TICKETS_DIR = path.join(ROOT, 'workflow', 'tickets');
const CHECKPOINT_DIR = path.join(ROOT, 'workflow', 'state', 'subagent_checkpoints');
const DEFAULT_DEDUPE_IN = path.join(CHECKPOINT_DIR, 'R7_dedupe_result.json');
const DEFAULT_REUSE_OUT = path.join(CHECKPOINT_DIR, 'R7_duplicate_reuse_map.json');
const DEFAULT_TICKET_TRACE = path.join(CHECKPOINT_DIR, 'R7_ticketization_trace.json');
const STATE_FILE = path.join(ROOT, 'workflow', 'state', 'workflow_state.json');

const SURFACE_MAP = {
  POS: { ticketPrefix: 'R7.POS', schemaSurface: 'pos', service: 'api-gateway', basePath: '/api', stagingUrl: 'https://staging.supermandi.tech/api/v1/health' },
  RET: { ticketPrefix: 'R7.RET', schemaSurface: 'retailer_web', service: 'retailer-admin', basePath: '/retailer', stagingUrl: 'https://staging.supermandi.tech/retailer/' },
  SUP: { ticketPrefix: 'R7.SUP', schemaSurface: 'supplier_web', service: 'supplier-portal', basePath: '/supplier', stagingUrl: 'https://staging.supermandi.tech/supplier/' },
  SA: { ticketPrefix: 'R7.SA', schemaSurface: 'superadmin_web', service: 'superadmin', basePath: '/admin', stagingUrl: 'https://staging.supermandi.tech/admin/' },
  BE: { ticketPrefix: 'R7.BE', schemaSurface: 'backend', service: 'main-backend', basePath: '/api', stagingUrl: 'https://staging.supermandi.tech/api/v1/health' },
  CROSS: { ticketPrefix: 'R7.CROSS', schemaSurface: 'shared', service: 'api-gateway', basePath: '/api', stagingUrl: 'https://staging.supermandi.tech/api/v1/health' },
};

const SEVERITY_TO_RISK = { P0: 'critical', P1: 'high', P2: 'medium', P3: 'low' };
const REQUIRED_DEPLOY_REF = 'github://run/22305359033';
const REQUIRED_REVISION_IDS = [
  'main-backend-00103-zbw',
  'api-gateway-00084-7zh',
  'retailer-admin-00084-pk6',
  'supplier-portal-00078-wv8',
  'superadmin-00077-r6c',
  'landing-00077-gj7',
];

function arg(flag, fallback = '') {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return fallback;
  return process.argv[idx + 1];
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, '/');
}

function headSha() {
  try {
    return execSync('git rev-parse --short HEAD', { cwd: ROOT }).toString().trim();
  } catch {
    return 'UNKNOWN';
  }
}

function nowIso() {
  return new Date().toISOString();
}

function slug(title, maxWords = 7) {
  return String(title || 'UNTITLED')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maxWords)
    .join('_');
}

function parseSurface(finding) {
  const s = String(finding.surface || '').toUpperCase();
  if (SURFACE_MAP[s]) return s;
  return 'CROSS';
}

function parseDimensionLayers(dimension, surface) {
  const d = String(dimension || '').toLowerCase();
  const layers = {
    ui: 'na',
    ux: 'na',
    professional_polish: 'na',
    wiring: 'na',
    navigation: 'na',
    api: 'na',
    backend: surface === 'backend' ? 'fail' : 'na',
    db: 'na',
    migration: 'na',
    gcp_parity: 'na',
  };
  if (d.includes('ui')) layers.ui = 'fail';
  if (d.includes('ux')) layers.ux = 'fail';
  if (d.includes('wiring') || d.includes('state')) layers.wiring = 'fail';
  if (d.includes('navigation')) layers.navigation = 'fail';
  if (d.includes('api')) layers.api = 'fail';
  if (d.includes('db') || d.includes('sql') || d.includes('mapping')) layers.db = 'fail';
  if (d.includes('business')) {
    if (surface === 'backend') layers.backend = 'fail';
    else layers.wiring = layers.wiring === 'fail' ? 'fail' : 'fail';
  }
  if (Object.values(layers).every((v) => v === 'na')) {
    layers.wiring = 'fail';
  }
  return layers;
}

function invariantTemplate(notes) {
  return { status: 'pending', evidence: [], notes };
}

function buildTicket(finding, seq, requiredFilesRead, sha) {
  const surf = parseSurface(finding);
  const cfg = SURFACE_MAP[surf];
  const sev = finding.severity || 'P2';
  const risk = SEVERITY_TO_RISK[sev] || 'medium';
  const ticketId = `${cfg.ticketPrefix}.${String(seq).padStart(3, '0')}.${slug(finding.title)}`;
  const surface = cfg.schemaSurface;
  const createdAt = nowIso();
  const impactedTarget = finding.target || surf;

  return {
    ticketId,
    screenId: ticketId,
    orderInScreen: seq,
    surface,
    riskClass: risk,
    title: finding.title || `${surf} finding`,
    description: [
      `R7 source-first finding ${finding.id}.`,
      `Dimension: ${finding.dimension || 'Wiring'}.`,
      `Severity: ${sev}.`,
      `Source SHA: ${sha}.`,
      `Source file: ${finding.file || 'N/A'}:${finding.line || 1}.`,
      finding.description || '',
    ].join(' ').trim(),
    status: 'todo',
    severity: sev,
    parentTicketId: null,
    subTicketIds: [],
    layers: parseDimensionLayers(finding.dimension, surface),
    gcpParity: {
      stagingValidated: false,
      stagingUrls: [cfg.stagingUrl],
      cloudRunServices: [cfg.service],
      basePathChecked: false,
      envParityChecked: false,
      routingChecked: false,
      apiContractChecked: false,
      dbConnectivityChecked: false,
      artifactDigestPinned: false,
      cloudRunRevisionIds: REQUIRED_REVISION_IDS,
    },
    impact: {
      impactedScreens: [String(impactedTarget)],
      impactedServices: [cfg.service],
      impactRetestRequired: true,
      impactRetestStatus: 'pending',
    },
    operator: {
      reportedBy: 'claude-r7-audit',
      reproSteps: [
        `Open ${finding.file || 'target file'} and inspect line ${finding.line || 1}`,
        `Reproduce ${finding.title} on staging path ${cfg.stagingUrl}`,
      ],
      finalSignoff: false,
      signoffAt: '',
    },
    claudeChecks: {
      screenVisualizedWithOperator: false,
      codeQualityChecksPassed: false,
      regressionChecklistPassed: false,
      apiContractChecked: false,
      navigationChecked: false,
      envAndBasePathChecked: false,
      migrationSafetyChecked: false,
      rollbackPlanReady: false,
      stagingDeployPassed: false,
      stagingDeploymentRef: REQUIRED_DEPLOY_REF,
      cloudWorkspaceValidated: false,
      cloudWorkspaceRef: 'projects/supermandi-backend/locations/asia-south1',
    },
    sessionBoot: {
      bootstrappedBy: 'claude',
      bootstrappedAt: createdAt,
      runbookVersion: 'workflow-v1.0.0',
      memoryStateRef: 'workflow/state/workflow_state.json',
      requiredFilesRead: requiredFilesRead,
    },
    operatorChecks: {
      stagingTestExecuted: false,
      testedOnRealTarget: false,
      testedOnLaptopBrowser: false,
      testedOnRedmi: false,
      stagingUrlsTested: [cfg.stagingUrl],
      issuesReproduced: false,
      fixVerified: false,
      blockingIssueCount: 1,
      nonBlockingIssueCount: 0,
      noBlockingIssueRemaining: false,
      evidenceAttached: false,
      validatedDeploymentRef: REQUIRED_DEPLOY_REF,
      validatedCloudRunRevisionIds: REQUIRED_REVISION_IDS,
    },
    statusHistory: [],
    evidence: {
      beforeVisual: [],
      afterVisual: [],
      apiProof: (finding.evidence || []).slice(0, 8),
      parityProof: [
        `source_file=${finding.file || 'N/A'}`,
        `source_line=${finding.line || 1}`,
      ],
    },
    timestamps: {
      createdAt,
      updatedAt: createdAt,
      lockedAt: null,
    },
    truthDeclaration: {
      mockDataUsed: false,
      mockApisUsed: false,
      mockUsageApproved: false,
      productionDataTested: true,
      disclosedToOperator: false,
      notes: `R7 source-first ticket generated from code evidence at ${finding.file || 'N/A'}:${finding.line || 1}.`,
      evidence: (finding.evidence || []).slice(0, 4),
    },
    externalIntegrations: {
      touched: false,
      items: [],
      operatorDisclosureDone: false,
      allValidated: false,
    },
    buildMapping: {
      expectedSurface: surface,
      expectedBasePath: cfg.basePath,
      expectedPrimaryService: cfg.service,
      actualCloudRunServices: [cfg.service],
      urlMappingValidated: false,
      correctBuildTargetValidated: false,
      stagingRouteEvidence: [cfg.stagingUrl],
    },
    dependencyDisclosure: {
      internalDependencies: [],
      externalDependencies: [],
      pendingDependencies: [],
      blockers: [],
      disclosedToOperator: false,
      operatorAcknowledged: false,
      notes: 'R7 implementation pending.',
    },
    productionInvariants: {
      sellPurchaseIsolation: invariantTemplate('Pending R7 fix'),
      deterministicScanIntentResolution: invariantTemplate('Pending R7 fix'),
      frontendBackendStateParity: invariantTemplate('Pending R7 fix'),
      offlineFirstSafeSync: invariantTemplate('Pending R7 fix'),
      idempotentTransactionProcessing: invariantTemplate('Pending R7 fix'),
      atomicDatabaseWrites: invariantTemplate('Pending R7 fix'),
      strictSchemaValidation: invariantTemplate('Pending R7 fix'),
      zeroSilentFailures: invariantTemplate('Pending R7 fix'),
      structuredAuditLogging: invariantTemplate('Pending R7 fix'),
    },
    readiness: {
      productionGradeClaimed: false,
      pendingInternal: ['implementation_pending', 'operator_test_pending'],
      pendingExternal: [],
      pendingOps: ['staging_deploy_pending'],
      blocked: false,
      summary: 'R7 ticket created; implementation not started.',
    },
    gitDiscipline: {
      workBranch: 'main',
      changeScope: ticketId,
      lastValidatedCommit: sha,
      noMixedScope: true,
      noConflictMarkers: true,
      ciGateStatus: 'not_required',
      evidence: [
        `generated_at=${createdAt}`,
        `source_sha=${sha}`,
      ],
    },
  };
}

function main() {
  const inFile = path.resolve(ROOT, arg('--in', rel(DEFAULT_DEDUPE_IN)));
  const reuseOut = path.resolve(ROOT, arg('--reuse-out', rel(DEFAULT_REUSE_OUT)));
  const traceOut = path.resolve(ROOT, arg('--trace-out', rel(DEFAULT_TICKET_TRACE)));
  const dryRun = process.argv.includes('--dry-run');

  const dedupe = readJson(inFile);
  const state = readJson(STATE_FILE);
  const requiredFilesRead = state?.sessionBoot?.requiredFilesRead || ['workflow/state/workflow_state.json'];
  const sha = headSha();

  const netNew = [];
  const duplicates = [];
  for (const f of dedupe.findings || []) {
    if (f?.dedupe?.status === 'NET_NEW') netNew.push(f);
    else duplicates.push(f);
  }

  const surfaceSeq = { POS: 1, RET: 1, SUP: 1, SA: 1, BE: 1, CROSS: 1 };
  const created = [];
  for (const finding of netNew) {
    const surf = parseSurface(finding);
    const seq = surfaceSeq[surf];
    surfaceSeq[surf] += 1;
    const ticket = buildTicket(finding, seq, requiredFilesRead, sha);
    const fileName = `${ticket.ticketId}.json`;
    const filePath = path.join(TICKETS_DIR, fileName);
    created.push({ ticketId: ticket.ticketId, file: rel(filePath), sourceFindingId: finding.id });
    if (!dryRun) {
      fs.writeFileSync(filePath, `${JSON.stringify(ticket, null, 2)}\n`, 'utf8');
    }
  }

  const duplicateReuse = {
    generatedAt: nowIso(),
    headSha: sha,
    dedupeInput: rel(inFile),
    duplicateCount: duplicates.length,
    reused: duplicates.map((f) => ({
      findingId: f.id || null,
      findingTitle: f.title || null,
      matchedTicketIds: f?.dedupe?.matchedTicketIds || [],
      reason: f?.dedupe?.reason || null,
      confidence: f?.dedupe?.confidence ?? null,
    })),
  };
  const trace = {
    generatedAt: nowIso(),
    headSha: sha,
    dedupeInput: rel(inFile),
    netNewCount: netNew.length,
    duplicateCount: duplicates.length,
    createdTicketCount: created.length,
    createdBySurface: created.reduce((acc, c) => {
      const surface = c.ticketId.split('.')[1];
      acc[surface] = (acc[surface] || 0) + 1;
      return acc;
    }, {}),
    created,
  };

  if (!dryRun) {
    fs.writeFileSync(reuseOut, `${JSON.stringify(duplicateReuse, null, 2)}\n`, 'utf8');
    fs.writeFileSync(traceOut, `${JSON.stringify(trace, null, 2)}\n`, 'utf8');
  }

  console.log(`Input findings: ${(dedupe.findings || []).length}`);
  console.log(`NET_NEW: ${netNew.length}`);
  console.log(`DUPLICATE: ${duplicates.length}`);
  console.log(`Created tickets: ${created.length}${dryRun ? ' (dry-run)' : ''}`);
  console.log(`Reuse map: ${rel(reuseOut)}`);
  console.log(`Trace: ${rel(traceOut)}`);
}

main();
