# Claude Next Action - Deploy To Locked Live Testing

> Superseded for immediate execution by:
> `RELEASES/CLAUDE_NEXT_ACTION_IMPLEMENT_NOW_TEST_TOMORROW_2026-03-06.md`
> because current operator intent is implementation/deploy/build tonight and locked live testing tomorrow.

- Generated at (UTC): 2026-03-05T19:20:00Z
- Mode: deployment completion -> post-deploy gate -> locked live testing

## Deploy Context
1. Branch: `main`
2. Commit pushed: `da7ded4a`
3. Deploy workflow: `deploy.yml`
4. Deploy run id: `22730271139` (in progress at handoff time)

## Toolchain Setup Completed By Codex
1. Added script: `scripts/live-testing/toolchain-check.ps1`
2. Added script: `scripts/live-testing/post-deploy-live-gate.ps1`
3. Added script: `scripts/live-testing/freeze-screen-manifest.js`
4. Added script: `scripts/live-testing/mcp-config-check.js`
5. Added script: `scripts/live-testing/firebase-testlab-matrix.ps1`
6. Added Detox scaffold: `detox.config.js`, `e2e/detox/*`
7. Added runbook: `RELEASES/LIVE_TESTING_TOOLCHAIN_RUNBOOK.md`
8. Added npm scripts:
   - `npm run live:tools:check`
   - `npm run live:gate:postdeploy`
   - `npm run live:manifest:freeze`
   - `npm run live:mcp:check`
   - `npm run live:detox:check`
   - `npm run live:testlab:matrix`

## Execution Sequence (Mandatory)
1. Freeze locked manifest:
   - `npm run live:manifest:freeze`
2. Validate MCP config:
   - `npm run live:mcp:check`
3. Wait for deploy run completion:
   - `gh run watch 22730271139 --exit-status`
4. Validate toolchain + artifacts:
   - `npm run live:tools:check -- -ExpectedDeploySha da7ded4a -DeployRunId 22730271139`
5. Run post-deploy staging gate:
   - `npm run live:gate:postdeploy -- -ExpectedSha da7ded4a`
6. Optional deeper tooling before exploratory run:
   - `npm run live:detox:check`
   - `npm run live:testlab:matrix -- -ProjectId <project> -AppApk <app.apk> -TestApk <androidTest.apk> -NumShards 4`
7. If all gates pass, start locked live testing:
   - Order: POS -> Retailer -> Supplier -> SuperAdmin -> Cross-function
   - Traversal lock: `screen -> sub-screen -> modal`
   - Runtime evidence only
   - Append findings only (`ISSUE-014+`) to `RELEASES/LIVE_TESTING_ISSUES.md`

## Gate Pass Criteria
1. Staging health endpoint: PASS
2. Staging `/version` SHA prefix matches `da7ded4a`
3. `ui:audit`: PASS
4. `pnpm -r typecheck`: PASS
5. `backend test:unit`: PASS
6. Playwright staging smoke and portal verification: PASS

## If Deploy Or Gate Fails
1. Do not start live testing.
2. Report failed gate with direct evidence.
3. Keep machine-state phase in `DEPLOY_OR_GATE_BLOCKED`.
4. Propose the smallest fix batch, redeploy, then rerun the same gate command.
