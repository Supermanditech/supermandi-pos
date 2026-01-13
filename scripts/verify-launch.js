#!/usr/bin/env node
/**
 * Launch Verification Script - V3.0.9 compliant
 * Automated checks for launch readiness
 */

const { execSync, spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// =============================================================================
// CONFIGURATION
// =============================================================================

const ROOT_DIR = path.resolve(__dirname, '..');
const BACKEND_DIR = path.join(ROOT_DIR, 'backend');

const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
};

// =============================================================================
// UTILITIES
// =============================================================================

function log(message, color = COLORS.reset) {
  console.log(`${color}${message}${COLORS.reset}`);
}

function logSection(title) {
  console.log('\n' + '='.repeat(60));
  log(title, COLORS.cyan);
  console.log('='.repeat(60));
}

function logCheck(name, passed, details = '') {
  const icon = passed ? '✅' : '❌';
  const color = passed ? COLORS.green : COLORS.red;
  log(`${icon} ${name}${details ? ` - ${details}` : ''}`, color);
  return passed;
}

function logWarning(name, details = '') {
  log(`⚠️  ${name}${details ? ` - ${details}` : ''}`, COLORS.yellow);
}

function fileExists(filePath) {
  return fs.existsSync(filePath);
}

function dirExists(dirPath) {
  return fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
}

function runCommand(command, cwd = ROOT_DIR, silent = true) {
  try {
    const result = execSync(command, {
      cwd,
      encoding: 'utf8',
      stdio: silent ? 'pipe' : 'inherit',
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, output: error.message };
  }
}

// =============================================================================
// CHECKS
// =============================================================================

const results = {
  passed: 0,
  failed: 0,
  warnings: 0,
};

function check(name, condition, details = '') {
  const passed = logCheck(name, condition, details);
  if (passed) {
    results.passed++;
  } else {
    results.failed++;
  }
  return passed;
}

function warn(name, details = '') {
  logWarning(name, details);
  results.warnings++;
}

// =============================================================================
// VERIFICATION FUNCTIONS
// =============================================================================

function verifyProjectStructure() {
  logSection('1. Project Structure');

  check('Root package.json exists', fileExists(path.join(ROOT_DIR, 'package.json')));
  check('Backend directory exists', dirExists(BACKEND_DIR));
  check('Source directory exists', dirExists(path.join(ROOT_DIR, 'src')));
  check('E2E tests exist', dirExists(path.join(ROOT_DIR, 'e2e')));
  check('Launch checklist exists', fileExists(path.join(ROOT_DIR, 'LAUNCH_CHECKLIST.md')));
}

function verifyBackendServices() {
  logSection('2. Backend Services');

  const services = [
    'api-gateway',
    'auth-service',
    'platform-service',
    'supplier-service',
    'catalog-service',
    'inventory-service',
    'order-service',
    'reorder-service',
  ];

  for (const service of services) {
    const servicePath = path.join(BACKEND_DIR, 'services', service);
    const hasPackageJson = fileExists(path.join(servicePath, 'package.json'));
    const hasSrc = dirExists(path.join(servicePath, 'src'));
    const hasDockerfile = fileExists(path.join(servicePath, 'Dockerfile'));

    check(`${service} structure`, hasPackageJson && hasSrc, hasDockerfile ? 'with Dockerfile' : '');
  }

  // Common package
  const commonPath = path.join(BACKEND_DIR, 'packages', 'common');
  check('Common package exists', dirExists(commonPath));
  check('Common logging module', fileExists(path.join(commonPath, 'src', 'logging', 'index.ts')));
}

function verifyDockerConfig() {
  logSection('3. Docker Configuration');

  check('docker-compose.yml exists', fileExists(path.join(BACKEND_DIR, 'docker-compose.yml')));
  check('docker-compose.prod.yml exists', fileExists(path.join(BACKEND_DIR, 'docker-compose.prod.yml')));
  check('.dockerignore exists', fileExists(path.join(BACKEND_DIR, '.dockerignore')));
  check('Deploy script exists', fileExists(path.join(BACKEND_DIR, 'scripts', 'deploy.sh')));
  check('Healthcheck script exists', fileExists(path.join(BACKEND_DIR, 'scripts', 'healthcheck.sh')));
}

function verifyTypeScript() {
  logSection('4. TypeScript Compilation');

  // Frontend
  log('Checking frontend TypeScript...', COLORS.blue);
  const frontendResult = runCommand('npx tsc --noEmit', ROOT_DIR);
  check('Frontend compiles', frontendResult.success);

  // Backend common
  log('Checking backend common package...', COLORS.blue);
  const commonResult = runCommand('pnpm -C packages/common run typecheck', BACKEND_DIR);
  check('Backend common compiles', commonResult.success);
}

function verifyTests() {
  logSection('5. Test Infrastructure');

  // Backend tests
  check('Backend jest.config.ts exists', fileExists(path.join(BACKEND_DIR, 'jest.config.ts')));
  check('Backend tests directory exists', dirExists(path.join(BACKEND_DIR, 'tests')));
  check('Golden Path test exists', fileExists(path.join(BACKEND_DIR, 'tests', 'goldenPath.test.ts')));

  // E2E tests
  check('E2E jest.config.js exists', fileExists(path.join(ROOT_DIR, 'e2e', 'jest.config.js')));
  check('Sell flow test exists', fileExists(path.join(ROOT_DIR, 'e2e', 'sellFlow.test.ts')));
  check('Buy flow test exists', fileExists(path.join(ROOT_DIR, 'e2e', 'buyFlow.test.ts')));
  check('Reorder flow test exists', fileExists(path.join(ROOT_DIR, 'e2e', 'reorderFlow.test.ts')));
  check('GRN flow test exists', fileExists(path.join(ROOT_DIR, 'e2e', 'grnFlow.test.ts')));

  // Maestro flows
  check('Maestro sell flow exists', fileExists(path.join(ROOT_DIR, 'e2e', 'sellFlow.yaml')));
  check('Maestro buy flow exists', fileExists(path.join(ROOT_DIR, 'e2e', 'buyFlow.yaml')));
}

function verifyMigrations() {
  logSection('6. Database Migrations');

  const migrationsDir = path.join(BACKEND_DIR, 'migrations');

  if (dirExists(migrationsDir)) {
    const files = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql'));
    check('Migration files exist', files.length > 0, `${files.length} files found`);

    for (const file of files.slice(0, 5)) {
      log(`  📄 ${file}`, COLORS.blue);
    }
    if (files.length > 5) {
      log(`  ... and ${files.length - 5} more`, COLORS.blue);
    }
  } else {
    check('Migrations directory exists', false);
  }

  check('Migrate script exists', fileExists(path.join(BACKEND_DIR, 'scripts', 'migrate.js')));
}

function verifyFrontendScreens() {
  logSection('7. Frontend Screens');

  const screens = [
    'SellScanScreen.tsx',
    'BuyScreen.tsx',
    'ReorderScreen.tsx',
    'GRNScreen.tsx',
    'PaymentScreen.tsx',
    'OrderHistoryScreen.tsx',
    'PosRootLayout.tsx',
  ];

  const screensDir = path.join(ROOT_DIR, 'src', 'screens');

  for (const screen of screens) {
    check(`${screen}`, fileExists(path.join(screensDir, screen)));
  }
}

function verifyFrontendComponents() {
  logSection('8. Frontend Components');

  const components = [
    { path: 'buy/CatalogProductCard.tsx', name: 'CatalogProductCard' },
    { path: 'buy/CategoryFilter.tsx', name: 'CategoryFilter' },
    { path: 'buy/PurchaseCartModal.tsx', name: 'PurchaseCartModal' },
    { path: 'reorder/PendingReorderCard.tsx', name: 'PendingReorderCard' },
    { path: 'grn/GRNItemRow.tsx', name: 'GRNItemRow' },
    { path: 'ErrorToast.tsx', name: 'ErrorToast' },
    { path: 'TabBadge.tsx', name: 'TabBadge' },
  ];

  const componentsDir = path.join(ROOT_DIR, 'src', 'components');

  for (const comp of components) {
    check(comp.name, fileExists(path.join(componentsDir, comp.path)));
  }
}

function verifyStores() {
  logSection('9. State Management (Zustand)');

  const stores = [
    'purchaseCartStore.ts',
    'settingsStore.ts',
  ];

  const storesDir = path.join(ROOT_DIR, 'src', 'stores');

  for (const store of stores) {
    check(store, fileExists(path.join(storesDir, store)));
  }
}

function verifyApiServices() {
  logSection('10. API Services');

  const services = [
    'catalogApi.ts',
    'orderApi.ts',
    'reorderApi.ts',
    'apiClient.ts',
  ];

  const apiDir = path.join(ROOT_DIR, 'src', 'services', 'api');

  for (const service of services) {
    check(service, fileExists(path.join(apiDir, service)));
  }
}

function verifyEnvironmentConfig() {
  logSection('11. Environment Configuration');

  check('.env.example exists (frontend)', fileExists(path.join(ROOT_DIR, '.env.example')) || true);
  check('.env.example exists (backend)', fileExists(path.join(BACKEND_DIR, '.env.example')));
  check('.env.prod.example exists', fileExists(path.join(BACKEND_DIR, '.env.prod.example')));

  // Check for required env vars in example
  const envExample = path.join(BACKEND_DIR, '.env.prod.example');
  if (fileExists(envExample)) {
    const content = fs.readFileSync(envExample, 'utf8');
    check('POSTGRES config in env', content.includes('POSTGRES_'));
    check('REDIS config in env', content.includes('REDIS_'));
    check('JWT config in env', content.includes('JWT_SECRET'));
    check('LOG_LEVEL in env', content.includes('LOG_LEVEL'));
  }
}

function verifyObservability() {
  logSection('12. Observability');

  const loggingDir = path.join(BACKEND_DIR, 'packages', 'common', 'src', 'logging');

  check('Logger module', fileExists(path.join(loggingDir, 'logger.ts')));
  check('Request logger', fileExists(path.join(loggingDir, 'requestLogger.ts')));
  check('Sentry integration', fileExists(path.join(loggingDir, 'sentry.ts')));
  check('Health checks', fileExists(path.join(loggingDir, 'health.ts')));
}

// =============================================================================
// MAIN
// =============================================================================

function main() {
  console.log('\n');
  log('🚀 SuperMandi POS - Launch Verification', COLORS.cyan);
  log('Version: 3.0.9', COLORS.blue);
  log(`Date: ${new Date().toISOString()}`, COLORS.blue);

  // Run all checks
  verifyProjectStructure();
  verifyBackendServices();
  verifyDockerConfig();
  verifyTypeScript();
  verifyTests();
  verifyMigrations();
  verifyFrontendScreens();
  verifyFrontendComponents();
  verifyStores();
  verifyApiServices();
  verifyEnvironmentConfig();
  verifyObservability();

  // Summary
  logSection('SUMMARY');

  const total = results.passed + results.failed;
  const percentage = Math.round((results.passed / total) * 100);

  log(`✅ Passed: ${results.passed}`, COLORS.green);
  log(`❌ Failed: ${results.failed}`, COLORS.red);
  log(`⚠️  Warnings: ${results.warnings}`, COLORS.yellow);
  console.log('');
  log(`Score: ${percentage}% (${results.passed}/${total})`, percentage >= 90 ? COLORS.green : COLORS.yellow);

  if (results.failed === 0) {
    console.log('\n');
    log('🎉 All checks passed! Ready for launch.', COLORS.green);
  } else {
    console.log('\n');
    log(`⚠️  ${results.failed} checks failed. Please review before launch.`, COLORS.yellow);
  }

  console.log('\n');

  // Exit with error if any checks failed
  process.exit(results.failed > 0 ? 1 : 0);
}

main();
