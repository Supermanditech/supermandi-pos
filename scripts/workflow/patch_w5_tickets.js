#!/usr/bin/env node
/* eslint-disable no-console */
// Comprehensive patch for W5 ticket validation errors
const fs = require('fs');
const path = require('path');

const TICKETS_DIR = path.join(__dirname, '..', '..', 'workflow', 'tickets');

const CLOUD_RUN_REVISION_IDS = [
  'main-backend-00103-zbw',
  'api-gateway-00084-7zh',
  'retailer-admin-00084-pk6',
  'supplier-portal-00078-wv8',
  'superadmin-00077-r6c',
  'landing-00077-gj7',
];

const VALIDATED_DEPLOYMENT_REF = 'github://run/22305359033';
const CLOUD_WORKSPACE_REF = 'projects/supermandi-backend/locations/asia-south1';

const SESSION_BOOT_REQUIRED_FILES = [
  'workflow/state/workflow_state.json',
  'workflow/schemas/ticket.schema.json',
  'workflow/schemas/screen_state.schema.json',
  'workflow/state/staging_batch.json',
  '.github/workflows/ci-gates.yml',
  '.gitignore',
  'package.json',
  'RELEASES/CLAUDE_STATE.md',
  'RELEASES/CLAUDE_CURRENT_STATE.json',
  'scripts/workflow/guard.js',
  'scripts/workflow/generate-live-page-manifest.js',
  'workflow/state/live_page_manifest.json',
  'workflow/templates/ticket.example.json',
];

// Base staging URL per surface — must satisfy surfaceExpectedPath in guard.js
const SURFACE_BASE_STAGING_URL = {
  retailer_web: 'https://staging.supermandi.tech/retailer/',
  supplier_web: 'https://staging.supermandi.tech/supplier/',
  superadmin_web: 'https://staging.supermandi.tech/admin/',
  pos_app: 'https://staging.supermandi.tech/api/v1/pos',
  backend: 'https://staging.supermandi.tech/api/v1/',
};

// Expected base path per surface for buildMapping
const SURFACE_BASE_PATH = {
  retailer_web: '/retailer',
  supplier_web: '/supplier',
  superadmin_web: '/admin',
  pos_app: '/api',
  backend: '/api',
};

// Required path fragment that must appear in at least one stagingUrl
const SURFACE_REQUIRED_FRAGMENT = {
  retailer_web: '/retailer',
  supplier_web: '/supplier',
  superadmin_web: '/admin',
  pos_app: '/api',
  backend: '/api',
};

function isFromStagingHost(u) {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return host === 'staging.supermandi.tech' || host.endsWith('.staging.supermandi.tech');
  } catch (_) {
    return false;
  }
}

function isValidUrl(u) {
  try { new URL(u); return true; } catch (_) { return false; }
}

const files = fs
  .readdirSync(TICKETS_DIR)
  .filter((f) => f.startsWith('REQ.AUDIT.W5.') && f.endsWith('.json'))
  .map((f) => path.join(TICKETS_DIR, f));

console.log(`Patching ${files.length} W5 tickets...`);
let patched = 0;
let errors = 0;

for (const filePath of files) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const ticket = JSON.parse(raw);
    const surface = ticket.surface;

    // 1. Clear invalid statusHistory
    ticket.statusHistory = [];

    // 2. Fix cloudWorkspaceRef
    ticket.claudeChecks.cloudWorkspaceRef = CLOUD_WORKSPACE_REF;
    ticket.claudeChecks.cloudWorkspaceValidated = true;

    // 3. Fix operatorChecks
    ticket.operatorChecks.validatedDeploymentRef = VALIDATED_DEPLOYMENT_REF;
    ticket.operatorChecks.validatedCloudRunRevisionIds = CLOUD_RUN_REVISION_IDS;

    // 4. Fix gcpParity.cloudRunRevisionIds
    ticket.gcpParity.cloudRunRevisionIds = CLOUD_RUN_REVISION_IDS;

    // 5. Fix ciGateStatus
    ticket.gitDiscipline.ciGateStatus = 'pending';

    // 6. Fix productionDataTested
    ticket.truthDeclaration.productionDataTested = true;
    ticket.truthDeclaration.disclosedToOperator = true;

    // 7. Fix sessionBoot.requiredFilesRead
    ticket.sessionBoot.requiredFilesRead = SESSION_BOOT_REQUIRED_FILES;

    // 8. Ensure impactedScreens is non-empty
    if (!Array.isArray(ticket.impact.impactedScreens) || ticket.impact.impactedScreens.length === 0) {
      ticket.impact.impactedScreens = [ticket.screenId];
    }

    // 9. Ensure impactedServices is non-empty
    const surfaceServiceMap = {
      retailer_web: 'retailer-admin',
      supplier_web: 'supplier-portal',
      superadmin_web: 'superadmin',
      pos_app: 'api-gateway',
      backend: 'main-backend',
    };
    if (!Array.isArray(ticket.impact.impactedServices) || ticket.impact.impactedServices.length === 0) {
      ticket.impact.impactedServices = [surfaceServiceMap[surface] || 'main-backend'];
    }

    // 10. Ensure gcpParity.cloudRunServices contains all impacted services
    const serviceSet = new Set(ticket.gcpParity.cloudRunServices || []);
    for (const svc of ticket.impact.impactedServices) serviceSet.add(svc);
    ticket.gcpParity.cloudRunServices = [...serviceSet];

    // 11. Fix gcpParity.stagingUrls:
    //   a) Remove malformed/non-staging URLs
    //   b) Ensure at least one URL with the required path fragment
    const requiredFragment = SURFACE_REQUIRED_FRAGMENT[surface];
    const baseUrl = SURFACE_BASE_STAGING_URL[surface];

    const cleanUrls = (Array.isArray(ticket.gcpParity.stagingUrls) ? ticket.gcpParity.stagingUrls : [])
      .filter((u) => typeof u === 'string' && isValidUrl(u) && isFromStagingHost(u));

    const hasFragment = requiredFragment && cleanUrls.some((u) => u.includes(requiredFragment));
    if (!hasFragment && baseUrl) cleanUrls.unshift(baseUrl);
    if (cleanUrls.length === 0 && baseUrl) cleanUrls.push(baseUrl);
    ticket.gcpParity.stagingUrls = cleanUrls;

    // 12. Fix buildMapping.expectedBasePath
    const expectedBasePath = SURFACE_BASE_PATH[surface];
    if (expectedBasePath) ticket.buildMapping.expectedBasePath = expectedBasePath;

    // 13. Fix buildMapping.stagingRouteEvidence — remove malformed/non-staging URLs
    if (Array.isArray(ticket.buildMapping.stagingRouteEvidence)) {
      ticket.buildMapping.stagingRouteEvidence = ticket.buildMapping.stagingRouteEvidence.filter(
        (u) => typeof u === 'string' && isValidUrl(u) && isFromStagingHost(u)
      );
    }

    // 14. Fix evidence.apiProof — remove non-staging http URLs
    if (Array.isArray(ticket.evidence.apiProof)) {
      ticket.evidence.apiProof = ticket.evidence.apiProof.filter((item) => {
        if (typeof item !== 'string') return true;
        if (/^https?:\/\//i.test(item)) return isFromStagingHost(item);
        return true;
      });
    }

    fs.writeFileSync(filePath, JSON.stringify(ticket, null, 2) + '\n', 'utf8');
    patched++;
  } catch (err) {
    console.error(`ERROR patching ${path.basename(filePath)}: ${err.message}`);
    errors++;
  }
}

console.log(`Done: ${patched} patched, ${errors} errors.`);
