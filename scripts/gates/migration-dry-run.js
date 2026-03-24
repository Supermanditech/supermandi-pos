#!/usr/bin/env node
// GCP-STG-0596: Validate pending migrations before deploy
const fs = require('fs');
const path = require('path');

const MIGRATIONS_DIR = path.join(__dirname, '../../backend/migrations');
const LAST_DEPLOYED = 187; // Update after each staging deploy

console.log('=== MIGRATION DRY-RUN ===');

const files = fs.readdirSync(MIGRATIONS_DIR)
  .filter(f => f.endsWith('.sql'))
  .sort();

let errors = 0;
const pending = [];

for (const file of files) {
  const num = parseInt(file.split('_')[0], 10);
  if (isNaN(num) || num <= LAST_DEPLOYED) continue;

  pending.push({ file, num });
  const content = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');

  // Check for destructive operations
  if (/DROP\s+TABLE\s+(?!IF\s+EXISTS)/i.test(content)) {
    console.log(`  ❌ ${file}: DROP TABLE without IF EXISTS`);
    errors++;
  }

  // Check for NOT NULL without DEFAULT
  if (/ADD\s+COLUMN.*NOT\s+NULL(?!\s+DEFAULT)/i.test(content) &&
      !/IF\s+NOT\s+EXISTS/i.test(content)) {
    console.log(`  ⚠️ ${file}: ADD COLUMN NOT NULL without DEFAULT — may fail on existing rows`);
  }
}

console.log(`\nPending migrations: ${pending.length} (${LAST_DEPLOYED + 1} → ${pending[pending.length-1]?.num || LAST_DEPLOYED})`);
pending.forEach(p => console.log(`  ${p.file}`));

if (errors > 0) {
  console.log(`\n❌ ${errors} error(s) — FIX BEFORE DEPLOY`);
  process.exit(1);
}

console.log('\n=== MIGRATION DRY-RUN: ✅ PASS ===');
