# SuperMandi Workflow Guard

This directory enforces the Live Fix -> Freeze -> Production workflow with machine-checked JSON artifacts.

## Files

- `workflow/state/workflow_state.json`: global state machine and policy rules.
- `workflow/state/live_micro_audit_state_machine.json`: strict phase-order contract for exhaustive staging-only micro audit + ticketization.
- `workflow/state/freeze_manifest.json`: immutable freeze record before production promotion.
- `workflow/state/staging_batch.json`: required staging deploy batch manifest.
- `workflow/state/live_micro_check_queue.json`: manifest-derived micro-check queue across all surfaces.
- `workflow/state/live_ticketization_progress.json`: per-check evidence and issue-detection status ledger.
- `workflow/schemas/ticket.schema.json`: required production-layer ticket structure.
- `workflow/schemas/screen_state.schema.json`: screen certification structure.
- `workflow/schemas/freeze_manifest.schema.json`: freeze manifest structure.
- `workflow/schemas/staging_batch.schema.json`: staging batch manifest structure.
- `workflow/legacy_conflicts.json`: legacy rule/state/CI-CD conflicts and remediation tracking.
- `workflow/production_boundary_iam.md`: IAM boundary checklist for staging-vs-production principals.
- `workflow/templates/live_micro_audit_operator_prompt.md`: copy-paste prompt to run exhaustive staging micro audit with no screen skipping.
- `workflow/tickets/*.json`: ticket records.
- `workflow/screens/*.json`: screen records.

## Commands

- `pnpm workflow:validate`
- `pnpm workflow:sync`
- `pnpm workflow:pre-staging`
- `pnpm workflow:pre-staging:attempt`
- `pnpm workflow:pre-promote -- --sha <SHA>`
- `pnpm workflow:validate-batch`
- `node scripts/workflow/guard.js legacy-audit`
- `pnpm workflow:session-boot -- --file workflow/tickets/<id>.json`
- `pnpm workflow:monitor`
- `pnpm workflow:monitor:watch`
- `pnpm workflow:mode -- --set <LIVE_FIX|FREEZE_CANDIDATE|FREEZE_READY|PROD_PROMOTE|PROD_LOCKED>`
- `pnpm workflow:ticket-transition -- --file workflow/tickets/<id>.json --to <status> --actor <claude|operator> --reason "<text>"`
- `pnpm workflow:screen-transition -- --file workflow/screens/<id>.json --to <status> --actor <claude|operator> --reason "<text>"`
- `node scripts/workflow/guard.js resolve-contradiction --id CC-001`

## Guard behavior

- Blocks production promotion unless:
  - workflow mode is `FREEZE_READY` (or `PROD_PROMOTE` in retry path),
  - freeze manifest is `locked`,
  - all service digests and staging revisions are pinned,
  - DB migration lock is present,
  - approvals are true.
- Blocks screen certification unless all linked tickets are `locked`.
- Blocks ticket lock if any production layer is `fail`.
- Enforces `maxActiveTicketsPerScreen` from `workflow/state/workflow_state.json`.
- Enforces actor-based status transitions with `statusHistory` (no jump transitions).
- Enforces `statusHistory` hash-chain integrity (`prevHash` -> `hash`) for transition traceability.
- Enforces Claude failure-mode blocks (missing staging deploy, no rollback plan, no env/basepath/API checks).
- Enforces Operator failure-mode blocks (signoff without staging test, blocking issues still open).
- Blocks any ticket from ready/lock states if mock data/mock API usage is declared.
- Enforces external integration contract/staging evidence for WhatsApp/payment/other providers when touched.
- Enforces surface-to-service build mapping (`/retailer`, `/supplier`, `/admin`, `/api`) and correct primary Cloud Run target.
- Enforces explicit dependency disclosure and blocks progression if pending/blocking dependencies exist.
- Enforces operator-to-claude deployment binding (`validatedDeploymentRef` and tested revision IDs must match deployed refs).
- Enforces cloud-workspace proof (`claudeChecks.cloudWorkspaceValidated` + `cloudWorkspaceRef`) for production-grade claims.
- Enforces strict global WIP controls (`maxWipTicketsGlobal=1`, `maxWipScreensGlobal=1`) to prevent parallel ticket mesh/regression.
- Enforces top-level ticket order per screen: later top-level tickets cannot be WIP before earlier ticket is closed.
- Enforces parent/sub-ticket hierarchy: parent cannot close while sub-tickets remain open; sub-ticket cannot run if parent is inactive/closed.
- Enforces transition session continuity via `WORKFLOW_SESSION_ID` (status history hash-chain includes `sessionId`).
- Enforces Claude session bootstrap proof (`sessionBoot`) so required workflow files are acknowledged before ticket progression.
- `workflow:session-boot` auto-stamps ticket bootstrap metadata and validates ticket integrity immediately.
- Enforces production invariants per ticket (sell/purchase isolation, deterministic scan intent, state parity, offline sync safety, idempotency, atomic writes, strict schema validation, zero silent failures, structured audit logging).
- Enforces production-grade coding ethics (`rules.productionGradeCodingEthics`): no partial closure, no sub-100% progress claims, and fail-layer blocking for enforced ticket statuses (with optional all-layers-pass mode).
- `pnpm workflow:monitor` reports ticket-by-ticket guard failures and writes `workflow/state/live_monitor_report.json`.
- Enforces staging batch cap from `workflow/state/workflow_state.json`:
  - frontend-only batch: max `3` screens
  - backend/shared API change batch: max `2` screens
  - DB/migration/urlmap/ingress batch: max `1` screen
  - POS + backend together batch: max `1` screen
- Enforces staged deploy manifest existence before `pre-staging-deploy` passes.
- Enforces git discipline before staging deploy: clean worktree, no detached HEAD, no merge conflict markers.
  - Exception: `workflow/state/staging_batch.json` may be dirty for deploy-intent updates when `allowDirtyStagingBatchManifest=true`.
- Enforces staging batch deployment binding (`targetEnvironment`, `targetProject`, `targetRegion`, `commitSha`, `deploymentRef`).
- Enforces full-surface deploy intent for wave completion: no stale mixed-version services across
  `main-backend`, `api-gateway`, `retailer-admin`, `supplier-portal`, `superadmin`, `landing`.
- Enforces migration safety in staging batches when DB/migration risk flags are set.
- Enforces immutable artifact intent in staging batch (`immutableImagesPinned=true`, `secretVersionsPinned=true`).
- Enforces operator-only production mode transitions and pre-promote checks via `WORKFLOW_ACTOR=operator`.
- Enforces production execution context to run in pipeline mode (`WORKFLOW_EXECUTION_CONTEXT=pipeline`) with a live pipeline signal.
- Enforces operator identity allowlist for production actions (from `roles.operator.identity.allowedPrincipals` or `WORKFLOW_ALLOWED_OPERATOR_PRINCIPALS`).
- Enforces freeze approval principal binding (`freeze_manifest.approvals.operatorPrincipal`) to match the active promoting principal.
- Provides `legacy-audit` to identify old rules/files still conflicting with this workflow.
