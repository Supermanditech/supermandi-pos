# SuperMandi POS System Audit Report
## Retailer, Supplier & Admin Onboarding/Activation Flow

**Audit Date:** 2026-02-01
**System Version:** Commit `ceaa165`
**Audit Type:** Read-Only Code Inspection (No Refactoring)

---

## Table of Contents

1. [Executive Summary](#executive-summary)
2. [Flow Diagrams](#1-flow-diagrams)
3. [State Tables](#2-state-tables)
4. [Conflict List](#3-conflict-list)
5. [Bottleneck List](#4-bottleneck-list)
6. [Readiness Verdict](#5-readiness-verdict)

---

## Executive Summary

This audit traces the complete onboarding and activation flows for retailers, suppliers, and admin operations in the SuperMandi POS system. The inspection covers UI → API → DB → VM paths using real routes, guards, and states as they exist in production code.

**Key Finding:** The system has a critical dependency on SuperAdmin for all store creation and supplier approval operations, creating a bottleneck that prevents safe scaling to 10,000 stores.

---

## 1. Flow Diagrams

### 1.1 Retailer POS-First Flow (Primary Path)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RETAILER POS-FIRST FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

[SuperAdmin Portal]
        │
        ▼
┌───────────────────┐
│ 1. Create Store   │ ◄── POST /api/admin/stores
│    (SuperAdmin)   │     backend/services/platform-service/src/routes/admin.ts:111-130
│                   │     Status: 'active'
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 2. Generate       │ ◄── POST /api/admin/stores/:storeId/enrollments
│    Enrollment     │     Creates 6-char alphanumeric code
│    Code           │     expires_at = NOW + 24 hours
└────────┬──────────┘
         │
         ▼
┌───────────────────┐     ┌─────────────────────────────────────────────────┐
│ 3. Share Code     │ ──► │ OFFLINE: SuperAdmin shares code with retailer   │
│    with Retailer  │     │ (WhatsApp, Phone, Email - outside system)       │
└────────┬──────────┘     └─────────────────────────────────────────────────┘
         │
         ▼
[POS Device]
         │
         ▼
┌───────────────────┐
│ 4. Enter          │ ◄── POST /api/v1/pos/enroll
│    Enrollment     │     backend/src/routes/v1/pos/enroll.ts:84-512
│    Code           │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 5. Validate       │     Checks:
│    Enrollment     │     • Code exists & not expired
│                   │     • Store exists & active
│                   │     • max_devices limit not reached
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 6. Issue Device   │     Returns:
│    Token          │     • device_token (JWT, 90-day expiry)
│                   │     • store_id, device_id
│                   │     Device status: 'active'
└────────┬──────────┘
         │
         ▼
┌───────────────────────────────────────┐
│ ✅ DEVICE CAN NOW PROCESS SALES       │
│    POS is operational                 │
└───────────────────────────────────────┘
```

### 1.2 Retailer Web-First Flow (Shows Dead End)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         RETAILER WEB-FIRST FLOW                             │
│                           (SHOWS DEAD END)                                  │
└─────────────────────────────────────────────────────────────────────────────┘

[Retailer Web Portal]
        │
        ▼
┌───────────────────┐
│ 1. Enter Phone    │ ◄── Retailer Portal Login Page
│    Number         │     apps/retailer-portal/src/app/login/page.tsx
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 2. Firebase OTP   │ ◄── Firebase Phone Auth
│    Verification   │     Returns Firebase ID Token
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 3. Backend        │ ◄── POST /api/retailer/auth/firebase-login
│    Validation     │     backend/services/auth-service/src/routes/retailerAuth.ts:199-217
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 4. Store Lookup   │     Query: SELECT * FROM stores
│    by Phone       │     WHERE retailer_portal_phone = :phone
└────────┬──────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌────────────────────────────────────────────────────────────────┐
│ Store  │  │ ❌ NO STORE FOUND                                              │
│ EXISTS │  │                                                                │
└───┬────┘  │ Response: 404 "No store found for this phone number"          │
    │       │                                                                │
    │       │ ┌────────────────────────────────────────────────────────────┐ │
    │       │ │ DEAD END: Retailer cannot self-register                   │ │
    │       │ │ Must wait for SuperAdmin to create store first            │ │
    │       │ └────────────────────────────────────────────────────────────┘ │
    │       └────────────────────────────────────────────────────────────────┘
    ▼
┌───────────────────┐
│ 5. Issue JWT      │     Token includes:
│    Token          │     • store_id, user_id
│                   │     • role: 'store_owner'
└────────┬──────────┘
         │
         ▼
┌───────────────────────────────────────┐
│ ✅ ACCESS TO RETAILER DASHBOARD       │
│    Can view sales, manage inventory   │
└───────────────────────────────────────┘
```

### 1.3 Supplier Registration & Approval Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPPLIER REGISTRATION FLOW                          │
└─────────────────────────────────────────────────────────────────────────────┘

[Supplier Portal]
        │
        ▼
┌───────────────────┐
│ 1. Enter Phone    │ ◄── Supplier Portal Registration
│    for Firebase   │     apps/supplier-portal/src/app/register/page.tsx
│    OTP            │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 2. Firebase OTP   │ ◄── Firebase Phone Auth
│    Verification   │     Returns Firebase ID Token
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 3. Submit         │ ◄── POST /api/v1/supplier/auth/firebase-register
│    Registration   │     backend/src/routes/v1/supplier/auth.ts:1296-1444
│    Details        │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 4. Create         │     INSERT INTO suppliers:
│    Supplier       │     • status = 'pending'
│    Record         │     • verification_status = 'pending'
│                   │     • firebase_uid = :uid
└────────┬──────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ ⚠️  NO JWT TOKEN ISSUED                                                   │
│     Supplier cannot access portal until approved                          │
│     Response: { success: true, message: "Registration pending approval" } │
└────────┬──────────────────────────────────────────────────────────────────┘
         │
         ▼
┌───────────────────┐
│ 5. Wait for       │ ◄── MANUAL PROCESS
│    SuperAdmin     │     SuperAdmin reviews in admin portal
│    Approval       │
└────────┬──────────┘
         │
         ▼
[SuperAdmin Portal]
         │
         ▼
┌───────────────────┐
│ 6. Review         │ ◄── GET /api/admin/suppliers?status=pending
│    Pending        │
│    Suppliers      │
└────────┬──────────┘
         │
    ┌────┴────┐
    │         │
    ▼         ▼
┌────────┐  ┌────────┐
│APPROVE │  │REJECT  │
└───┬────┘  └───┬────┘
    │           │
    ▼           ▼
┌────────┐  ┌────────────────────────────────────────┐
│status= │  │status='rejected'                       │
│'active'│  │Supplier cannot login                   │
└───┬────┘  └────────────────────────────────────────┘
    │
    ▼
┌───────────────────┐
│ 7. Supplier       │ ◄── POST /api/v1/supplier/auth/firebase-login
│    Can Now        │     Now returns JWT token
│    Login          │
└────────┬──────────┘
         │
         ▼
┌───────────────────────────────────────┐
│ ✅ ACCESS TO SUPPLIER DASHBOARD       │
│    Can manage products, view orders   │
└───────────────────────────────────────┘
```

### 1.4 Legacy Password Registration Flow (Bypass)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    LEGACY PASSWORD REGISTRATION                             │
│                    (BYPASSES APPROVAL GATE)                                 │
└─────────────────────────────────────────────────────────────────────────────┘

[Supplier Portal - Legacy Path]
        │
        ▼
┌───────────────────┐
│ 1. Submit         │ ◄── POST /api/v1/supplier/auth/register
│    Email/Password │     backend/src/routes/v1/supplier/auth.ts:268-447
│    Registration   │
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 2. Create         │     INSERT INTO suppliers:
│    Supplier       │     • status = 'active'  ◄── IMMEDIATELY ACTIVE
│    Record         │     • verification_status = 'pending'
└────────┬──────────┘
         │
         ▼
┌───────────────────┐
│ 3. Issue JWT      │ ◄── Token issued immediately
│    Token          │     No approval required
└────────┬──────────┘
         │
         ▼
┌───────────────────────────────────────────────────────────────────────────┐
│ ⚠️  CONFLICT: Password registration bypasses the approval gate            │
│     Firebase registration requires approval, password does not            │
└───────────────────────────────────────────────────────────────────────────┘
```

### 1.5 Admin Touchpoints Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         SUPERADMIN TOUCHPOINTS                              │
└─────────────────────────────────────────────────────────────────────────────┘

BLOCKING ACTIONS (Cannot proceed without SuperAdmin):
═══════════════════════════════════════════════════════

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 1. STORE CREATION                                                       │
  │    Route: POST /api/admin/stores                                        │
  │    File: backend/services/platform-service/src/routes/admin.ts:111-130  │
  │    Impact: No store = No retailer operations possible                   │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 2. ENROLLMENT CODE GENERATION                                           │
  │    Route: POST /api/admin/stores/:storeId/enrollments                   │
  │    File: backend/services/platform-service/src/routes/admin.ts          │
  │    Impact: No code = No POS device enrollment                           │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 3. RETAILER PORTAL PHONE INITIALIZATION                                 │
  │    Route: PUT /api/admin/stores/:storeId                                │
  │    File: backend/services/platform-service/src/routes/admin.ts          │
  │    Impact: No phone = Retailer cannot login to web portal               │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 4. SUPPLIER APPROVAL                                                    │
  │    Route: PUT /api/admin/suppliers/:supplierId/approve                  │
  │    File: backend/services/platform-service/src/routes/admin.ts          │
  │    Impact: Pending suppliers cannot access portal or sell               │
  └─────────────────────────────────────────────────────────────────────────┘

  ┌─────────────────────────────────────────────────────────────────────────┐
  │ 5. UPI CONFIGURATION                                                    │
  │    Route: PUT /api/admin/stores/:storeId/upi                            │
  │    File: backend/services/platform-service/src/routes/admin.ts          │
  │    Impact: Store cannot accept UPI payments                             │
  └─────────────────────────────────────────────────────────────────────────┘


OPTIONAL ACTIONS (System works without these):
══════════════════════════════════════════════

  • View all stores list
  • View store details
  • View sales analytics
  • Suspend/unsuspend stores
  • Block/unblock devices
  • Reject suppliers (vs approve)
```

---

## 2. State Tables

### 2.1 Retailer Store States

| State | Description | Entry Trigger | Exit Trigger | Who Changes |
|-------|-------------|---------------|--------------|-------------|
| `created` | Store record exists in DB | SuperAdmin creates store | Portal phone added | SuperAdmin |
| `portal_initialized` | retailer_portal_phone set | SuperAdmin adds phone | UPI configured | SuperAdmin |
| `upi_configured` | UPI VPA validated | SuperAdmin adds UPI | Manual suspension | SuperAdmin |
| `active` | Fully operational | Default on creation | Suspension | SuperAdmin |
| `suspended` | Temporarily disabled | SuperAdmin action | Reactivation | SuperAdmin |
| `inactive` | Long-term disabled | SuperAdmin action | Reactivation | SuperAdmin |

**Database Location:** `backend/migrations/001_initial_schema.sql` - stores table

### 2.2 Device States

| State | Description | Entry Trigger | Exit Trigger | Who Changes |
|-------|-------------|---------------|--------------|-------------|
| `not_enrolled` | No device record | N/A | Enrollment | N/A |
| `active` | Device can transact | Valid enrollment code used | Token expiry/block | System/SuperAdmin |
| `expired` | 90-day token expired | Time passage | Re-enrollment | System |
| `blocked` | Manually disabled | SuperAdmin blocks | Unblock action | SuperAdmin |

**Database Location:** `backend/migrations/001_initial_schema.sql` - devices table

### 2.3 Supplier States

| State | Description | Entry Trigger | Exit Trigger | Who Changes |
|-------|-------------|---------------|--------------|-------------|
| `pending` | Awaiting approval | Firebase registration | Approval/Rejection | System → SuperAdmin |
| `active` | Can operate | SuperAdmin approves OR password registration | Suspension | SuperAdmin/System |
| `rejected` | Denied access | SuperAdmin rejects | N/A (terminal) | SuperAdmin |
| `suspended` | Temporarily disabled | SuperAdmin action | Reactivation | SuperAdmin |

**Database Location:** `backend/migrations/001_initial_schema.sql` - suppliers table

### 2.4 Supplier KYC States

| State | Field | Values | Who Updates |
|-------|-------|--------|-------------|
| `verification_status` | Overall KYC status | `pending`, `partial`, `verified`, `rejected` | SuperAdmin |
| `pan_verified` | PAN document | `true`/`false` | SuperAdmin |
| `gstin_verified` | GSTIN document | `true`/`false` | SuperAdmin |
| `bank_verified` | Cancelled cheque | `true`/`false` | SuperAdmin |
| `address_verified` | Address proof | `true`/`false` | SuperAdmin |

**Database Location:** `backend/migrations/001_initial_schema.sql` - suppliers table

### 2.5 Enrollment Code States

| State | Description | Entry Trigger | Exit Trigger | Who Changes |
|-------|-------------|---------------|--------------|-------------|
| `active` | Code can be used | SuperAdmin generates | Usage/Expiry | SuperAdmin/System |
| `used` | Code consumed | Device enrollment | N/A (terminal) | System |
| `expired` | Past expires_at | Time passage (24h) | N/A (terminal) | System |

**Note:** Demo codes (`DEMO01`, `DEMO02`) have special handling - see CONFLICT-005.

---

## 3. Conflict List

### CONFLICT-001: Web Cannot Create Store Before POS

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Location** | `backend/services/auth-service/src/routes/retailerAuth.ts:199-217` |
| **Description** | Retailer web portal login requires store to exist with matching `retailer_portal_phone`. If retailer tries to login before SuperAdmin creates their store, they get 404 error with no path forward. |
| **Impact** | Retailers cannot self-onboard. Every retailer requires SuperAdmin intervention before first login. |
| **Evidence** | Code queries `SELECT * FROM stores WHERE retailer_portal_phone = :phone` and returns 404 if no match. |

### CONFLICT-002: Phone Uniqueness Across All Users

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Location** | `backend/migrations/002_auth_schema.sql:60-66` |
| **Description** | Phone numbers must be unique across ALL user types (retailers, suppliers, admins). A phone registered as supplier cannot be used for retailer. |
| **Impact** | Store owners who are also suppliers must use different phones for each role. Creates friction for multi-role users. |
| **Evidence** | `UNIQUE(phone)` constraint on users table with no role scoping. |

### CONFLICT-003: User Actor Binding Conflict

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Location** | `backend/src/middleware/storeOwnership.ts:228-236` |
| **Description** | Users are bound to exactly one store via `actor_id`. Multi-store operators cannot manage multiple stores from single account. |
| **Impact** | Franchise operators need separate accounts per store. No consolidated view possible. |
| **Evidence** | Middleware checks `user.actor_id === store.id` for all store operations. |

### CONFLICT-004: Password vs Firebase Registration Disparity

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Location** | `backend/src/routes/v1/supplier/auth.ts:268-447` (password) vs `backend/src/routes/v1/supplier/auth.ts:1296-1444` (Firebase) |
| **Description** | Password registration sets `status='active'` immediately. Firebase registration sets `status='pending'` requiring approval. Same system, two different onboarding paths with different security models. |
| **Impact** | Approval gate can be bypassed by using password registration. Inconsistent security posture. |
| **Evidence** | Password path: `status: 'active'` on line 312. Firebase path: `status: 'pending'` on line 1356. |

### CONFLICT-005: Enrollment Code Reuse for Demo vs Production

| Attribute | Value |
|-----------|-------|
| **Severity** | LOW |
| **Location** | `backend/src/routes/v1/pos/enroll.ts` |
| **Description** | Demo enrollment codes (`DEMO01`, `DEMO02`) have special handling that bypasses normal validation. If these codes leak or are guessed, devices can enroll to demo stores. |
| **Impact** | Potential unauthorized demo access. Demo data could be polluted. |
| **Evidence** | Special case handling for codes matching `/^DEMO\d{2}$/` pattern. |

### CONFLICT-006: Token Auto-Refresh Without Invalidation

| Attribute | Value |
|-----------|-------|
| **Severity** | MEDIUM |
| **Location** | `backend/src/middleware/deviceToken.ts:154-190` |
| **Description** | When device tokens are refreshed, old tokens remain valid for their full 90-day lifetime. No token revocation on refresh. |
| **Impact** | Stolen tokens cannot be invalidated by refresh. Security incident recovery requires manual block. |
| **Evidence** | Refresh endpoint issues new token but no `UPDATE tokens SET revoked=true` for old token. |

---

## 4. Bottleneck List

### BOTTLENECK-001: Store Creation Requires SuperAdmin

| Attribute | Value |
|-----------|-------|
| **Severity** | CRITICAL |
| **Route** | `POST /api/admin/stores` |
| **File** | `backend/services/platform-service/src/routes/admin.ts:111-130` |
| **Guard** | `requireSuperAdmin` middleware |
| **Impact** | Every new retailer requires manual SuperAdmin action. No self-service store creation. |
| **Scaling Issue** | 10,000 stores = 10,000 manual creation actions by SuperAdmin |

### BOTTLENECK-002: Enrollment Code Generation Requires SuperAdmin

| Attribute | Value |
|-----------|-------|
| **Severity** | CRITICAL |
| **Route** | `POST /api/admin/stores/:storeId/enrollments` |
| **File** | `backend/services/platform-service/src/routes/admin.ts` |
| **Guard** | `requireSuperAdmin` middleware |
| **Impact** | Every POS device enrollment requires SuperAdmin to generate code first. |
| **Scaling Issue** | 10,000 stores × avg 2 devices = 20,000 manual code generations |

### BOTTLENECK-003: Retailer Portal Initialization Requires SuperAdmin

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Route** | `PUT /api/admin/stores/:storeId` |
| **File** | `backend/services/platform-service/src/routes/admin.ts` |
| **Guard** | `requireSuperAdmin` middleware |
| **Impact** | Retailer web portal access requires SuperAdmin to set `retailer_portal_phone`. |
| **Scaling Issue** | Additional manual step for every store wanting web access |

### BOTTLENECK-004: Supplier Approval Requires SuperAdmin

| Attribute | Value |
|-----------|-------|
| **Severity** | CRITICAL |
| **Route** | `PUT /api/admin/suppliers/:supplierId/approve` |
| **File** | `backend/services/platform-service/src/routes/admin.ts` |
| **Guard** | `requireSuperAdmin` middleware |
| **Impact** | Every Firebase-registered supplier waits for manual approval. |
| **Scaling Issue** | High supplier volume creates approval backlog |

### BOTTLENECK-005: UPI Configuration Requires SuperAdmin

| Attribute | Value |
|-----------|-------|
| **Severity** | HIGH |
| **Route** | `PUT /api/admin/stores/:storeId/upi` |
| **File** | `backend/services/platform-service/src/routes/admin.ts` |
| **Guard** | `requireSuperAdmin` middleware |
| **Impact** | Stores cannot accept UPI payments until SuperAdmin configures VPA. |
| **Scaling Issue** | Payment enablement blocked on manual action |

---

## 5. Readiness Verdict

### Can the system safely scale to 10,000 stores?

## ❌ NO

### Justification

The current implementation has **fundamental architectural constraints** that prevent scaling:

#### 1. Single Point of Failure
All critical operations (store creation, enrollment, approvals) require `SuperAdmin` role:
- No delegation model exists
- No regional admin hierarchy
- No automated approval workflows

#### 2. Manual Intervention Requirements
For 10,000 stores, SuperAdmin must manually perform:
- **10,000** store creation actions
- **20,000+** enrollment code generations (assuming 2 devices/store)
- **10,000** retailer portal phone configurations
- **10,000** UPI VPA configurations
- **Unknown** supplier approvals (depends on supplier count)

#### 3. No Self-Service Paths
- Retailers cannot create their own stores
- Retailers cannot generate their own enrollment codes
- Suppliers cannot auto-approve based on KYC verification
- No batch operations exist for any of these actions

#### 4. Missing Scalability Features
- No admin role hierarchy (SuperAdmin → RegionalAdmin → etc.)
- No automated approval rules/workflows
- No bulk import/batch processing
- No API for programmatic onboarding

### Recommendations for Scale (Not Part of Audit Scope)

If scaling is required, the following would need to be addressed:

1. **Admin Hierarchy**: Implement regional/area admin roles with delegated permissions
2. **Self-Service Onboarding**: Allow retailers to register and create stores with verification
3. **Automated Approvals**: Rule-based approval for suppliers meeting KYC thresholds
4. **Batch Operations**: Bulk store creation, enrollment generation, configuration APIs
5. **Workflow Engine**: Automated state transitions based on business rules

---

## Appendix: File References

| Component | File Path | Key Lines |
|-----------|-----------|-----------|
| Store Creation | `backend/services/platform-service/src/routes/admin.ts` | 111-130 |
| Device Enrollment | `backend/src/routes/v1/pos/enroll.ts` | 84-512 |
| Retailer Auth | `backend/services/auth-service/src/routes/retailerAuth.ts` | 199-217 |
| Supplier Firebase Register | `backend/src/routes/v1/supplier/auth.ts` | 1296-1444 |
| Supplier Password Register | `backend/src/routes/v1/supplier/auth.ts` | 268-447 |
| Phone Uniqueness | `backend/migrations/002_auth_schema.sql` | 60-66 |
| Store Ownership | `backend/src/middleware/storeOwnership.ts` | 228-236 |
| Device Token Refresh | `backend/src/middleware/deviceToken.ts` | 154-190 |
| Initial Schema | `backend/migrations/001_initial_schema.sql` | - |

---

*Report generated by Claude Code audit system*
*Commit: ceaa165*
*Date: 2026-02-01*
