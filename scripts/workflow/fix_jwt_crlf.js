#!/usr/bin/env node
/* eslint-disable no-console */
// Fix remaining CRLF files by targeting the dev/test block directly
const fs = require('fs');
const path = require('path');
const ROOT = path.join(__dirname, '..', '..');

const files = [
  'backend/src/middleware/validateGatewayHeaders.ts',
  'backend/src/routes/v1/admin/adminAuth.ts',
  'backend/src/routes/v1/supplier/auth.ts',
  'backend/src/routes/v1/retailer-admin/auth.ts',
  'backend/src/routes/v1/supplier/orders.ts',
  'backend/src/routes/v1/demo.ts',
];

// Target: remove the 3-line dev/test fallback block from inside the if(!secret) block
// Pattern (LF-normalized):
// "    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    "
// Replace with:
// "    // W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\n    "

// Also need to update the comments above the IIFE to replace SEC-003 comment with W5 reference
// Comment pattern varies — just update the inner block which is consistent

const OLD_INNER = "    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    ";
const NEW_INNER = "    // W5-BACKEND-JWT-001: JWT_SECRET must always be set; no hardcoded fallback in any environment\n    ";

// For demo.ts, the pattern is slightly different (length check)
const OLD_INNER_DEMO = "    const env = (process.env.NODE_ENV || '').toLowerCase();\n    if (env === 'development' || env === 'test') {\n      return 'dev-secret-change-in-prod';\n    }\n    throw new Error('JWT_SECRET must be set and at least 32 characters');";
const NEW_INNER_DEMO = "    // W5-BACKEND-JWT-001: JWT_SECRET must always be set and >=32 chars; no hardcoded fallback in any environment\n    throw new Error('[FATAL] JWT_SECRET must be set and at least 32 characters');";

let ok = 0;
let fail = 0;

for (const f of files) {
  const filePath = path.join(ROOT, f);
  const raw = fs.readFileSync(filePath, 'utf8');
  const hasCRLF = raw.includes('\r\n');
  // Normalize to LF
  let content = hasCRLF ? raw.replace(/\r\n/g, '\n') : raw;

  let newContent;
  if (f.endsWith('demo.ts')) {
    if (!content.includes(OLD_INNER_DEMO)) {
      console.error('MISMATCH (demo):', f);
      fail++;
      continue;
    }
    newContent = content.replace(OLD_INNER_DEMO, NEW_INNER_DEMO);
  } else {
    if (!content.includes(OLD_INNER)) {
      console.error('MISMATCH:', f);
      fail++;
      continue;
    }
    newContent = content.replace(OLD_INNER, NEW_INNER);
  }

  // Restore CRLF if original had it
  const final = hasCRLF ? newContent.replace(/\n/g, '\r\n') : newContent;
  fs.writeFileSync(filePath, final, 'utf8');
  console.log('FIXED:', f);
  ok++;
}

console.log('\nDone:', ok, 'fixed,', fail, 'failed');
