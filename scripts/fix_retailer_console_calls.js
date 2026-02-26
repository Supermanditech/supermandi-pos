#!/usr/bin/env node
// REQ.AUDIT.W5.RETAILER.CONSOLE-ERROR-IN-PRODUCTION.001
// Replace console.error/warn in retailer-admin pages with structured logger calls
'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', 'retailer-admin', 'src');

// Files in pages/ + pages/admin/
const PAGE_FILES = [
  'pages/admin/ProductQueuePage.tsx',
  'pages/admin/SupplierQueuePage.tsx',
  'pages/CompliancePage.tsx',
  'pages/DashboardPage.tsx',
  'pages/DeviceActivationPage.tsx',
  'pages/ForgotPasswordPage.tsx',
  'pages/InventoryPage.tsx',
  'pages/InvoicesPage.tsx',
  'pages/LoginPage.tsx',
  'pages/NotificationsPage.tsx',
  'pages/PaymentsPage.tsx',
  'pages/ProductsPage.tsx',
  'pages/RegisterPage.tsx',
  'pages/RetailerOnboardingPage.tsx',
  'pages/SettingsPage.tsx',
  'pages/SupplierCatalogPage.tsx',
  'pages/SuppliersPage.tsx',
];

let totalFiles = 0;
let totalReplacements = 0;

for (const relPath of PAGE_FILES) {
  const filePath = path.join(ROOT, relPath);
  if (!fs.existsSync(filePath)) {
    console.log(`SKIP (not found): ${relPath}`);
    continue;
  }

  let src = fs.readFileSync(filePath, 'utf8');
  const hasCRLF = src.includes('\r\n');
  const original = src;

  // Determine logger import path relative to file location
  const depth = relPath.split('/').length - 1; // 1 for pages/, 2 for pages/admin/
  const importPath = depth === 1 ? '../lib/logger' : '../../lib/logger';

  // Count console calls before
  const consoleBefore = (src.match(/console\.(error|warn|log)\(/g) || []).length;
  if (consoleBefore === 0) {
    console.log(`OK (no console calls): ${relPath}`);
    continue;
  }

  // Check if logger already imported
  const alreadyImported = src.includes("from '" + importPath + "'") ||
                          src.includes('from "' + importPath + '"');

  // Replace console.error/warn/log with logger equivalents
  src = src.replace(/console\.error\(/g, 'logger.error(');
  src = src.replace(/console\.warn\(/g, 'logger.warn(');
  src = src.replace(/console\.log\(/g, 'logger.log(');

  const consoleAfter = (src.match(/console\.(error|warn|log)\(/g) || []).length;
  const replacedCount = consoleBefore - consoleAfter;

  // Add logger import if not present and we made replacements
  if (replacedCount > 0 && !alreadyImported) {
    // Insert after last existing import line
    const lines = src.split('\n');
    let lastImportIdx = -1;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('import ')) lastImportIdx = i;
    }
    const insertIdx = lastImportIdx >= 0 ? lastImportIdx + 1 : 0;
    lines.splice(insertIdx, 0, `import { logger } from '${importPath}';`);
    src = lines.join('\n');
  }

  if (hasCRLF) src = src.replace(/\r?\n/g, '\r\n');

  if (src !== original) {
    fs.writeFileSync(filePath, src);
    console.log(`UPDATED ${relPath}: ${replacedCount} replacement(s)`);
    totalFiles++;
    totalReplacements += replacedCount;
  } else {
    console.log(`NO CHANGE: ${relPath}`);
  }
}

console.log(`\nDone: ${totalFiles} files, ${totalReplacements} replacements`);
