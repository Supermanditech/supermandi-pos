# STAGING DEEP AUDIT BACKLOG DRAFT (2026-02-23)

Status: Draft intake only (not activated in workflow state yet).
Source A: Comprehensive staging audit on baseline SHA `badc3fbe` (deploy `github://run/22305359033`).
Source B: Deep audit report (GW/BE/DB/POS/SUP/SA/XF IDs).
Source C: Verified code-read P0 confirmations shared after round 2.
Policy: Every ticket must close at **100% production-grade**. No 93/95/97/99 acceptance language.
Execution mode when activated: WIP=1, strict one-by-one, scope-only commits, no deploy until entire activated batch is complete.

## -1. Round Coverage Lock (Do Not Drop)

- Round 1 coverage (`F-001..F-012`): captured below with explicit mapping/disposition.
- Round 2 coverage (`GW/BE/DB/POS/SUP/SA/XF` IDs): captured below with explicit mapping.
- Round 3: reserved for append-only intake when received.

### Round 1 Mapping (`F-001..F-012`)

| Audit ID | Finding | Draft ticket/disposition | Priority |
|---|---|---|---|
| `F-001` | `/api/v1/platform/stores` auth/public parity mismatch | `LIVE.API.PLATFORM_STORES_PUBLIC_ACCESS_PARITY.001` | P0 |
| `F-002` | health endpoint `gitSha` mismatch vs deployed env `GIT_SHA` | `LIVE.API.HEALTH_GITSHA_ENV_PARITY.001` | P0 |
| `F-003` | iOS force-update URL empty (falls back to Play Store path) | `LIVE.POS.FORCE_UPDATE_IOS_APPSTORE_URL.001` | P0 |
| `F-004` | POS SellScan missing explicit empty state | `LIVE.POS.SELLSCAN_EMPTY_STATE.001` | P1 |
| `F-005` | POS Buy search missing explicit empty state | `LIVE.POS.BUY_SEARCH_EMPTY_STATE.001` | P1 |
| `F-006` | POS enroll deep-link autofill verification gap | `LIVE.POS.ENROLL_DEEPLINK_AUTOFILL_E2E.001` | P1 |
| `F-007` | admin auth rate-limit too aggressive for test/ops flows | `LIVE.ADMIN.AUTH_RATE_LIMIT_TUNING.001` | P1 |
| `F-008` | migration sequence gaps need explicit governance documentation | `LIVE.DB.MIGRATION_GAPS_DOCUMENTATION.001` | P1 |
| `F-009` | supplier trailing slash deep-link behavior | informational, no new ticket | n/a |
| `F-010` | `/api/v1/auth/login` 404 by design | informational, no new ticket | n/a |
| `F-011` | POS enroll validation order (`LABEL_REQUIRED`) | informational, no new ticket | n/a |
| `F-012` | superadmin token storage tradeoff | informational, no new ticket | n/a |

### Round 2 Verified P0 Lock (Code-Read Confirmed)

- `GW-P0-001` confirmed critical: gateway must strip `x-admin-token` -> `LIVE.GW.STORE_ISOLATION.ADMIN_HEADER_STRIP.001`.
- Backend-side trust pair also critical: `isSuperAdmin` must use validated admin role, never raw header presence -> `LIVE.BE.SUPERADMIN_TRUST_MODEL_HARDENING.001` (severity override to P0 for this batch).
- `GW-P0-002` confirmed: missing `trust proxy` -> `LIVE.GW.TRUST_PROXY_CLOUD_RUN.001`.
- `GW-P0-004` confirmed: CORS includes internal-only headers -> `LIVE.GW.CORS_INTERNAL_HEADER_EXPOSURE.001`.
- `XF-P0-001` needs explicit contract verification + fix if required -> `LIVE.POS.ENROLL.DEVICE_TYPE_REQUIRED_PARITY.001`.

## 0. Mandatory Closure Contract (for every ticket)

- Transition flow: `todo -> in_progress -> done` only after complete implementation and evidence.
- Layers: `ui/ux/professional_polish/wiring/navigation/api/backend/db/migration/gcp_parity` must be `pass` or justified `na` with evidence.
- Readiness: `pendingInternal`, `pendingExternal`, `pendingOps` must be empty at completion claim.
- Git discipline (mandatory per ticket):
  1. `pnpm workflow:session-boot -- --file workflow/tickets/<ticket>.json`
  2. transition using guard (`todo -> in_progress`)
  3. implement only ticket scope
  4. run: `node scripts/workflow/guard.js validate-state`
  5. run: `node scripts/workflow/ticket-monitor.js --once`
  6. run: `bash scripts/gates/git-discipline.sh`
  7. commit scope-only
- Deploy policy: keep deploy hold active; park at git for later cumulative staging deploy.

## 1. Phase A (Immediate Activation Candidates)

1. `LIVE.GW.STORE_ISOLATION.ADMIN_HEADER_STRIP.001` (P0) [GW-P0-001]
2. `LIVE.BE.SUPERADMIN_TRUST_MODEL_HARDENING.001` (P0, severity override from round-2 verification)
3. `LIVE.GW.CORS_INTERNAL_HEADER_EXPOSURE.001` (P0) [GW-P0-004]
4. `LIVE.GW.TRUST_PROXY_CLOUD_RUN.001` (P0) [GW-P0-002]
5. `LIVE.GW.CSRF_WEBHOOK_EXEMPTIONS.001` (P0) [GW-P0-003]
6. `LIVE.POS.ENROLL.DEVICE_TYPE_REQUIRED_PARITY.001` (P0) [XF-P0-001]
7. `LIVE.API.PLATFORM_STORES_PUBLIC_ACCESS_PARITY.001` (P0) [F-001]
8. `LIVE.API.HEALTH_GITSHA_ENV_PARITY.001` (P0) [F-002]
9. `LIVE.POS.FORCE_UPDATE_IOS_APPSTORE_URL.001` (P0) [F-003]
10. `LIVE.REPORTS.DAILY_SQL_ITEM_COUNT_FIX.001` (P0) [XF-P0-002]
11. `LIVE.REPORTS.DAILY_PAYMENT_BREAKDOWN_FIX.001` (P0) [XF-P0-003]
12. `LIVE.POS.OFFLINE_QUEUE_STORE_SCOPING.001` (P0) [POS-P0-001]

## 2. Full P0 Intake (Explicit IDs from reports)

### API Gateway P0
- `GW-P0-001` -> `LIVE.GW.STORE_ISOLATION.ADMIN_HEADER_STRIP.001`
- `GW-P0-002` -> `LIVE.GW.TRUST_PROXY_CLOUD_RUN.001`
- `GW-P0-003` -> `LIVE.GW.CSRF_WEBHOOK_EXEMPTIONS.001`
- `GW-P0-004` -> `LIVE.GW.CORS_INTERNAL_HEADER_EXPOSURE.001`

### Backend Security P0 (round-2 verified severity override)
- `BE-P1-002` -> `LIVE.BE.SUPERADMIN_TRUST_MODEL_HARDENING.001`

### API/Cross-Function P0
- `F-001` -> `LIVE.API.PLATFORM_STORES_PUBLIC_ACCESS_PARITY.001`
- `F-002` -> `LIVE.API.HEALTH_GITSHA_ENV_PARITY.001`
- `XF-P0-001` -> `LIVE.POS.ENROLL.DEVICE_TYPE_REQUIRED_PARITY.001`
- `XF-P0-002` -> `LIVE.REPORTS.DAILY_SQL_ITEM_COUNT_FIX.001`
- `XF-P0-003` -> `LIVE.REPORTS.DAILY_PAYMENT_BREAKDOWN_FIX.001`

### POS P0
- `F-003` -> `LIVE.POS.FORCE_UPDATE_IOS_APPSTORE_URL.001`
- `POS-P0-001` -> `LIVE.POS.OFFLINE_QUEUE_STORE_SCOPING.001`
- `POS-P0-002` -> `LIVE.POS.SECURESTORE_FALLBACK_HARDENING.001`

### SuperAdmin P0
- `SA-P0-001` -> `LIVE.SA.INVOICE_API_PATH_SANITIZATION.001`
- `SA-P0-002` -> `LIVE.SA.INVOICE_API_ERROR_SANITIZATION.001`
- `SA-P0-003` -> `LIVE.SA.WHATSAPP_API_ERROR_SANITIZATION.001`
- `SA-P0-004` -> `LIVE.SA.RBAC_TAB_ACTION_ENFORCEMENT.001`

### Database P0 (exact details pending expanded audit attachment)
- `DB-P0-001` -> `LIVE.DB.RLS_CRITICAL_GAP_001.001`
- `DB-P0-002` -> `LIVE.DB.RLS_CRITICAL_GAP_002.001`
- `DB-P0-003` -> `LIVE.DB.RLS_CRITICAL_GAP_003.001`
- `DB-P0-004` -> `LIVE.DB.RLS_CRITICAL_GAP_004.001`
- `DB-P0-005` -> `LIVE.DB.RLS_CRITICAL_GAP_005.001`
- `DB-P0-006` -> `LIVE.DB.MIGRATION_RUNNER_LOCK_CRASH_SAFETY.001`
- `DB-P0-007` -> `LIVE.DB.MIGRATION_DUPLICATE_NUMBER_ORDERING.001`
- `DB-P0-008` -> `LIVE.DB.CRITICAL_MIGRATION_INTEGRITY_008.001`

### Supplier P0
- `SUP-P0-001` -> `LIVE.SUP.AUTH.SERVER_SIDE_ENFORCEMENT.001`
- `SUP-P0-002` -> `LIVE.SUP.LIMITED_MODE_ENFORCEMENT.001`

## 3. P1 Intake (Explicit IDs from reports)

### Round 1 P1
- `F-004` -> `LIVE.POS.SELLSCAN_EMPTY_STATE.001`
- `F-005` -> `LIVE.POS.BUY_SEARCH_EMPTY_STATE.001`
- `F-006` -> `LIVE.POS.ENROLL_DEEPLINK_AUTOFILL_E2E.001`
- `F-007` -> `LIVE.ADMIN.AUTH_RATE_LIMIT_TUNING.001`
- `F-008` -> `LIVE.DB.MIGRATION_GAPS_DOCUMENTATION.001`

### Backend Security P1
- `BE-P1-001` -> `LIVE.BE.JWT_ALGORITHM_PINNING.001`
- `BE-P1-003` -> `LIVE.BE.DOC_UPLOAD_AUTH_VALIDATION.001`
- `BE-P1-004` -> `LIVE.BE.JWT_ADMIN_ISSUER_ENFORCEMENT.001`
- `BE-P1-005` -> `LIVE.BE.CHAT_WS_JWT_CONSTRAINTS.001`

### Gateway P1
- `GW-P1-001` -> `LIVE.GW.HEALTH_BYPASS_EXPLICIT_ALLOWLIST.001`
- `GW-P1-002` -> `LIVE.GW.ADMIN_PUBLIC_PATH_EXACT_MATCH.001`
- `GW-P1-003` -> `LIVE.GW.RATE_LIMIT_REDIS_BACKED.001`
- `GW-P1-004` -> `LIVE.GW.JWT_SECRET_FALLBACK_REMOVAL.001`
- `GW-P1-005` -> `LIVE.GW.SUPPLIER_REGISTER_TRAILING_SLASH_PARITY.001`

### POS P1
- `POS-P1-001` -> `LIVE.POS.SPLIT_PAYMENT_NAV_REPLACE.001`
- `POS-P1-002` -> `LIVE.POS.CAMERA_TIMEOUT_COPY_PARITY.001`
- `POS-P1-003` -> `LIVE.POS.TRANSIENT_NETWORK_RETRY_BACKOFF.001`
- `POS-P1-004` -> `LIVE.POS.CART_TOTAL_SHARED_UTILITY.001`
- `POS-P1-005` -> `LIVE.POS.PHONE_VALIDATION_STRICT_REGEX.001`
- `POS-P1-006` -> `LIVE.POS.OFFLINE_QUEUE_CONSOLIDATION.001`
- `POS-P1-007` -> `LIVE.POS.AMOUNT_PRECISION_AND_CAP.001`
- `POS-P1-008` -> `LIVE.POS.SESSION_LOGGING_DEV_GUARD.001`

### SuperAdmin P1
- `SA-P1-001` -> `LIVE.SA.STORE_DIRECTORY_PAGINATION.001`
- `SA-P1-002` -> `LIVE.SA.WHATSAPP_PHONE_VALIDATION.001`
- `SA-P1-003` -> `LIVE.SA.LOGIN_EMAIL_VALIDATION_STRICT.001`
- `SA-P1-004` -> `LIVE.SA.OTP_RESEND_COUNTDOWN_AFTER_SUCCESS.001`
- `SA-P1-005` -> `LIVE.SA.INVOICE_PDF_AUTH_GUARD.001`
- `SA-P1-006` -> `LIVE.SA.AI_ENDPOINT_PREFIX_PARITY.001`

### Cross-Function P1
- `XF-P1-001` -> `LIVE.XF.UI_STATUS_UPI_VPA_PARITY.001`
- `XF-P1-002` -> `LIVE.XF.DUAL_INVENTORY_RECONCILIATION.001`
- `XF-P1-003` -> `LIVE.XF.ENROLLMENT_ACTIVE_DEVICE_COUNT_RESPONSE.001`

### Retailer P1
- `RET-P1-001` -> `LIVE.RET.SKU_PDF_AUTH_DOWNLOAD_PATH.001`

## 4. P2 Intake (Documented for later atomic split)

The report lists 50+ P2 findings. Keep these as pending intake until full granular list with file+line is supplied, then split into one ticket per issue.
Seed themes:
- error sanitization gaps
- hardcoded dev secret remnants
- fail-open paths on DB/Redis outage
- service leakage in 503 paths
- chat/credit policy coverage
- scanner memory growth limits
- POS certificate pinning
- staff PIN transmission hardening
- CSP strictness for retailer/superadmin
- superadmin component decomposition
- polling rationalization
- form validation consistency

## 5. Activation Checklist (when operator says ACTIVATE)

1. Convert this draft list into schema-valid `workflow/tickets/*.json` tickets.
2. Set machine-state batch queue in `workflow/state/workflow_state.json`.
3. Keep deploy hold active (`deployApproval.approved=false`).
4. Start implementation from first ticket only.
5. No staging deploy until active batch remaining tickets is zero.

## 6. Round 3 Mega-Audit Lock (12-Agent Consolidated Intake)

Source D: Mega-report (2026-02-23), 41 P0 + 68 P1 + 80+ P2.

- This section is append-only and mandatory for future activation.
- No finding from Source D may be silently dropped.
- Any duplicate issue IDs must map to one canonical ticket with explicit dedupe note.
- If severity conflicts across rounds, highest severity wins until closure evidence proves otherwise.

### 6.1 Round 3 P0 Mapping Ledger (41 findings, explicit traceability)

| # | Audit Ref | Finding (short) | Canonical Draft Ticket | Disposition |
|---|---|---|---|---|
| 1 | Security-1 | Gateway does not strip `x-admin-token` | `LIVE.GW.STORE_ISOLATION.ADMIN_HEADER_STRIP.001` | existing |
| 2 | Security-2 | `isSuperAdmin` trusts header presence | `LIVE.BE.SUPERADMIN_TRUST_MODEL_HARDENING.001` | existing, P0 override |
| 3 | Security-3 | CORS allows `x-admin-token`/internal headers | `LIVE.GW.CORS_INTERNAL_HEADER_EXPOSURE.001` | existing |
| 4 | Security-4 | RLS context never activated in runtime | `LIVE.DB.RLS_CONTEXT_RUNTIME_ENFORCEMENT.001` | new |
| 5 | Security-5 | `UPDATE sales` without `store_id` scope | `LIVE.BE.STORE_ISOLATION.UPDATE_SALES_SCOPE.001` | new |
| 6 | Security-6 | `UPDATE sell_payments` without `store_id` | `LIVE.BE.STORE_ISOLATION.UPDATE_SELL_PAYMENTS_SCOPE.001` | new |
| 7 | Security-7 | `UPDATE sales status` without `store_id` | `LIVE.BE.STORE_ISOLATION.UPDATE_SALES_STATUS_SCOPE.001` | new |
| 8 | Security-8 | Sync path updates sales without `store_id` | `LIVE.BE.STORE_ISOLATION.SYNC_UPDATE_SALES_SCOPE.001` | new |
| 9 | Security-9 | Sync path updates payments without `store_id` | `LIVE.BE.STORE_ISOLATION.SYNC_UPDATE_PAYMENTS_SCOPE.001` | new |
| 10 | Security-10 | Refund path updates inventory ledger without store scope | `LIVE.BE.STORE_ISOLATION.REFUND_LEDGER_SCOPE.001` | new |
| 11 | Security-11 | Dues update without store scope | `LIVE.BE.STORE_ISOLATION.CUSTOMER_DUES_SCOPE.001` | new |
| 12 | Security-12 | Store-context update touches global catalog products | `LIVE.RET.PRODUCTS.GLOBAL_CATALOG_SCOPE_GUARD.001` | new |
| 13 | Security-13 | OTP codes logged in production path | `LIVE.SECRETS.OTP_LOG_REDACTION.001` | new |
| 14 | Security-14 | Test auth router mounted without production guard | `LIVE.BE.TEST_AUTH_ROUTE_PROD_GUARD.001` | new |
| 15 | Security-15 | Document upload auth checks presence only | `LIVE.BE.DOC_UPLOAD_AUTH_VALIDATION.001` | existing |
| 16 | Security-16 | Content-Disposition header injection risk | `LIVE.BE.DOCUMENTS.CONTENT_DISPOSITION_SANITIZATION.001` | new |
| 17 | Biz-1 | Opening stock mutates balances without ledger rows | `LIVE.BIZ.OPENING_STOCK_LEDGER_INTEGRITY.001` | new |
| 18 | Biz-2 | Sale cancellation does not reverse inventory | `LIVE.BIZ.SALE_CANCELLATION_INVENTORY_REVERSAL.001` | new |
| 19 | Biz-3 | Daily closing uses wrong status filter | `LIVE.REPORTS.DAILY_STATUS_FILTER_PARITY.001` | new |
| 20 | Biz-4 | UPI/Cash confirm misses `stock_quantity` for retail variants | `LIVE.BIZ.PAYMENT_CONFIRM_STOCK_QUANTITY_PARITY.001` | new |
| 21 | Biz-5 | Cancelled sales leave orphan ledger deductions | `LIVE.BIZ.SALE_CANCELLATION_INVENTORY_REVERSAL.001` | dedupe to #18 |
| 22 | Biz-6 | Opening stock causes ledger mismatch | `LIVE.BIZ.OPENING_STOCK_LEDGER_INTEGRITY.001` | dedupe to #17 |
| 23 | Input-1 | Voice order prompt-injection vector | `LIVE.AI.VOICE_PROMPT_INJECTION_GUARD.001` | new |
| 24 | Input-2 | Superadmin AI analytics prompt-injection vector | `LIVE.SA.AI_PROMPT_INJECTION_GUARD.001` | new |
| 25 | Race-1 | Sync mid-loop `COMMIT` breaks transaction atomicity | `LIVE.SYNC.BATCH_TRANSACTION_ATOMICITY_SAVEPOINT.001` | new |
| 26 | Race-2 | Stock-in idempotency TOCTOU race | `LIVE.STOCKIN.IDEMPOTENCY_SINGLE_TX_LOCK.001` | new |
| 27 | Race-3 | Shift start allows double-open due to no transaction guard | `LIVE.SHIFTS.START_DOUBLE_OPEN_GUARD.001` | new |
| 28 | Sync-1 | Legacy offline queue key not store-scoped | `LIVE.POS.OFFLINE_QUEUE_STORE_SCOPING.001` | existing |
| 29 | Sync-2 | Legacy queue drops events after 3 retries | `LIVE.POS.OFFLINE_QUEUE_RETRY_POLICY_HARDENING.001` | new |
| 30 | Sync-3 | Client rejects retriable sync events permanently | `LIVE.POS.SYNC_RETRYABLE_REJECTION_GUARD.001` | new |
| 31 | Frontend-1 | Superadmin JWT persisted in localStorage | `LIVE.SA.AUTH_TOKEN_STORAGE_HARDENING.001` | new |
| 32 | Frontend-2 | Superadmin bearer token model JS-accessible | `LIVE.SA.AUTH_TOKEN_STORAGE_HARDENING.001` | dedupe to #31 |
| 33 | Secrets-1 | Enrollment codes logged plaintext | `LIVE.SECRETS.ENROLLMENT_CODE_LOG_REDACTION.001` | new |
| 34 | Secrets-2 | Supplier non-prod response includes `devToken` | `LIVE.SUP.AUTH.DEVTOKEN_RESPONSE_REDACTION.001` | new |
| 35 | Secrets-3 | Supplier non-prod response includes `devCode` | `LIVE.SUP.AUTH.DEVCODE_RESPONSE_REDACTION.001` | new |
| 36 | Secrets-4 | Retailer non-prod response includes `devToken` | `LIVE.RET.AUTH.DEVTOKEN_RESPONSE_REDACTION.001` | new |
| 37 | Secrets-5 | Supplier OTP logged in verification flow | `LIVE.SUP.AUTH.OTP_LOG_REDACTION.001` | new |
| 38 | Secrets-6 | Raw `device_token` returned in API response | `LIVE.POS.ENROLL.DEVICE_TOKEN_RESPONSE_MINIMIZATION.001` | new |
| 39 | Migrate-1 | Duplicate migration numbers (`100`,`101`,`108`) | `LIVE.DB.MIGRATION_DUPLICATE_NUMBER_ORDERING.001` | existing |
| 40 | Migrate-2 | `orders.payments` table reference without schema creation parity | `LIVE.DB.ORDERS_PAYMENTS_SCHEMA_PARITY.001` | new |
| 41 | Migrate-3 | Sales status enum contradiction across migrations | `LIVE.DB.SALES_STATUS_ENUM_PARITY.001` | new |

### 6.2 Round 3 P0 Immediate Bundle (deploy-blocking once activated)

1. `LIVE.GW.STORE_ISOLATION.ADMIN_HEADER_STRIP.001`
2. `LIVE.BE.SUPERADMIN_TRUST_MODEL_HARDENING.001`
3. `LIVE.GW.CORS_INTERNAL_HEADER_EXPOSURE.001`
4. `LIVE.GW.TRUST_PROXY_CLOUD_RUN.001`
5. `LIVE.DB.RLS_CONTEXT_RUNTIME_ENFORCEMENT.001`
6. `LIVE.REPORTS.DAILY_STATUS_FILTER_PARITY.001`
7. `LIVE.BIZ.SALE_CANCELLATION_INVENTORY_REVERSAL.001`
8. `LIVE.BIZ.PAYMENT_CONFIRM_STOCK_QUANTITY_PARITY.001`
9. `LIVE.SYNC.BATCH_TRANSACTION_ATOMICITY_SAVEPOINT.001`
10. `LIVE.STOCKIN.IDEMPOTENCY_SINGLE_TX_LOCK.001`

## 7. Round 3 P1/P2 Intake Policy (No Loss)

- Round 3 reports `68` P1 and `80+` P2 findings.
- These remain mandatory backlog and cannot be dropped before atomic split.
- For each P1/P2 finding, required expansion tuple:
  - `auditRef`
  - `file:line`
  - `impact`
  - `fix`
  - `canonical ticket id`

## 8. Activation Guard for Round 3

When operator says ACTIVATE_ROUND3:

1. Create schema-valid ticket JSON per canonical ID in section 6.1.
2. Mark dedupe tickets via `relatedTickets` to avoid duplicate execution.
3. Inject queue in `workflow/state/workflow_state.json` with WIP=1 and deploy hold still true.
4. Enforce no deploy while any activated P0 remains non-done.
5. Keep cumulative deploy scope parked at git until all activated tickets are done.

## 9. Round 4 Mega-Audit Intake Lock (No-Loss, Source-Classified)

Source E: `RELEASES/DEEP_PRODUCTION_AUDIT_R4.md`

- Date in report: `2026-02-23`
- Method in report: static code analysis of local repo, no live servers contacted
- Branch/SHA in report: `main @ 9975471e`
- Classification: `REPO_ANALYSIS` (not live-runtime staging evidence)

Round 4 extracted ledger:

- File: `RELEASES/DEEP_PRODUCTION_AUDIT_R4_FINDINGS_LEDGER_2026-02-23.json`
- Extraction scope: markdown category tables (`A-1`..`I-3`)
- Extracted findings rows: `140`
- Severity counts (table rows): `P0=43`, `P1=78`, `P2=19`
- Category counts: `A=13`, `B=29`, `C=21`, `D=14`, `E=26`, `F=8`, `G=11`, `H=15`, `I=3`

No-loss rules for Source E:

1. Every extracted row in the JSON ledger must map to exactly one canonical ticket ID before activation.
2. Duplicates are allowed only with explicit `dedupeTo` pointer.
3. No row deletion or omission is allowed without explicit disposition:
  - `informational`
  - `duplicate`
  - `already-fixed-on-newer-sha`
  - `invalid-finding`
4. Any row marked `already-fixed-on-newer-sha` must include:
  - fixing commit SHA
  - regression test ref
  - staging runtime proof after deploy

### 9.1 Source-of-Truth Enforcement Matrix (Rounds 1-4)

| Round | Source Class | Can create implementation ticket directly? | Runtime re-validation required before closure? |
|---|---|---|---|
| Round 1 | hybrid (staging sweep + code-review checks) | yes | yes |
| Round 2 | repo code-read confirmations | yes | yes |
| Round 3 | repo deep-audit intake | yes | yes |
| Round 4 | repo static analysis (20 agents) | yes | yes (mandatory for all P0/P1) |

### 9.2 Round 4 Activation Gate

When operator says `ACTIVATE_ROUND4`:

1. Generate canonical ticket IDs for all Source-E ledger rows.
2. Populate per-ticket fields:
  - `origin.sourceClass = REPO_ANALYSIS`
  - `origin.reportRef = RELEASES/DEEP_PRODUCTION_AUDIT_R4.md`
  - `origin.rowId = <A-1|B-3|...>`
  - `runtimeValidation.required = true`
3. Keep deploy hold active (`deployApproval.approved=false`) while any activated P0/P1 remains open.
4. Closure requires both:
  - implementation evidence
  - post-fix runtime evidence on latest staging deploy SHA
