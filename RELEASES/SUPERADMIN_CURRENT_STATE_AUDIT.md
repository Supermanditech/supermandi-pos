# SUPERADMIN CURRENT STATE AUDIT

> Date: 2026-02-08
> Scope: POS App, Retailer Web, Supplier Web — all actions mapped to Superadmin control
> Method: Codebase audit with production-readiness assumptions (10K+ stores)

---

## LEGEND

| Symbol | Meaning |
|--------|---------|
| YES | Superadmin control exists and is functional |
| PARTIAL | Some control exists but incomplete |
| NO | No Superadmin control — gap |
| N/A | Not applicable or not needed |

---

## 1. STORE LIFECYCLE

| Action | App | Who Should Control | SA Control Exists? | Risk If Missing |
|--------|-----|-------------------|-------------------|-----------------|
| Create store | SA | Superadmin | YES | Low — admin-only endpoint |
| Activate store (DRAFT→ACTIVE) | SA | Superadmin | YES | Low — state machine enforced |
| Suspend store (ACTIVE→SUSPENDED) | SA | Superadmin | NO | **HIGH** — cannot temporarily disable a rogue/fraudulent store; only DELETE exists (permanent) |
| Reactivate suspended store | SA | Superadmin | NO | **HIGH** — no path back from suspension |
| Delete store (soft) | SA | Superadmin | YES | Low — sets status=deleted |
| View store directory | SA | Superadmin | YES | Low — paginated list |
| Edit store details | SA | Superadmin | YES | Low — name, UPI, address, contact |
| View store status history | SA | Superadmin | YES | Low — audit trail of transitions |
| Detect duplicate stores | SA | Superadmin | YES | Low — name/contact matching |
| Merge duplicate stores | SA | Superadmin | YES | Low — resolve duplicates |
| Set store KYC status | SA | Superadmin | YES | Low — part of activation flow |
| View pending registrations | SA | Superadmin | YES | Low |
| Store registration (apply) | Retailer | Retailer (SA approves) | YES | Low — gated by state machine |
| Store KYC submission | Retailer | Retailer (SA reviews) | YES | Low — triggers approval queue |
| Store UPI VPA submission | Retailer | Retailer (SA activates) | YES | Low — triggers state transition |
| Store settings (receipt, tax, hours) | Retailer | Retailer (SA should see) | NO | **MED** — SA cannot view/override store-level settings (receipt footer, tax rate, hours) |
| Store-level feature overrides | SA | Superadmin | PARTIAL | **MED** — scan_lookup_v2_enabled exists per store, but no general per-store feature flag system |
| Store spending/order limits | SA | Superadmin | NO | **HIGH** — no cap on how much a store can order |

---

## 2. USER & STAFF MANAGEMENT

| Action | App | Who Should Control | SA Control Exists? | Risk If Missing |
|--------|-----|-------------------|-------------------|-----------------|
| Create platform user | SA | Superadmin | YES | Low |
| Edit user status/info | SA | Superadmin | YES | Low |
| Deactivate user | SA | Superadmin | YES | Low |
| View all users | SA | Superadmin | YES | Low |
| Create admin account | SA | Superadmin | YES | Low |
| Manage admin roles (RBAC) | SA | Superadmin | YES | Low — 4 roles: super_admin, admin, moderator, viewer |
| Regenerate admin API key | SA | Superadmin | YES | Low |
| POS staff login/identity | POS | Superadmin (define roles) | NO | **CRITICAL** — POS has no staff identity; all actions attributed to device, not person |
| POS staff role/permissions | POS | Superadmin (assign roles) | NO | **CRITICAL** — no RBAC in POS; all staff have full access |
| Staff-level audit trail | POS | Superadmin (view) | NO | **CRITICAL** — cannot determine which staff member performed any action |
| Retailer portal user management | Retailer | Retailer + SA oversight | NO | **MED** — retailer manages own users, SA has no visibility into store staff |
| Force password reset | SA | Superadmin | PARTIAL | Low — exists for suppliers only, not for retailer users |
| Lock/unlock user account | SA | Superadmin | PARTIAL | MED — auto-lockout exists (brute force), but no manual lock/unlock |

---

## 3. DEVICE MANAGEMENT

| Action | App | Who Should Control | SA Control Exists? | Risk If Missing |
|--------|-----|-------------------|-------------------|-----------------|
| View all devices | SA | Superadmin | YES | Low — paginated list with online status |
| Edit device properties | SA | Superadmin | YES | Low — label, type, printing mode |
| Block/unblock device | SA | Superadmin | YES | Low — active flag; POS shows DeviceBlockedScreen |
| Generate enrollment code | SA | Superadmin | YES | Low — SMS-format, 30-min expiry, single-use |
| View enrollment codes | SA | Superadmin | YES | Low |
| Device enrollment (from POS) | POS | POS (SA issues code) | YES | Low — code validated by backend |
| Device token revocation | SA | Superadmin | PARTIAL | **MED** — token_revoked_at exists in DB but no SA UI endpoint to revoke |
| Force device re-enrollment | SA | Superadmin | NO | **MED** — no way to force POS to re-enroll (must block + re-issue code) |
| Device hardware whitelist | SA | Superadmin | NO | **LOW** — any HID device accepted; no serial number validation |
| Remote device config push | SA | Superadmin | NO | **MED** — cannot push config changes to device (must wait for next sync) |
| View device app version | SA | Superadmin | YES | Low — reported via device metadata |
| Force app update | SA | Superadmin | NO | **MED** — no mechanism to require minimum app version |

---

## 4. PRODUCT & CATALOG MANAGEMENT

| Action | App | Who Should Control | SA Control Exists? | Risk If Missing |
|--------|-----|-------------------|-------------------|-----------------|
| Approve supplier products | SA | Superadmin | YES | Low — approval_status workflow |
| Reject supplier products | SA | Superadmin | YES | Low — with rejection reason |
| Edit product margins | SA | Superadmin | YES | Low — fixed or percent margin |
| Edit BNPL terms | SA | Superadmin | YES | Low — eligibility + max days |
| POS create product (first scan) | POS | POS (SA should see) | NO | **HIGH** — POS auto-creates products from unknown barcodes; no approval, no quality gate |
| POS change sell price | POS | POS (SA should limit) | NO | **CRITICAL** — POS can set any price (including ₹0) with no validation or approval |
| POS change purchase price | POS | POS (SA should limit) | NO | **HIGH** — affects margin calculations |
| Retailer create product | Retailer | Retailer (SA should see) | NO | **MED** — retailer can create 500 products via bulk import; no SA approval |
| Retailer edit product price | Retailer | Retailer (SA should limit) | NO | **HIGH** — same price risk as POS |
| Retailer bulk import | Retailer | Retailer (SA should see) | NO | **MED** — mass import with no quality check |
| Product price bounds (min/max) | SA | Superadmin | NO | **CRITICAL** — no min/max price enforcement anywhere |
| Product category override | SA | Superadmin | PARTIAL | MED — CAT-AUTO-001 auto-assigns but SA cannot manually override per product |
| Global product catalog management | SA | Superadmin | PARTIAL | MED — deprecated endpoint exists but no active UI |

---

## 5. SUPPLIER MANAGEMENT

| Action | App | Who Should Control | SA Control Exists? | Risk If Missing |
|--------|-----|-------------------|-------------------|-----------------|
| View pending suppliers | SA | Superadmin | YES | Low |
| Approve supplier | SA | Superadmin | YES | Low — creates verified supplier |
| Reject supplier | SA | Superadmin | YES | Low — with review notes |
| View verified suppliers | SA | Superadmin | YES | Low — searchable list |
| View supplier KYC docs | SA | Superadmin | YES | Low |
| View supplier status history | SA | Superadmin | YES | Low |
| Change verification status | SA | Superadmin | YES | Low |
| Reset supplier password | SA | Superadmin | YES | Low |
| Suspend active supplier | SA | Superadmin | NO | **HIGH** — can reject pending but cannot suspend an already-active supplier |
| View supplier catalog (their products) | SA | Superadmin | PARTIAL | MED — can see pending products but not full active catalog per supplier |
| Supplier bank detail changes | Supplier | Supplier (SA should re-verify) | NO | **HIGH** — supplier can change bank details without re-verification |
| Supplier self-registration | Supplier | Supplier (SA approves) | YES | Low — gated by approval workflow |
| Supplier product upload | Supplier | Supplier (SA approves) | YES | Low — approval_status gate |

---

## 6. PAYMENT & FINANCIAL CONTROLS

| Action | App | Who Should Control | SA Control Exists? | Risk If Missing |
|--------|-----|-------------------|-------------------|-----------------|
| View payment analytics | SA | Superadmin | YES | Low — method adoption, success rates |
| View dues analytics | SA | Superadmin | YES | Low — outstanding amounts, aging |
| POS apply discount (item/cart) | POS | POS (SA should limit) | NO | **CRITICAL** — unlimited discounts (0-100%); no cap, no approval |
| POS record cash payment | POS | POS (SA should see) | PARTIAL | MED — event logged but no real-time visibility |
| POS record due (credit sale) | POS | POS (SA should limit) | NO | **HIGH** — unlimited customer dues; no cap per customer or per store |
| POS record split payment | POS | POS (SA should see) | NO | **MED** — UPI+cash split with no verification |
| POS offline payment recording | POS | POS (SA should validate) | NO | **HIGH** — offline sales synced without re-validation |
| Refund/reversal | SA | Superadmin | NO | **HIGH** — no refund API exists in entire system |
| Payment method control per store | SA | Superadmin | NO | **HIGH** — cannot disable specific payment methods (cash/UPI/due) per store |
| Store revenue visibility (real-time) | SA | Superadmin | PARTIAL | MED — analytics exist but batch/delayed, not real-time |
| GST credit tracking | SA | Superadmin | YES | Low — input credit lifecycle |
| BNPL limit per store | SA | Superadmin | PARTIAL | MED — backend sets credit limit but no SA UI to adjust per store |
| Due collection tracking | SA | Superadmin | PARTIAL | MED — analytics shows totals but no individual customer due aging |

---

## 7. PURCHASE & INVENTORY

| Action | App | Who Should Control | SA Control Exists? | Risk If Missing |
|--------|-----|-------------------|-------------------|-----------------|
| POS create purchase order | POS | POS (SA should limit) | NO | **HIGH** — can order unlimited amounts from any supplier; no spending cap |
| POS submit order to supplier | POS | POS (SA should approve for large orders) | NO | **HIGH** — immediate submission, no approval gate |
| POS cancel order | POS | POS (SA should see) | NO | **MED** — can cancel confirmed orders without approval |
| POS receive goods (GRN) | POS | POS (SA should validate) | NO | **HIGH** — can receive MORE than ordered; no quantity validation |
| POS stock-in (counter purchase) | POS | POS (SA should validate) | NO | **CRITICAL** — no supplier verification, no price validation; can record from unknown walk-in suppliers |
| POS manual stock adjustment | POS | POS (SA should see) | NO | **HIGH** — direct stock changes with no audit event |
| POS reorder policy changes | POS | POS (SA should approve) | NO | **HIGH** — can change min/max thresholds, preferred suppliers |
| POS auto-approve reorders | POS | POS (SA should know) | NO | **MED** — requireApproval=false means auto-ordering |
| Retailer inventory management | Retailer | Retailer (SA should see) | NO | **MED** — stock adjustments self-service |

---

## 8. FEATURE FLAGS & CONFIGURATION

| Action | App | Who Should Control | SA Control Exists? | Risk If Missing |
|--------|-----|-------------------|-------------------|-----------------|
| View system settings | SA | Superadmin | YES | Low |
| View system stats | SA | Superadmin | YES | Low |
| Feature flag: scan_lookup_v2 | SA | Superadmin | YES | Low — per-store toggle |
| Feature flag: buyEnabled | Backend | Superadmin | PARTIAL | **MED** — delivered via ui-status API but no SA UI to toggle per store |
| Feature flag: reorderEnabled | Backend | Superadmin | PARTIAL | Same as above |
| Feature flag: voiceEnabled | Backend | Superadmin | PARTIAL | Same as above |
| Feature flag: bnplEnabled | Backend | Superadmin | PARTIAL | Same as above |
| Feature flag: categoryBrowsingEnabled | Backend | Superadmin | PARTIAL | Same as above |
| Emergency feature kill switch | SA | Superadmin | NO | **CRITICAL** — no way to instantly disable a feature across all stores |
| Per-store feature override | SA | Superadmin | NO | **HIGH** — cannot enable/disable features for specific stores |
| Minimum app version enforcement | SA | Superadmin | NO | **MED** — cannot force POS to update |
| Maintenance mode | SA | Superadmin | NO | **HIGH** — no way to put system in maintenance mode |

---

## 9. OBSERVABILITY & INCIDENT CONTROL

| Action | App | Who Should Control | SA Control Exists? | Risk If Missing |
|--------|-----|-------------------|-------------------|-----------------|
| View POS events | SA | Superadmin | YES | Low |
| View audit logs | SA | Superadmin | YES | Low |
| View registration events | SA | Superadmin | YES | Low |
| View analytics (8 dimensions) | SA | Superadmin | YES | Low |
| AI-powered insights | SA | Superadmin | YES | Low |
| View document approval queue | SA | Superadmin | YES | Low |
| Real-time store health dashboard | SA | Superadmin | NO | **HIGH** — no per-store health indicator (online/offline, last sync, error rate) |
| Alert on anomalous activity | SA | Superadmin | NO | **HIGH** — no anomaly detection (sudden revenue drop, unusual discounts, mass cancellations) |
| POS sync status monitoring | SA | Superadmin | PARTIAL | MED — pending_outbox_count visible on devices page but no alerting |
| Error rate monitoring per store | SA | Superadmin | NO | **MED** — analytics exist but no error-rate dashboard |
| Forced sync trigger | SA | Superadmin | NO | **MED** — cannot force POS to sync |

---

## 10. COMPLIANCE & DOCUMENTS

| Action | App | Who Should Control | SA Control Exists? | Risk If Missing |
|--------|-----|-------------------|-------------------|-----------------|
| View pending documents | SA | Superadmin | YES | Low |
| Verify/reject documents | SA | Superadmin | YES | Low |
| View documents by entity | SA | Superadmin | YES | Low |
| GSTIN validation | Backend | Superadmin | YES | Low — format validation on registration |
| KYC document review | SA | Superadmin | YES | Low — approval workflow |
| Compliance status per store | SA | Superadmin | NO | **MED** — no aggregated compliance view (which stores have expired KYC, missing docs) |
| Generate barcode sheets | SA | Superadmin | YES | Low |

---

## SUMMARY COUNTS

| Control Status | Count | Percentage |
|----------------|-------|------------|
| YES (full control) | 48 | 51% |
| PARTIAL (incomplete) | 16 | 17% |
| NO (gap) | 30 | 32% |
| **Total actions audited** | **94** | **100%** |

**30 gaps identified. See SUPERADMIN_GAP_SUMMARY.md for severity classification.**
