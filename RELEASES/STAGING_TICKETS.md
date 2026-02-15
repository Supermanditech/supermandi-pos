# Staging Tickets — SuperMandi POS

> **Phase 1**: T-001 to T-053 — UI/UX staging fixes from operator browser testing (ALL DONE)
> **Phase 2**: T-054 to T-073 — E2E production-grade implementation tickets (QUEUED)
> **Zero Regression Rule**: Every ticket must leave the system in a deployable state. Fix micro issues inline.

---

## PHASE 1: STAGING UI/UX FIXES (T-001 → T-053) — ALL DONE

> 53 tickets implemented across 10 commits (08568af → 8ab4f4c).
> Categories: Blocking Bugs (3), Functional Bugs (7), Design System (5), Pre-Auth Retailer (5), Pre-Auth Supplier (5), Post-Auth Retailer (10), Post-Auth Supplier (7), SuperAdmin (11).

| Range | Category | Count | Status |
|-------|----------|-------|--------|
| T-001, T-012, T-014 | A: Blocking Bugs (P0) | 3 | DONE |
| T-002 to T-005, T-008, T-009, T-011 | B: Functional Bugs (P1) | 7 | DONE |
| T-016 to T-020 | C: Cross-Portal Design System (P1) | 5 | DONE |
| T-021 to T-025 | D: Pre-Auth Retailer (P2) | 5 | DONE |
| T-026 to T-030 | E: Pre-Auth Supplier (P2) | 5 | DONE |
| T-031 to T-040 | F: Post-Auth Retailer (P2) | 10 | DONE |
| T-041 to T-047 | G: Post-Auth Supplier (P2) | 7 | DONE |
| T-006, T-007, T-010, T-013, T-015, T-048 to T-053 | H: SuperAdmin (P1-P2) | 11 | DONE |

---

## PHASE 2: E2E PRODUCTION-GRADE IMPLEMENTATION (T-054 → T-073)

> 20 tickets. Full implementation — not verification stubs.
> Execution order: schema/migration first → backend API → frontend UI → POS app → cross-service E2E.
> During execution: if any micro issue found, fix inline and move on. Zero regression.

---

### CATEGORY I: RETAILER PRODUCT → POS SYNC (P0)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-054 | Retailer web inline product upload → POS sync | Backend + Retailer + POS | **Implement**: Full E2E chain — retailer creates product via web form (PACKAGED or LOOSE_BULK) → product saved to `catalog.store_products` → POS `/api/v1/pos/products/lookup` and `/api/v1/pos/products/list` return the product with correct barcode, name, price, stock, unit, category. Fix any gap in: form validation, barcode generation (LOOSE_BULK `2{prefix}{ts}{rand}`), stock initialization (`inventory.stock_balances` + `inventory.inventory_ledger` opening_stock entry), POS query returning new product. Verify PACKAGED mode (manufacturer barcode) and LOOSE_BULK mode (system barcode) both sync. |
| T-055 | Retailer CSV upload → POS sync | Backend + Retailer + POS | **Implement**: Full E2E chain — retailer uploads CSV file → async validation (5-step: template → upload → validate → commit → status) → products created in `catalog.store_products` → stock initialized in `inventory.stock_balances` + `inventory.inventory_ledger` → POS lookup/list/search returns all imported products. Fix any gap in: CSV parsing, duplicate barcode handling, chunked commit (100/batch), error categorization, stock ledger creation for imported rows with stock > 0. |

---

### CATEGORY J: LOOSE PRODUCT RETAIL VARIANTS (P0 — NEW FEATURE)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-056 | Loose product retail variant schema + migration | Backend DB | **Implement**: New migration creating `catalog.product_retail_variants` table. Schema: `id` (uuid PK), `store_product_id` (FK → store_products), `variant_label` (e.g., "1 kg", "500 gm", "5 kg"), `variant_qty` (numeric — quantity in base unit, e.g., 1.0, 0.5, 5.0), `base_unit` (enum: KG, GM, LTR, ML, COUNT), `sell_price_minor` (int — retail price in paise for this variant), `barcode` (unique, system-generated), `is_active` (boolean default true), `created_at`, `updated_at`. Add index on `(store_product_id, is_active)`. Add constraint: only LOOSE_BULK products can have variants. Add enum type if `base_unit` doesn't exist. |
| T-057 | Loose product retail variant backend API | Backend API | **Implement**: CRUD endpoints under `/api/v1/retailer-admin/products/:productId/variants`. POST — create variant (validate product is LOOSE_BULK, generate barcode `3{storePrefix}{ts}{rand}`, validate sell_price > 0, validate variant_qty > 0). GET — list variants for product. PUT `/:variantId` — update variant (price, label, active status). DELETE `/:variantId` — soft delete (set is_active=false). All endpoints store-scoped via JWT. Auto-generate default variants on LOOSE_BULK product creation based on base_unit: KG → [1kg, 5kg, 500gm, 250gm], LTR → [1L, 500ml, 200ml], COUNT → [1, 5, 10, 25]. |
| T-058 | Retailer admin UI — variant management for loose products | Retailer Admin | **Implement**: In product detail/edit page, when product mode is LOOSE_BULK, show "Retail Variants" section below main form. Table listing all variants with columns: Label, Quantity, Unit, Sell Price, Barcode, Active, Actions (edit/delete). "Add Variant" button opens inline form (label, qty, unit, price). Auto-suggest variants based on base unit. Show calculated cost-per-unit (purchase_price / variant_qty) next to sell_price for margin visibility. Print barcode labels for variants (extend existing SKU label PDF to include variant barcodes). |
| T-059 | POS app — variant picker for loose product sale | POS App | **Implement**: When scanning or selecting a LOOSE_BULK product in POS sale screen, if product has retail variants, show variant picker modal instead of adding directly to cart. Modal shows: product name, base purchase info (e.g., "Purchased: 1000 kg @ Rs 2/kg"), variant cards (e.g., "1 kg — Rs 25", "5 kg — Rs 120", "500 gm — Rs 15"). Tapping variant adds to cart with variant barcode, variant price, variant quantity. If product has no variants, fall back to current weight/count entry. POS product lookup API must return variants array with each LOOSE_BULK product. |
| T-060 | Inventory deduction for variant-based loose product sales | Backend + POS | **Implement**: When POS completes sale with variant items, deduct stock in BASE UNIT from `inventory.stock_balances`. Example: selling "2x 1kg flour variant" deducts 2.0 KG from parent product's stock. Selling "3x 500gm flour variant" deducts 1.5 KG. Ledger entry in `inventory.inventory_ledger`: transaction_type='sale', product_id=parent_product_id, delta_qty=-variant_qty*cart_qty, reference includes variant_id. Update `stock_balances.quantity` atomically. Handle insufficient stock (reject if stock < required, no negative stock). |
| T-061 | CSV upload support for loose product retail variants | Backend + Retailer | **Implement**: Extend retailer CSV import to support variant rows. New CSV columns: `variant_label`, `variant_qty`, `variant_unit`, `variant_sell_price`. If a CSV row has variant columns filled, create variant under the parent product (matched by barcode or product name). If parent doesn't exist yet in same CSV, create parent first then variants. Template download includes variant columns with example rows. Validation: variant_qty > 0, variant_sell_price > 0, parent must be LOOSE_BULK. |

---

### CATEGORY K: SUPPLY CHAIN E2E & SCALABILITY (P0-P1)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-062 | Stock/purchase/sell ledger E2E across retail web + POS | Backend + Retailer + POS | **Implement**: Full ledger E2E chain. (1) Retailer web: add product with opening stock → verify `inventory.inventory_ledger` has opening_stock row + `stock_balances` has correct qty. (2) POS sale: sell N units → verify ledger has 'sale' row with delta_qty=-N + stock_balances reduced. (3) POS sale return: return M units → verify ledger has 'sale_return' row with delta_qty=+M + stock_balances increased. (4) Stock adjustment via retailer web → verify ledger has 'adjustment' row. (5) Purchase received (GRN) → verify ledger has 'purchase_received' row + stock_balances increased + avg_unit_cost_minor recalculated. Fix any broken link in the chain. Ensure `stock_balances.quantity` ALWAYS equals SUM of all `inventory_ledger.delta_qty` for that product+store. |
| T-063 | Supplier CSV upload → SuperAdmin approval → POS catalog E2E | Backend + Supplier + SuperAdmin + POS | **Implement**: Full chain. (1) Supplier uploads CSV via supplier portal → products created in `catalog.supplier_products` with `approval_status='pending'`. (2) Products appear in SuperAdmin "Pending Products" panel → admin can edit name/category, set margin (lumpsum + %), approve or reject. (3) On approval: product added to `catalog.products` (master catalog) if not exists, `catalog.supplier_product_map` created linking supplier product to master. (4) POS catalog API `/api/v1/pos/catalog/stores/:storeId/catalog` returns the approved product with supplier info, margin-adjusted price, buyability. Fix any gap in: CSV validation, SuperAdmin approval endpoint, master catalog upsert, POS catalog query visibility rules. |
| T-064 | Supplier web inline upload → SuperAdmin approval → POS catalog E2E | Backend + Supplier + SuperAdmin + POS | **Implement**: Same chain as T-063 but via supplier web form instead of CSV. (1) Supplier creates product via web form (name, category, barcode, SKU, purchase_price, MRP, MOQ, unit, description) → saved to `catalog.supplier_products` with `approval_status='pending'`. (2) Appears in SuperAdmin pending queue. (3) SuperAdmin approves with margin → master catalog + supplier_product_map. (4) POS catalog shows product. Verify the web form captures all required fields, validation matches CSV validation, and the downstream chain is identical to CSV path. |
| T-065 | POS supplier catalog scalability — 10K suppliers x 1M SKUs | Backend + POS | **Implement**: Optimize POS catalog for scale. (1) Backend: paginated catalog API with cursor-based pagination (not offset), category index, supplier index, full-text search index on product name/SKU. (2) Add `catalog.catalog_categories` cache table (category → product count) refreshed on approval. (3) POS app: infinite scroll with 50-item pages, category sidebar filter, supplier filter dropdown, search-as-you-type with 300ms debounce, result count display. (4) Backend query plan: ensure JOINs across supplier_products + products + supplier_product_map + suppliers use indexed columns. (5) Add DB indexes: `idx_supplier_products_approval_status`, `idx_supplier_product_map_product_id`, `idx_products_category`. Target: <500ms p95 for first page load with 1M products. |
| T-066 | Supplier → SuperAdmin auto-approval queue | Backend + SuperAdmin | **Implement**: When supplier creates/uploads product, it automatically enters SuperAdmin approval queue. (1) Backend: ensure all product creation paths (web form + CSV) set `approval_status='pending'` and `created_at` timestamp. (2) SuperAdmin: "Pending Products" panel sorted by created_at ASC (oldest first), with supplier name, product count per supplier, batch approve/reject capability. (3) Real-time notification: when new products are pending, SuperAdmin dashboard shows badge count. (4) Approval queue filters: by supplier, by category, by date range. (5) Batch operations: select multiple products → approve all / reject all with single reason. |
| T-067 | SuperAdmin margin application — lumpsum + % per SKU/unit | Backend + SuperAdmin | **Implement**: Full margin system. (1) Schema: `catalog.supplier_products` already has `supermandi_margin_minor` (paise) and `margin_percent` (%). Verify both fields are used in price calculation. (2) Price calculation formula: `retailer_price = supplier_price + supermandi_margin_minor + (supplier_price * margin_percent / 100)`. (3) SuperAdmin UI: in product approval modal, margin fields with live preview — show supplier price, margin amount, final retailer price. (4) Bulk margin: apply same margin to all products from a supplier or all products in a category. (5) Margin validation: final price must be > 0 and ≤ MRP. (6) POS catalog API must return `retailer_price` (with margin applied), not raw `supplier_price`. |
| T-068 | SuperAdmin publish (approve) → POS purchase tab visibility | Backend + SuperAdmin + POS | **Implement**: End-to-end publish flow. (1) SuperAdmin clicks "Approve" on pending product → `approval_status='approved'`, `approved_at=now()`, `approved_by=admin_id`. (2) If master catalog entry doesn't exist, create in `catalog.products`. (3) Create `catalog.supplier_product_map` entry (supplier_product_id → product_id) with status='active'. (4) POS catalog query visibility rules: `sp.approval_status='approved'` AND `s.verification_status='verified'` AND `ssl.status='active'` AND `spm.status='active'`. (5) Verify: newly approved product appears in POS BuyScreen within 1 API refresh. (6) Verify: rejected product does NOT appear. (7) Verify: if supplier is unverified, approved product still doesn't appear (supplier gate). |

---

### CATEGORY L: INVOICING SYSTEM (P0 — NEW FEATURE)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-069 | Invoice system schema — tables + sequences | Backend DB | **Implement**: New migration creating invoice tables. (1) `orders.invoices`: id (uuid PK), invoice_number (varchar UNIQUE, auto-generated INV-YYYYMM-NNNNN), invoice_type (enum: 'buy_resell', 'platform_fee'), purchase_order_id (FK), supplier_id (FK), retailer_store_id (FK), invoice_date (timestamptz), due_date (timestamptz), subtotal_minor (int), cgst_minor (int), sgst_minor (int), igst_minor (int), total_tax_minor (int), total_minor (int), platform_fee_minor (int — only for platform_fee type), platform_fee_percent (numeric), status (enum: 'draft', 'issued', 'paid', 'cancelled'), from_gstin (varchar), to_gstin (varchar), from_state (varchar), to_state (varchar), from_entity_name (varchar), to_entity_name (varchar), notes (text), created_at, updated_at. (2) `orders.invoice_items`: id (uuid PK), invoice_id (FK), product_name (varchar), hsn_code (varchar), quantity (numeric), unit (varchar), unit_price_minor (int), discount_minor (int default 0), taxable_value_minor (int), cgst_rate (numeric), cgst_minor (int), sgst_rate (numeric), sgst_minor (int), igst_rate (numeric default 0), igst_minor (int default 0), total_minor (int). (3) Sequence: `orders.invoice_number_seq` for auto-incrementing invoice numbers. (4) Indexes on invoice_number, purchase_order_id, supplier_id, retailer_store_id, status. |
| T-070 | Invoice mode per product — schema + SuperAdmin UI | Backend + SuperAdmin | **Implement**: (1) Add `invoice_mode` column to `catalog.supplier_products` — enum: 'buy_resell', 'platform_fee', default null. (2) SuperAdmin product approval modal: add "Invoice Model" dropdown with two options: "Buy-Resell (SuperMandi as intermediary)" and "Platform Fee (Direct supplier → retailer)". (3) When admin selects buy_resell: show margin fields (lumpsum + %). When admin selects platform_fee: show platform fee fields (lumpsum fee + % fee). (4) Invoice mode is set at product publish time and stored per-product. (5) POS catalog API includes `invoice_mode` in product response so purchase flow knows which invoice to generate. (6) Validation: invoice_mode must be set before product can be approved/published. |
| T-071 | Invoice Model 1 — Buy-Resell (Supplier → SuperMandi → Retailer) | Backend + POS | **Implement**: When retailer purchases a buy_resell product via POS purchase tab: (1) TWO invoices generated: Invoice A (Supplier → SuperMandi Tech Pvt Ltd) at supplier_price, Invoice B (SuperMandi Tech Pvt Ltd → Retailer) at supplier_price + margin. (2) Tax calculation: determine if same-state (CGST 9% + SGST 9%) or inter-state (IGST 18%) based on supplier_state vs SuperMandi_state vs retailer_state. (3) SuperMandi entity details: hardcode company GSTIN, address, state in env vars (SUPERMANDI_GSTIN, SUPERMANDI_STATE, SUPERMANDI_ADDRESS, SUPERMANDI_ENTITY_NAME). (4) Invoice A: from=Supplier, to=SuperMandi, amount=supplier_price + tax. Invoice B: from=SuperMandi, to=Retailer, amount=retailer_price + tax. (5) Both invoices linked to same purchase_order_id. (6) Invoices created atomically when GRN is completed (goods received). |
| T-072 | Invoice Model 2 — Platform Fee (Supplier → Retailer + Fee) | Backend + POS | **Implement**: When retailer purchases a platform_fee product via POS purchase tab: (1) ONE invoice generated: Invoice (Supplier → Retailer) at supplier_price + tax. (2) PLUS a platform fee debit note: SuperMandi charges supplier a fee (lumpsum_fee_minor + fee_percent * invoice_total). (3) Fee debit note schema: `orders.platform_fee_notes` — id, invoice_id (FK), supplier_id, fee_amount_minor, fee_percent, fee_base_minor (what % is applied to), cgst_minor, sgst_minor, igst_minor, total_minor, status. (4) Tax on platform fee: SuperMandi charges GST on the fee itself (service tax). (5) Supplier earnings page: show gross earnings minus platform fees = net earnings. (6) SuperAdmin: platform fee report — total fees collected per supplier, per month. |
| T-073 | Invoice PDF generation + download | Backend + All Portals | **Implement**: (1) PDF generation service using `pdfkit` or `@react-pdf/renderer` (server-side). (2) Invoice PDF layout: company header (logo placeholder, name, GSTIN, address), invoice number, date, due date, from/to party details with GSTIN, itemized table (product, HSN, qty, unit price, taxable value, CGST, SGST, IGST, total), subtotal, tax summary, grand total in words, bank details for payment, terms & conditions, digital signature placeholder. (3) API endpoint: GET `/api/v1/invoices/:invoiceId/pdf` — generates and streams PDF. (4) Retailer admin: "Invoices" section showing purchase invoices with download button. (5) Supplier portal: "Invoices" section showing sales invoices + platform fee notes with download. (6) SuperAdmin: invoice search/filter/download across all invoices. (7) Store invoice PDFs in GCS bucket for archival. |

---

## SUMMARY

| Category | Range | Count | Priority | Status |
|----------|-------|-------|----------|--------|
| A-H: Staging UI/UX Fixes | T-001 → T-053 | 53 | P0-P2 | **DONE** |
| I: Retailer Product → POS Sync | T-054 → T-055 | 2 | P0 | QUEUED |
| J: Loose Product Retail Variants | T-056 → T-061 | 6 | P0 | QUEUED |
| K: Supply Chain E2E & Scalability | T-062 → T-068 | 7 | P0-P1 | QUEUED |
| L: Invoicing System | T-069 → T-073 | 5 | P0 | QUEUED |
| **TOTAL** | **T-001 → T-073** | **73** | | **53 DONE / 20 QUEUED** |

---

## EXECUTION ORDER (T-054 → T-073)

> Dependencies flow downward. Each ticket leaves system deployable.

```
Phase 1: Retailer → POS Sync (verify + fix existing chain)
  T-054  Retailer web product upload → POS sync
  T-055  Retailer CSV upload → POS sync

Phase 2: Loose Product Retail Variants (NEW feature, bottom-up)
  T-056  Schema + migration (catalog.product_retail_variants)
  T-057  Backend CRUD API (/products/:id/variants)
  T-058  Retailer admin UI (variant management)
  T-059  POS app (variant picker for sale)
  T-060  Inventory deduction (variant → base unit stock)
  T-061  CSV upload variant support

Phase 3: Supply Chain E2E (verify + fix + scale)
  T-062  Stock/purchase/sell ledger E2E
  T-063  Supplier CSV → SuperAdmin → POS catalog
  T-064  Supplier web → SuperAdmin → POS catalog
  T-065  POS catalog scalability (10K suppliers × 1M SKUs)
  T-066  Supplier → SuperAdmin auto-approval queue
  T-067  SuperAdmin margin (lumpsum + %)
  T-068  SuperAdmin publish → POS visibility

Phase 4: Invoicing System (NEW feature, bottom-up)
  T-069  Invoice schema + tables
  T-070  Invoice mode per product (SuperAdmin UI)
  T-071  Invoice Model 1: Buy-Resell
  T-072  Invoice Model 2: Platform Fee
  T-073  Invoice PDF generation + download
```

---

## ZERO REGRESSION RULES FOR PHASE 2

1. **Every ticket is E2E**: schema → API → UI → POS. No partial implementations.
2. **Fix inline**: If executing T-058 reveals a bug in T-054's work, fix it in the same commit.
3. **Stock integrity invariant**: `stock_balances.quantity = SUM(inventory_ledger.delta_qty)` — ALWAYS.
4. **Price integrity invariant**: All prices in minor units (paise). No floating point math on money.
5. **Store isolation invariant**: `store_id` from JWT only. Never trust client-sent store_id.
6. **Supplier gate invariant**: POS catalog only shows products where supplier is verified + product is approved + store link is active + mapping exists.
7. **Invoice integrity invariant**: Invoice totals must equal SUM(line items). Tax must match CGST+SGST or IGST (never both).
8. **No orphan data**: Every variant must have a parent product. Every invoice must have a purchase order. Every ledger entry must have a reference.

---

## REFERENCE: Portal Pages

### Retailer Portal
| Route | Component | Description |
|-------|-----------|-------------|
| `/retailer/login` | LoginPage | Phone OTP + password login |
| `/retailer/register` | RegisterPage | 5-step registration |
| `/retailer/forgot-password` | ForgotPasswordPage | OTP-based password reset |
| `/s/:storeCode` | DashboardPage | Main dashboard |
| `/s/:storeCode/products` | ProductsPage | Product catalog + variant management |
| `/s/:storeCode/import` | ImportPage | Bulk CSV import (4-step) |
| `/s/:storeCode/inventory` | InventoryPage | Inventory ledger |
| `/s/:storeCode/suppliers` | SuppliersPage | Supplier management |
| `/s/:storeCode/supplier-catalog` | SupplierCatalogPage | Browse supplier products |
| `/s/:storeCode/compliance` | CompliancePage | Compliance documents |
| `/s/:storeCode/settings` | SettingsPage | Store configuration |
| `/s/:storeCode/settings/payments` | PaymentsPage | Payment setup |
| `/s/:storeCode/devices` | DeviceActivationPage | POS device activation |
| `/s/:storeCode/invoices` | InvoicesPage | Purchase invoices (NEW — T-073) |

### Supplier Portal
| Route | Component | Description |
|-------|-----------|-------------|
| `/login` | LoginPage | Phone OTP + password login |
| `/register` | RegisterPage | 3-step registration |
| `/pending-approval` | PendingApprovalPage | Awaiting admin approval |
| `/forgot-password` | ForgotPasswordPage | Password reset |
| `/dashboard` | DashboardPage | Main dashboard |
| `/products` | ProductsPage | Product catalog |
| `/orders` | OrdersPage | Order management (SSE real-time) |
| `/upload` | UploadPage | CSV bulk import |
| `/kyc` | KYCPage | Document management + bank verification |
| `/earnings` | EarningsPage | Payout history + platform fee deductions |
| `/profile` | ProfilePage | Profile + password change |
| `/invoices` | InvoicesPage | Sales invoices + fee notes (NEW — T-073) |

### SuperAdmin Tabs
Events, Devices, Stores, Suppliers, Applications, Analytics (8 sub-tabs), Payments, Users, Settings, Documents, Audit Logs, Registrations, Staff, GRN Alerts, Invoices (NEW — T-073)
