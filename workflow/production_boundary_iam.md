# Production Boundary IAM Checklist

This checklist backs the machine guard rules with IAM boundaries in `supermandi-backend` (`asia-south1`).

## Principals

- `operator-release@supermandi-backend.iam.gserviceaccount.com`: operator promotion principal (must match `workflow_state.json` allowlist).
- `claude-staging@supermandi-backend.iam.gserviceaccount.com`: Claude staging principal (staging-only boundary).
- `cloud-deploy-promoter@supermandi-backend.iam.gserviceaccount.com`: pipeline promotion principal (invoked after operator approval).

## Minimum role split

1. `claude-staging@...`
- Allow: staging edit/deploy only (`run.developer` on `*-staging`, `artifactregistry.reader`, `cloudbuild.builds.editor` if needed).
- Deny: production Cloud Run services, Cloud Deploy production rollout approval.

2. `operator-release@...`
- Allow: approve promotion + run guarded promotion commands.
- Allow: Cloud Deploy promote on approved release only.
- Deny: direct code edits in runtime containers.

3. `cloud-deploy-promoter@...`
- Allow: deploy frozen artifacts to production targets only.
- Deny: staging code mutation responsibilities.

## Required guard environment

For any production promote/deploy command, set:

- `WORKFLOW_ACTOR=operator`
- `WORKFLOW_EXECUTION_CONTEXT=pipeline`
- `WORKFLOW_OPERATOR_PRINCIPAL=<active operator principal>`
- one pipeline signal: `GITHUB_ACTIONS=true` or `CLOUD_BUILD_BUILD_ID=<id>` or `WORKFLOW_PIPELINE_RUN_ID=<id>`

## Non-negotiable controls

- Production actions must fail if principal is not in `roles.operator.identity.allowedPrincipals`.
- Production actions must fail if execution context is not pipeline.
- `freeze_manifest.approvals.operatorPrincipal` must match active promoting principal.
- Promotion must use frozen digest artifacts only (no rebuild on prod promote).
