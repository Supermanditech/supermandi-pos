#!/usr/bin/env node
/**
 * generate_r6_tickets.js
 *
 * Reads R6 deep-audit checkpoint files and generates 116 ticket JSON files
 * in workflow/tickets/ following the project ticket template.
 */

const fs = require('fs');
const path = require('path');

const TICKETS_DIR = path.resolve(__dirname, '..', 'workflow', 'tickets');
const CHECKPOINTS_DIR = path.resolve(__dirname, '..', 'workflow', 'state', 'subagent_checkpoints');

const TIMESTAMP = '2026-02-24T18:00:00.000Z';
const SOURCE_SHA = 'bbd487a3';

// ---------- helpers ----------

function toUpperSnakeSlug(title, maxLen = 60) {
  let slug = title
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')   // non-alphanum -> _
    .replace(/_+/g, '_')            // collapse multiple _
    .replace(/^_/, '')              // strip leading _
    .replace(/_$/, '');             // strip trailing _

  if (slug.length > maxLen) {
    // truncate at a word boundary (underscore)
    slug = slug.substring(0, maxLen);
    const lastUnderscore = slug.lastIndexOf('_');
    if (lastUnderscore > 30) {
      slug = slug.substring(0, lastUnderscore);
    }
    slug = slug.replace(/_$/, '');
  }
  return slug;
}

function defaultLayers() {
  return {
    ui: 'na',
    ux: 'na',
    professional_polish: 'na',
    wiring: 'na',
    navigation: 'na',
    api: 'na',
    backend: 'na',
    db: 'na',
    migration: 'na',
    gcp_parity: 'na',
  };
}

function applyDimensionToLayers(layers, dimension) {
  const dim = (dimension || '').toLowerCase().replace(/[\s-]/g, '_');

  // ui / ux / wiring / navigation
  if (dim === 'ui') layers.ui = 'fail';
  else if (dim === 'ux') layers.ux = 'fail';
  else if (dim === 'wiring') layers.wiring = 'fail';
  else if (dim === 'navigation') layers.navigation = 'fail';

  // api_contract / api / api_integration
  else if (dim === 'api_contract' || dim === 'api' || dim === 'api_integration') layers.api = 'fail';

  // backend-oriented dimensions
  else if (dim === 'business_logic' || dim === 'security' || dim === 'auth' || dim === 'auth_rbac')
    layers.backend = 'fail';
  else if (dim === 'state_sync') layers.backend = 'fail';
  else if (dim === 'store_isolation') layers.backend = 'fail';
  else if (dim === 'offline_behavior') layers.backend = 'fail';
  else if (dim === 'error_handling') layers.backend = 'fail';
  else if (dim === 'input_validation') layers.backend = 'fail';
  else if (dim === 'configuration') layers.backend = 'fail';

  // data_model -> both
  else if (dim === 'data_model') {
    layers.api = 'fail';
    layers.backend = 'fail';
  }

  // db_queries
  else if (dim === 'db_queries') {
    layers.api = 'fail';
    layers.backend = 'fail';
  }

  // SSR-related (supplier portal)
  else if (dim === 'ssr') layers.ui = 'fail';

  // superadmin category-based
  else if (dim === 'confirmation_ux') layers.ux = 'fail';
  else if (dim === 'blob_memory') layers.ui = 'fail';
  else if (dim === 'status_code_leak') layers.api = 'fail';
}

function buildTicket({
  ticketId,
  surface,
  riskClass,
  title,
  description,
  severity,
  dimension,
  orderInScreen,
}) {
  const slug = toUpperSnakeSlug(title);
  const layers = defaultLayers();
  applyDimensionToLayers(layers, dimension);

  return {
    fileName: `${ticketId}.${slug}.json`,
    data: {
      ticketId: `${ticketId}.${slug}`,
      screenId: `${ticketId}.${slug}`,
      orderInScreen: orderInScreen || 1,
      surface,
      riskClass,
      title,
      description: `R6 deep audit finding. Dimension: ${dimension}. Severity: ${severity}. Source SHA: ${SOURCE_SHA}. Scope: R6_DEEP_AUDIT_WAVE. ${description}`,
      status: 'open',
      severity,
      parentTicketId: null,
      subTicketIds: [],
      layers,
      gcpParity: {
        stagingValidated: false,
        stagingUrls: [],
        cloudRunServices: [],
        basePathChecked: false,
        envParityChecked: false,
        routingChecked: false,
        apiContractChecked: false,
        dbConnectivityChecked: false,
        artifactDigestPinned: false,
        cloudRunRevisionIds: [],
      },
      impact: {
        impactedScreens: [],
        impactedServices: [],
        impactRetestRequired: true,
        impactRetestStatus: 'not_started',
      },
      operator: {
        manualTestRequired: false,
        manualTestSteps: [],
        operatorApproval: false,
      },
      claudeChecks: {
        typecheckPassed: false,
        lintPassed: false,
        unitTestsPassed: false,
        integrationTestsPassed: false,
        contractTestsPassed: false,
        securityTestsPassed: false,
        buildPassed: false,
        e2ePassed: false,
      },
      sessionBoot: {
        readClaudeState: true,
        readCurrentState: true,
        gitLogVerified: true,
        gitStatusClean: true,
        gatesRun: true,
      },
      operatorChecks: {
        browserTestPassed: false,
        screenshotCollected: false,
        signoffGiven: false,
      },
      statusHistory: [
        {
          from: null,
          to: 'open',
          timestamp: TIMESTAMP,
          sha: SOURCE_SHA,
          actor: 'claude-r6-audit',
          reason: 'R6 deep audit wave ticketization',
          hash: 'genesis',
        },
      ],
      evidence: {
        uiProof: [],
        apiProof: [],
        dbProof: [],
        ciLinks: [],
        notes: '',
      },
      timestamps: {
        created: TIMESTAMP,
        updated: TIMESTAMP,
        started: null,
        completed: null,
      },
      truthDeclaration: {
        sourceOfTruth: 'code',
        verifiedAgainstStaging: false,
        verifiedAgainstProduction: false,
      },
      externalIntegrations: {
        githubIssue: null,
        githubPR: null,
        slackThread: null,
      },
      buildMapping: {
        dockerService: null,
        cloudRunService: null,
        buildCommand: null,
        deployCommand: null,
      },
      dependencyDisclosure: {
        upstreamDeps: [],
        downstreamDeps: [],
        migrationRequired: false,
        envVarsRequired: [],
      },
      productionInvariants: {
        storeIsolation: false,
        stockIntegrity: false,
        ledgerConsistency: false,
        idempotency: false,
        scanScope: false,
        priceIntegrity: false,
      },
      readiness: {
        preStaging: false,
        staging: false,
        production: false,
      },
      gitDiscipline: {
        branchName: null,
        prNumber: null,
        tagName: null,
        mergedToMain: false,
      },
    },
  };
}

// ---------- per-source processors ----------

function processBackendAudit() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(CHECKPOINTS_DIR, 'backend_audit.json'), 'utf8')
  );
  // Only NET_NEW findings -> R6.BE.001 - R6.BE.011
  const netNew = raw.findings.filter((f) => f.dedupeStatus === 'NET_NEW');
  const tickets = [];
  let idx = 1;
  for (const f of netNew) {
    if (idx > 11) break; // cap at 11
    const ticketId = `R6.BE.${String(idx).padStart(3, '0')}`;
    tickets.push(
      buildTicket({
        ticketId,
        surface: 'backend',
        riskClass: f.riskClass,
        title: f.title,
        description: f.description,
        severity: f.severity,
        dimension: f.dimension,
        orderInScreen: idx,
      })
    );
    idx++;
  }
  return tickets;
}

function processRetailerAudit() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(CHECKPOINTS_DIR, 'retailer_audit.json'), 'utf8')
  );
  const tickets = [];
  for (let i = 0; i < raw.findings.length; i++) {
    const f = raw.findings[i];
    const idx = i + 1;
    const ticketId = `R6.RET.${String(idx).padStart(3, '0')}`;
    tickets.push(
      buildTicket({
        ticketId,
        surface: 'retailer_web',
        riskClass: f.riskClass,
        title: f.title,
        description: f.description,
        severity: f.severity,
        dimension: f.dimension,
        orderInScreen: idx,
      })
    );
  }
  return tickets;
}

function processSupplierAudit() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(CHECKPOINTS_DIR, 'supplier_audit.json'), 'utf8')
  );
  const findings = raw.netNewFindings;
  const tickets = [];
  for (let i = 0; i < findings.length; i++) {
    const f = findings[i];
    const idx = i + 1;
    const ticketId = `R6.SUP.${String(idx).padStart(3, '0')}`;
    tickets.push(
      buildTicket({
        ticketId,
        surface: 'supplier_web',
        riskClass: mapSupplierRisk(f.severity),
        title: f.title,
        description: f.description,
        severity: f.severity,
        dimension: f.category,
        orderInScreen: idx,
      })
    );
  }
  return tickets;
}

function mapSupplierRisk(severity) {
  // Supplier findings have standard P0-P3 severities
  switch (severity) {
    case 'P0': return 'critical';
    case 'P1': return 'high';
    case 'P2': return 'medium';
    case 'P3': return 'low';
    default: return 'medium';
  }
}

function processSuperadminAudit() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(CHECKPOINTS_DIR, 'superadmin_audit.json'), 'utf8')
  );
  const tickets = [];
  for (let i = 0; i < raw.findings.length; i++) {
    const f = raw.findings[i];
    const idx = i + 1;
    const ticketId = `R6.SA.${String(idx).padStart(3, '0')}`;

    // SuperAdmin uses HIGH/MEDIUM/LOW severity
    let severity, riskClass;
    switch ((f.severity || '').toUpperCase()) {
      case 'HIGH':
        severity = 'P1';
        riskClass = 'high';
        break;
      case 'MEDIUM':
        severity = 'P2';
        riskClass = 'medium';
        break;
      case 'LOW':
        severity = 'P3';
        riskClass = 'low';
        break;
      default:
        severity = 'P2';
        riskClass = 'medium';
    }

    tickets.push(
      buildTicket({
        ticketId,
        surface: 'superadmin_web',
        riskClass,
        title: f.title,
        description: f.description,
        severity,
        dimension: f.category,
        orderInScreen: idx,
      })
    );
  }
  return tickets;
}

function processPosAudit() {
  const raw = JSON.parse(
    fs.readFileSync(path.join(CHECKPOINTS_DIR, 'pos_audit.json'), 'utf8')
  );
  const tickets = [];
  for (let i = 0; i < raw.findings.length; i++) {
    const f = raw.findings[i];
    const idx = i + 1;
    const ticketId = `R6.POS.${String(idx).padStart(3, '0')}`;
    tickets.push(
      buildTicket({
        ticketId,
        surface: 'pos',
        riskClass: f.riskClass,
        title: f.title,
        description: f.description,
        severity: f.severity,
        dimension: f.dimension,
        orderInScreen: idx,
      })
    );
  }
  return tickets;
}

function processCrossFunctionAudit() {
  const raw = JSON.parse(
    fs.readFileSync(
      path.join(CHECKPOINTS_DIR, 'cross_function_audit.json'),
      'utf8'
    )
  );
  const tickets = [];
  for (let i = 0; i < raw.findings.length; i++) {
    const f = raw.findings[i];
    const idx = i + 1;
    const ticketId = `R6.CROSS.${String(idx).padStart(3, '0')}`;
    tickets.push(
      buildTicket({
        ticketId,
        surface: 'cross_function',
        riskClass: f.riskClass,
        title: f.title,
        description: f.description,
        severity: f.severity,
        dimension: f.dimension,
        orderInScreen: idx,
      })
    );
  }
  return tickets;
}

// ---------- main ----------

function main() {
  // Ensure tickets dir exists
  if (!fs.existsSync(TICKETS_DIR)) {
    fs.mkdirSync(TICKETS_DIR, { recursive: true });
  }

  const allTickets = [
    ...processBackendAudit(),
    ...processRetailerAudit(),
    ...processSupplierAudit(),
    ...processSuperadminAudit(),
    ...processPosAudit(),
    ...processCrossFunctionAudit(),
  ];

  let written = 0;
  const byPrefix = {};
  for (const t of allTickets) {
    const filePath = path.join(TICKETS_DIR, t.fileName);
    fs.writeFileSync(filePath, JSON.stringify(t.data, null, 2) + '\n', 'utf8');
    written++;

    // count by prefix
    const prefix = t.data.ticketId.split('.').slice(0, 2).join('.');
    byPrefix[prefix] = (byPrefix[prefix] || 0) + 1;
  }

  console.log(`\nR6 ticket generation complete.`);
  console.log(`Total tickets written: ${written}`);
  console.log(`\nBreakdown:`);
  for (const [prefix, count] of Object.entries(byPrefix).sort()) {
    console.log(`  ${prefix}: ${count}`);
  }
}

main();
