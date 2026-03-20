# SuperMandi GCP-STG Implementation Plan

## Overview
280 tickets organized into 16 batches by dependency chain and layer.

## Batch Summary

| Batch | Name | Tickets | Focus |
|---|---|---|---|
| 0 | GCP Config + Emergency Unblocks | 1 | GCP, Auth |
| 1 | DB + Migration Fixes | 5 | DB, Migrations |
| 2 | Auth + Session Critical Path | 7 | Backend, Auth |
| 3 | API Gateway Route Fixes | 4 | Gateway, Backend |
| 4 | POS Session + Navigation | 7 | POS App, Navigation |
| 5 | POS UI Grid + Layout | 8 | POS UI, UX |
| 6 | POS Core Wiring (Cart, Checkout) | 6 | POS Wiring |
| 7 | POS Payment Methods | 6 | POS, UI, Wiring |
| 8 | POS Advanced Features | 8 | POS Features |
| 9 | Retailer Portal Auth | 6 | Frontend, Auth |
| 10 | Supplier Portal Auth | 7 | Frontend, Auth, Backend |
| 11 | SuperAdmin Backend Routes | 7 | Backend, API |
| 12 | Retailer Portal Features | 5 | Frontend, Backend |
| 13 | SuperAdmin UI + Wiring | 13 | Frontend, Backend |
| 14 | Cross-Service + Ledger | 5 | Backend, Business Logic |
| 15 | GCP Infrastructure | 3 | GCP, DB |
| 16 | Scale + Performance | 8 | Performance, Testing |

## Phase 1: Unblock Platform (Batches 0-3)

### BATCH 0: GCP Config

#### GCP-STG-0153 — Fix EMAIL_FROM env var
**Layer:** GCP Config | **Depends on:** none
**Scope:** `gcloud run services update main-backend --update-env-vars="EMAIL_FROM=supermanditech@gmail.com"`
**Verify:** Send test email → arrives from correct address

#### GCP-STG-0002 — Clear Redis rate limits for staging
**Layer:** GCP Config | **Depends on:** none
**Scope:** Clear Redis keys `email_rl:*` OR set `RATE_LIMIT_MULTIPLIER=10` for staging
**Verify:** Admin OTP send → 200 (not 429)

### BATCH 1: DB + Migration Fixes

#### GCP-STG-0124 — Fix CHECK constraint (supplier approval)
**Layer:** DB, Migrations | **Depends on:** none
**Files:** New migration `208_fix_supplier_verification_status.sql`
**Scope:** Change supplier approval code to use `verification_status = 'ACTIVE'` instead of `'verified'`. OR add `'verified'` to CHECK constraint.
**Verify:** SuperAdmin approves supplier → 200 (not 500)

#### GCP-STG-0001 — Fix GSTIN locking before approval
**Layer:** DB, Migrations | **Depends on:** none
**Files:** New migration `209_relax_gstin_constraint.sql`, `backend/src/routes/v1/supplier/registration.ts`
**Scope:** Replace hard UNIQUE on suppliers.gstin with partial unique index for ACTIVE status only
**Verify:** Register with GSTIN → reject → re-register same GSTIN → succeeds

#### GCP-STG-0151 — Copy email to auth.users on approval
**Layer:** DB, Backend | **Depends on:** GCP-STG-0124
**Files:** `backend/src/routes/v1/admin/applications.ts` (approval handler)
**Scope:** Add `email` column to INSERT into auth.users during approval: copy from auth.applications.email
**Verify:** Approve application → auth.users.email = supermanditech@gmail.com (not NULL)

#### GCP-STG-0121 — Store GSTIN required for invoicing
**Layer:** DB | **Depends on:** none
**Files:** SuperAdmin Stores tab
**Scope:** Add GSTIN input to store edit form, save to platform.stores.gstin
**Verify:** Edit store → enter GSTIN → save → DB shows GSTIN

### BATCH 2: Auth + Session Critical Path

#### GCP-STG-0125+0128 — Fix V3 stock check (sale + stock screen)
**Layer:** Backend | **Depends on:** none
**Files:** `backend/src/services/inventoryService.ts:555-642`, `backend/src/routes/v1/pos/inventory.ts`
**Scope:** Change stock check to query `inventory.stock_balances` (V3) instead of `public.variants` + `retailer_variants` (legacy). Same fix for stock screen endpoint.
**Verify:** POS cash sale → COMPLETE SALE → succeeds (not "insufficient_stock"). Stock screen → shows product names + quantities (not "Unknown")

#### GCP-STG-0218 — Fix gateway JWT actorId claim
**Layer:** API Gateway | **Depends on:** none
**Files:** `backend/services/api-gateway/src/middleware/jwtAuth.ts:281`
**Scope:** Make actorId optional OR populate from sub claim when missing. Feature-flags and non-critical endpoints should work without actorId.
**Verify:** Retailer logs in via OTP → feature-flags call → 200 (not 401). Session persists.

#### GCP-STG-0216+0217 — Fix AuthContext non-nuclear logout
**Layer:** Frontend | **Depends on:** GCP-STG-0218
**Files:** `retailer-admin/src/lib/AuthContext.tsx:384-387`
**Scope:** Only auto-logout on auth endpoint 401s. Non-critical 401s (feature-flags, analytics) → show warning, don't logout.
**Verify:** Retailer stays logged in for 5+ minutes. Non-auth 401 → warning toast, no logout.

#### GCP-STG-0038 — Fix SplashScreenV3 auth failure recovery
**Layer:** POS App | **Depends on:** none
**Files:** `src/screens/v3/SplashScreenV3.tsx:96-100`
**Scope:** On DEVICE_UNAUTHORIZED → clearDeviceSession() + navigate to EnrollDevice (not V3Phone)
**Verify:** Stale session → app shows EnrollDevice (not dead-end V3Phone)

### BATCH 3: API Gateway Route Fixes

#### GCP-STG-0219 — Feature-flags to PUBLIC_PATHS
**Layer:** API Gateway | **Depends on:** none
**Files:** `backend/services/api-gateway/src/middleware/jwtAuth.ts`
**Scope:** Add `/api/v1/retailer-admin/feature-flags` to PUBLIC_PATHS array
**Verify:** GET feature-flags without auth → 200

#### GCP-STG-0004 — Gateway: exempt pos/auth/* from device token
**Layer:** API Gateway | **Depends on:** none
**Files:** `backend/services/api-gateway/src/config.ts`
**Scope:** Add `/api/v1/pos/auth/send-otp` and `/api/v1/pos/auth/verify-otp` to device-token exemption list. Add `/api/v1/config-status` to public routes.
**Verify:** POST /pos/auth/send-otp without device token → 200 (not DEVICE_UNAUTHORIZED)

## Phase 2: POS App Foundation (Batches 4-5)

### BATCH 4: POS Session + Navigation

- **GCP-STG-0009**: Wire StaffLoginScreenV3 after enrollment
- **GCP-STG-0011**: Default tab = SELL (not BUY)
- **GCP-STG-0005**: Two-layer session (device + staff)
- **GCP-STG-0007**: Concurrent session prevention
- **GCP-STG-0008**: Token expiry + silent refresh

### BATCH 5: POS UI Grid + Layout

- **GCP-STG-0010**: ProductTileV3 flex:1 (3-column grid)
- **GCP-STG-0142**: Pixel-perfect prototype compliance
- **GCP-STG-0144**: Category-specific emoji mapping
- **GCP-STG-0145**: BUY tiles = SELL tiles
- **GCP-STG-0013**: Category emojis (not generic box)
- **GCP-STG-0015**: Stock dot indicators
- **GCP-STG-0023**: Price always visible

## Phase 3: POS Features (Batches 6-8)

### BATCH 6: Cart + Checkout wiring
### BATCH 7: Payment methods
### BATCH 8: Voice, Scan, Inventory

## Phase 4: Web Portals (Batches 9-10)

### BATCH 9: Retailer portal auth fixes
### BATCH 10: Supplier portal auth + registration

## Phase 5: SuperAdmin + Integration (Batches 11-14)

### BATCH 11: SuperAdmin missing backend routes (12 routes returning 404)
### BATCH 12: Retailer portal features
### BATCH 13: SuperAdmin UI wiring (every button)
### BATCH 14: Ledger + settlement

## Phase 6: Scale + Hardening (Batches 15-16)

### BATCH 15: GCP parity audit
### BATCH 16: Load testing + edge cases

## Implementation Sequence

```
Batch 0 (10 min) → Batch 1 (30 min) → Batch 2 (1 hr) → Batch 3 (20 min)
    = Platform unblocked, all portals accessible, sales work

Batch 4 (1 hr) → Batch 5 (2 hr)
    = POS app looks and navigates correctly

Batch 6 (2 hr) → Batch 7 (2 hr) → Batch 8 (2 hr)
    = All POS features work end-to-end

Batch 9-10 (3 hr) → Batch 11-13 (4 hr) → Batch 14-16 (4 hr)
    = Full platform production-grade
```

## Verification SOP

After each ticket:
1. Claude A posts: "GCP-STG-XXXX DONE — files: [list], commit: [sha]"
2. Operator pastes to Claude B: "Verify GCP-STG-XXXX against 12 layers"
3. Claude B reads code → responds PASS or FAIL with specifics
4. If FAIL → operator pastes fix instructions back to Claude A
