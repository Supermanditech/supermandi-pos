#!/usr/bin/env node
/**
 * APK READINESS CHECK
 *
 * Validates that the app is ready for APK build by checking common issues
 * that work in Expo Go but FAIL in standalone APK builds.
 *
 * Run before every APK build: node scripts/apk-readiness-check.js
 */

const fs = require('fs');
const path = require('path');

const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

let errors = [];
let warnings = [];

function fail(message) {
  errors.push(message);
  console.error(`${RED}[FAIL]${RESET} ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.log(`${YELLOW}[WARN]${RESET} ${message}`);
}

function pass(message) {
  console.log(`${GREEN}[PASS]${RESET} ${message}`);
}

function info(message) {
  console.log(`${CYAN}[INFO]${RESET} ${message}`);
}

const projectRoot = path.join(__dirname, '..');

console.log('\n' + '='.repeat(60));
console.log(`${CYAN}  APK READINESS CHECK${RESET}`);
console.log(`${CYAN}  Expo Go vs APK Build Compatibility${RESET}`);
console.log('='.repeat(60) + '\n');

// ============================================================
// CHECK 1: Font Loading (CRITICAL - Icons won't show without this)
// ============================================================
console.log('--- CHECK 1: Font/Icon Loading ---\n');

const appTsx = fs.readFileSync(path.join(projectRoot, 'App.tsx'), 'utf8');

// Check if expo-font is imported
if (!appTsx.includes('expo-font') && !appTsx.includes('useFonts')) {
  fail('expo-font not imported in App.tsx - icons will NOT show in APK');
} else {
  pass('expo-font imported');
}

// Check if MaterialCommunityIcons font is loaded
if (!appTsx.includes('MaterialCommunityIcons.font') && !appTsx.includes('loadAsync')) {
  fail('MaterialCommunityIcons font not loaded - icons will be empty boxes in APK');
} else {
  pass('MaterialCommunityIcons font loading configured');
}

// Check for font loading state
if (!appTsx.includes('fontsLoaded') && !appTsx.includes('loaded')) {
  warn('No font loading state detected - app may render before fonts are ready');
} else {
  pass('Font loading state management in place');
}

// ============================================================
// CHECK 2: Vector Icons Usage
// ============================================================
console.log('\n--- CHECK 2: Vector Icons ---\n');

// Find all icon libraries used in src/
const iconLibraries = new Set();
const srcDir = path.join(projectRoot, 'src');

function scanForIcons(dir) {
  if (!fs.existsSync(dir)) return;
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      scanForIcons(fullPath);
    } else if (file.endsWith('.tsx') || file.endsWith('.ts')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      // Check for common icon libraries
      const iconImports = content.match(/from\s+["']@expo\/vector-icons["']/g);
      if (iconImports) {
        const icons = content.match(/import\s*\{([^}]+)\}\s*from\s*["']@expo\/vector-icons["']/);
        if (icons) {
          icons[1].split(',').forEach(icon => {
            iconLibraries.add(icon.trim());
          });
        }
      }
    }
  });
}

scanForIcons(srcDir);

if (iconLibraries.size > 0) {
  info(`Icon libraries used: ${Array.from(iconLibraries).join(', ')}`);

  // Check if each icon library is loaded in App.tsx
  iconLibraries.forEach(lib => {
    if (lib && !appTsx.includes(`${lib}.font`)) {
      warn(`${lib} used but font may not be loaded in App.tsx`);
    }
  });
} else {
  pass('No vector icons detected');
}

// ============================================================
// CHECK 3: Assets Configuration
// ============================================================
console.log('\n--- CHECK 3: Assets Configuration ---\n');

const appJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'app.json'), 'utf8'));

// Check for splash screen
if (appJson.expo?.splash?.image) {
  const splashPath = path.join(projectRoot, appJson.expo.splash.image);
  if (fs.existsSync(splashPath)) {
    pass('Splash screen image exists');
  } else {
    warn(`Splash screen image not found: ${appJson.expo.splash.image}`);
  }
} else {
  warn('No splash screen configured in app.json');
}

// Check for app icon
if (appJson.expo?.icon) {
  const iconPath = path.join(projectRoot, appJson.expo.icon);
  if (fs.existsSync(iconPath)) {
    pass('App icon exists');
  } else {
    warn(`App icon not found: ${appJson.expo.icon}`);
  }
} else {
  warn('No app icon configured in app.json');
}

// Check for adaptive icon (Android)
if (appJson.expo?.android?.adaptiveIcon?.foregroundImage) {
  const adaptivePath = path.join(projectRoot, appJson.expo.android.adaptiveIcon.foregroundImage);
  if (fs.existsSync(adaptivePath)) {
    pass('Android adaptive icon exists');
  } else {
    warn(`Android adaptive icon not found`);
  }
}

// ============================================================
// CHECK 4: Native Plugins
// ============================================================
console.log('\n--- CHECK 4: Native Plugins ---\n');

const plugins = appJson.expo?.plugins || [];
info(`Plugins configured: ${plugins.length > 0 ? plugins.map(p => typeof p === 'string' ? p : p[0]).join(', ') : 'none'}`);

// Check if custom plugins exist
plugins.forEach(plugin => {
  const pluginName = typeof plugin === 'string' ? plugin : plugin[0];
  if (pluginName.startsWith('./')) {
    const pluginPath = path.join(projectRoot, pluginName + '.js');
    if (fs.existsSync(pluginPath)) {
      pass(`Custom plugin exists: ${pluginName}`);
    } else {
      fail(`Custom plugin NOT found: ${pluginName}`);
    }
  }
});

// ============================================================
// CHECK 5: Environment Variables
// ============================================================
console.log('\n--- CHECK 5: Environment Variables ---\n');

// Check .env file exists
const envPath = path.join(projectRoot, '.env');
if (fs.existsSync(envPath)) {
  pass('.env file exists');
  const envContent = fs.readFileSync(envPath, 'utf8');
  if (envContent.includes('EXPO_PUBLIC_API_URL')) {
    pass('EXPO_PUBLIC_API_URL is set in .env');
  } else {
    warn('EXPO_PUBLIC_API_URL not found in .env');
  }
} else {
  warn('.env file not found - using defaults from app.json');
}

// Check API_URL in app.json
if (appJson.expo?.extra?.API_URL) {
  info(`API_URL in app.json: ${appJson.expo.extra.API_URL}`);
  if (appJson.expo.extra.API_URL.includes('localhost') || appJson.expo.extra.API_URL.includes('127.0.0.1')) {
    fail('API_URL points to localhost - APK will NOT work!');
  } else {
    pass('API_URL points to remote server');
  }
}

// ============================================================
// CHECK 6: Network Security (Android)
// ============================================================
console.log('\n--- CHECK 6: Network Security ---\n');

// Check for cleartext traffic plugin
const hasCleartextPlugin = plugins.some(p => {
  const name = typeof p === 'string' ? p : p[0];
  return name.includes('Cleartext') || name.includes('cleartext');
});

if (hasCleartextPlugin) {
  pass('Cleartext traffic plugin configured');
} else {
  warn('No cleartext traffic plugin - HTTP requests may fail on Android');
}

// ============================================================
// CHECK 7: Expo Updates Configuration
// ============================================================
console.log('\n--- CHECK 7: Expo Updates ---\n');

if (appJson.expo?.updates?.enabled === false) {
  pass('Expo updates disabled (prevents "Remote update" errors)');
} else {
  warn('Expo updates enabled - may cause errors if EAS not configured');
}

if (appJson.expo?.updates?.checkAutomatically === 'NEVER') {
  pass('Auto update check disabled');
}

// ============================================================
// CHECK 8: Package Dependencies
// ============================================================
console.log('\n--- CHECK 8: Dependencies ---\n');

const packageJson = JSON.parse(fs.readFileSync(path.join(projectRoot, 'package.json'), 'utf8'));
const deps = { ...packageJson.dependencies, ...packageJson.devDependencies };

// Required for APK builds
const requiredDeps = [
  'expo-font',
  '@expo/vector-icons',
  'react-native-gesture-handler',
  'react-native-screens',
  'react-native-safe-area-context'
];

requiredDeps.forEach(dep => {
  if (deps[dep]) {
    pass(`${dep} installed`);
  } else {
    fail(`${dep} NOT installed - may cause APK crash`);
  }
});

// ============================================================
// CHECK 9: TypeScript Compilation
// ============================================================
console.log('\n--- CHECK 9: TypeScript ---\n');

const { execSync } = require('child_process');
try {
  execSync('npx tsc --noEmit', { cwd: projectRoot, stdio: 'pipe' });
  pass('TypeScript compiles without errors');
} catch (e) {
  fail('TypeScript has compilation errors');
}

// ============================================================
// CHECK 10: Common APK Issues
// ============================================================
console.log('\n--- CHECK 10: Common APK Issues ---\n');

// Check for console.log in production (can slow down APK)
let consoleLogCount = 0;
function countConsoleLogs(dir) {
  if (!fs.existsSync(dir)) return;
  fs.readdirSync(dir).forEach(file => {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory() && !file.includes('node_modules')) {
      countConsoleLogs(fullPath);
    } else if (file.endsWith('.ts') || file.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      const matches = content.match(/console\.(log|warn|error)\(/g);
      if (matches) consoleLogCount += matches.length;
    }
  });
}
countConsoleLogs(srcDir);

if (consoleLogCount > 50) {
  warn(`${consoleLogCount} console statements found - consider removing for production`);
} else {
  pass(`Console statements: ${consoleLogCount} (acceptable)`);
}

// ============================================================
// CHECK 11: WIP Tasks (BLOCKS APK BUILD)
// ============================================================
console.log('\n--- CHECK 11: Work-in-Progress Tasks ---\n');

const fixesPath = path.join(__dirname, 'mandatory-fixes.json');
if (fs.existsSync(fixesPath)) {
  const fixesConfig = JSON.parse(fs.readFileSync(fixesPath, 'utf8'));

  // CHECK WIP TASKS - Any WIP task blocks APK build
  const wipTasks = fixesConfig.wip?.tasks || [];
  if (wipTasks.length > 0) {
    console.log(`${RED}BLOCKED: ${wipTasks.length} WIP task(s) must be completed first!${RESET}\n`);
    wipTasks.forEach((task, i) => {
      fail(`[WIP-${i + 1}] ${task.name}`);
      console.log(`   ${CYAN}Description:${RESET} ${task.description || 'No description'}`);
      if (task.file) console.log(`   ${CYAN}File:${RESET} ${task.file}`);
    });
    console.log(`\n${YELLOW}Complete all WIP tasks before building APK!${RESET}`);
    console.log(`${YELLOW}Edit scripts/mandatory-fixes.json to remove completed tasks from 'wip.tasks'${RESET}\n`);
  } else {
    pass('No WIP tasks blocking build');
  }

  // ============================================================
  // CHECK 12: Completed Fixes Verification
  // ============================================================
  console.log('\n--- CHECK 12: Mandatory Fixes Verification ---\n');

  const fixes = fixesConfig.completedFixes || fixesConfig.fixes || [];
  info(`Verifying ${fixes.length} mandatory fixes...\n`);

  fixes.forEach(fix => {
    const filePath = path.join(projectRoot, fix.file);
    if (!fs.existsSync(filePath)) {
      fail(`[${fix.id}] ${fix.name}: File not found - ${fix.file}`);
      return;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    let fixOk = true;

    // Check patterns that MUST exist
    (fix.mustContain || []).forEach(pattern => {
      if (!content.includes(pattern)) {
        fail(`[${fix.id}] ${fix.name}: Missing pattern "${pattern}"`);
        console.log(`   ${CYAN}File:${RESET} ${fix.file}`);
        console.log(`   ${CYAN}Why:${RESET} ${fix.description}`);
        fixOk = false;
      }
    });

    // Check patterns that must NOT exist
    (fix.mustNotContain || []).forEach(pattern => {
      if (content.includes(pattern)) {
        fail(`[${fix.id}] ${fix.name}: Found forbidden pattern "${pattern}"`);
        console.log(`   ${CYAN}File:${RESET} ${fix.file}`);
        console.log(`   ${CYAN}Why:${RESET} ${fix.description}`);
        fixOk = false;
      }
    });

    if (fixOk) {
      pass(`[${fix.id}] ${fix.name}`);
    }
  });

  // Show changelog summary
  const changelog = fixesConfig.changelog || [];
  if (changelog.length > 0) {
    const latestChanges = changelog[0];
    console.log(`\n${CYAN}Latest changes (${latestChanges.date}):${RESET}`);
    latestChanges.changes.slice(0, 5).forEach(c => console.log(`  - ${c}`));
    if (latestChanges.changes.length > 5) {
      console.log(`  ... and ${latestChanges.changes.length - 5} more`);
    }
  }
} else {
  warn('mandatory-fixes.json not found - skipping fix verification');
}

// ============================================================
// SUMMARY
// ============================================================
console.log('\n' + '='.repeat(60));

if (errors.length === 0) {
  console.log(`${GREEN}  APK READINESS CHECK PASSED${RESET}`);
  console.log('='.repeat(60));
  if (warnings.length > 0) {
    console.log(`\n${YELLOW}${warnings.length} warning(s) - review above${RESET}`);
  }
  console.log('\n  Safe to build APK\n');
  process.exit(0);
} else {
  console.log(`${RED}  APK READINESS CHECK FAILED - ${errors.length} issue(s)${RESET}`);
  console.log('='.repeat(60));
  console.log(`
${RED}Fix the above issues before building APK!${RESET}

Common fixes:
1. Icons missing: Add Font.loadAsync() in App.tsx
2. API localhost: Update API_URL in app.json to production server
3. Missing deps: npm install <package>
4. Mandatory fix missing: Check scripts/mandatory-fixes.json for required patterns
`);
  process.exit(1);
}
