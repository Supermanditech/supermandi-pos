# Claude Live Staging Micro-Audit Prompt (Copy/Paste)

Use this instruction exactly:

```text
Execute exhaustive LIVE micro-audit and ticketization from GCP staging only.

Mandatory source of truth:
1) workflow/state/live_micro_audit_state_machine.json
2) workflow/state/live_page_manifest.json
3) workflow/state/live_micro_check_queue.json
4) workflow/state/live_ticketization_progress.json
5) workflow/state/workflow_state.json

Hard rules:
- No local-only assumptions. No code-audit-only closure. Evidence must come from staging runtime/browser.
- No sampling and no page skipping.
- Page-by-page gate is mandatory: complete all micro-checks for current page (`progress.liveIteration.ticketization.currentPageId`) before touching the next page.
- Cover every route/flow/component/action from manifest.
- One issue = one atomic ticket.
- Do not start implementation or deploy.
- Park work in git after ticketization and wait for operator-approved batch execution.

Execution order (strict):
1) Retailer web
2) Supplier web
3) Superadmin web
4) POS app
5) Cross-function matrix
6) Ticket quality gate

Page cursor control:
- Start with `pnpm workflow:ticketization:refresh` to initialize queue and set current page pointer.
- After finishing each page, refresh/update progress so `currentPageId` advances automatically.
- `pnpm workflow:validate` must stay PASS; any page-skip violation means stop and return to the first incomplete page.

For each micro-check, validate all 8 layers:
- ui
- ux
- wiring
- navigation
- api_contract
- backend_behavior
- db_migration_impact
- gcp_staging_parity

Auth flow minimums (end-to-end in browser/runtime):
- Retailer: login password, login OTP, forgot password, registration full form, document upload, success state.
- Supplier: login email/password, login OTP, forgot password, registration full form, document upload, success state.
- Superadmin: email OTP login + unauthorized handling.
- POS: auth/device/scan/cart/checkout flow using staging APIs and POS runtime.

Ticket evidence contract per issue:
- staging URL or flow ID
- observed UTC timestamp
- deploy run ref
- commit SHA
- relevant Cloud Run revision IDs
- runtime evidence (HTTP payload/log/screenshot/video)
- repro steps
- expected vs actual
- severity

Output format required at end:
1) Surface coverage matrix with PASS / ISSUE_TICKETED / BLOCKED counts
2) Full new ticket list
3) Remaining check IDs (if any)
4) Explicit statement: "100% micro-ingredient ticketization complete" OR "NOT COMPLETE"

Do not move to implementation/deploy in this run.
```
