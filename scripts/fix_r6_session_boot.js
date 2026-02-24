// Fix sessionBoot.requiredFilesRead for all R6 tickets to match the full required list
const fs = require('fs');
const path = require('path');

const FULL_REQUIRED_FILES = [
  ".github/workflows/ci-gates.yml",
  ".gitignore",
  "package.json",
  "RELEASES/CLAUDE_STATE.md",
  "RELEASES/CLAUDE_CURRENT_STATE.json",
  "RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md",
  "RELEASES/CLAUDE_NEXT_ACTION_FIX001.md",
  "scripts/deploy-cloud-run.sh",
  "scripts/gates/git-discipline.sh",
  "scripts/promote-to-prod.sh",
  "scripts/release-gate.js",
  "scripts/workflow/guard.js",
  "scripts/workflow/generate-live-page-manifest.js",
  "scripts/workflow/production-identity-guard.sh",
  "scripts/workflow/session-boot.js",
  "scripts/workflow/ticket-monitor.js",
  "scripts/workflow/pre-staging-attempt.js",
  "workflow/README.md",
  "workflow/legacy_conflicts.json",
  "workflow/production_boundary_iam.md",
  "workflow/schemas/freeze_manifest.schema.json",
  "workflow/schemas/screen_state.schema.json",
  "workflow/schemas/staging_batch.schema.json",
  "workflow/schemas/ticket.schema.json",
  "workflow/screens/.gitkeep",
  "workflow/state/freeze_manifest.json",
  "workflow/state/live_page_manifest.json",
  "workflow/state/staging_batch.json",
  "workflow/state/workflow_state.json",
  "workflow/templates/freeze_manifest.example.json",
  "workflow/templates/live_ticket_intake.example.md",
  "workflow/templates/screen.example.json",
  "workflow/templates/staging_batch.example.json",
  "workflow/templates/ticket.example.json",
  "workflow/tickets/.gitkeep"
];

const dir = 'workflow/tickets';
const files = fs.readdirSync(dir).filter(f => f.startsWith('R6.') && f.endsWith('.json'));
let fixed = 0;

for (const file of files) {
  const filePath = path.join(dir, file);
  const ticket = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  ticket.sessionBoot.requiredFilesRead = FULL_REQUIRED_FILES;
  fs.writeFileSync(filePath, JSON.stringify(ticket, null, 2) + '\n');
  fixed++;
}

console.log(`Fixed sessionBoot.requiredFilesRead for ${fixed} R6 tickets`);
