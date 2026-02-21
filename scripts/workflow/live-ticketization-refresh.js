#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.join(__dirname, '..', '..');
const MANIFEST_FILE = path.join(ROOT_DIR, 'workflow', 'state', 'live_page_manifest.json');
const SWEEP_FILE = path.join(ROOT_DIR, 'workflow', 'state', 'live_http_sweep_latest.json');
const QUEUE_FILE = path.join(ROOT_DIR, 'workflow', 'state', 'live_micro_check_queue.json');
const PROGRESS_FILE = path.join(ROOT_DIR, 'workflow', 'state', 'live_ticketization_progress.json');
const STATE_FILE = path.join(ROOT_DIR, 'workflow', 'state', 'workflow_state.json');

function readJson(filePath) {
  const raw = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(raw);
}

function writeJson(filePath, payload) {
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function normalizeRouteUrl(routeUrl) {
  return String(routeUrl || '').replace(/\{storeCode\}/g, 'TEST001');
}

function buildQueue(manifest) {
  const queue = [];
  const pushCheck = (surface, route, url, check) => {
    queue.push({
      checkId: `${surface}|${route}|${check}`,
      surface,
      route,
      url,
      check,
      status: 'PENDING',
      ticketId: null,
      notes: '',
    });
  };

  if (manifest.surfaces && typeof manifest.surfaces === 'object') {
    for (const [surface, entries] of Object.entries(manifest.surfaces)) {
      if (!Array.isArray(entries)) continue;
      for (const entry of entries) {
        if (!entry || typeof entry !== 'object') continue;
        const route = String(entry.route || '');
        const url = normalizeRouteUrl(entry.url || '');
        const checks = Array.isArray(entry.requiredChecks) ? entry.requiredChecks : [];
        for (const check of checks) {
          pushCheck(surface, route, url, String(check));
        }
      }
    }
  }

  if (manifest.pos_app && typeof manifest.pos_app === 'object') {
    const checks = Array.isArray(manifest.pos_app.requiredChecks) ? manifest.pos_app.requiredChecks : [];
    const endpoints = Array.isArray(manifest.pos_app.criticalEndpoints) ? manifest.pos_app.criticalEndpoints : [];
    for (const endpoint of endpoints) {
      for (const check of checks) {
        pushCheck('pos_app', String(endpoint), String(endpoint), String(check));
      }
    }
  }

  if (Array.isArray(manifest.crossFunctionMatrix)) {
    for (const flow of manifest.crossFunctionMatrix) {
      if (!flow || typeof flow !== 'object') continue;
      const flowId = String(flow.flowId || '');
      const entryUrl = String(flow.entryUrl || '');
      const checks = Array.isArray(flow.requiredChecks) ? flow.requiredChecks : [];
      for (const check of checks) {
        pushCheck('cross_function_matrix', flowId, entryUrl, String(check));
      }
    }
  }

  return queue;
}

function statusRank(status) {
  switch (status) {
    case 'FAIL':
      return 3;
    case 'BROWSER_ONLY':
      return 2;
    case 'PASS':
      return 1;
    default:
      return 0;
  }
}

function indexSweepByRoute(sweep) {
  const index = new Map();
  const results = Array.isArray(sweep?.results) ? sweep.results : [];
  for (const row of results) {
    if (!row || typeof row !== 'object') continue;
    const surface = String(row.surface || '');
    const route = String(row.route || '');
    const key = `${surface}|${route}`;
    const next = {
      status: String(row.status || ''),
      httpStatus: row.httpStatus ?? null,
      url: String(row.url || ''),
      note: String(row.note || ''),
    };
    const current = index.get(key);
    if (!current || statusRank(next.status) > statusRank(current.status)) {
      index.set(key, next);
    }
  }
  return index;
}

function deriveCheckStatus(check, routeEvidence) {
  if (!routeEvidence) {
    return {
      status: 'PENDING_NO_ROUTE_EVIDENCE',
      notes: 'No route-level evidence found in latest HTTP sweep',
    };
  }

  if (routeEvidence.status === 'FAIL') {
    return {
      status: 'ISSUE_DETECTED',
      notes: `Route failed in HTTP sweep (${routeEvidence.httpStatus ?? 'n/a'})`,
    };
  }

  if (routeEvidence.status === 'BROWSER_ONLY') {
    return {
      status: 'BROWSER_EVIDENCE_REQUIRED',
      notes: 'Client-side route requires browser runtime evidence',
    };
  }

  const browserChecks = new Set(['ui', 'ux', 'wiring', 'navigation']);
  if (browserChecks.has(check.check)) {
    return {
      status: 'BROWSER_EVIDENCE_REQUIRED',
      notes: 'HTTP pass only; browser-level verification still required',
    };
  }

  return {
    status: 'RUNTIME_EVIDENCE_REQUIRED',
    notes: 'HTTP pass only; API/backend/parity evidence still required',
  };
}

function summarizeBySurface(queue) {
  const surfaceMap = new Map();
  for (const row of queue) {
    if (!surfaceMap.has(row.surface)) {
      surfaceMap.set(row.surface, {
        surface: row.surface,
        total: 0,
        issueDetected: 0,
        browserEvidenceRequired: 0,
        runtimeEvidenceRequired: 0,
        pendingNoRouteEvidence: 0,
      });
    }
    const item = surfaceMap.get(row.surface);
    item.total += 1;
    if (row.status === 'ISSUE_DETECTED') item.issueDetected += 1;
    if (row.status === 'BROWSER_EVIDENCE_REQUIRED') item.browserEvidenceRequired += 1;
    if (row.status === 'RUNTIME_EVIDENCE_REQUIRED') item.runtimeEvidenceRequired += 1;
    if (row.status === 'PENDING_NO_ROUTE_EVIDENCE') item.pendingNoRouteEvidence += 1;
  }
  return [...surfaceMap.values()].sort((a, b) => a.surface.localeCompare(b.surface));
}

function countByStatus(queue) {
  const counts = {};
  for (const row of queue) {
    counts[row.status] = (counts[row.status] || 0) + 1;
  }
  return counts;
}

function updateWorkflowState(progressSummary) {
  const state = readJson(STATE_FILE);
  const now = new Date().toISOString();
  const liveIteration = state?.progress?.liveIteration;
  if (!liveIteration || typeof liveIteration !== 'object') {
    return;
  }
  const ticketization = liveIteration.ticketization;
  if (!ticketization || typeof ticketization !== 'object') {
    return;
  }

  const unresolved = progressSummary.unresolvedChecks;
  const issues = progressSummary.issueDetectedChecks;
  const browserPending = progressSummary.browserEvidenceRequiredChecks;
  const runtimePending = progressSummary.runtimeEvidenceRequiredChecks;
  ticketization.complete = false;
  ticketization.statement = `NOT COMPLETE - ticketization tracker refreshed: unresolved=${unresolved}, issues=${issues}, browser_pending=${browserPending}, runtime_pending=${runtimePending}`;
  ticketization.requiredCoverageSource = 'workflow/state/live_page_manifest.json';
  ticketization.remainingCheckIds = [
    `queue:workflow/state/live_micro_check_queue.json:${progressSummary.totalChecks}`,
    `issues:${issues}`,
    `browser_pending:${browserPending}`,
    `runtime_pending:${runtimePending}`,
    'retailer_web:*',
    'supplier_web:*',
    'superadmin_web:*',
    'pos_app:*',
    'cross_function_matrix:*',
  ];
  ticketization.lastUpdatedAt = now;

  if (!ticketization.coverageBySurface || typeof ticketization.coverageBySurface !== 'object') {
    ticketization.coverageBySurface = {};
  }
  for (const item of progressSummary.summaryBySurface) {
    ticketization.coverageBySurface[item.surface] = false;
  }

  state.updatedAt = now;
  writeJson(STATE_FILE, state);
}

function main() {
  if (!fs.existsSync(MANIFEST_FILE)) {
    throw new Error(`Manifest missing: ${path.relative(ROOT_DIR, MANIFEST_FILE)}`);
  }
  const manifest = readJson(MANIFEST_FILE);
  const queue = buildQueue(manifest);
  writeJson(QUEUE_FILE, {
    generatedAt: new Date().toISOString(),
    sourceManifest: path.relative(ROOT_DIR, MANIFEST_FILE).replace(/\\/g, '/'),
    totalChecks: queue.length,
    pendingChecks: queue.length,
    queue,
  });

  const sweep = fs.existsSync(SWEEP_FILE) ? readJson(SWEEP_FILE) : { results: [] };
  const routeIndex = indexSweepByRoute(sweep);
  const enrichedQueue = queue.map((check) => {
    const routeKey = `${check.surface}|${check.route}`;
    const routeEvidence = routeIndex.get(routeKey) || routeIndex.get(`${check.surface}|${check.url}`);
    const derived = deriveCheckStatus(check, routeEvidence);
    return {
      ...check,
      status: derived.status,
      notes: derived.notes,
    };
  });

  const summaryBySurface = summarizeBySurface(enrichedQueue);
  const statusCounts = countByStatus(enrichedQueue);
  const progress = {
    generatedAt: new Date().toISOString(),
    sourceManifest: path.relative(ROOT_DIR, MANIFEST_FILE).replace(/\\/g, '/'),
    sourceSweep: path.relative(ROOT_DIR, SWEEP_FILE).replace(/\\/g, '/'),
    totalChecks: enrichedQueue.length,
    unresolvedChecks: enrichedQueue.length,
    issueDetectedChecks: statusCounts.ISSUE_DETECTED || 0,
    browserEvidenceRequiredChecks: statusCounts.BROWSER_EVIDENCE_REQUIRED || 0,
    runtimeEvidenceRequiredChecks: statusCounts.RUNTIME_EVIDENCE_REQUIRED || 0,
    pendingNoRouteEvidenceChecks: statusCounts.PENDING_NO_ROUTE_EVIDENCE || 0,
    statusCounts,
    summaryBySurface,
  };

  writeJson(PROGRESS_FILE, {
    ...progress,
    queueStatus: enrichedQueue,
  });

  updateWorkflowState(progress);

  console.log(`Updated ${path.relative(ROOT_DIR, QUEUE_FILE)}`);
  console.log(`Updated ${path.relative(ROOT_DIR, PROGRESS_FILE)}`);
  console.log(`Updated ${path.relative(ROOT_DIR, STATE_FILE)}`);
  console.log(
    `Checks: total=${progress.totalChecks}, issues=${progress.issueDetectedChecks}, browser_pending=${progress.browserEvidenceRequiredChecks}, runtime_pending=${progress.runtimeEvidenceRequiredChecks}, no_route=${progress.pendingNoRouteEvidenceChecks}`
  );
}

main();
