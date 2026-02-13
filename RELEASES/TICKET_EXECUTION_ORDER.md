# Post-Deploy Ticket Execution Order

> **After staging deploy verified, tickets execute in this order.**
> Phase 1 (Security) MUST complete before Phase 2 starts.

---

## Phase 1: SECURITY — P0 Backend (7 tickets)

These are already merged to main via AUDIT PRs. Verify they work on staging.

| Order | Ticket | Summary | Status |
|-------|--------|---------|--------|
| 1 | AUDIT-API-001 | SQL template literal → parameterized query (enroll.ts) | MERGED, verify on staging |
| 2 | AUDIT-API-002 | SQL template literal → parameterized query (tokenSecurity.ts) | MERGED, verify on staging |
| 3 | AUDIT-API-003 | Remove JWT secret from console logs | MERGED, verify on staging |
| 4 | AUDIT-API-004 | Remove hardcoded payout API key fallback | MERGED, verify on staging |
| 5 | AUDIT-API-005 | Add auth to demo seed endpoint | MERGED, verify on staging |
| 6 | AUDIT-API-006 | Add storeId filter to voice endpoint | MERGED, verify on staging |
| 7 | AUDIT-API-007 | Fail-fast on missing security env vars | MERGED, verify on staging |

**Gate**: All 7 verified on staging → Phase 1 DONE

---

## Phase 2: BROKEN FUNCTIONALITY — P0 Cross-Platform (13 tickets)

| Order | Ticket | Portal | Summary | Status |
|-------|--------|--------|---------|--------|
| 8 | AUDIT-SUP-001 | Supplier | Auth guard on /supplier/onboard | TO FIX |
| 9 | AUDIT-SUP-002 | Supplier | Remove dead forgot-password link | TO FIX |
| 10 | AUDIT-SUP-003 | Supplier | Sanitize error.tsx stack traces | TO FIX |
| 11 | AUDIT-SUP-004 | Supplier | Sanitize global-error.tsx | TO FIX |
| 12 | AUDIT-SUP-005 | Supplier | Fix root page infinite loading | TO FIX |
| 13 | AUDIT-SUP-006 | Supplier | Remove orphan upload page | TO FIX |
| 14 | AUDIT-POS-001 | POS | Fix purchase history monetary values | TO FIX |
| 15 | AUDIT-POS-002 | POS | Wire Review Order button handler | TO FIX |
| 16 | AUDIT-POS-003 | POS | Fix BNPL dispute false success | TO FIX |
| 17 | AUDIT-RET-003 | Retailer | Fix Firebase credentials: include | TO FIX |
| 18 | AUDIT-RET-030 | Retailer | Fix useState anti-pattern | TO FIX |
| 19 | AUDIT-SA-001 | SuperAdmin | Split 6256-line monolith App.tsx | TO FIX |
| 20 | AUDIT-SA-008 | SuperAdmin | Add responsive/mobile layout | TO FIX |

**Gate**: All P0s fixed + verified on staging → Phase 2 DONE

---

## Phase 3: DATA INTEGRITY — P1 Backend (14 tickets)

| Order | Ticket | Summary |
|-------|--------|---------|
| 21 | AUDIT-API-008 | Fix connection leak in csvImport.ts |
| 22 | AUDIT-API-009 | Add phone validation to supplier registration |
| 23 | AUDIT-API-010 | Fix BNPL partial payment status |
| 24 | AUDIT-API-011 | Add idempotency key to stock-in |
| 25 | AUDIT-API-012 | Fix timing-unsafe Razorpay signature comparison |
| 26 | AUDIT-API-013 | Fix 2 remaining connection leaks |
| 27 | AUDIT-API-014 | Remove all dev-secret fallbacks |
| 28 | AUDIT-API-015 | Redact PII from audit logs |
| 29 | AUDIT-API-016 | Require customer_phone for DUE payments |
| 30 | AUDIT-API-017 | Add store isolation to BNPL queries |
| 31 | AUDIT-API-018 | Add store isolation to UPI status check |
| 32 | AUDIT-API-019 | Fix gateway trust model for direct backend access |
| 33 | AUDIT-API-020 | Better error for serialization conflicts |
| 34 | AUDIT-API-021 | Clean up voice endpoint temp files |

---

## Phase 4: P1 Portal Fixes (75 tickets)

Grouped by portal, one portal at a time:
- Retailer Admin: 19 P1 tickets (AUDIT-RET-*)
- Supplier Portal: 20 P1 tickets (AUDIT-SUP-*)
- SuperAdmin: 20 P1 tickets (AUDIT-SA-*)
- POS Mobile: 16 P1 tickets (AUDIT-POS-*)

---

## Phase 5: P2 Hardening (~210 tickets)

Deferred until all P0 + P1 complete. Categories:
- Security hardening (15)
- UX 4-state coverage (25+)
- Accessibility (20+)
- Performance (15+)
- Code quality (15+)
- i18n (10+)
- Mobile responsiveness (5+)

---

## Test Coverage Gaps (D2)

| Platform | Current Tests | Critical Gap | Priority |
|----------|--------------|--------------|----------|
| Backend | 16 files (integration) | No per-service unit tests, no contract tests, no security tests | HIGH |
| POS | 22 files (Jest + Maestro) | No component rendering tests | MEDIUM |
| Retailer Admin | **0 files** | **ZERO coverage** — no unit, component, or E2E | CRITICAL |
| Supplier Portal | **0 files** | **ZERO coverage** — no unit, component, or E2E | CRITICAL |
| SuperAdmin | **0 files** | **ZERO coverage** — no unit, component, or E2E | CRITICAL |
| E2E Playwright | 16 specs | No portal user flow tests (only onboarding + sync) | HIGH |

**Strategy**: For the 3 portals with zero tests, add Playwright E2E smoke tests as part of each portal's Phase 4 tickets. Don't block ticket work waiting for unit tests — the CI gates (typecheck + lint + build) plus Playwright E2E provide baseline coverage.

---

## Numbering Convention (C4)

```
INFRA-001 to INFRA-009    ← Infrastructure (COMPLETED or IN PROGRESS)
BUG-001 to BUG-004        ← Pre-deploy bug fixes (COMPLETED)
AUDIT-API-001 to 021      ← Backend API audit tickets
AUDIT-RET-001 to 068      ← Retailer Admin audit tickets
AUDIT-SUP-001 to 065      ← Supplier Portal audit tickets
AUDIT-SA-001 to 064       ← SuperAdmin audit tickets
AUDIT-POS-001 to 060      ← POS Mobile audit tickets
POST-001+                  ← New tickets discovered during Phase 2+
```

All existing AUDIT-* IDs from AUDIT_BACKLOG.md are preserved. No renumbering.
