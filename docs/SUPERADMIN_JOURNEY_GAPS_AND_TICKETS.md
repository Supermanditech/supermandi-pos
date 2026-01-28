# SuperAdmin Journey (1.3) - Go-Live Gap Analysis & Micro-Tickets

**Date:** 2026-01-28
**Audit Source:** GO_LIVE_WORKFLOW_AUDIT_REPORT.html.pdf
**Focus:** 1.3 SUPERADMIN JOURNEY (Control Plane)

---

## A) GAP LIST (1.3 SUPERADMIN JOURNEY ONLY)

### Summary from Audit Report

| Feature | Audit Status | Actual Current State | Gap Description |
|---------|--------------|---------------------|-----------------|
| Admin Login | ✓ Works | ✓ Verified | Token-based auth functional |
| Supplier Approval | ✓ Works | ✓ Verified | Approve/Reject/Link workflows exist |
| **Product Approval** | ❌ MISSING | ⚠️ PARTIAL | Backend APIs exist, **Frontend UI MISSING** |
| **Margin/BNPL/Credit** | ❌ MISSING | ⚠️ PARTIAL | Backend APIs exist, **Frontend UI MISSING** |
| Analytics | ✓ Works | ✓ Verified | Read-only dashboards functional |
| Store Management | ⚠️ Partial | ✓ Mostly good | Create/edit works, bulk ops missing |
| **User Management** | ⚠️ Partial | ⚠️ PARTIAL | Status change works, **Create/Delete MISSING** |

---

### Detailed Gap Analysis

#### GAP-1: Product Approval Frontend UI (CRITICAL)

| Attribute | Value |
|-----------|-------|
| **Screen/Page** | Suppliers Tab → Products Sub-section |
| **Issue** | No UI to view pending products, approve, or reject them |
| **Root Cause** | Backend APIs implemented (SM-008/SM-009), frontend not built |
| **Severity** | **CRITICAL** |
| **Backend Status** | ✅ Complete |
| **Frontend Status** | ❌ Missing |

**Backend Endpoints (Already Implemented):**
- `GET /api/v1/admin/products/pending` - List pending products
- `POST /api/v1/admin/products/:productId/approve` - Approve product
- `POST /api/v1/admin/products/:productId/reject` - Reject product

**Evidence:** [backend/src/routes/v1/admin/suppliers.ts:438-612](backend/src/routes/v1/admin/suppliers.ts#L438-L612)

---

#### GAP-2: Product Margin/BNPL Edit UI (CRITICAL)

| Attribute | Value |
|-----------|-------|
| **Screen/Page** | Suppliers Tab → Product Detail / Edit Modal |
| **Issue** | No UI to set margin (fixed/percentage) or BNPL settings per product |
| **Root Cause** | Backend API implemented (SM-009), frontend not built |
| **Severity** | **CRITICAL** |
| **Backend Status** | ✅ Complete |
| **Frontend Status** | ❌ Missing |

**Backend Endpoint (Already Implemented):**
- `PUT /api/v1/admin/products/:productId/edit`
  - `superMandiMarginMinor` - Fixed margin in paise
  - `marginPercent` - Percentage margin
  - `bnplEligible` - Enable/disable BNPL
  - `bnplMaxDays` - Max credit days

**Evidence:** [backend/src/routes/v1/admin/suppliers.ts:614-811](backend/src/routes/v1/admin/suppliers.ts#L614-L811)

---

#### GAP-3: User Creation API & UI (HIGH)

| Attribute | Value |
|-----------|-------|
| **Screen/Page** | Users Tab → Create User Form |
| **Issue** | Cannot create new users; only status change supported |
| **Root Cause** | POST endpoint not implemented |
| **Severity** | **HIGH** |
| **Backend Status** | ❌ Missing |
| **Frontend Status** | ❌ Missing |

**Current Implementation:**
- `GET /api/v1/admin/users` ✅
- `GET /api/v1/admin/users/:userId` ✅
- `PATCH /api/v1/admin/users/:userId` ✅ (status only)
- `POST /api/v1/admin/users` ❌ **MISSING**
- `DELETE /api/v1/admin/users/:userId` ❌ **MISSING**

**Evidence:** [backend/src/routes/v1/admin/users.ts](backend/src/routes/v1/admin/users.ts) - No POST/DELETE handlers

---

#### GAP-4: Store-Level BNPL/Credit Controls UI (MEDIUM)

| Attribute | Value |
|-----------|-------|
| **Screen/Page** | Stores Tab → Store Detail |
| **Issue** | Database columns exist (bnpl_enabled, bnpl_credit_limit, credit_enabled) but no UI to configure |
| **Root Cause** | Schema added (migration 054), UI not built |
| **Severity** | **MEDIUM** |
| **Backend Status** | ⚠️ Columns exist, no dedicated endpoint |
| **Frontend Status** | ❌ Missing |

**Database Schema:**
```sql
-- platform.stores
bnpl_enabled BOOLEAN DEFAULT FALSE
bnpl_credit_limit INTEGER DEFAULT 500000  -- 5000 INR in paise
bnpl_max_days INTEGER DEFAULT 7
credit_enabled BOOLEAN DEFAULT FALSE
credit_limit INTEGER DEFAULT 0
```

---

#### GAP-5: Audit Trail Viewing UI (MEDIUM)

| Attribute | Value |
|-----------|-------|
| **Screen/Page** | Settings Tab or dedicated Audit Tab |
| **Issue** | Audit logs written to DB but no UI to view them |
| **Root Cause** | Schema exists (supplier.approval_logs, admin.audit_log), no view endpoint/UI |
| **Severity** | **MEDIUM** |
| **Backend Status** | ⚠️ Logs written, no GET endpoint |
| **Frontend Status** | ❌ Missing |

---

## B) MICRO-TICKET LIST (SA-1.3-###)

### CRITICAL Priority (Must fix before Go-Live)

---

#### SA-1.3-001: Add Pending Products List UI

| Field | Value |
|-------|-------|
| **App** | supermandi-superadmin |
| **Workflow** | Product Approval |
| **Scope** | ONE screen section |
| **Dependencies** | None (backend ready) |

**Problem:** SuperAdmin cannot see supplier products waiting for approval.

**Acceptance Criteria:**
- [ ] Add "Pending Products" section in Suppliers tab
- [ ] Display: Product Name, SKU, Barcode, Supplier Name, Purchase Price, MRP, Created Date
- [ ] Show count badge in tab header
- [ ] Calls `GET /api/v1/admin/products/pending`

**Files to Change:**
- `supermandi-superadmin/src/api/suppliers.ts` - Add `fetchPendingProducts()` function
- `supermandi-superadmin/src/App.tsx` - Add pendingProducts state and UI section

**API Client Code:**
```typescript
export type PendingProduct = {
  id: string;
  productName: string;
  skuCode: string;
  barcode: string;
  purchasePrice: number;
  mrp: number;
  moq: number;
  createdAt: string;
  supplierId: string;
  supplierName: string;
};

export async function fetchPendingProducts(): Promise<PendingProduct[]> {
  // GET /api/v1/admin/products/pending
}
```

---

#### SA-1.3-002: Add Product Approve/Reject Buttons

| Field | Value |
|-------|-------|
| **App** | supermandi-superadmin |
| **Workflow** | Product Approval |
| **Scope** | TWO buttons per product row |
| **Dependencies** | SA-1.3-001 |

**Problem:** No way to approve or reject pending products.

**Acceptance Criteria:**
- [ ] "Approve" button calls `POST /api/v1/admin/products/:id/approve`
- [ ] "Reject" button opens reason input, then calls `POST /api/v1/admin/products/:id/reject`
- [ ] Rejected reason is mandatory (min 10 chars)
- [ ] Remove product from list on success
- [ ] Show loading state during API call
- [ ] Show error on failure

**Files to Change:**
- `supermandi-superadmin/src/api/suppliers.ts` - Add `approveProduct()`, `rejectProduct()` functions
- `supermandi-superadmin/src/App.tsx` - Add handlers and UI buttons

**API Client Code:**
```typescript
export async function approveProduct(productId: string): Promise<{ productId: string; approvalStatus: string }> {
  // POST /api/v1/admin/products/:productId/approve
}

export async function rejectProduct(productId: string, reason: string): Promise<{ productId: string; approvalStatus: string }> {
  // POST /api/v1/admin/products/:productId/reject
}
```

---

#### SA-1.3-003: Add Product Edit Modal (Margin/BNPL)

| Field | Value |
|-------|-------|
| **App** | supermandi-superadmin |
| **Workflow** | Margin Controls + BNPL Configuration |
| **Scope** | ONE modal component |
| **Dependencies** | SA-1.3-001 |

**Problem:** Cannot configure product margin or BNPL eligibility.

**Acceptance Criteria:**
- [ ] "Edit" button opens modal for any pending/approved product
- [ ] Fields:
  - Edited Name (text input, optional override)
  - Edited Category (dropdown)
  - Margin Type toggle (Fixed vs Percentage)
  - Fixed Margin (paise input, shown if Fixed selected)
  - Margin Percent (% input, shown if Percentage selected)
  - BNPL Eligible (checkbox)
  - BNPL Max Days (number input, 1-30, default 7)
- [ ] Calculate and display "Retailer Price" = Purchase Price + Margin
- [ ] Calls `PUT /api/v1/admin/products/:productId/edit`
- [ ] Validation: Margin >= 0, BNPL days 1-30

**Files to Change:**
- `supermandi-superadmin/src/api/suppliers.ts` - Add `editProduct()` function
- `supermandi-superadmin/src/App.tsx` - Add ProductEditModal component and state

**API Client Code:**
```typescript
export type ProductEditInput = {
  editedName?: string;
  editedCategory?: string;
  superMandiMarginMinor?: number;  // Fixed margin in paise
  marginPercent?: number;          // Percentage margin (mutually exclusive)
  bnplEligible?: boolean;
  bnplMaxDays?: number;
};

export type ProductEditResponse = {
  productId: string;
  editedName: string;
  editedCategory?: string;
  superMandiMarginMinor?: number;
  marginPercent?: number;
  bnplEligible: boolean;
  bnplMaxDays: number;
  purchasePrice: number;
  retailerPrice: number;
};

export async function editProduct(productId: string, input: ProductEditInput): Promise<ProductEditResponse> {
  // PUT /api/v1/admin/products/:productId/edit
}
```

---

### HIGH Priority (Sprint 1 Post Go-Live)

---

#### SA-1.3-004: Add User Creation API Endpoint

| Field | Value |
|-------|-------|
| **App** | backend |
| **Workflow** | User Management |
| **Scope** | ONE API endpoint |
| **Dependencies** | None |

**Problem:** Admin cannot create new users.

**Acceptance Criteria:**
- [ ] `POST /api/v1/admin/users` endpoint
- [ ] Required fields: name, email or phone
- [ ] Optional fields: actor_type (default 'store'), actor_id
- [ ] Generate temp password or send invite email
- [ ] Idempotent: reject duplicate email/phone
- [ ] Log to admin.audit_log

**Files to Create/Change:**
- `backend/src/routes/v1/admin/users.ts` - Add POST handler

**SQL:**
```sql
INSERT INTO auth.users (name, email, phone, actor_type, actor_id, status)
VALUES ($1, $2, $3, $4, $5, 'active')
RETURNING id, email, phone, name, actor_type, actor_id, status, created_at;
```

---

#### SA-1.3-005: Add User Creation UI Form

| Field | Value |
|-------|-------|
| **App** | supermandi-superadmin |
| **Workflow** | User Management |
| **Scope** | ONE form in Users tab |
| **Dependencies** | SA-1.3-004 |

**Problem:** No UI to create users.

**Acceptance Criteria:**
- [ ] "Create User" button at top of Users tab
- [ ] Form fields: Name*, Email, Phone, Actor Type (dropdown), Actor ID
- [ ] At least one of Email or Phone required
- [ ] Calls `POST /api/v1/admin/users`
- [ ] Refresh list on success

**Files to Change:**
- `supermandi-superadmin/src/api/users.ts` - Add `createUser()` function
- `supermandi-superadmin/src/App.tsx` - Add create user form and handlers

---

#### SA-1.3-006: Add Store BNPL/Credit Settings UI

| Field | Value |
|-------|-------|
| **App** | supermandi-superadmin |
| **Workflow** | Store Management |
| **Scope** | ONE expanded section per store |
| **Dependencies** | None |

**Problem:** Cannot configure store-level BNPL/Credit limits.

**Acceptance Criteria:**
- [ ] In Stores tab, expand store row to show settings
- [ ] Fields:
  - BNPL Enabled (toggle)
  - BNPL Credit Limit (INR input, stored as paise)
  - BNPL Max Days (number, 1-30)
  - Credit Enabled (toggle)
  - Credit Limit (INR input)
- [ ] Save via `PATCH /api/v1/admin/stores/:storeId`
- [ ] Show current values from store record

**Files to Change:**
- `backend/src/routes/v1/admin/stores.ts` - Extend PATCH to include BNPL/credit fields
- `supermandi-superadmin/src/App.tsx` - Add BNPL/credit fields to store expanded view

---

### MEDIUM Priority (Sprint 2 Post Go-Live)

---

#### SA-1.3-007: Add Audit Trail API Endpoint

| Field | Value |
|-------|-------|
| **App** | backend |
| **Workflow** | Audit Trail |
| **Scope** | ONE API endpoint |
| **Dependencies** | None |

**Problem:** Audit logs exist but cannot be viewed.

**Acceptance Criteria:**
- [ ] `GET /api/v1/admin/audit-logs` endpoint
- [ ] Query params: entity_type, entity_id, actor_id, from_date, to_date, limit
- [ ] Returns: action, entity_type, entity_id, from_status, to_status, changes, actor_id, created_at
- [ ] Order by created_at DESC, limit 100 default

**Files to Create:**
- `backend/src/routes/v1/admin/auditLogs.ts`

---

#### SA-1.3-008: Add Audit Trail Viewing UI

| Field | Value |
|-------|-------|
| **App** | supermandi-superadmin |
| **Workflow** | Audit Trail |
| **Scope** | ONE tab or section |
| **Dependencies** | SA-1.3-007 |

**Problem:** No UI to view admin actions history.

**Acceptance Criteria:**
- [ ] New "Audit" sub-tab under Settings or standalone
- [ ] Show table: Timestamp, Actor, Action, Entity Type, Entity ID, Changes
- [ ] Filters: Date range, Action type, Entity type
- [ ] Expandable row to show full changes JSON

**Files to Change:**
- `supermandi-superadmin/src/api/auditLogs.ts` - New file
- `supermandi-superadmin/src/App.tsx` - Add audit log section

---

#### SA-1.3-009: Add User Deletion Endpoint

| Field | Value |
|-------|-------|
| **App** | backend |
| **Workflow** | User Management |
| **Scope** | ONE API endpoint |
| **Dependencies** | None |

**Problem:** Cannot delete users.

**Acceptance Criteria:**
- [ ] `DELETE /api/v1/admin/users/:userId` endpoint
- [ ] Soft delete (set status = 'deleted') not hard delete
- [ ] Cannot delete self
- [ ] Log to admin.audit_log

**Files to Change:**
- `backend/src/routes/v1/admin/users.ts` - Add DELETE handler

---

## C) IMPLEMENTATION PRIORITY ORDER

### Phase 1: CRITICAL (Before Go-Live) - 3 Tickets

| Order | Ticket | Description | Est. Effort |
|-------|--------|-------------|-------------|
| 1 | SA-1.3-001 | Pending Products List UI | 2h |
| 2 | SA-1.3-002 | Product Approve/Reject Buttons | 1h |
| 3 | SA-1.3-003 | Product Edit Modal (Margin/BNPL) | 3h |

**Total Phase 1:** ~6 hours

### Phase 2: HIGH (Sprint 1) - 3 Tickets

| Order | Ticket | Description | Est. Effort |
|-------|--------|-------------|-------------|
| 4 | SA-1.3-004 | User Creation API | 1h |
| 5 | SA-1.3-005 | User Creation UI | 1h |
| 6 | SA-1.3-006 | Store BNPL/Credit Settings | 2h |

**Total Phase 2:** ~4 hours

### Phase 3: MEDIUM (Sprint 2) - 3 Tickets

| Order | Ticket | Description | Est. Effort |
|-------|--------|-------------|-------------|
| 7 | SA-1.3-007 | Audit Trail API | 1h |
| 8 | SA-1.3-008 | Audit Trail UI | 2h |
| 9 | SA-1.3-009 | User Deletion Endpoint | 0.5h |

**Total Phase 3:** ~3.5 hours

---

## D) FILES REQUIRING CHANGES

### SuperAdmin Dashboard (`supermandi-superadmin/`)

| File | Tickets | Changes |
|------|---------|---------|
| `src/api/suppliers.ts` | SA-1.3-001, 002, 003 | Add product approval API functions |
| `src/api/users.ts` | SA-1.3-005 | Add createUser function |
| `src/api/auditLogs.ts` (NEW) | SA-1.3-008 | New file for audit log API |
| `src/App.tsx` | SA-1.3-001, 002, 003, 005, 006, 008 | Add UI components |

### Backend (`backend/`)

| File | Tickets | Changes |
|------|---------|---------|
| `src/routes/v1/admin/users.ts` | SA-1.3-004, 009 | Add POST/DELETE handlers |
| `src/routes/v1/admin/stores.ts` | SA-1.3-006 | Extend PATCH for BNPL/credit |
| `src/routes/v1/admin/auditLogs.ts` (NEW) | SA-1.3-007 | New file for audit log endpoint |
| `src/routes/v1/admin/index.ts` | SA-1.3-007 | Register auditLogs router |

---

## E) VERIFICATION CHECKLIST

After implementation, verify on VM:

### Product Approval Flow
- [ ] Login to SuperAdmin dashboard
- [ ] Navigate to Suppliers tab
- [ ] See "Pending Products" section with count
- [ ] Click "Approve" → Product moves to approved
- [ ] Click "Reject" with reason → Product moves to rejected
- [ ] Click "Edit" → Modal opens with margin/BNPL fields
- [ ] Set margin, enable BNPL → Save → Retailer price calculated

### User Management Flow
- [ ] Navigate to Users tab
- [ ] Click "Create User" → Form appears
- [ ] Fill name, email → Submit → User appears in list
- [ ] Change user status → Dropdown saves

### Store BNPL/Credit Flow
- [ ] Navigate to Stores tab
- [ ] Expand store row
- [ ] See BNPL/Credit settings
- [ ] Toggle BNPL enabled → Save
- [ ] Set credit limit → Save

### Audit Trail Flow
- [ ] Navigate to Audit tab
- [ ] See list of admin actions
- [ ] Filter by date/type
- [ ] Expand row to see change details

---

*Document generated: 2026-01-28*
*Total Tickets: 9 (3 CRITICAL, 3 HIGH, 3 MEDIUM)*
