# R5 AUDIT — DEDUPE MAP AGAINST FROZEN 204 SCOPE

**HEAD SHA**: `f05165b8`
**Frozen Scope**: POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203 (203 + 1 delta = 204)
**Runtime Baseline**: `badc3fbe` (stale-runtime-baseline)
**Audit Date**: 2026-02-24

---

## 1. Raw Findings Summary

| Surface | Raw Count | P0 | P1 | P2 |
|---------|-----------|----|----|-----|
| POS (critical 15) | 25 | 2 | 8 | 15 |
| POS (remaining 29) | 28 | 1 | 8 | 19 |
| Retailer Web | 40 | 0 | 12 | 28 |
| Supplier Web | 36 | 5 | 10 | 21 |
| SuperAdmin Web | 26 | 5 | 7 | 14 |
| Backend Services | 25 | 5 | 8 | 12 |
| **TOTAL RAW** | **180** | **18** | **53** | **109** |

---

## 2. Overlap with Frozen 204 Tickets

These R5 findings map to existing frozen tickets. Tagged as **REVALIDATION** — the frozen ticket addressed the area but R5 found residual or deeper issues.

| R5 Finding | Frozen Ticket | Overlap Type | Disposition |
|------------|---------------|-------------|-------------|
| R5-POS-004 (camera timeout "5s" text) | LIVE.POS.CAMERA_TIMEOUT_COPY_PARITY.001 | RESIDUAL — timeout changed to 45s but UI text still says "5s" | Update frozen ticket with R5 revalidation note |
| R5-POS-005 (empty APP_STORE_URL) | LIVE.POS.FORCE_UPDATE_IOS_APPSTORE_URL.001 | KNOWN DEPENDENCY — frozen ticket documented operator provides URL post-submission | Update frozen ticket with R5 revalidation note |
| R5-POS-003 (float money ×100) | LIVE.POS.AMOUNT_PRECISION_AND_CAP.001 | PARTIAL — frozen ticket capped amounts; R5 found precision bug across 5 screens (9 occurrences) | NEW finding (broader scope than frozen) |
| R5-RET-013 (SKU PDF auth) | LIVE.RET.SKU_PDF_AUTH_DOWNLOAD_PATH.001 | RESIDUAL — frozen ticket fixed path; R5 found auth header still missing on download | Update frozen ticket with R5 revalidation note |
| R5-RET-038 (paise/rupee format) | LIVE.RET.BUY_REORDER_PRICE_DOUBLE_CONVERSION_FIX.001 | PARTIAL — frozen ticket fixed reorder; R5 found inconsistency across other pages | NEW finding (broader scope) |
| R5-SA-006 (no tab RBAC) | LIVE.SA.RBAC_TAB_ACTION_ENFORCEMENT.001 | RESIDUAL — frozen ticket added action-level RBAC; R5 found tab-level visibility still unguarded | Update frozen ticket with R5 revalidation note |
| R5-SA-015 (WA phone validation) | LIVE.SA.WHATSAPP_PHONE_VALIDATION.001 | RESIDUAL — frozen ticket added backend validation; R5 found frontend validation still minimal | Update frozen ticket with R5 revalidation note |
| R5-SA-020 (store directory pagination) | LIVE.SA.STORE_DIRECTORY_PAGINATION.001 | RESIDUAL — frozen ticket added backend pagination; R5 found frontend doesn't use it | Update frozen ticket with R5 revalidation note |
| R5-BE-013 (JWT issuer mismatch) | LIVE.BE.JWT_ADMIN_ISSUER_ENFORCEMENT.001 | RESIDUAL — frozen ticket enforced issuer; R5 found admin session uses different issuer | Update frozen ticket with R5 revalidation note |
| R5-BE-008 (in-memory rate limit) | LIVE.GW.RATE_LIMIT_REDIS_BACKED.001 | PARTIAL — frozen ticket moved gateway to Redis; admin auth still uses in-memory | NEW finding (different component) |
| R5-BE-025 (localhost fallback) | LIVE.GW.MAIN_BACKEND_URL_FAIL_FAST.001 | PARTIAL — frozen ticket added fail-fast for gateway; admin auth proxy still has fallback | NEW finding (different file) |

**Dedupe Result:**
- **8 frozen tickets updated with R5 revalidation note** (residual issues found)
- **3 findings reclassified as NEW** (broader scope than frozen ticket)
- **169 findings are truly NEW** (no overlap with frozen 204)

---

## 3. Dedupe-Adjusted Totals

| Category | Count |
|----------|-------|
| Total raw R5 findings | 180 |
| Overlap (revalidation note on frozen) | 8 |
| Reclassified as broader-scope NEW | 3 |
| **Net NEW findings** | **172** |
| **Frozen tickets updated** | **8** |

---

## 4. New Findings by Severity (After Dedupe)

| Severity | Count |
|----------|-------|
| P0 (Critical) | 18 |
| P1 (High) | 49 |
| P2 (Medium) | 105 |
| **Total NEW** | **172** |

---

## 5. Frozen Tickets Requiring R5 Revalidation Update

| Frozen Ticket ID | R5 Finding | Revalidation Note |
|------------------|------------|-------------------|
| LIVE.POS.CAMERA_TIMEOUT_COPY_PARITY.001 | R5-POS-004 | UI text still shows "5s" while actual timeout is 45s |
| LIVE.POS.FORCE_UPDATE_IOS_APPSTORE_URL.001 | R5-POS-005 | APP_STORE_URL still empty — operator dependency documented |
| LIVE.RET.SKU_PDF_AUTH_DOWNLOAD_PATH.001 | R5-RET-013 | Download path fixed but auth header not attached to PDF fetch |
| LIVE.SA.RBAC_TAB_ACTION_ENFORCEMENT.001 | R5-SA-006 | Action RBAC added but tab-level visibility has no role filtering |
| LIVE.SA.WHATSAPP_PHONE_VALIDATION.001 | R5-SA-015 | Backend validation present; frontend send form accepts any non-empty input |
| LIVE.SA.STORE_DIRECTORY_PAGINATION.001 | R5-SA-020 | Backend paginated; frontend fetches all stores in single request |
| LIVE.BE.JWT_ADMIN_ISSUER_ENFORCEMENT.001 | R5-BE-013 | Auth-service issuer `supermandi-auth` vs admin session issuer `supermandi-admin` |
| LIVE.POS.AMOUNT_PRECISION_AND_CAP.001 | R5-POS-003 | Amount cap fixed; float ×100 precision bug remains across 5 screens |

---

## 6. Cross-Function Findings (Not In Any Frozen Ticket)

| R5 ID | Flow | Surfaces | Severity | Issue |
|-------|------|----------|----------|-------|
| R5-BE-005 | GRN → Inventory | backend (order + inventory) | P0 | HTTP-before-commit: stock updated but GRN record fails → permanent inconsistency |
| R5-BE-004 | Inventory → Ledger | backend (inventory) | P0 | `getLedgerEntriesByReference` missing store_id → cross-store data leak |
| R5-SUP-010 | Supplier Profile ↔ KYC | supplier_web | P1 | Two conflicting bank detail update paths |
| R5-SUP-005 | Auth ↔ API client | supplier_web | P0 | Logout redirect race between auth.tsx and api.ts 401 handler |
| R5-POS-054 | POS → Orders (multiple suppliers) | pos → backend | P0 | Sequential order creation: partial failure leaves inconsistent state |
| R5-SA-001/002 | Admin → Finance | superadmin_web → backend | P0 | Refund approve + Invoice issue: no confirmation dialog |
| R5-BE-001/002/003 | All → Backend services | all → backend | P0 | Multiple services have NO service-level auth (defense-in-depth gap) |

---

## 7. GCP Parity Findings Tagged `stale-runtime-baseline`

All GCP parity findings are tagged because runtime baseline `badc3fbe` does not match HEAD `f05165b8`. These cannot be verified until staging deploy.

| R5 ID | Issue | Requires Runtime Verify |
|-------|-------|------------------------|
| R5-SA-005 | MonitoringTab hardcoded infra values | YES — need live GCP console comparison |
| R5-SA-016 | Service URL column shows invalid Cloud Run format | YES — need actual Cloud Run URLs |
| R5-BE-016 | Voice service in-memory store incompatible with Cloud Run | YES — need multi-instance test |
| R5-BE-019 | POS rate limiting uses DB writes (perf under Cloud Run) | YES — need load test on staging |
| R5-BE-025 | Admin auth hardcoded localhost fallback | YES — verify env var set in Cloud Run |
| R5-POS-025 | No hardcoded URLs (clean baseline) | PASS — no runtime verify needed |
| R5-SA-013 | Self-contained tabs use relative URLs | CONDITIONAL — works if portal behind gateway |

**Total stale-runtime-baseline tagged**: 6 findings requiring staging deploy for verification
