#!/usr/bin/env node
/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const ROOT_DIR = path.join(__dirname, '..', '..');
const DEFAULT_CONTRACT_FILE = 'workflow/state/deployment_runtime_contract.json';
const CONTRACT_PATH = path.join(
  ROOT_DIR,
  (process.env.NONBREAKABLE_CONTRACT_FILE || DEFAULT_CONTRACT_FILE).replace(/\//g, path.sep)
);

const pass = [];
const fail = [];

function logPass(id, message) {
  pass.push({ id, message });
  console.log(`  PASS: ${id} - ${message}`);
}

function logFail(id, message) {
  fail.push({ id, message });
  console.error(`  FAIL: ${id} - ${message}`);
}

function run(command) {
  try {
    return {
      ok: true,
      output: execSync(command, {
        cwd: ROOT_DIR,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    };
  } catch (error) {
    const output = `${error.stdout || ''}${error.stderr || ''}`.trim();
    return { ok: false, output };
  }
}

function runJson(command) {
  const result = run(command);
  if (!result.ok) {
    return { ok: false, error: result.output };
  }
  try {
    return { ok: true, value: JSON.parse(result.output || '{}') };
  } catch (error) {
    return { ok: false, error: `invalid JSON output: ${error.message}` };
  }
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function lower(value) {
  return String(value || '').toLowerCase();
}

async function httpGet(baseUrl, targetPath, options = {}) {
  const url = `${baseUrl}${targetPath}`;
  const timeoutMs = Number(options.timeoutMs || 15000);
  const redirect = options.redirect || 'follow';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { redirect, signal: controller.signal });
    const body = await response.text();
    return {
      ok: true,
      status: response.status,
      body,
      location: response.headers.get('location') || '',
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      body: '',
      location: '',
      error: error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function routeCheck(baseUrl, check, options = {}) {
  const retries = Number(options.retries || 3);
  const retryDelayMs = Number(options.retryDelayMs || 7000);
  let lastStatus = 0;
  let lastError = '';
  let lastBody = '';

  for (let attempt = 1; attempt <= retries; attempt += 1) {
    const result = await httpGet(baseUrl, check.path, { timeoutMs: options.timeoutMs || 15000, redirect: 'follow' });
    lastStatus = result.status;
    lastError = result.error || '';
    lastBody = result.body || '';

    const expected = asArray(check.expectedStatuses).map(Number).filter((v) => Number.isFinite(v));
    const acceptedRange = check.acceptAnyStatusRange;
    const statusAcceptedByList = expected.length > 0 ? expected.includes(lastStatus) : false;
    const statusAcceptedByRange =
      acceptedRange &&
      Number.isFinite(Number(acceptedRange.min)) &&
      Number.isFinite(Number(acceptedRange.max)) &&
      lastStatus >= Number(acceptedRange.min) &&
      lastStatus <= Number(acceptedRange.max);

    const statusOk = statusAcceptedByList || statusAcceptedByRange;
    let bodyOk = true;
    const requiredMarkers = asArray(check.bodyContainsAny)
      .map((item) => String(item || '').trim())
      .filter((item) => item.length > 0);
    if (requiredMarkers.length > 0) {
      const bodyLower = lower(lastBody);
      bodyOk = requiredMarkers.some((marker) => bodyLower.includes(lower(marker)));
    }

    if (statusOk && bodyOk) {
      return { ok: true, status: lastStatus };
    }

    if (attempt < retries) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }

  return {
    ok: false,
    status: lastStatus,
    error: lastError,
    bodyPreview: String(lastBody || '').slice(0, 220).replace(/\s+/g, ' '),
  };
}

function extractRevisionEnvMap(revisionJson) {
  const entries = asArray(revisionJson?.spec?.containers?.[0]?.env);
  const map = new Map();
  for (const entry of entries) {
    if (entry && typeof entry.name === 'string') {
      map.set(entry.name, String(entry.value || ''));
    }
  }
  return map;
}

function extractActiveTrafficEntries(serviceJson) {
  const traffic = asArray(serviceJson?.status?.traffic);
  return traffic.filter((entry) => Number(entry.percent || 0) > 0);
}

function ensureContractShape(contract) {
  const errors = [];
  if (!contract || typeof contract !== 'object') {
    errors.push('contract must be an object');
    return errors;
  }
  if (!Array.isArray(contract.requiredCloudRunServices) || contract.requiredCloudRunServices.length === 0) {
    errors.push('requiredCloudRunServices must be a non-empty array');
  }
  if (!Array.isArray(contract.requiredSurfaces) || contract.requiredSurfaces.length === 0) {
    errors.push('requiredSurfaces must be a non-empty array');
  }
  if (!Array.isArray(contract.surfacePathChecks) || contract.surfacePathChecks.length === 0) {
    errors.push('surfacePathChecks must be a non-empty array');
  }
  if (!Array.isArray(contract.backendFrontendChecks) || contract.backendFrontendChecks.length === 0) {
    errors.push('backendFrontendChecks must be a non-empty array');
  }
  return errors;
}

async function main() {
  console.log('=== Non-Breakable Deploy Parity Gate ===');
  console.log('');

  if (!fs.existsSync(CONTRACT_PATH)) {
    logFail('NB-CONTRACT-001', `Contract file not found: ${path.relative(ROOT_DIR, CONTRACT_PATH)}`);
    process.exit(1);
  }

  let contract = null;
  try {
    contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  } catch (error) {
    logFail('NB-CONTRACT-002', `Contract file is invalid JSON: ${error.message}`);
    process.exit(1);
  }

  for (const error of ensureContractShape(contract)) {
    logFail('NB-CONTRACT-003', error);
  }
  if (fail.length > 0) {
    process.exit(1);
  }

  const stagingUrl = String(process.env.STAGING_URL || contract.stagingUrl || 'https://staging.supermandi.tech').replace(/\/+$/, '');
  const deploySha = String(process.env.DEPLOY_SHA || process.env.SHA || '').trim();
  const gcpProject = String(process.env.GCP_PROJECT || contract.gcpProject || 'supermandi-backend').trim();
  const gcpRegion = String(process.env.GCP_REGION || contract.gcpRegion || 'asia-south1').trim();

  const requiredServices = asArray(contract.requiredCloudRunServices);
  const requiredSurfaces = asArray(contract.requiredSurfaces);
  const requiredSurfaceSet = new Set(['retailer_web', 'supplier_web', 'superadmin_web', 'pos_app']);
  const missingSurfaceRules = [...requiredSurfaceSet].filter((item) => !requiredSurfaces.includes(item));
  if (missingSurfaceRules.length === 0) {
    logPass('NB-CONTRACT-004', 'requiredSurfaces covers retailer_web, supplier_web, superadmin_web, pos_app');
  } else {
    logFail('NB-CONTRACT-004', `requiredSurfaces missing: ${missingSurfaceRules.join(', ')}`);
  }

  const routingSpecPath = path.join(ROOT_DIR, 'RELEASES', 'ROUTING_SPEC.json');
  if (!fs.existsSync(routingSpecPath)) {
    logFail('NB-CONTRACT-005', 'RELEASES/ROUTING_SPEC.json not found');
  } else {
    logPass('NB-CONTRACT-005', 'RELEASES/ROUTING_SPEC.json present');
  }

  const urlMapName = contract.urlMap || 'supermandi-staging-urlmap';
  const urlMapRes = runJson(
    `gcloud compute url-maps describe ${urlMapName} --project=${gcpProject} --format=json`
  );
  if (!urlMapRes.ok) {
    logFail('NB-GCP-001', `cannot describe URL map ${urlMapName}: ${urlMapRes.error}`);
  } else {
    const pathRules = asArray(urlMapRes.value?.pathMatchers)
      .flatMap((matcher) => asArray(matcher.pathRules))
      .flatMap((rule) => asArray(rule.paths))
      .map((item) => String(item || '').trim());
    const requiredPathRules = ['/retailer/*', '/supplier/*', '/admin/*', '/api/*'];
    const missingPathRules = requiredPathRules.filter((rule) => !pathRules.includes(rule));
    if (missingPathRules.length === 0) {
      logPass('NB-GCP-002', `URL map ${urlMapName} has required path rules`);
    } else {
      logFail('NB-GCP-002', `URL map missing required path rule(s): ${missingPathRules.join(', ')}`);
    }
  }

  const serviceRevisionMap = new Map();
  for (const service of requiredServices) {
    const serviceRes = runJson(
      `gcloud run services describe ${service} --region=${gcpRegion} --project=${gcpProject} --format=json`
    );
    if (!serviceRes.ok) {
      logFail('NB-GCP-003', `cannot describe Cloud Run service ${service}: ${serviceRes.error}`);
      continue;
    }
    const activeTraffic = extractActiveTrafficEntries(serviceRes.value);
    if (activeTraffic.length === 0) {
      logFail('NB-GCP-004', `${service} has no active traffic revision`);
      continue;
    }
    if (contract?.cloudRunParityRules?.requireSingleActiveRevision && activeTraffic.length !== 1) {
      logFail('NB-GCP-005', `${service} has split traffic (${activeTraffic.length} active revisions)`);
      continue;
    }

    const active = activeTraffic[0];
    const percent = Number(active.percent || 0);
    if (contract?.cloudRunParityRules?.require100TrafficToActiveRevision && percent !== 100) {
      logFail('NB-GCP-006', `${service} active revision traffic is ${percent}% (expected 100%)`);
      continue;
    }

    const revision = String(active.revisionName || '').trim();
    if (!revision) {
      logFail('NB-GCP-007', `${service} active traffic revision name is empty`);
      continue;
    }
    serviceRevisionMap.set(service, revision);

    const revisionRes = runJson(
      `gcloud run revisions describe ${revision} --region=${gcpRegion} --project=${gcpProject} --format=json`
    );
    if (!revisionRes.ok) {
      logFail('NB-GCP-008', `cannot describe revision ${revision} for ${service}: ${revisionRes.error}`);
      continue;
    }
    const envMap = extractRevisionEnvMap(revisionRes.value);
    const gitSha = envMap.get('GIT_SHA') || '';
    if (contract?.cloudRunParityRules?.requireGitShaEnvParity) {
      if (!gitSha) {
        logFail('NB-GCP-009', `${service}/${revision} missing GIT_SHA env var`);
      } else if (deploySha && gitSha !== deploySha) {
        logFail('NB-GCP-009', `${service}/${revision} GIT_SHA=${gitSha} does not match DEPLOY_SHA=${deploySha}`);
      } else {
        logPass('NB-GCP-009', `${service}/${revision} GIT_SHA parity OK (${gitSha})`);
      }
    }
    if (service === 'main-backend' && contract?.cloudRunParityRules?.requireMainBackendMinAppVersion) {
      const minAppVersion = (envMap.get('MIN_APP_VERSION') || '').trim();
      if (minAppVersion) {
        logPass('NB-GCP-010', `main-backend MIN_APP_VERSION present (${minAppVersion})`);
      } else {
        logFail('NB-GCP-010', 'main-backend MIN_APP_VERSION is missing');
      }
    }
  }

  for (const check of asArray(contract.surfacePathChecks)) {
    const result = await routeCheck(stagingUrl, check, { retries: 3, retryDelayMs: 8000, timeoutMs: 15000 });
    if (result.ok) {
      logPass(check.id || 'NB-SURF', `${check.path} HTTP ${result.status}`);
    } else {
      const reason = result.error
        ? `error=${result.error}`
        : `status=${result.status}, bodyPreview="${result.bodyPreview}"`;
      logFail(check.id || 'NB-SURF', `${check.path} failed (${reason})`);
    }
  }

  for (const check of asArray(contract.deepLinkChecks)) {
    const result = await routeCheck(stagingUrl, check, { retries: 3, retryDelayMs: 8000, timeoutMs: 15000 });
    if (result.ok) {
      logPass(check.id || 'NB-PATH', `${check.path} HTTP ${result.status}`);
    } else {
      const reason = result.error
        ? `error=${result.error}`
        : `status=${result.status}, bodyPreview="${result.bodyPreview}"`;
      logFail(check.id || 'NB-PATH', `${check.path} failed (${reason})`);
    }
  }

  for (const check of asArray(contract.backendFrontendChecks)) {
    const result = await routeCheck(stagingUrl, check, { retries: 3, retryDelayMs: 8000, timeoutMs: 15000 });
    if (result.ok) {
      logPass(check.id || 'NB-API', `${check.path} HTTP ${result.status}`);
    } else {
      const reason = result.error
        ? `error=${result.error}`
        : `status=${result.status}, bodyPreview="${result.bodyPreview}"`;
      logFail(check.id || 'NB-API', `${check.path} failed (${reason})`);
    }
  }

  for (const check of asArray(contract.versionParityChecks)) {
    const result = await routeCheck(stagingUrl, {
      path: check.path,
      acceptAnyStatusRange: { min: 200, max: 299 },
    }, { retries: 3, retryDelayMs: 7000, timeoutMs: 15000 });
    if (!result.ok) {
      logFail(check.id || 'NB-VERSION', `${check.path} unavailable for version parity`);
      continue;
    }

    const response = await httpGet(stagingUrl, check.path, { timeoutMs: 15000, redirect: 'follow' });
    if (!response.ok) {
      logFail(check.id || 'NB-VERSION', `${check.path} request failed: ${response.error}`);
      continue;
    }
    let parsed = null;
    try {
      parsed = JSON.parse(response.body || '{}');
    } catch (error) {
      logFail(check.id || 'NB-VERSION', `${check.path} did not return JSON`);
      continue;
    }
    const field = String(check.field || 'sha');
    const value = String(parsed[field] || '').trim();
    if (!value) {
      logFail(check.id || 'NB-VERSION', `${check.path} missing "${field}" field`);
      continue;
    }
    if (deploySha && value !== deploySha) {
      logFail(check.id || 'NB-VERSION', `${check.path} ${field}=${value} expected ${deploySha}`);
      continue;
    }
    logPass(check.id || 'NB-VERSION', `${check.path} ${field} parity OK (${value})`);
  }

  if (serviceRevisionMap.size === requiredServices.length) {
    logPass('NB-GCP-011', 'all required Cloud Run services resolved with active revisions');
  } else {
    logFail(
      'NB-GCP-011',
      `active revision map incomplete (${serviceRevisionMap.size}/${requiredServices.length})`
    );
  }

  console.log('');
  console.log('------------------------------------------------------------');
  console.log(`NONBREAKABLE DEPLOY PARITY SUMMARY: ${pass.length} PASS, ${fail.length} FAIL`);
  console.log('------------------------------------------------------------');

  if (fail.length > 0) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(`FATAL: ${error.message}`);
  process.exit(1);
});
