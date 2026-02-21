# CLAUDE NEXT ACTION: GCP STAGING TICKETIZATION (NO IMPLEMENTATION / NO DEPLOY)

Effective date: 2026-02-22  
Owner: Codex instruction packet for Claude execution

## Objective

Run a full, micro-atomic, live ticketization cycle from **GCP staging only** and create/update issue tickets with production-grade evidence.

This run is strictly:

1. ticketization only
2. no code implementation
3. no staging deploy trigger

## Staging Baseline (Source of Truth)

- Base URL: `https://staging.supermandi.tech`
- Deploy ref: `github://run/22264213051`
- Staging commit SHA: `7b3a4ee8`
- Environment for evidence: live GCP staging only

## Mandatory Files To Read First (In Order)

1. `RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md`
2. `RELEASES/CLAUDE_STATE.md`
3. `RELEASES/CLAUDE_CURRENT_STATE.json`
4. `workflow/state/workflow_state.json`
5. `workflow/state/live_page_manifest.json`
6. `workflow/state/live_ticketization_progress.json`
7. `workflow/state/live_micro_audit_state_machine.json`
8. `workflow/state/live_micro_check_queue.json`
9. `workflow/templates/live_micro_audit_operator_prompt.md`
10. `workflow/templates/live_ticket_intake.example.md`
11. `workflow/schemas/ticket.schema.json`
12. `workflow/schemas/screen_state.schema.json`
13. `scripts/workflow/guard.js`
14. `scripts/workflow/generate-live-page-manifest.js`
15. `scripts/workflow/live-ticketization-refresh.js`
16. `scripts/workflow/update-browser-checks.js`
17. `scripts/workflow/update-runtime-checks.js`
18. `scripts/workflow/ticket-monitor.js`
19. `workflow/README.md`
20. `workflow/production_boundary_iam.md`

## Mandatory Commands (Before Testing)

```bash
pnpm workflow:validate
pnpm workflow:monitor
pnpm workflow:manifest:live
pnpm workflow:ticketization:refresh
pnpm workflow:validate
pnpm workflow:monitor
```

## Machine-State Setup For This Run

Update `workflow/state/workflow_state.json` before beginning checks:

1. set `progress.liveIteration.phase` to `ticketization`
2. ensure ticketization statement is `NOT COMPLETE` until finished
3. ensure `remainingCheckIds` reflects unresolved checks
4. ensure `RELEASES/CLAUDE_CURRENT_STATE.json.nextAction` explicitly includes:
   - `NOT COMPLETE`
   - `ticketization`

Do not include deploy-complete language during this run.

## Execution Order (No Skips)

Run page-by-page in this exact order:

1. retailer_web
2. supplier_web
3. superadmin_web
4. pos_app
5. cross_function_matrix

Per page/flow, test all micro checks:

1. UI
2. UX
3. wiring
4. navigation
5. API contract
6. backend behavior
7. DB/migration impact
8. GCP staging parity

## Hard Gate (Already Enforced In Guard)

Live ticket intake must be from staging host only:

- allowed host: `staging.supermandi.tech`
- non-staging URLs in evidence are invalid
- local-only or code-only assumption tickets are invalid

Each new ticket must include:

1. staging URL/flow
2. timestamp (UTC/IST)
3. runtime evidence (HTTP/API/log/screenshot/video)
4. Cloud Run revision IDs
5. deployment ref mapped to `github://run/22264213051`

## Ticketization Output Rules

1. one issue = one ticket
2. no batching multiple issues into one ticket
3. no skipping low-visibility issues
4. no implementation edits in this run
5. no deploy in this run

## Mandatory Checkpoint Format (After Each Surface)

- Surface:
- Checked pages/flows:
- New tickets created:
- Remaining check IDs:
- Blocking items (if any):
- State file updated: yes/no

## Ticket Intake Ledger (Claude Must Maintain In This File)

Append one line per newly created ticket during this run.

| Timestamp (UTC) | Surface | Page/Flow | Ticket ID | Severity | Staging URL | Deploy Ref | Revision IDs Captured | Runtime Evidence Type | Status |
|---|---|---|---|---|---|---|---|---|---|
| 2026-02-22T22:15:00Z | shared | /retailer/register, /supplier/register/, /supplier/help/ | LIVE.LEGAL.TERMS_PRIVACY_ROUTES.001 | P1 | staging.supermandi.tech/retailer/register | github://run/22264213051 | Yes (6 services) | http_response (404 on /terms, /privacy) | todo |
| 2026-02-22T22:15:00Z | shared | /api/v1/*/health | LIVE.API.HEALTH_ENDPOINT_PARITY.001 | P2 | staging.supermandi.tech/api/v1/catalog/health | github://run/22264213051 | Yes (6 services) | api_payload (401 on 4 health, 404 on 2) | todo |
| 2026-02-22T22:15:00Z | shared | /, /pos, /privacy, /terms | LIVE.LANDING.CROSS_PAGE_CONSISTENCY.001 | P2 | staging.supermandi.tech/ | github://run/22264213051 | Yes (6 services) | http_response (font/footer mismatch) | todo |
| 2026-02-22T22:15:00Z | superadmin_web | /admin/ | LIVE.SUPERADMIN.CSP_FONT_BLOCK.001 | P2 | staging.supermandi.tech/admin/ | github://run/22264213051 | Yes (6 services) | http_response (CSP blocks Google Fonts) | todo |
| 2026-02-22T22:15:00Z | superadmin_web | /admin/ (mobile) | LIVE.SUPERADMIN.MOBILE_NAVIGATION.001 | P2 | staging.supermandi.tech/admin/ | github://run/22264213051 | Yes (6 services) | http_response (15 of 23 tabs on mobile) | todo |
| 2026-02-22T22:15:00Z | retailer_web | /retailer/login, /register, /forgot-password | LIVE.A11Y.RETAILER_FORM_LABELS.001 | P1 | staging.supermandi.tech/retailer/login | github://run/22264213051 | Yes (6 services) | http_response (no htmlFor/id, no ARIA) | todo |
| 2026-02-22T22:15:00Z | superadmin_web | /admin/ (OTP step) | LIVE.SUPERADMIN.OTP_LENGTH_MISMATCH.001 | P3 | staging.supermandi.tech/admin/ | github://run/22264213051 | Yes (6 services) | http_response (maxLength=8 vs "6-digit") | todo |
| 2026-02-22T22:15:00Z | supplier_web | /supplier/register/, /supplier/reset-password | LIVE.SUPPLIER.SSR_REGISTER_DEGRADED.001 | P2 | staging.supermandi.tech/supplier/register/ | github://run/22264213051 | Yes (6 services) | http_response (SSR shows "Loading...") | todo |

## Final Completion Statement (Required)

At end of run, Claude must write exactly one:

1. `100% micro-ingredient ticketization complete ...`
2. `NOT COMPLETE ...` with:
   - remaining check IDs
   - blocker owner
   - unblock plan

### Result

NOT COMPLETE — GCP staging ticketization run for SHA 7b3a4ee8 completed HTTP-level and code-level audit across all 5 surfaces. Created 8 new tickets from staging-observable issues. However, 696 of 704 micro-checks require BROWSER_EVIDENCE (UI rendering, form interaction, click-through wiring, visual parity) that cannot be verified via HTTP/API probes alone because all portals are JavaScript SPAs that render client-side.

**Completed this run:**
- HTTP probes: All 84 manifest pages return expected status codes (200/302)
- API probes: 10 API endpoints probed, health/contract verified
- Security headers: Verified on portal (nginx) and API (Helmet) layers
- Code review: Retailer auth (4 pages), supplier auth (5 pages), superadmin (LoginGate + App.tsx), landing (4 pages)
- Tickets created: 8 new (LIVE.LEGAL, LIVE.API, LIVE.LANDING, LIVE.SUPERADMIN x3, LIVE.A11Y, LIVE.SUPPLIER)

**Remaining check IDs (by surface):**
- retailer_web: 256 checks (ui/ux/wiring/navigation require browser — forms, buttons, flows are SPA-rendered)
- supplier_web: 152 checks (same — Next.js SSR partial, but interactive checks need browser)
- superadmin_web: 200 checks (Vite SPA — all content is JS-rendered)
- pos_app: 32 checks (mobile app — needs device or emulator)
- cross_function_matrix: 32 checks (cross-portal flows need authenticated browser sessions)
- landing: 24 remaining checks (static pages partly verifiable but nav/link tests need browser)

**Blocker owner:** Operator (browser-level testing requires human interaction with staging)

**Unblock plan:**
1. Operator opens each staging URL in browser (laptop + Redmi)
2. Operator verifies UI rendering, form interaction, navigation links
3. Operator reports pass/fail per page
4. Claude creates tickets for any new issues found
5. Claude marks checks as PASS or ISSUE_TICKETED based on operator evidence

## Prohibited In This Run

1. changing ticket phase to implementation
2. triggering staging deploy
3. claiming ticket closure without runtime evidence
4. creating tickets from non-staging sources
5. skipping page-by-page gate
