---
name: supermandi-operating-system-memory-sync
description: Use when starting or resuming SuperMandi work to load machine-enforced workflow artifacts, commands, and guardrails for staging-first delivery.
---

# CLAUDE MEMORY SYNC PACK (2026-02-20)

Use this file to sync Claude memory/rules with the latest machine-enforced workflow for SuperMandi.

## 1. Authoritative Load Order

1. `RELEASES/CLAUDE_STATE.md`
2. `RELEASES/CLAUDE_CURRENT_STATE.json`
3. `workflow/state/workflow_state.json`
4. `workflow/schemas/ticket.schema.json`
5. `workflow/schemas/screen_state.schema.json`
6. `workflow/state/staging_batch.json`
7. `workflow/state/freeze_manifest.json`
8. `workflow/README.md`
9. `workflow/production_boundary_iam.md`

## 2. Mandatory Session Commands

```bash
pnpm workflow:validate
pnpm workflow:monitor
```

Before a ticket moves from `todo` to `in_progress`:

```bash
pnpm workflow:session-boot -- --file workflow/tickets/<ticket>.json
```

## 3. Updated Files To Keep In Memory

- `.github/workflows/ci-gates.yml`
- `.gitignore`
- `package.json`
- `RELEASES/CLAUDE_STATE.md`
- `RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md`
- `scripts/deploy-cloud-run.sh`
- `scripts/gates/git-discipline.sh`
- `scripts/promote-to-prod.sh`
- `scripts/release-gate.js`
- `scripts/workflow/guard.js`
- `scripts/workflow/production-identity-guard.sh`
- `scripts/workflow/session-boot.js`
- `scripts/workflow/ticket-monitor.js`
- `workflow/README.md`
- `workflow/legacy_conflicts.json`
- `workflow/production_boundary_iam.md`
- `workflow/schemas/freeze_manifest.schema.json`
- `workflow/schemas/screen_state.schema.json`
- `workflow/schemas/staging_batch.schema.json`
- `workflow/schemas/ticket.schema.json`
- `workflow/screens/.gitkeep`
- `workflow/state/freeze_manifest.json`
- `workflow/state/staging_batch.json`
- `workflow/state/workflow_state.json`
- `workflow/templates/freeze_manifest.example.json`
- `workflow/templates/screen.example.json`
- `workflow/templates/staging_batch.example.json`
- `workflow/templates/ticket.example.json`
- `workflow/tickets/.gitkeep`

## 4. Guardrails

- Claude is staging-only; production promotion requires explicit operator approval.
- No ticket can be locked without passing all production layers and operator signoff.
- No screen certification without linked ticket locks and impact re-test pass.
- No freeze without pinned image digests, revision IDs, and migration lock.
- No production promote without `FREEZE_READY` and principal-bound operator approval.
