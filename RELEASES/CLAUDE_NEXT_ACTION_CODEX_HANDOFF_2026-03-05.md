# CLAUDE Resume Handoff (Live Testing Lock)

> Superseded for immediate execution by:
> `RELEASES/CLAUDE_NEXT_ACTION_DEPLOY_TO_LIVE_TESTING_2026-03-05.md`
> because deploy run `22730271139` (SHA `da7ded4a`) must complete before locked live testing starts.

- Generated at (UTC): 2026-03-05T18:45:00Z
- Operator instruction: run strict live testing only, from real user interaction, and append findings into `RELEASES/LIVE_TESTING_ISSUES.md`.

## Locked Objective
Execute a production-style, click-by-click live audit on `https://staging.supermandi.tech` with hard lock at:
1. Screen
2. Sub-screen
3. Modal/drawer/dialog

Do not move to the next screen until current layer is exhausted or blocked with evidence.

## Canonical Issue File Rules
1. Keep existing `ISSUE-001..ISSUE-013` unchanged.
2. Append all new findings as `ISSUE-014+` in `RELEASES/LIVE_TESTING_ISSUES.md`.
3. Findings must be runtime-backed only (live browser/app evidence), not code-assumption only.

## Mandatory Coverage Per Screen
For each user click/tap path, verify and record:
1. UI
2. UX
3. Wiring
4. Navigation
5. API behavior
6. DB/tables symptoms
7. GCP current state/parity
8. Business logic
9. Real user flow continuity/recovery

## Mandatory Platform Order
1. POS app (device first)
2. Retailer web
3. Supplier web
4. SuperAdmin web
5. Cross-function flows

## Cross-Function Flows (must run)
1. Store creation/approval and role boundary checks
2. POS enrollment and re-enrollment/cancel/retry behavior
3. Stock sync POS -> Retailer and visibility parity
4. Retailer -> Supplier -> SuperAdmin escalations/approvals
5. Payment and transaction continuity (including cancel/partial/timeout paths)

## Gate Commands Before Discovery
1. `npm run ui:audit`
2. `npm run typecheck`
3. `npm --prefix backend run test:unit -- --runInBand`
4. `STAGING=true node ./node_modules/@playwright/test/cli.js test e2e-tests/tests/staging-url-smoke.spec.ts --project=chromium`
5. `STAGING=true node ./node_modules/@playwright/test/cli.js test e2e-tests/tests/portal-verification.spec.ts --grep @prod --project=chromium`

## Existing Build/Test Context
1. Fix branch: `codex/pos-audit-phase-a-e`
2. Build SHA for traceability: `d78e09c7`
3. Local APK built/installed on Redmi and uploaded to Firebase (distribution groups pending creation)
4. Health endpoints were 200 OK on staging at last check

## Required Output
1. Updated `RELEASES/LIVE_TESTING_ISSUES.md` with newly appended issues (`ISSUE-014+`)
2. Exact screen/sub-screen/modal path for each issue
3. Severity + reproducible steps + expected vs actual + impacted layer(s)
4. Rebuild verdict: `required` or `not required` with reason
5. Updated machine-state JSON fields to reflect exact progress and blockers
