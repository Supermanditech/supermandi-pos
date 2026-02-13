# Cross-Relation Matrices

> **Purpose**: Map data consistency rules between Retailer Web, POS, and SuperAdmin.
> **Generated**: 2026-02-13
> **Companion**: `RELEASES/RWSM.md` (screen map), `RELEASES/SCREENWISE_TESTING_BACKLOG.md` (tickets)

---

## D2a: Retailer Web ↔ POS Matrix (RW↔POS)

### Inventory & Stock

| Domain | Source of Truth | Sync Rule | RW Screen | POS Screen | Consistency Check |
|--------|----------------|-----------|-----------|------------|-------------------|
| **Stock levels** | DB `inventory.stock_qty` | Real-time on write | S06 Inventory, S04 Dashboard | StockStatement | RW stock qty per product = POS StockStatement qty |
| **Stock inward (manual)** | DB `ledger_entries` | Immediate on POST | S06 Inventory (INWARD entry) | InwardScreen | POS manual inward → RW ledger shows same qty, cost, supplier, timestamp |
| **Stock inward (GRN)** | DB `ledger_entries` + `purchase_orders` | Immediate on GRN submit | S06 Inventory (INWARD entry) | GRNScreen | POS GRN → RW ledger INWARD entry + PO status = "delivered" |
| **Stock outward (sale)** | DB `ledger_entries` | Immediate on sale POST | S06 Inventory (OUTWARD entry) | PaymentScreen (sale complete) | POS sale → RW ledger OUTWARD entry, stock reduced by qty sold |
| **Stock adjustment** | DB `ledger_entries` | Immediate on adjustment | S06 Inventory (ADJUSTMENT entry) | N/A | RW-only adjustments (if any) must not exist in POS |

### Pricing

| Domain | Source of Truth | Sync Rule | RW Screen | POS Screen | Consistency Check |
|--------|----------------|-----------|-----------|------------|-------------------|
| **Selling price** | DB `store_products.selling_price` | POS refreshes on app resume (CACHE-000) | S05 Products (edit price) | SellScanScreen (cart price) | RW price change → POS uses new price on next scan (after cache refresh) |
| **Purchase price** | DB `supplier_store_links.purchase_price` | POS refreshes on catalog load | S07 Suppliers, S08 Supplier Catalog | PurchaseScreen, BuyScreen | Same unit cost in both portals |
| **Tax rate** | DB `store_settings.tax_rate` | POS picks up on next sale | S11 Settings (tax rate field) | PaymentScreen (tax calc) | RW tax rate % = POS checkout tax % |

### Sales & Billing

| Domain | Source of Truth | Sync Rule | RW Screen | POS Screen | Consistency Check |
|--------|----------------|-----------|-----------|------------|-------------------|
| **Daily sales summary** | DB aggregation | RW re-fetches on load | S04 Dashboard (daily summary) | MenuScreen (daily summary) | RW total sales = POS total sales for same date |
| **Bill/transaction list** | DB `sales` + `bill_snapshots` | Immediate on write | S04 Dashboard (future reports) | SalesHistoryScreen, BillDetailScreen | Every POS bill appears in RW sales list |
| **Sales statement** | DB aggregation | Derived view | S04 Dashboard (sell revenue) | SalesStatementScreen | RW total sell revenue = POS sales statement total for period |
| **Payment breakdown** | DB `payments` | Immediate on write | S04 Dashboard (payment breakdown) | PaymentScreen | Cash/UPI/Due totals match between RW dashboard and POS |

### Purchase Orders

| Domain | Source of Truth | Sync Rule | RW Screen | POS Screen | Consistency Check |
|--------|----------------|-----------|-----------|------------|-------------------|
| **Purchase orders** | DB `purchase_orders` | Immediate on creation | S06 Inventory (purchase ledger) | OrderHistoryScreen, OrderDetailScreen | POS PO count = RW PO count; statuses match |
| **PO status** | DB `purchase_orders.status` | Updated on GRN/cancel | S06 Inventory | OrderDetailScreen | POS "delivered" = RW shows completed PO |
| **Reorder suggestions** | DB reorder engine | POS polls pending list | N/A (RW doesn't show reorder) | ReorderScreen | Reorder approvals in POS → create POs visible in both |
| **Reorder policies** | DB `reorder_policies` | Shared table | N/A (future RW feature) | ReorderSettingsScreen, ReorderPoliciesScreen | Min/max thresholds match if RW exposes them |

### Products & Catalog

| Domain | Source of Truth | Sync Rule | RW Screen | POS Screen | Consistency Check |
|--------|----------------|-----------|-----------|------------|-------------------|
| **Product list** | DB `store_products` | POS cache refreshes on resume | S05 Products | SellScanScreen (lookup) | Same product count; barcode → product mapping identical |
| **Product add** | DB `store_products` | Immediate on INSERT | S05 Products (add), S09 Import (CSV) | BuyScreen, PurchaseScreen | New RW product scannable in POS after cache refresh |
| **Product delete** | DB soft-delete | POS cache refreshes on resume | S05 Products (delete) | SellScanScreen | Deleted product not scannable in POS after refresh |
| **Categories** | DB `store_categories` | Shared | S04 Dashboard (categories) | BuyScreen (FMCG categories) | Same category list in both |
| **Barcode mapping** | DB `product_barcodes` | Immediate | S05 Products, S04 Dashboard search | SellScanScreen (barcode scan) | Barcode → product resolution identical |

### Devices

| Domain | Source of Truth | Sync Rule | RW Screen | POS Screen | Consistency Check |
|--------|----------------|-----------|-----------|------------|-------------------|
| **Device enrollment** | DB `devices` | Real-time during enrollment | S13 Devices (activate) | EnrollDeviceScreen | RW activation code → POS enrollment succeeds |
| **Device status** | DB `devices.is_active` | On next POS heartbeat | S13 Devices (toggle active) | SplashScreen (readiness) | RW deactivate → POS blocked on next start |

### UPI Payments

| Domain | Source of Truth | Sync Rule | RW Screen | POS Screen | Consistency Check |
|--------|----------------|-----------|-----------|------------|-------------------|
| **UPI VPA** | DB `store_settings.upi_vpa` | POS picks up on next sale | S11 Settings, S12 Payments | PaymentScreen (UPI mode) | RW VPA = POS UPI target |

### Offline Behavior (Critical)

| Scenario | POS Behavior | RW Impact | Risk |
|----------|-------------|-----------|------|
| POS sells offline (Cash/Due) | Sale queued in outbox | RW doesn't see sale until POS syncs (5-10 min) | Temporary stock/sales divergence |
| POS sells offline (UPI) | BLOCKED — error shown | No impact | None |
| POS GRN offline | BLOCKED | No impact | None |
| POS manual inward offline | May queue depending on impl | Delayed ledger entry | Stock discrepancy window |

---

## D2b: Retailer Web ↔ SuperAdmin Matrix (RW↔SA)

### Store Lifecycle

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary | Audit Trail |
|--------|----------------|-------------|-----------|-----------|-------------------|-------------|
| **Store creation** | SA creates store in DB | Immediate — enables RW login | Login (store appears) | Stores → Create Store | SA only | Yes (audit log) |
| **Store suspend** | DB `stores.status` | Immediate — JWT invalidated | All screens blocked (login fails) | Stores → Store Status | SA only (RW cannot reactivate) | Yes |
| **Store reactivate** | DB `stores.status` | Immediate — login works again | All screens accessible | Stores → Store Status | SA only | Yes |
| **Store name edit** | DB `stores.name` | RW sees on next load | S04 Dashboard (store name), Sidebar | Stores → Edit Name | Both can edit (SA overrides) | Yes |

### User & Access Control

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary | Audit Trail |
|--------|----------------|-------------|-----------|-----------|-------------------|-------------|
| **User status (active/inactive/suspended)** | DB `users.status` | On next login attempt | Login blocked if inactive/suspended | Users → Status Control | SA only | Yes |
| **User creation** | SA or self-registration | Immediate | Register page (self), Login (access) | Users → Create User | SA creates; RW self-registers | Yes |
| **Session revoke** | DB session table | Immediate — current token invalid | Forced logout | Users → Status (suspend) | SA only | Yes |

### Staff (POS Access)

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary | Audit Trail |
|--------|----------------|-------------|-----------|-----------|-------------------|-------------|
| **Staff creation** | DB `store_staff` | Immediate — POS login available | N/A (RW doesn't manage staff) | Staff → Add Staff | SA only | Yes |
| **Staff disable** | DB `store_staff.is_active` | On next POS restart | N/A | Staff → Toggle Status | SA only | Yes |
| **Staff PIN reset** | DB `store_staff.pin_hash` | Immediate — old PIN invalid | N/A | Staff → Reset PIN | SA only | Yes |
| **Staff roles** | DB `store_staff.role` | On next POS restart | N/A | Staff → Role Assignment | SA only (CASHIER/STOCK_MANAGER/MANAGER) | Yes |

### RBAC & Permissions

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary | Audit Trail |
|--------|----------------|-------------|-----------|-----------|-------------------|-------------|
| **Retailer admin role** | DB `user_store.role` | On login (JWT claims) | AdminRoute guard (S14, S15) | Users tab | SA assigns role | Yes |
| **Limited mode** | DB `applications.status` | On login | Sidebar hides most items (REG-AUTH-301) | Applications → Approve | SA approval unlocks full access | Yes |

### Feature Flags & Remote Config

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary | Audit Trail |
|--------|----------------|-------------|-----------|-----------|-------------------|-------------|
| **Global feature flags** | DB `feature_flags` | On next ui-status fetch (POS); on next page load (RW) | Navigation items appear/disappear | Settings → Feature Kill Switch | SA only | Yes (last changed) |
| **Per-store overrides** | DB `store_feature_overrides` | Same as global | Screen gating per store | Stores → Per-Store Flags | SA only | Yes |
| **Bulk flag application** | DB batch update | Atomic | Affects multiple stores | Stores → Bulk Feature Flags | SA only | Yes |
| **Min app version** | Feature flag config | POS checks on start | N/A | Settings → Feature Flags (minAppVersion) | SA only | Yes |

### Payment Methods

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary | Audit Trail |
|--------|----------------|-------------|-----------|-----------|-------------------|-------------|
| **Allowed payment methods** | DB `stores.allowed_payment_methods` | On next POS refresh | S12 Payments (read-only view) | Stores → Payment Methods (CASH/UPI/DUE) | SA controls which methods available | Yes |
| **UPI VPA** | DB `store_settings.upi_vpa` | Immediate | S11 Settings, S12 Payments (editable) | Stores → UPI VPA (editable) | Both can edit (SA activates) | Yes |

### Catalog & Product Governance

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary | Audit Trail |
|--------|----------------|-------------|-----------|-----------|-------------------|-------------|
| **Supplier verification** | DB `suppliers.verified` | Immediate | S07 Suppliers (verified badge), S08 Catalog (only verified) | Suppliers → Verify/Reject | SA verifies; RW sees status | Yes |
| **Supplier suspension** | DB `suppliers.status` | On next RW/POS refresh | S07 Suppliers (hidden if suspended) | Suppliers → Suspend | SA only | Yes |
| **Product approval** | DB `products.status` | Immediate | S08 Supplier Catalog (only approved), S15 Product Queue | Suppliers → Pending Products → Approve/Reject | SA approves; RW store admin also has queue | Yes |
| **Margin/BNPL config** | DB `products.margin_type/bnpl_eligible` | Immediate | S05 Products (read margin), S15 Product Queue (edit before approve) | Suppliers → Pending Products (edit) | SA sets platform margin; RW store admin can adjust at store level | Yes |

### Pricing, Tax & Promo

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary | Audit Trail |
|--------|----------------|-------------|-----------|-----------|-------------------|-------------|
| **Store tax rate** | DB `store_settings.tax_rate` | RW edits; POS uses on next sale | S11 Settings (tax rate) | N/A (store-level control) | RW owner sets | N/A |
| **Platform margin** | DB `products.margin_type` | Immediate | Read-only in S05 Products | Suppliers → Pending Products (edit) | SA sets platform-wide | Yes |

### Registration & Onboarding

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary | Audit Trail |
|--------|----------------|-------------|-----------|-----------|-------------------|-------------|
| **Retailer application** | DB `auth.applications` | SA reviews | S02 Register (submit) | Applications → Queue | RW submits; SA approves/rejects | Yes |
| **KYC documents** | DB `documents` | SA reviews | S02 Register (upload), S10 Compliance (upload) | Documents → Review | RW uploads; SA approves/rejects | Yes |
| **Registration events** | DB `registration_events` | Real-time | S02 Register (events fire) | Registrations → Event Stream | SA monitors | Yes |

### Compliance & Documents

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary | Audit Trail |
|--------|----------------|-------------|-----------|-----------|-------------------|-------------|
| **Compliance docs** | DB `compliance_documents` | RW uploads; SA reviews | S10 Compliance (upload, view status) | Documents → Pending Queue | RW uploads; SA approves/rejects | Yes |
| **Document rejection** | DB `documents.rejection_reason` | Immediate | S10 Compliance (shows reason) | Documents → Reject (with reason) | SA only | Yes |

### Audit & Monitoring

| Domain | Source of Truth | Propagation | RW Screen | SA Screen | Permission Boundary |
|--------|----------------|-------------|-----------|-----------|-------------------|
| **Admin action logs** | DB `audit_logs` | Real-time on write | N/A | Audit → Logs Query | SA only (RW has no audit view) |
| **Analytics (sales)** | DB aggregation | On query | S04 Dashboard (daily summary) | Analytics → Consumer Sales | SA sees all stores; RW sees own store |
| **Analytics (devices)** | DB aggregation | On query | S13 Devices (list) | Analytics → Devices | SA sees all; RW sees own |
| **GRN excess alerts** | DB `grn_alerts` | On query | N/A | GRN-Alerts → Queue | SA only |
| **POS event stream** | DB `pos_events` | On query | N/A | Events → Raw Logs | SA only (debug) |

---

## D2c: Tri-Matrix (RW ↔ POS ↔ SA)

These domains require all three systems to reconcile:

### TRI-01: Pricing & Tax → POS Checkout → RW Reports → SA Audit

| Step | System | Action | Must Match |
|------|--------|--------|-----------|
| 1 | **SA** | Set platform margin on product | `products.margin_type`, `products.percent_margin` |
| 2 | **RW** | Set store tax rate | `store_settings.tax_rate` |
| 3 | **POS** | Customer checkout | Uses margin + tax to calculate final price |
| 4 | **RW** | Dashboard daily summary | Revenue includes same margin + tax |
| 5 | **SA** | Analytics → Consumer Sales | Same revenue figures for the store |
| **Check** | | | POS receipt price = RW reported revenue per sale = SA analytics revenue |

### TRI-02: Feature Flags → POS Visibility → RW Availability

| Step | System | Action | Must Match |
|------|--------|--------|-----------|
| 1 | **SA** | Disable feature flag (e.g., `buy`) | `feature_flags.enabled = false` |
| 2 | **POS** | Purchase tab hidden | Feature gate blocks tab |
| 3 | **RW** | Supplier Catalog hidden (if gated) | Feature gate blocks page |
| **Check** | | | SA kill → POS tab gone → RW page gone (all within next refresh cycle) |

### TRI-03: Store Lifecycle → POS Offline → RW Blocked

| Step | System | Action | Must Match |
|------|--------|--------|-----------|
| 1 | **SA** | Suspend store | `stores.status = SUSPENDED` |
| 2 | **POS** | App blocked on next start | JWT validation fails |
| 3 | **RW** | Login fails, existing session invalidated | 401 on any API call |
| **Check** | | | SA suspend → both POS and RW immediately inaccessible |

### TRI-04: Catalog Approval → RW Listing → POS Scan

| Step | System | Action | Must Match |
|------|--------|--------|-----------|
| 1 | **SA** | Approve supplier product | `products.status = approved` |
| 2 | **RW** | Product appears in Supplier Catalog (S08) | Product searchable + addable |
| 3 | **RW** | Store admin adds to store | `store_products` row created |
| 4 | **POS** | Product scannable in SellScan | Barcode → product resolved |
| **Check** | | | SA approve → RW visible → POS scannable (after cache refresh) |

### TRI-05: Payment Method Control → POS Checkout → RW Reports

| Step | System | Action | Must Match |
|------|--------|--------|-----------|
| 1 | **SA** | Set allowed payment methods (e.g., remove UPI) | `stores.allowed_payment_methods = [CASH, DUE]` |
| 2 | **POS** | UPI option hidden in PaymentScreen | Only Cash/Due shown |
| 3 | **RW** | Dashboard payment breakdown | No UPI transactions after change |
| **Check** | | | SA restricts → POS enforces → RW reports reflect restriction |

### TRI-06: Supplier Status → RW Catalog → POS Buy

| Step | System | Action | Must Match |
|------|--------|--------|-----------|
| 1 | **SA** | Suspend supplier | `suppliers.status = suspended` |
| 2 | **RW** | Supplier hidden from S07 Suppliers, S08 Catalog | Filtered out |
| 3 | **POS** | Supplier products hidden from PurchaseScreen | Not in buy catalog |
| **Check** | | | SA suspend → RW hides → POS can't buy from supplier |

### TRI-07: Staff Access → POS Login → SA Audit

| Step | System | Action | Must Match |
|------|--------|--------|-----------|
| 1 | **SA** | Create staff with CASHIER role | Staff record active |
| 2 | **POS** | Staff logs in with PIN | Session created, sell-only permissions |
| 3 | **POS** | Staff attempts stock-in | BLOCKED (CASHIER can't stock-in) |
| 4 | **SA** | Audit log shows blocked attempt | Event captured |
| **Check** | | | SA role → POS enforces → SA audit captures |

### TRI-08: Inventory Reconciliation

| Step | System | Action | Must Match |
|------|--------|--------|-----------|
| 1 | **POS** | Sell 5 units of product X | stock -= 5, sale recorded |
| 2 | **RW** | Dashboard inventory | stock = original - 5 |
| 3 | **SA** | Analytics → Products | units_sold += 5, revenue matches |
| **Check** | | | POS sale qty = RW stock decrease = SA analytics units_sold |

---

## Sync Timing Summary

| Change Source | Propagation to Others | Delay |
|---------------|----------------------|-------|
| SA store suspend | RW + POS: immediate (JWT invalidation) | 0s |
| SA feature flag kill | POS: next ui-status poll; RW: next page load | 0-30s |
| SA staff disable | POS: next restart | 0-5min |
| SA payment method change | POS: next refresh | 0-5min |
| RW price change | POS: next app resume (CACHE-000) | 0-60min |
| RW product add | POS: next cache refresh | 0-60min |
| POS sale (online) | RW: immediate (DB write) | 0s |
| POS sale (offline) | RW: after outbox sync | 5-10min |
| POS GRN | RW: immediate (DB write) | 0s |
