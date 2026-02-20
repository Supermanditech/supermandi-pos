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

## 2A. Staging Deploy Hotfix (2026-02-20)

When running `pnpm workflow:pre-staging`:

- `workflow/state/staging_batch.json` is the only file allowed to be dirty for deploy-intent `commitSha` updates.
- If any other file is dirty, staging gate must fail.
- `staging_batch.commitSha` MUST match current `git rev-parse --short HEAD`.

Required retry order:

1. Commit and push any non-batch dirty files first.
2. Set `workflow/state/staging_batch.json.commitSha` to current HEAD.
3. Verify `git status --short` shows only:
   `M workflow/state/staging_batch.json`
4. Run:
   `pnpm workflow:pre-staging`

Do not bypass this sequence.

## 2B. Active Objective (Current Wave)

Current objective is a zero-regression GCP staging deployment of work completed in the last 10 days across:

- Retailer web frontend
- Supplier web frontend
- Superadmin web frontend
- POS app frontend
- Backend services + API gateway
- DB migrations and staging infra parity

For this wave, Claude must treat `FIX-001` as deploy-orchestration for the full scope above.
Claude must not claim deployment complete until Cloud Run staging evidence is real (no placeholders).

Minimum completion evidence per attempt:

1. `commitSha` used for deploy
2. GitHub Actions / Cloud Build run URL
3. Migration execution result summary
4. Cloud Run revision IDs for all 6 staging services
5. `https://staging.supermandi.tech/api/health` response
6. Operator test handoff status (laptop + Redmi)

If any evidence item is missing, status remains `ready_for_operator_test` (not `locked`).

## 2C. Tracking Protocol (Codex + Claude)

At each retry, Claude must publish a short checkpoint containing:

- `Attempt #`
- `HEAD SHA`
- `staging_batch.commitSha`
- `git status --short` summary
- `pnpm workflow:pre-staging` result
- next blocking item (if failed)

No silent retries.

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
- For `FIX-001` staging deploy attempts, Claude must re-read this file before each retry and follow Section 2A exactly.
- For this active wave, Claude must also enforce Section 2B and Section 2C on every deploy attempt.
