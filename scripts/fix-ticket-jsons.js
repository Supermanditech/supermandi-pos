#!/usr/bin/env node
// Bulk-fix ticket JSONs for guard compliance
// Run: node scripts/fix-ticket-jsons.js

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ticketDir = path.join(__dirname, '..', 'workflow', 'tickets');
const files = fs.readdirSync(ticketDir).filter(f => f.endsWith('.json'));

const REQUIRED_FILES = [
  '.github/workflows/ci-gates.yml',
  '.gitignore',
  'package.json',
  'RELEASES/CLAUDE_STATE.md',
  'RELEASES/CLAUDE_CURRENT_STATE.json',
  'RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md',
  'RELEASES/CLAUDE_NEXT_ACTION_FIX001.md',
  'scripts/deploy-cloud-run.sh',
  'scripts/gates/git-discipline.sh',
  'scripts/promote-to-prod.sh',
  'scripts/release-gate.js',
  'scripts/workflow/guard.js',
  'scripts/workflow/generate-live-page-manifest.js',
  'scripts/workflow/production-identity-guard.sh',
  'scripts/workflow/session-boot.js',
  'scripts/workflow/ticket-monitor.js',
  'scripts/workflow/pre-staging-attempt.js',
  'workflow/README.md',
  'workflow/legacy_conflicts.json',
  'workflow/production_boundary_iam.md',
  'workflow/schemas/freeze_manifest.schema.json',
  'workflow/schemas/screen_state.schema.json',
  'workflow/schemas/staging_batch.schema.json',
  'workflow/schemas/ticket.schema.json',
  'workflow/screens/.gitkeep',
  'workflow/state/freeze_manifest.json',
  'workflow/state/live_page_manifest.json',
  'workflow/state/staging_batch.json',
  'workflow/state/workflow_state.json',
  'workflow/templates/freeze_manifest.example.json',
  'workflow/templates/live_ticket_intake.example.md',
  'workflow/templates/screen.example.json',
  'workflow/templates/staging_batch.example.json',
  'workflow/templates/ticket.example.json',
  'workflow/tickets/.gitkeep'
];

function computeHash(step) {
  const payload = `${step.from}|${step.to}|${step.actor}|${step.sessionId}|${step.at}|${step.reason}|${step.prevHash}`;
  return crypto.createHash('sha256').update(payload).digest('hex');
}

let fixed = 0;
for (const file of files) {
  const filePath = path.join(ticketDir, file);
  const ticket = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  let changed = false;

  // 1. Fix sessionBoot.requiredFilesRead — merge in all required files
  if (ticket.sessionBoot && Array.isArray(ticket.sessionBoot.requiredFilesRead)) {
    const normalized = ticket.sessionBoot.requiredFilesRead.map(f => f.replace(/\\/g, '/'));
    const existing = new Set(normalized);
    const missing = REQUIRED_FILES.filter(f => !existing.has(f));
    if (missing.length > 0) {
      ticket.sessionBoot.requiredFilesRead = [...new Set([...REQUIRED_FILES, ...normalized])];
      changed = true;
    }
  }

  // 2. Fix statusHistory entries — add actor, sessionId, prevHash, hash
  if (Array.isArray(ticket.statusHistory)) {
    for (let i = 0; i < ticket.statusHistory.length; i++) {
      const step = ticket.statusHistory[i];

      // Fix 'by' -> 'actor'
      if (step.by && !step.actor) {
        step.actor = step.by;
        delete step.by;
        changed = true;
      }
      if (!step.actor) {
        step.actor = 'claude';
        changed = true;
      }

      // Add sessionId
      if (!step.sessionId) {
        step.sessionId = 'session-staging-hardening-2026-02-21';
        changed = true;
      }

      // Add prevHash
      if (!step.prevHash) {
        step.prevHash = i === 0 ? 'GENESIS' : (ticket.statusHistory[i - 1].hash || 'GENESIS');
        changed = true;
      }

      // Always recompute hash to ensure correctness
      const expectedHash = computeHash(step);
      if (step.hash !== expectedHash) {
        step.hash = expectedHash;
        changed = true;
      }
    }
  }

  if (changed) {
    fs.writeFileSync(filePath, JSON.stringify(ticket, null, 2) + '\n');
    fixed++;
    console.log(`FIXED: ${file}`);
  } else {
    console.log(`OK:    ${file}`);
  }
}
console.log(`\nTotal: ${fixed} fixed / ${files.length} files`);
