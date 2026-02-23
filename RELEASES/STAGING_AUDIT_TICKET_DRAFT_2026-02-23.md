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
