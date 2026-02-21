#!/usr/bin/env node
/**
 * Generates a live staging page/flow manifest to reduce manual test planning load.
 * This is non-destructive and does not mutate tickets.
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..', '..');
const OUT_FILE = path.join(ROOT_DIR, 'workflow', 'state', 'live_page_manifest.json');
const BASE_URL = 'https://staging.supermandi.tech';
const REQUIRED_CHECKS = [
  'ui',
  'ux',
  'wiring',
  'navigation',
  'api_contract',
  'backend_behavior',
  'db_migration_impact',
  'gcp_staging_parity',
];

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function ensureDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function uniqueSorted(values) {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function walkFiles(startDir, predicate) {
  const out = [];
  const stack = [startDir];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!fs.existsSync(current)) continue;
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.isFile() && predicate(full)) {
        out.push(full);
      }
    }
  }
  return out;
}

function normalizeRoute(route) {
  if (!route.startsWith('/')) return `/${route}`;
  return route;
}

function pathToUrl(route) {
  return `${BASE_URL}${route}`;
}

function parseRetailerRoutes() {
  const appPath = path.join(ROOT_DIR, 'retailer-admin', 'src', 'App.tsx');
  const content = readText(appPath);
  const routes = new Set();
  routes.add('/retailer/');

  const matches = content.matchAll(/<Route\s+path="([^"]+)"/g);
  for (const match of matches) {
    const routePath = match[1];
    if (!routePath || routePath === '*') continue;
    if (routePath === '_pages' || routePath.endsWith('/_pages')) continue;
    if (routePath.startsWith('/retailer')) {
      routes.add(routePath);
      continue;
    }
    if (routePath.startsWith('/s/:storeCode')) {
      routes.add(routePath.replace('/s/:storeCode', '/s/{storeCode}'));
      continue;
    }
    if (!routePath.startsWith('/')) {
      routes.add(`/s/{storeCode}/${routePath}`);
    }
  }

  // Index route under /s/:storeCode
  routes.add('/s/{storeCode}');
  return uniqueSorted([...routes]).map((route) => ({
    route: normalizeRoute(route),
    url: pathToUrl(normalizeRoute(route)),
    primaryService: 'retailer-admin',
    requiredChecks: REQUIRED_CHECKS,
  }));
}

function parseSupplierRoutes() {
  const appDir = path.join(ROOT_DIR, 'supplier-portal', 'src', 'app');
  const files = walkFiles(appDir, (file) => file.replace(/\\/g, '/').endsWith('/page.tsx'));
  const routes = new Set();
  routes.add('/supplier/');

  for (const file of files) {
    const rel = path.relative(appDir, file).replace(/\\/g, '/');
    const dir = path.posix.dirname(rel);
    const parts = dir === '.' ? [] : dir.split('/');
    const routeParts = parts
      .filter((segment) => !(segment.startsWith('(') && segment.endsWith(')')))
      .map((segment) => segment.replace(/^\[(.+)\]$/, '{$1}'));
    const route = routeParts.length === 0 ? '/supplier/' : `/supplier/${routeParts.join('/')}/`;
    routes.add(route.replace(/\/+/g, '/'));
  }

  return uniqueSorted([...routes]).map((route) => ({
    route: normalizeRoute(route),
    url: pathToUrl(normalizeRoute(route)),
    primaryService: 'supplier-portal',
    requiredChecks: REQUIRED_CHECKS,
  }));
}

function parseSuperadminTabs() {
  const appPath = path.join(ROOT_DIR, 'supermandi-superadmin', 'src', 'App.tsx');
  const content = readText(appPath);
  const tabs = new Set();
  const blockMatch = content.match(/const\s+TAB_LABELS[\s\S]*?=\s*{([\s\S]*?)\n};/);
  if (blockMatch) {
    const body = blockMatch[1];
    const keyMatches = body.matchAll(/^\s*["']?([a-z0-9-]+)["']?\s*:/gim);
    for (const match of keyMatches) {
      tabs.add(match[1]);
    }
  }

  const routes = ['/admin/'];
  for (const tab of uniqueSorted([...tabs])) {
    routes.push(`/admin/#${tab}`);
  }

  return routes.map((route) => ({
    route,
    url: pathToUrl(route),
    primaryService: 'superadmin',
    requiredChecks: REQUIRED_CHECKS,
  }));
}

function landingRoutes() {
  const routes = ['/', '/pos', '/privacy', '/terms'];
  return routes.map((route) => ({
    route,
    url: pathToUrl(route),
    primaryService: 'landing',
    requiredChecks: REQUIRED_CHECKS,
  }));
}

function crossFunctionFlows() {
  return [
    {
      flowId: 'XFN-001',
      name: 'Retailer auth to protected dashboard',
      entryUrl: `${BASE_URL}/retailer/login`,
      expectedServices: ['retailer-admin', 'api-gateway', 'main-backend'],
      requiredChecks: REQUIRED_CHECKS,
    },
    {
      flowId: 'XFN-002',
      name: 'Supplier auth to orders workflow',
      entryUrl: `${BASE_URL}/supplier/login/`,
      expectedServices: ['supplier-portal', 'api-gateway', 'main-backend'],
      requiredChecks: REQUIRED_CHECKS,
    },
    {
      flowId: 'XFN-003',
      name: 'Superadmin operational tabs and API wiring',
      entryUrl: `${BASE_URL}/admin/`,
      expectedServices: ['superadmin', 'api-gateway', 'main-backend'],
      requiredChecks: REQUIRED_CHECKS,
    },
    {
      flowId: 'XFN-004',
      name: 'POS API contract and backend parity',
      entryUrl: `${BASE_URL}/api/v1/health`,
      expectedServices: ['api-gateway', 'main-backend'],
      requiredChecks: REQUIRED_CHECKS,
    },
  ];
}

function buildManifest() {
  const retailer = parseRetailerRoutes();
  const supplier = parseSupplierRoutes();
  const superadmin = parseSuperadminTabs();
  const landing = landingRoutes();
  const crossFlows = crossFunctionFlows();

  const manifest = {
    generatedAt: new Date().toISOString(),
    generatedBy: 'scripts/workflow/generate-live-page-manifest.js',
    sourceEnvironment: 'gcp_staging',
    baseUrl: BASE_URL,
    surfaces: {
      retailer_web: retailer,
      supplier_web: supplier,
      superadmin_web: superadmin,
      landing: landing,
    },
    pos_app: {
      apiBase: `${BASE_URL}/api/v1/`,
      requiredChecks: REQUIRED_CHECKS,
      criticalEndpoints: [
        `${BASE_URL}/api/v1/health`,
        `${BASE_URL}/api/v1/version`,
        `${BASE_URL}/api/v1/pos`,
        `${BASE_URL}/api/v1/auth`,
      ],
    },
    crossFunctionMatrix: crossFlows,
  };

  return manifest;
}

function main() {
  const manifest = buildManifest();
  ensureDir(OUT_FILE);
  fs.writeFileSync(OUT_FILE, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');

  const retailerCount = manifest.surfaces.retailer_web.length;
  const supplierCount = manifest.surfaces.supplier_web.length;
  const superadminCount = manifest.surfaces.superadmin_web.length;
  const landingCount = manifest.surfaces.landing.length;
  const flowCount = manifest.crossFunctionMatrix.length;

  console.log(`Generated: workflow/state/live_page_manifest.json`);
  console.log(
    `Counts -> retailer:${retailerCount}, supplier:${supplierCount}, superadmin:${superadminCount}, landing:${landingCount}, crossFlows:${flowCount}`
  );
}

main();
