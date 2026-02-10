# SUPERADMIN IMPLEMENTATION TICKETS

> Date: 2026-02-08
> Source: SUPERADMIN_GAP_SUMMARY.md (34 gaps → 34 tickets)
> Rule: One gap = one ticket. No bundling.
> **Updated: 2026-02-08 — Operator decisions applied (see OPERATOR DECISIONS below)**
>
> ## OPERATOR DECISIONS
>
> | Ticket | Decision |
> |--------|----------|
> | SA-P0-002 | Discounts are store-owned; SA sets limits (keep SA control) |
> | SA-P0-003 | Price bounds are store-owned; SA sets global defaults (keep SA control) |
> | SA-P0-004 | Supplier info is OPTIONAL on counter purchase; add editable supplier field on POS (not mandatory) |
> | SA-P1-002 | Spending limits → **Retailer Dashboard** (retailer-owned) |
> | SA-P1-003 | Due limits → **Retailer Dashboard** (retailer-owned) |
> | SA-P1-011 | Stock adjustment logging → **Retailer Dashboard** (retailer-owned) |
> | SA-P1-015 | Reorder policy supervision → **Retailer Dashboard** (store-owned) |
>
> ## PHASING DECISION (2026-02-10)
>
> | Category | Tickets | Count |
> |----------|---------|-------|
> | **ALREADY MERGED** | SA-P0-005, SA-P0-006, SA-P1-001, SA-P1-004, SA-P1-005, SA-P1-006, SA-P1-007, SA-P1-008 | 8 |
> | **CRITICAL GO-LIVE** | SA-P0-001, SA-P0-004, SA-P0-007, SA-P1-009, SA-P1-012, SA-P1-014, SA-P1-015, SA-P2-001 thru SA-P2-010 | 17 |
> | **DEFERRED (post go-live)** | SA-P0-002, SA-P0-003, SA-P1-002, SA-P1-003, SA-P1-010, SA-P1-011, SA-P1-013, SA-P2-011 | 8 |

---

## P0 TICKETS — GO-LIVE BLOCKERS

---

### SA-P0-001: Store Suspension & Reactivation

**Gap:** G-01
**Title:** Add SUSPENDED state to store lifecycle with immediate POS effect

**Assumed Requirement:**
Superadmin must be able to temporarily halt a store's operations (fraud investigation, compliance violation, payment dispute) without permanently deleting it. Suspension must take effect on POS within minutes.

**Scope:**
1. Add `SUSPENDED` status to store state machine (between ACTIVE and DELETED)
2. API: `PATCH /api/v1/admin/stores/:storeId/status` — add `ACTIVE→SUSPENDED` and `SUSPENDED→ACTIVE` transitions
3. Backend: When store status = SUSPENDED, all POS API calls return 403 with `{"code":"STORE_SUSPENDED","message":"Store operations temporarily suspended"}`
4. POS: Handle 403/STORE_SUSPENDED response — show blocking screen similar to DeviceBlockedScreen
5. SA UI: Add "Suspend" and "Reactivate" buttons on store detail page
6. Audit log: Record suspension reason, suspended_by, suspended_at

**Acceptance Criteria:**
- [ ] SA can suspend an ACTIVE store with reason
- [ ] Suspended store's POS devices show suspension screen within 1 API call
- [ ] SA can reactivate a SUSPENDED store
- [ ] Suspension/reactivation logged in audit trail
- [ ] Retailer portal shows suspension notice when store is SUSPENDED

**Systems Affected:** Backend (state machine, middleware), SA UI, POS (error handling), Retailer Portal (status display)
**Priority:** P0

---

### SA-P0-002: Discount Limits & Approval Gate

**Gap:** G-02
**Title:** Enforce maximum discount percentage per store with SA-configurable limits

**Assumed Requirement:**
Superadmin must be able to set per-store discount limits. Discounts exceeding the limit should either be blocked or require manager approval. Without this, a single cashier can zero out an entire day's revenue.

**Scope:**
1. DB: Add `max_discount_percent` column to stores table (default: 15, range: 0-100)
2. API (admin): `PATCH /api/v1/admin/stores/:storeId` — add `max_discount_percent` field
3. API (POS): Include `max_discount_percent` in `/api/v1/pos/ui-status` response
4. POS: Enforce discount cap in checkout flow
   - Item-level discount: capped at store's max_discount_percent
   - Cart-level discount: capped at store's max_discount_percent of cart total
   - If user attempts > limit: show "Discount exceeds store limit (X%)" error
5. SA UI: Add "Max Discount %" field on store edit page
6. Event: Log `DISCOUNT_LIMIT_HIT` event when limit is reached

**Acceptance Criteria:**
- [ ] SA can set max_discount_percent per store (0-100)
- [ ] POS blocks discounts exceeding the limit
- [ ] Default limit is 15% for new stores
- [ ] POS displays clear error when limit hit
- [ ] Event logged when limit is reached

**Systems Affected:** Backend (stores table, ui-status), SA UI, POS (checkout logic)
**Priority:** P0

---

### SA-P0-003: Product Price Bounds Enforcement

**Gap:** G-03
**Title:** Enforce minimum and maximum sell price bounds for store products

**Assumed Requirement:**
Products must have enforceable price bounds to prevent ₹0 sales or absurdly inflated prices. SA should set global defaults; stores can operate within those bounds.

**Scope:**
1. DB: Add `min_sell_price_paise` (default: 100 = ₹1) and `max_sell_price_paise` (default: 10000000 = ₹100,000) to platform config or stores table
2. Backend validation: On `POST/PATCH /api/v1/pos/store-products` and retailer product endpoints, validate sell_price within bounds
3. API response: Return 422 with `{"code":"PRICE_OUT_OF_BOUNDS","min":100,"max":10000000}` if violated
4. POS: Display error when price is out of bounds
5. SA UI: Global price bounds configuration in Settings page
6. SA API: `PATCH /api/v1/admin/settings/price-bounds` — set global min/max

**Acceptance Criteria:**
- [ ] Backend rejects sell prices below minimum or above maximum
- [ ] SA can configure global price bounds
- [ ] POS shows clear error message with allowed range
- [ ] Existing products with out-of-bound prices are grandfathered (warning only)
- [ ] Retailer portal enforces same bounds

**Systems Affected:** Backend (validation middleware), SA UI (settings), POS (error handling), Retailer Portal (product form)
**Priority:** P0

---

### SA-P0-004: Stock-In Supplier Info (Optional + Editable)

**Gap:** G-04
**Title:** Add optional, editable supplier fields to POS counter purchase screen

**Operator Decision:** Retailer CAN buy without supplier name or GST. Supplier info is OPTIONAL but should be editable on the POS counter purchase screen.

**Assumed Requirement:**
Counter purchases (walk-in buys) are a normal retail operation. Supplier info (name, GSTIN) should be available as editable fields so retailers can record it when known, but it must NOT be mandatory — many walk-in purchases legitimately have no supplier identity.

**Scope:**
1. POS: Add editable `supplier_name` and `supplier_gstin` fields on counter purchase screen (both optional)
2. POS: Pre-populate from verified supplier list if retailer selects one (dropdown + "None/Walk-in" default)
3. Backend: Accept stock-in entries with or without supplier reference
4. Backend: Store supplier_name and supplier_gstin on stock-in records when provided
5. SA analytics: Dashboard shows stock-in by supplier (known vs walk-in breakdown)
6. SA API: Filter stock-in events by supplier type (verified vs walk-in vs unknown)

**Acceptance Criteria:**
- [ ] POS counter purchase screen has optional supplier_name and supplier_gstin fields
- [ ] Fields are editable (not just dropdown — can type manually)
- [ ] Stock-in works without supplier info (no blocking)
- [ ] When supplier info is provided, it's stored and visible in SA analytics
- [ ] SA can see stock-in breakdown: verified supplier / walk-in with info / walk-in no info
- [ ] Existing stock-in records without supplier are labeled "Legacy/Unknown" in analytics

**Systems Affected:** Backend (stock-in API, analytics), POS (counter purchase UI), SA UI (analytics filter)
**Priority:** P0

---

### SA-P0-005: Emergency Feature Kill Switch

**Gap:** G-05
**Title:** Add system-wide and per-store feature kill switch in Superadmin

**Assumed Requirement:**
If a feature (voice, BNPL, buy, reorder) has a critical bug in production, SA must instantly disable it across all stores or specific stores. POS must respect the kill switch within one health check cycle (~15 min max, ideally sooner).

**Scope:**
1. DB: Create `admin.feature_flags` table: `(feature_key, enabled_global, created_at, updated_at)`
2. DB: Create `admin.store_feature_overrides` table: `(store_id, feature_key, enabled, updated_at)`
3. SA API: `GET /api/v1/admin/feature-flags` — list all flags with global status
4. SA API: `PATCH /api/v1/admin/feature-flags/:key` — toggle global flag
5. SA API: `PATCH /api/v1/admin/stores/:storeId/feature-flags/:key` — per-store override
6. Backend: Modify `/api/v1/pos/ui-status` to read from feature_flags tables (global + per-store override)
7. SA UI: Feature Flags panel in Settings tab — toggle switches for each feature, per-store override table
8. Feature keys: `buy`, `reorder`, `voice`, `bnpl`, `credit`, `categoryBrowsing`, `scanLookupV2`

**Acceptance Criteria:**
- [ ] SA can disable any feature globally (one click)
- [ ] SA can override feature per store (enable/disable)
- [ ] POS respects kill switch within next ui-status fetch
- [ ] Kill switch state persists across backend restarts (DB-backed)
- [ ] Audit log records who changed what flag and when

**Systems Affected:** Backend (new tables, ui-status logic), SA UI (feature flags panel), POS (reads ui-status)
**Priority:** P0

---

### SA-P0-006: Refund & Sale Reversal Capability

**Gap:** G-06
**Title:** Implement sale reversal/refund API with SA approval gate

**Assumed Requirement:**
Customer refunds are a fundamental retail operation. Without refund capability, incorrect sales cannot be corrected, leading to accounting errors and customer complaints.

**Scope:**
1. DB: Add `refunds` table: `(id, original_sale_id, store_id, amount_paise, reason, status, approved_by, created_at)`
2. API: `POST /api/v1/pos/sales/:saleId/refund` — create refund request (POS initiates)
3. API: `GET /api/v1/admin/refunds/pending` — list pending refund requests
4. API: `POST /api/v1/admin/refunds/:id/approve` — SA approves refund
5. API: `POST /api/v1/admin/refunds/:id/reject` — SA rejects refund
6. Backend: Approved refund creates negative ledger entry, adjusts inventory
7. POS: "Request Refund" option on bill detail screen — creates pending request
8. SA UI: Refund approval queue (similar to supplier approval queue)
9. Refund types: FULL (entire sale) or PARTIAL (specific items)

**Acceptance Criteria:**
- [ ] POS can initiate refund request for any completed sale
- [ ] Refund request appears in SA approval queue
- [ ] SA can approve or reject with reason
- [ ] Approved refund adjusts financial ledger and inventory
- [ ] Refund audit trail: who requested, who approved, amount, reason
- [ ] POS shows refund status (pending/approved/rejected)

**Systems Affected:** Backend (new table, new routes), SA UI (refund queue), POS (refund request UI)
**Priority:** P0

---

### SA-P0-007: System Maintenance Mode

**Gap:** G-07
**Title:** Add maintenance mode toggle that gracefully blocks all client access

**Assumed Requirement:**
During emergencies (security incidents, critical migrations, infrastructure changes), SA must gracefully block all API access with a user-friendly message, rather than relying on infrastructure shutdown.

**Scope:**
1. DB: Add `admin.system_config` table: `(key, value, updated_at, updated_by)` — or add to existing settings
2. Config key: `maintenance_mode` (boolean), `maintenance_message` (string)
3. Backend middleware: Check maintenance_mode on every request
   - If enabled: return 503 with `{"code":"MAINTENANCE","message":"...","estimatedEnd":"..."}`
   - Exempt: SA admin routes (so SA can disable maintenance mode)
   - Exempt: Health check endpoints
4. POS: Handle 503/MAINTENANCE — show maintenance screen with message
5. SA UI: "Maintenance Mode" toggle in Settings with message editor
6. SA API: `PATCH /api/v1/admin/settings/maintenance` — toggle + message

**Acceptance Criteria:**
- [ ] SA can enable maintenance mode with custom message
- [ ] All non-admin API calls return 503 during maintenance
- [ ] SA admin routes remain accessible (to disable maintenance)
- [ ] Health endpoints remain accessible (for monitoring)
- [ ] POS shows friendly maintenance screen
- [ ] Retailer/Supplier portals show maintenance page
- [ ] Audit log records maintenance mode changes

**Systems Affected:** Backend (middleware), SA UI (settings), POS (error screen), Retailer Portal, Supplier Portal
**Priority:** P0

---

## P1 TICKETS — OPERATIONAL RISK

---

### SA-P1-001: POS Staff Identity & Basic RBAC

**Gap:** G-08, G-09
**Title:** Add staff login to POS with role-based action gating

**Assumed Requirement:**
At scale (10K+ stores, 3+ staff per store), individual accountability is required. Each POS action must be attributed to a specific staff member, and certain actions (discounts, refunds, settings) should be restricted by role.

**Scope:**
1. DB: Add `store_staff` table: `(id, store_id, name, phone, pin_hash, role, is_active, created_at)`
2. Roles: `CASHIER` (sell only), `STOCK_MANAGER` (sell + inward), `MANAGER` (all operations)
3. POS: Add staff PIN login screen after device enrollment (4-6 digit PIN)
4. POS: Include `staff_id` in all API calls (sales, stock-in, orders)
5. Backend: Record `staff_id` on sales, stock adjustments, orders
6. SA UI: Staff management per store (add/edit/deactivate staff, assign roles)
7. SA API: CRUD for store staff

**Acceptance Criteria:**
- [ ] POS requires staff PIN before operations
- [ ] Each sale/action includes staff_id
- [ ] SA can view staff activity per store
- [ ] Role restrictions enforced (CASHIER cannot do stock-in)
- [ ] Staff audit trail visible in SA

**Systems Affected:** Backend (new table, staff auth), SA UI (staff management), POS (staff login, role checks)
**Priority:** P1

---

### SA-P1-002: Purchase Order Spending Limits (Retailer Dashboard)

**Gap:** G-10
**Title:** Set daily/monthly spending limits per store for purchase orders

**Operator Decision:** This is retailer-owned. Spending limits should be configured from the **Retailer Web Dashboard**, not Superadmin.

**Assumed Requirement:**
Retailers should be able to set their own spending caps per store to control over-ordering and budget overruns. This is a self-service store management feature.

**Scope:**
1. DB: Add `daily_order_limit_paise` and `monthly_order_limit_paise` to stores table (default: NULL = unlimited)
2. Backend: On order submission, check accumulated spend vs limit
3. POS: Show remaining budget on order screen; block if limit exceeded
4. **Retailer Dashboard:** Spending limit configuration on store settings page
5. Retailer API: `PATCH /api/v1/retailer/store/settings` — update spending limits
6. SA: Read-only visibility into store spending limits (via SA-P1-014 Store Settings Visibility)

**Acceptance Criteria:**
- [ ] Retailer can set daily and monthly spending limits from Retailer Dashboard
- [ ] Backend rejects orders exceeding limits
- [ ] POS shows clear "Budget exceeded" message
- [ ] Retailer Dashboard shows spending vs limit
- [ ] SA can view spending limits (read-only) via store settings

**Systems Affected:** Backend (order validation), **Retailer Dashboard** (settings), POS (order screen), SA (read-only visibility)
**Priority:** P1

---

### SA-P1-003: Customer Due Limits (Retailer Dashboard)

**Gap:** G-11
**Title:** Set maximum outstanding due amount per store

**Operator Decision:** This is retailer-owned. Due limits should be configured from the **Retailer Web Dashboard**, not Superadmin.

**Assumed Requirement:**
Retailers should control their own credit risk by setting due limits per store and optionally per customer. This is a self-service store management feature.

**Scope:**
1. DB: Add `max_outstanding_dues_paise` to stores table (default: 5000000 = ₹50,000)
2. Backend: On DUE payment recording, check store's total outstanding vs limit
3. POS: Show remaining due capacity; block new dues if limit exceeded
4. **Retailer Dashboard:** Due limit configuration on store settings page
5. **Retailer Dashboard:** Due aging report (30/60/90 day buckets)
6. Retailer API: `PATCH /api/v1/retailer/store/settings` — update due limits
7. SA: Read-only visibility into due limits and aging (via SA-P1-014 Store Settings Visibility)

**Acceptance Criteria:**
- [ ] Retailer can set max outstanding dues from Retailer Dashboard
- [ ] Backend blocks new due sales when limit exceeded
- [ ] POS shows "Due limit reached" message
- [ ] Retailer Dashboard shows due aging per customer (30/60/90 days)
- [ ] SA can view due limits (read-only) via store settings

**Systems Affected:** Backend (checkout validation), **Retailer Dashboard** (settings, analytics), POS (checkout), SA (read-only visibility)
**Priority:** P1

---

### SA-P1-004: GRN Quantity Validation

**Gap:** G-12
**Title:** Flag and require approval for GRN quantities exceeding ordered amounts

**Assumed Requirement:**
Receiving more goods than ordered is a common indicator of theft or accounting manipulation. SA must be alerted and can require approval for excess receipts.

**Scope:**
1. Backend: On GRN submission, compare received_qty vs ordered_qty per line item
2. If received > ordered: flag as `EXCESS_RECEIPT`, create alert for SA
3. SA API: `GET /api/v1/admin/grn/alerts` — list excess receipt alerts
4. SA UI: GRN alerts panel (store, order, item, ordered qty, received qty)
5. Optional: Configurable threshold (e.g., allow 10% excess without alert)

**Acceptance Criteria:**
- [ ] Backend detects received_qty > ordered_qty
- [ ] Alert created in SA for excess receipts
- [ ] SA can view and acknowledge alerts
- [ ] POS allows receipt but shows warning

**Systems Affected:** Backend (GRN validation, alerts table), SA UI (alerts panel)
**Priority:** P1

---

### SA-P1-005: Supplier Suspension

**Gap:** G-13
**Title:** Add SUSPENDED status for active suppliers

**Assumed Requirement:**
SA must be able to suspend an already-verified supplier (fraud, quality issues, compliance violations) without losing their data. Suspension should hide them from retailer/POS supplier lists.

**Scope:**
1. DB: Add `SUSPENDED` to supplier verification_status enum
2. Backend: Suspended suppliers excluded from retailer/POS supplier lists
3. SA API: `PATCH /api/v1/admin/suppliers/:id/verification-status` — allow `verified→suspended`
4. SA API: `PATCH /api/v1/admin/suppliers/:id/verification-status` — allow `suspended→verified` (reactivate)
5. SA UI: "Suspend" button on supplier detail
6. Supplier portal: Show suspension notice on login

**Acceptance Criteria:**
- [ ] SA can suspend a verified supplier with reason
- [ ] Suspended supplier hidden from all store/POS lists
- [ ] Existing orders not cancelled (fulfill in progress)
- [ ] SA can reactivate suspended supplier
- [ ] Audit trail records suspension/reactivation

**Systems Affected:** Backend (supplier status, list filtering), SA UI, Supplier Portal
**Priority:** P1

---

### SA-P1-006: Payment Method Control Per Store

**Gap:** G-14
**Title:** Allow SA to enable/disable payment methods per store

**Assumed Requirement:**
SA must control which payment methods (cash, UPI, due/credit) are available at each store. Compliance may require UPI-only stores; risky stores should have dues disabled.

**Scope:**
1. DB: Add `allowed_payment_methods` (JSONB array) to stores table. Default: `["CASH","UPI","DUE"]`
2. Backend: Include in ui-status response
3. POS: Only show allowed payment methods in checkout
4. SA UI: Payment method checkboxes on store edit page
5. SA API: Update allowed payment methods per store

**Acceptance Criteria:**
- [ ] SA can toggle payment methods per store
- [ ] POS only shows allowed methods
- [ ] Backend rejects disallowed payment types
- [ ] Default: all methods enabled

**Systems Affected:** Backend (stores, ui-status, checkout validation), SA UI, POS (checkout)
**Priority:** P1

---

### SA-P1-007: Per-Store Feature Flag Overrides

**Gap:** G-15
**Title:** Enable SA to override feature flags per store (depends on SA-P0-005)

**Assumed Requirement:**
Beyond global kill switch (P0), SA needs granular per-store feature control for piloting, troubleshooting, and compliance.

**Scope:**
Covered by SA-P0-005 (per-store override table). This ticket adds:
1. SA UI: Per-store feature flags on store detail page
2. SA UI: Bulk feature flag update (select stores → toggle feature)
3. Backend: Feature override precedence: per-store > global

**Acceptance Criteria:**
- [ ] SA can toggle features per individual store
- [ ] Per-store overrides take precedence over global
- [ ] Bulk update for multiple stores

**Systems Affected:** SA UI (store detail, bulk update)
**Priority:** P1

---

### SA-P1-008: Supplier Bank Detail Re-Verification

**Gap:** G-16
**Title:** Require SA approval when supplier changes bank details

**Assumed Requirement:**
Bank detail changes on a verified supplier account could redirect payouts to fraudulent accounts. SA must approve bank detail changes.

**Scope:**
1. Backend: On supplier profile update with bank fields, set `bank_verification_status = PENDING`
2. SA API: `GET /api/v1/admin/suppliers/bank-changes` — list pending bank verifications
3. SA API: `POST /api/v1/admin/suppliers/:id/bank-verify` — approve/reject
4. Supplier portal: Show "Bank details under review" status
5. Payouts: Block payouts to unverified bank accounts

**Acceptance Criteria:**
- [ ] Bank detail changes trigger re-verification
- [ ] SA sees pending bank verifications
- [ ] Payouts blocked until bank verified
- [ ] Audit trail for bank changes

**Systems Affected:** Backend (supplier profile, payout logic), SA UI, Supplier Portal
**Priority:** P1

---

### SA-P1-009: Real-Time Store Health Dashboard

**Gap:** G-17
**Title:** Add per-store health indicators to SA dashboard

**Assumed Requirement:**
SA must see at a glance which stores are healthy (online, syncing, transacting) vs problematic (offline, stale, erroring).

**Scope:**
1. Backend: Aggregate per-store health from device last_seen_online, pending_outbox_count, last sale timestamp
2. SA API: `GET /api/v1/admin/stores/health` — list stores with health indicators
3. Health indicators: online/offline, last_sync_age, pending_outbox, last_sale_age, error_count_24h
4. SA UI: Health dashboard with color-coded store cards (green/yellow/red)
5. Sort/filter by health status

**Acceptance Criteria:**
- [ ] SA sees per-store health at a glance
- [ ] Stores color-coded by health status
- [ ] Can filter to show only unhealthy stores
- [ ] Health data updates on page refresh

**Systems Affected:** Backend (health aggregation), SA UI (health dashboard)
**Priority:** P1

---

### SA-P1-010: Anomaly Detection & Alerting

**Gap:** G-18
**Title:** Basic anomaly alerts for revenue drops, unusual discounts, mass actions

**Assumed Requirement:**
At 10K stores, manual monitoring is impossible. SA needs automated alerts for anomalous patterns that could indicate fraud, errors, or operational issues.

**Scope:**
1. Backend: Periodic job (hourly) computes per-store metrics vs rolling 7-day average
2. Alert triggers: revenue drop >50%, discount rate >2x average, >5 order cancellations/day, 0 sales for >4 hours during operating hours
3. DB: `admin.alerts` table: `(id, store_id, alert_type, severity, message, acknowledged, created_at)`
4. SA API: `GET /api/v1/admin/alerts` — list active alerts
5. SA API: `POST /api/v1/admin/alerts/:id/acknowledge` — dismiss alert
6. SA UI: Alerts panel with badge count on navigation

**Acceptance Criteria:**
- [ ] Automated alerts generated for defined anomalies
- [ ] SA sees alert count badge
- [ ] Alerts are dismissible with acknowledgment
- [ ] Alert history retained for audit

**Systems Affected:** Backend (scheduled job, alerts table), SA UI (alerts panel)
**Priority:** P1

---

### SA-P1-011: Stock Adjustment Audit Logging (Retailer Dashboard)

**Gap:** G-19
**Title:** Log all manual stock adjustments as auditable events

**Operator Decision:** This is retailer-owned. Stock adjustment logs should be visible in the **Retailer Web Dashboard**, not just Superadmin.

**Assumed Requirement:**
Manual inventory adjustments must be logged with reason. Retailers need visibility into their own store's stock adjustments for shrinkage detection and audit.

**Scope:**
1. POS: Add `reason` field to stock adjustment (DAMAGE, EXPIRY, COUNT_CORRECTION, OTHER)
2. Backend: Record stock_adjustment event with old_qty, new_qty, reason, device_id
3. **Retailer Dashboard:** Stock adjustment history page (filterable by date, product, reason)
4. Retailer API: `GET /api/v1/retailer/store/stock-adjustments` — list adjustments
5. SA: Read-only visibility via existing analytics endpoints

**Acceptance Criteria:**
- [ ] POS requires reason for stock adjustments
- [ ] Backend logs adjustment with old/new qty and reason
- [ ] Retailer Dashboard shows adjustment history (date, product, old qty, new qty, reason)
- [ ] SA can view adjustment history per store (read-only)

**Systems Affected:** Backend (event logging), POS (adjustment UI), **Retailer Dashboard** (stock history), SA (read-only analytics)
**Priority:** P1

---

### SA-P1-012: Offline Sale Re-Validation

**Gap:** G-20
**Title:** Backend validates price/discount on offline sale sync

**Assumed Requirement:**
Sales created offline bypass real-time backend validation. On sync, backend must verify prices and discounts against current bounds before accepting.

**Scope:**
1. Backend: On sync endpoint, validate each sale's line items against price bounds
2. Backend: Validate discounts against store's max_discount_percent
3. If violation: Accept sale but flag as `NEEDS_REVIEW`, create SA alert
4. SA API: `GET /api/v1/admin/sales/flagged` — list flagged offline sales

**Acceptance Criteria:**
- [ ] Offline sales validated on sync
- [ ] Out-of-bounds sales flagged (not rejected — data preservation)
- [ ] SA can view flagged sales
- [ ] Flag includes specific violation (price/discount/other)

**Systems Affected:** Backend (sync validation), SA UI (flagged sales)
**Priority:** P1

---

### SA-P1-013: Device Token Revocation UI

**Gap:** G-21
**Title:** Add device token revocation to SA device management

**Assumed Requirement:**
SA must be able to revoke device tokens without direct DB access. More targeted than blocking the device entirely.

**Scope:**
1. SA API: `POST /api/v1/admin/devices/:deviceId/revoke-token` — sets token_revoked_at
2. SA UI: "Revoke Token" button on device detail (forces re-enrollment)
3. Backend: Existing token revocation check already works

**Acceptance Criteria:**
- [ ] SA can revoke device token from UI
- [ ] Device forced to re-enroll on next API call
- [ ] Audit log records token revocation

**Systems Affected:** Backend (admin route), SA UI (device detail)
**Priority:** P1

---

### SA-P1-014: Store Settings Visibility

**Gap:** G-22
**Title:** Allow SA to view (read-only) store-level settings

**Assumed Requirement:**
SA must audit what settings a store has configured (receipt footer, tax rate, operating hours, UPI VPA) for compliance and troubleshooting.

**Scope:**
1. SA API: `GET /api/v1/admin/stores/:storeId/settings` — return all store settings
2. SA UI: "Settings" tab on store detail page (read-only view)
3. Include: receipt_footer, tax_rate, open_time, close_time, gst_number, upi_vpa, allowed_payment_methods

**Acceptance Criteria:**
- [ ] SA can view all store settings (read-only)
- [ ] Displayed on store detail page

**Systems Affected:** Backend (admin route), SA UI (store detail)
**Priority:** P1

---

### SA-P1-015: Reorder Policy Supervision (Retailer Dashboard)

**Gap:** G-23
**Title:** Log reorder policy changes and show in Retailer Dashboard

**Operator Decision:** This is store-owned. Reorder policy management and change logs should be in the **Retailer Web Dashboard**, not just Superadmin.

**Assumed Requirement:**
Reorder policies control automated purchasing. Retailers need visibility into policy changes for their own store. SA gets read-only oversight.

**Scope:**
1. Backend: Log reorder policy changes (event: `REORDER_POLICY_CHANGED`, old/new values)
2. **Retailer Dashboard:** Reorder policy management page (view/edit policies)
3. **Retailer Dashboard:** Policy change history log
4. Retailer API: `GET /api/v1/retailer/store/reorder-policies` — list policies with change history
5. SA: Read-only visibility via analytics; alert on suspicious configurations (auto-approve, zero threshold)

**Acceptance Criteria:**
- [ ] Policy changes logged with old/new values
- [ ] Retailer Dashboard shows reorder policies with change history
- [ ] Retailer can manage reorder policies from dashboard
- [ ] SA can view change history (read-only)
- [ ] SA alerted on suspicious configurations

**Systems Affected:** Backend (event logging), **Retailer Dashboard** (reorder management), SA (read-only analytics + alerts)
**Priority:** P1

---

## P2 TICKETS — EFFICIENCY (CRITICAL BEFORE GO-LIVE)

---

### SA-P2-001: Force Device Re-Enrollment

**Gap:** G-24
**Title:** Add "Force Re-Enroll" action to SA device management

**Scope:**
1. SA API: `POST /api/v1/admin/devices/:deviceId/force-reenroll` — revoke token + block device
2. SA UI: "Force Re-Enroll" button (combines block + revoke in one action)

**Priority:** P2

---

### SA-P2-002: Remote Config Push Notification

**Gap:** G-25
**Title:** Push notification to POS to trigger immediate config refresh

**Scope:**
1. Backend: Send push notification via FCM when store config changes
2. POS: On push receipt, trigger immediate ui-status refresh

**Priority:** P2

---

### SA-P2-003: Minimum App Version Enforcement

**Gap:** G-26
**Title:** Add minimum app version check to POS health endpoint

**Scope:**
1. DB: Add `min_app_version` to system config
2. Backend: On ui-status, compare POS app version vs minimum; return `force_update: true` if below
3. POS: Show mandatory update screen when force_update is true

**Priority:** P2

---

### SA-P2-004: Compliance Status Aggregation

**Gap:** G-27
**Title:** Aggregate KYC/compliance status across all stores

**Scope:**
1. SA API: `GET /api/v1/admin/compliance/overview` — stores grouped by compliance status
2. SA UI: Compliance dashboard (complete/incomplete/expired)

**Priority:** P2

---

### SA-P2-005: Force POS Sync Trigger

**Gap:** G-28
**Title:** SA-initiated sync trigger via push notification

**Scope:**
1. SA API: `POST /api/v1/admin/devices/:deviceId/trigger-sync`
2. Backend: Send FCM push to device with `sync_now: true` payload
3. POS: On push receipt, trigger sync cycle

**Priority:** P2

---

### SA-P2-006: Product Category Manual Override

**Gap:** G-29
**Title:** Allow SA to manually override product category assignment

**Scope:**
1. SA API: `PATCH /api/v1/admin/products/:productId/category` — set taxonomy_id
2. SA UI: Category dropdown on product detail (accessible from analytics)

**Priority:** P2

---

### SA-P2-007: BNPL Limit Adjustment UI

**Gap:** G-30
**Title:** Add BNPL credit limit editor to SA store management

**Scope:**
1. SA UI: BNPL limit field on store edit page
2. SA API: Include `bnpl_credit_limit` in store PATCH endpoint

**Priority:** P2

---

### SA-P2-008: Retailer Bulk Import Notification

**Gap:** G-31
**Title:** Notify SA when retailer performs bulk product import

**Scope:**
1. Backend: On bulk import (>50 products), create SA notification
2. SA UI: Notification in alerts panel
3. SA API: Bulk import log endpoint

**Priority:** P2

---

### SA-P2-009: Device Hardware Whitelist

**Gap:** G-32
**Title:** Optional HID device serial number whitelist per store

**Scope:**
1. DB: `store_device_whitelist` table (store_id, serial_number, device_type)
2. POS: Report scanner serial on connection; backend validates if whitelist enabled
3. SA UI: Device whitelist management per store

**Priority:** P2

---

### SA-P2-010: Retailer User Force Password Reset

**Gap:** G-33
**Title:** Add force password reset for retailer portal users

**Scope:**
1. SA API: `POST /api/v1/admin/users/:userId/force-reset`
2. Backend: Invalidate all tokens, send reset link
3. SA UI: "Force Reset" button on user detail

**Priority:** P2

---

### SA-P2-011: Persistent Rate Limiting

**Gap:** G-34
**Title:** Move rate limit state from in-memory to Redis

**Scope:**
1. Backend: Replace in-memory rate limit maps with Redis-backed counters
2. Survives backend restarts
3. Shared across multiple backend instances

**Priority:** P2

---

## TICKET SUMMARY (Updated 2026-02-10)

| Category | Count | Details |
|----------|-------|---------|
| **Already Merged** | **8** | SA-P0-005, SA-P0-006, SA-P1-001, SA-P1-004, SA-P1-005, SA-P1-006, SA-P1-007, SA-P1-008 |
| **Critical Go-Live** | **17** | 3 P0 + 4 P1 + 10 P2 (see implementation order) |
| **Deferred (post go-live)** | **8** | SA-P0-002, SA-P0-003, SA-P1-002, SA-P1-003, SA-P1-010, SA-P1-011, SA-P1-013, SA-P2-011 |
| **Total** | **33** | |

---

## IMPLEMENTATION ORDER (Updated 2026-02-10)

> **Operator Decision (2026-02-10):** Phased approach. 17 tickets critical for go-live; 8 deferred to post-launch.

### ALREADY MERGED (8 tickets — DONE)
1. ~~SA-P0-005 — Feature kill switch~~ (PR #9 — MERGED)
2. ~~SA-P0-006 — Refund & sale reversal~~ (PR #11 — MERGED)
3. ~~SA-P1-001 — Staff identity/RBAC~~ (PR #5 — MERGED)
4. ~~SA-P1-004 — GRN quantity validation~~ (PR #6 — MERGED)
5. ~~SA-P1-005 — Supplier suspension~~ (PR #7 — MERGED)
6. ~~SA-P1-006 — Payment method control per store~~ (PR #8 — MERGED)
7. ~~SA-P1-007 — Per-store feature flag overrides~~ (PR #9 — MERGED)
8. ~~SA-P1-008 — Supplier bank detail re-verification~~ (PR #10 — MERGED)

### CRITICAL GO-LIVE (17 tickets — must implement before launch)

**P0 — Go-Live Blockers (3 tickets)**
1. SA-P0-001 — Store suspension & reactivation
2. SA-P0-004 — Stock-in supplier info (optional + editable on POS)
3. SA-P0-007 — Maintenance mode (enables emergency shutdown)

**P1 — Operational (4 tickets)**
4. SA-P1-009 — Store health dashboard
5. SA-P1-012 — Offline sale re-validation
6. SA-P1-014 — Store settings visibility (read-only)
7. SA-P1-015 — Reorder policy supervision (Retailer Dashboard)

**P2 — Platform (10 tickets)**
8. SA-P2-001 — Force device re-enrollment
9. SA-P2-002 — Remote config push notification
10. SA-P2-003 — Minimum app version enforcement
11. SA-P2-004 — Compliance status aggregation
12. SA-P2-005 — Force POS sync trigger
13. SA-P2-006 — Product category manual override
14. SA-P2-007 — BNPL limit adjustment UI
15. SA-P2-008 — Retailer bulk import notification
16. SA-P2-009 — Device hardware whitelist
17. SA-P2-010 — Retailer user force password reset

### DEFERRED — POST GO-LIVE (8 tickets)
- SA-P0-002 — Discount limits & approval gate
- SA-P0-003 — Price bounds enforcement
- SA-P1-002 — Purchase order spending limits (Retailer Dashboard)
- SA-P1-003 — Customer due limits (Retailer Dashboard)
- SA-P1-010 — Anomaly detection & alerting
- SA-P1-011 — Stock adjustment audit logging (Retailer Dashboard)
- SA-P1-013 — Device token revocation UI
- SA-P2-011 — Persistent rate limiting
