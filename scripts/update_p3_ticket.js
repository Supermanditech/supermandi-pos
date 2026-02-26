#!/usr/bin/env node
'use strict';
// Generic P3 ticket updater — run with: node scripts/update_p3_ticket.js <ticketPath> <patch.json>
const fs = require('fs');
const crypto = require('crypto');

const EXPANDED_FILES = [
  'workflow/state/workflow_state.json','workflow/schemas/ticket.schema.json','workflow/schemas/screen_state.schema.json',
  'workflow/state/staging_batch.json','.github/workflows/ci-gates.yml','.gitignore','package.json',
  'RELEASES/CLAUDE_STATE.md','RELEASES/CLAUDE_CURRENT_STATE.json','RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md',
  'RELEASES/CLAUDE_NEXT_ACTION_FIX001.md','scripts/deploy-cloud-run.sh','scripts/gates/git-discipline.sh',
  'scripts/promote-to-prod.sh','scripts/release-gate.js','scripts/workflow/guard.js',
  'scripts/workflow/generate-live-page-manifest.js','scripts/workflow/production-identity-guard.sh',
  'scripts/workflow/session-boot.js','scripts/workflow/ticket-monitor.js','scripts/workflow/pre-staging-attempt.js',
  'workflow/README.md','workflow/legacy_conflicts.json','workflow/production_boundary_iam.md',
  'workflow/schemas/freeze_manifest.schema.json','workflow/schemas/staging_batch.schema.json',
  'workflow/screens/.gitkeep','workflow/state/freeze_manifest.json','workflow/state/live_page_manifest.json',
  'workflow/templates/freeze_manifest.example.json','workflow/templates/live_ticket_intake.example.md',
  'workflow/templates/screen.example.json','workflow/templates/staging_batch.example.json',
  'workflow/templates/ticket.example.json','workflow/tickets/.gitkeep'
];

function hashEntry(from, to, actor, sessionId, at, reason, prevHash) {
  return crypto.createHash('sha256').update([from,to,actor,sessionId,at,reason,prevHash].join('|')).digest('hex');
}

module.exports = { EXPANDED_FILES, hashEntry };

// If run directly with args
if (require.main === module) {
  const ticketPath = process.argv[2];
  const patchPath = process.argv[3];
  if (!ticketPath || !patchPath) {
    console.error('Usage: node update_p3_ticket.js <ticketPath> <patchPath>');
    process.exit(1);
  }
  const ticket = JSON.parse(fs.readFileSync(ticketPath, 'utf8'));
  const patch = JSON.parse(fs.readFileSync(patchPath, 'utf8'));
  Object.assign(ticket, patch);
  ticket.sessionBoot.requiredFilesRead = EXPANDED_FILES;
  fs.writeFileSync(ticketPath, JSON.stringify(ticket, null, 2) + '\n');
  console.log('Updated:', ticketPath);
}
