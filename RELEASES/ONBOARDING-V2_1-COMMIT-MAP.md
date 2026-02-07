# Onboarding V2.1 — Commit Map

ANCHOR_SHA=6004157
DATE=2026-02-07
BRANCH=main

## Ticket Count

- **23 ticket IDs** implemented (DRX-001..003, RO-001..010, DR-004..013)
- **2 supporting commits** (BB-ENV infra fix, ITER-2 hardening pass)
- **Total: 25 commit entries**

> The "26 tickets" number from earlier sessions included BB-ENV as a ticket.
> Accurate count is **23 unique ticket IDs + 2 supporting commits = 25 entries**.

## Commit Map

| # | Ticket | SHA | Summary | Key Files | Migration? | Tests |
|---|--------|-----|---------|-----------|------------|-------|
| 1 | DRX-002 | `64587b6` | Fix generate_store_code() DB function | `migrations/109_fix_generate_store_code.sql`, `admin/stores.ts` | **Y** (109) | — |
| 2 | RO-006 | `d440046` | De-duplication guarantees (DB constraints) | `migrations/110_ro006_dedup_constraints.sql`, `errorHandler.ts`, `audit-store-data.sql` | **Y** (110) | — |
| 3 | RO-002 | `78d8889` | Unified retailer registration schema (Zod) | `common/src/schemas/retailerRegistration.ts` | N | — |
| 4 | RO-001 | `a0389b0` | Canonical registration API (instant store creation) | `retailer/register.ts`, `retailerRegistrationService.ts`, `migrations/111_registration_events.sql` | **Y** (111) | — |
| 5 | RO-009 | `5f42e35` | Config closure + URL consistency | `onboardingConfig.ts`, `configStatus.ts`, `server.ts`, `docker-compose.local-prod.yml` | N | @config |
| 6 | RO-005 | `560274e` | Cross-surface login linking | `retailer/me.ts` | N | @onboarding |
| 7 | RO-003 | `c29d4e3` | Portal registration UI — instant store creation | `RegisterPage.tsx`, `retailer-admin/App.tsx` | N | — |
| 8 | DRX-001 | `aae91e3` | POS phone OTP capability (Firebase JS SDK) | `firebase.ts`, `phoneOtp.ts` | N | — |
| 9 | RO-004 | `91d66e2` | POS registration screen — register from POS device | `RegisterStoreScreen.tsx` | N | — |
| 10 | RO-007 | `6f85028` | SuperAdmin registration events visibility | `admin/registrationEvents.ts`, `superadmin/App.tsx`, `api/registrationEvents.ts` | N | @onboarding |
| 11 | RO-008 | `d9298b7` | SMS + Email onboarding notifications | `notificationService.ts`, `smsService.ts`, `retailerRegistrationService.ts` | N | — |
| 12 | DRX-003 | `2e398f6` | Registration → Enrollment bridge | `enrollmentCodeService.ts`, `notificationService.ts`, `admin/registrationEvents.ts`, POS screens | N | — |
| 13 | DR-004 | `b783304` | Password/credential strategy for OTP-only | `retailer-admin/auth.ts` | N | — |
| 14 | DR-005 | `c2414bc` | Store status vs state machine alignment | `storeStatusGate.ts`, `pos/enroll.ts` | N | — |
| 15 | DR-006 | `fa4fd32` | Anti-Spam / Abuse Controls for registration | `registrationRateLimiter.ts`, `retailer/register.ts` | N | — |
| 16 | DR-007 | `d61ddba` | Landing Page Register CTA | `supermandi-landing/index.html` | N | — |
| 17 | DR-008 | `22aa238` | POS App Distribution page at /pos | `supermandi-landing/pos.html`, `supermandi-landing/Dockerfile` | N | — |
| 18 | DR-009 | `e1dbd64` | Enumeration-safe responses (GSTIN/phone) | `retailer-admin/registration.ts`, `retailer/register.ts`, `LoginPage.tsx` | N | — |
| 19 | DR-010 | `b9e13d5` | SuperAdmin registration badge with auto-refresh | `superadmin/App.tsx` | N | — |
| 20 | DR-011 | `e9281fb` | Single-store per phone enforcement | `migrations/112_dr011_single_store_per_owner.sql`, `retailer/me.ts` | **Y** (112) | @onboarding |
| 21 | DR-012 | `a0a5fd0` | Legacy application records cleanup + coexistence | `migrations/113_dr012_legacy_application_cleanup.sql`, `retailerRegistrationService.ts` | **Y** (113) | — |
| 22 | DR-013 | `46009cd` | Camera permission for POS enrollment QR scanner | `app.json` | N | — |
| 23 | RO-010 | `db2b4c8` | Runtime smoke tests for onboarding flow | `register.spec.ts`, `cross-surface.spec.ts`, `admin-visibility.spec.ts` | N | @onboarding |

### Supporting Commits

| # | ID | SHA | Summary | Key Files |
|---|-----|-----|---------|-----------|
| 24 | BB-ENV | `b6ed09a` | Add REDIS_HOST + ADMIN_EMAIL_ALLOWLIST to docker-compose | `docker-compose.local-prod.yml` |
| 25 | ITER-2 | `6004157` | Production hardening — 10 gaps fixed | 8 files (inet cast, GSTIN dual-column, catch-block, phone normalize, env.example, migration txn, JSDoc, dedup test) |

## Migrations Summary

| # | File | Ticket | Additive? | Idempotent? |
|---|------|--------|-----------|-------------|
| 109 | `109_fix_generate_store_code.sql` | DRX-002 | Yes (CREATE OR REPLACE, IF NOT EXISTS) | Yes |
| 110 | `110_ro006_dedup_constraints.sql` | RO-006 | Yes (ADD COLUMN IF NOT EXISTS, CREATE INDEX IF NOT EXISTS) | Yes |
| 111 | `111_registration_events.sql` | RO-001 | Yes (CREATE TABLE IF NOT EXISTS, CREATE INDEX IF NOT EXISTS) | Yes |
| 112 | `112_dr011_single_store_per_owner.sql` | DR-011 | Yes (CREATE UNIQUE INDEX IF NOT EXISTS) | Yes |
| 113 | `113_dr012_legacy_application_cleanup.sql` | DR-012 | Yes (UPDATE with idempotent guards) | Yes |

## Test Tags

| Tag | Files | What it covers |
|-----|-------|----------------|
| `@onboarding` | `register.spec.ts`, `cross-surface.spec.ts`, `admin-visibility.spec.ts` | Registration flow, /me endpoint, admin events |
| `@config` | `config-contract.spec.ts` | Env var wiring contract |

## Run Command

```bash
# All onboarding + config contract tests
npx playwright test --grep "@onboarding|@config"

# Or via pnpm alias (e2e-tests/)
pnpm test:onboarding
```
