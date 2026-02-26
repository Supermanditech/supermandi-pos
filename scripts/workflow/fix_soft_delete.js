// fix_soft_delete.js
// P1-3: SOFT-DELETE-QUERIES-MISSING-FILTER
// Adds AND deleted_at IS NULL to all platform.stores SELECT queries
// that were written before migration 069 introduced soft-delete on that table.

const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '../..');
let errorCount = 0;

function applyFix(filePath, fixes) {
  const fullPath = path.join(root, filePath);
  let content = fs.readFileSync(fullPath, 'utf8');
  const wasCRLF = content.includes('\r\n');
  if (wasCRLF) content = content.replace(/\r\n/g, '\n');

  let changed = false;
  for (const [label, oldStr, newStr] of fixes) {
    const before = content;
    content = content.split(oldStr).join(newStr);   // replaceAll equivalent
    if (content !== before) {
      console.log(`  ✓ ${label}`);
      changed = true;
    } else {
      console.error(`  ✗ MISSED: ${label}`);
      errorCount++;
    }
  }

  if (wasCRLF) content = content.replace(/\n/g, '\r\n');
  if (changed) fs.writeFileSync(fullPath, content, 'utf8');
  return changed;
}

// ---------------------------------------------------------------------------
// 1. deviceToken.ts — LEFT JOIN platform.stores missing AND deleted_at IS NULL
// ---------------------------------------------------------------------------
console.log('\n[1] backend/src/middleware/deviceToken.ts');
applyFix('backend/src/middleware/deviceToken.ts', [
  [
    'LEFT JOIN stores (line 117)',
    'LEFT JOIN platform.stores s ON s.id = d.store_id::uuid\n    WHERE d.device_token = $1',
    'LEFT JOIN platform.stores s ON s.id = d.store_id::uuid AND s.deleted_at IS NULL\n    WHERE d.device_token = $1',
  ],
]);

// ---------------------------------------------------------------------------
// 2. auth-service/retailerAuth.ts — two queries missing the filter (LF file)
// ---------------------------------------------------------------------------
console.log('\n[2] backend/services/auth-service/src/routes/retailerAuth.ts');
applyFix('backend/services/auth-service/src/routes/retailerAuth.ts', [
  [
    'getStoreByCode — WHERE code (line 131)',
    `SELECT id, code, name, status, retailer_portal_enabled, retailer_portal_phone
     FROM platform.stores
     WHERE code = $1\``,
    `SELECT id, code, name, status, retailer_portal_enabled, retailer_portal_phone
     FROM platform.stores
     WHERE code = $1 AND deleted_at IS NULL\``,
  ],
  [
    'GET /me — WHERE id (line 383)',
    '`SELECT id, code, name FROM platform.stores WHERE id = $1`',
    '`SELECT id, code, name FROM platform.stores WHERE id = $1 AND deleted_at IS NULL`',
  ],
]);

// ---------------------------------------------------------------------------
// 3. retailer-admin/auth.ts — 8 queries (CRLF file)
// ---------------------------------------------------------------------------
console.log('\n[3] backend/src/routes/v1/retailer-admin/auth.ts');
applyFix('backend/src/routes/v1/retailer-admin/auth.ts', [
  // (a) Firebase login — lookup by store code, full columns
  [
    'firebase-login getStoreByCode (line 274)',
    `\`SELECT id, code, name, status, retailer_portal_enabled, retailer_portal_phone\n       FROM platform.stores\n       WHERE code = $1\``,
    `\`SELECT id, code, name, status, retailer_portal_enabled, retailer_portal_phone\n       FROM platform.stores\n       WHERE code = $1 AND deleted_at IS NULL\``,
  ],
  // (b) OTP verify — lookup stores by phone (auto-create path)
  [
    'OTP storeByPhone (line 491)',
    `\`SELECT id, code, name FROM platform.stores\n         WHERE retailer_portal_enabled = true\n         AND retailer_portal_phone = $1\``,
    `\`SELECT id, code, name FROM platform.stores\n         WHERE retailer_portal_enabled = true\n         AND retailer_portal_phone = $1 AND deleted_at IS NULL\``,
  ],
  // (c) INNER JOIN query — appears TWICE (lines 525 + 875); split/join replaces both
  [
    'INNER JOIN stores (lines 525 & 875 — both occurrences)',
    `WHERE su.user_id = $1 AND su.is_active = true AND s.retailer_portal_enabled = true\n       ORDER BY s.name\``,
    `WHERE su.user_id = $1 AND su.is_active = true AND s.retailer_portal_enabled = true AND s.deleted_at IS NULL\n       ORDER BY s.name\``,
  ],
  // (d) NOT IN subquery for legacy phone stores
  [
    'storesByPhone NOT IN (line 535)',
    `AND s.id NOT IN (\n         SELECT store_id FROM auth.store_users WHERE user_id = $2\n       )\``,
    `AND s.id NOT IN (\n         SELECT store_id FROM auth.store_users WHERE user_id = $2\n       ) AND s.deleted_at IS NULL\``,
  ],
  // (e) Register OTP send — lookup by code, partial columns
  [
    'register getStoreByCode (line 714)',
    `\`SELECT id, code, name, retailer_portal_enabled\n       FROM platform.stores\n       WHERE code = $1\``,
    `\`SELECT id, code, name, retailer_portal_enabled\n       FROM platform.stores\n       WHERE code = $1 AND deleted_at IS NULL\``,
  ],
  // (f) SELECT by id — appears TWICE (lines 1351 + 1431); split/join replaces both
  [
    'SELECT by store id (lines 1351 & 1431 — both occurrences)',
    '`SELECT id, code, name FROM platform.stores WHERE id = $1`',
    '`SELECT id, code, name FROM platform.stores WHERE id = $1 AND deleted_at IS NULL`',
  ],
]);

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('');
if (errorCount === 0) {
  console.log('SUCCESS — all soft-delete filters applied');
} else {
  console.error(`FAILED — ${errorCount} fix(es) did not match; file may have changed`);
  process.exit(1);
}
