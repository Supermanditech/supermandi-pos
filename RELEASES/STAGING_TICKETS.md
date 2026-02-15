# Staging Tickets — SuperMandi POS

> **Phase 1**: T-001 to T-053 — UI/UX staging fixes from operator browser testing (ALL DONE)
> **Phase 2**: T-054 to T-073 — E2E production-grade implementation tickets (ALL DONE)
> **Phase 3**: T-074 to T-111 — UI/UX Professional Polish (ALL DONE)
> **Phase 4**: T-112 to T-127 — Wiring & Navigation (ALL DONE)
> **Phase 5**: T-128 to T-199 — Production Audit: POS + Cross-Platform Gaps (ALL DONE)
> **Phase 6**: T-200 to T-235 — 360° CTO Audit (ALL DONE)
> **Phase 7**: T-236 to T-252 — B2B Reorder System (ALL DONE)
> **Phase 8**: T-219, T-223, T-231, T-232, T-235 — FCM Push + Deferred (ALL DONE)
> **Phase 9**: T-253 to T-316 — Payments + B2B Finance + WhatsApp + AI Automation (QUEUED)
> **Launch Geography**: India — INR (₹), +91, IST, DD/MM/YYYY
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
| I: Retailer Product → POS Sync | T-054 → T-055 | 2 | P0 | **DONE** |
| J: Loose Product Retail Variants | T-056 → T-061 | 6 | P0 | **DONE** |
| K: Supply Chain E2E & Scalability | T-062 → T-068 | 7 | P0-P1 | **DONE** |
| L: Invoicing System | T-069 → T-073 | 5 | P0 | **DONE** |
| M: Brand Foundation | T-074 → T-080 | 7 | P0 | QUEUED |
| N: Navigation & Layout | T-081 → T-088 | 8 | P0 | QUEUED |
| O: Component Consistency | T-089 → T-098 | 10 | P1 | QUEUED |
| P: Loading States & Feedback | T-099 → T-103 | 5 | P1 | QUEUED |
| Q: Landing Page Brand | T-104 → T-106 | 3 | P1 | QUEUED |
| R: POS App Polish | T-107 → T-109 | 3 | P1 | QUEUED |
| S: Verification (Phase 3) | T-110 → T-111 | 2 | P2 | QUEUED |
| T: Breadcrumbs | T-112 → T-114 | 3 | P1 | QUEUED |
| U: 404 & Error Pages | T-115 → T-117 | 3 | P1 | QUEUED |
| V: Deep Linking & State | T-118 → T-121 | 4 | P1 | QUEUED |
| W: POS Navigation Polish | T-122 → T-127 | 6 | P1 | QUEUED |
| **TOTAL** | **T-001 → T-127** | **127** | | **73 DONE / 54 QUEUED** |

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

---

## PHASE 3: UI/UX PROFESSIONAL POLISH (T-074 → T-111)

> 38 tickets. Brand consistency + professional appearance across all platforms.
> Launch geography: India. All locale defaults: INR (₹), +91, IST, DD/MM/YYYY.
> Brand spec: Primary `#2563EB` (blue), Accent `#14B8A6` (teal), Background `#F7F9FC`, Font Inter, Sidebar 256px dark gradient.
> Execution order: brand foundation → navigation/layout → components → page polish → states/feedback → landing.
> During execution: if any micro issue found, fix inline and move on. Zero regression.

---

### CATEGORY M: BRAND FOUNDATION (P0 — Do First)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-074 | Unified brand design tokens specification | All Platforms | **Implement**: Create `RELEASES/DESIGN_TOKENS.md` — single source-of-truth for all UI tokens. Primary: `#2563EB` (blue-600), PrimaryDark: `#1D4ED8`, PrimaryLight: `#EFF6FF`. Accent: `#14B8A6`, AccentDark: `#0D9488`, AccentLight: `#F0FDFA`. Success: `#22C55E`, Warning: `#F59E0B`, Error: `#EF4444`, Info: `#0EA5E9`. Background: `#F7F9FC`, Surface: `#FFFFFF`, Border: `#E2E8F0`. Text: `#0F172A` primary, `#64748B` secondary. Sidebar: 256px, gradient `#0F172A→#1E293B`. Card radius: 8px, Button height: 46px, Input height: 42px, Button/Input radius: 6px, Modal radius: 12px. Font: `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif`. All platforms reference this spec. |
| T-075 | SVG brand logo + shortmark icon | Shared Assets | **Implement**: Create `shared/brand/` directory with: (1) `logo-full.svg` — "SuperMandi" text in Inter Bold 700 with geometric shortmark icon (abstract "SM" monogram, hexagonal/tech shape, `#2563EB` blue). (2) `logo-shortmark.svg` — Just the icon, scalable 16×16 to 64×64, blue on transparent. (3) `favicon.svg` — 32×32 shortmark on `#2563EB` blue background with white icon, rounded corners. (4) `logo-white.svg` — White version for dark backgrounds (sidebars). Design: clean geometric, tech-forward, derived from "S" + "M" letterforms. No gradients — flat blue + white only. |
| T-076 | Align POS mobile color tokens to brand standard | POS App | **Implement**: Update `src/theme/colors.ts`: Change `primary` from `"#1D4ED8"` to `"#2563EB"`, `primaryDark` from `"#1E3A8A"` to `"#1D4ED8"`, `primaryLight` from `"#3B82F6"` to `"#EFF6FF"`, `success` from `"#16A34A"` to `"#22C55E"`, `background` from `"#F4F6FB"` to `"#F7F9FC"`, `backgroundSecondary` from `"#EEF2F6"` to `"#F1F5F9"`. Keep accent `#14B8A6` (already matches). All screens using `theme.colors.primary` auto-update. Run typecheck after. |
| T-077 | Align SuperAdmin font stack + heading sizes | SuperAdmin | **Implement**: (1) Update `supermandi-superadmin/src/index.css` `:root` font-family to `Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif` (add Inter first, matching retailer/supplier). (2) Update `supermandi-superadmin/src/App.css` `.title` from `font-size: 26px; font-weight: 800` to `font-size: 24px; font-weight: 700`. (3) Update SuperAdmin button `border-radius: 10px` to `6px`, input `border-radius: 12px` to `6px` in `index.css`. |
| T-078 | Replace all favicons with brand shortmark | Retailer + SuperAdmin + Landing | **Implement**: (1) Copy `shared/brand/favicon.svg` to `retailer-admin/public/favicon.svg` — replaces green "S" on green background. (2) Copy to `supermandi-superadmin/public/favicon.svg` — replaces Vite logo. Update `supermandi-superadmin/index.html` favicon href from `/admin/vite.svg` to `/admin/favicon.svg`. Update `supermandi-superadmin/public/manifest.json` `theme_color` from `"#1976d2"` to `"#2563EB"`. (3) Replace landing page inline data URI favicon with `<link rel="icon" href="/favicon.svg">`, copy favicon to `supermandi-landing/favicon.svg`. |
| T-079 | Standardize sidebar width to 256px across all portals | Retailer + SuperAdmin | **Implement**: (1) Retailer Admin: Update `retailer-admin/src/index.css` `--sidebar-width` from `240px` to `256px`. Update `retailer-admin/src/components/ProtectedLayout.tsx` inline `width: '240px'` to `'256px'` and `marginLeft: '240px'` to `'256px'`. (2) SuperAdmin: Update `supermandi-superadmin/src/App.css` `.sidebar { width: 220px }` to `256px`. Update `.mainContent` padding-left if hardcoded. Supplier Portal already at `w-64` (256px) — no change needed. |
| T-080 | Standardize card/modal border radius across SuperAdmin | SuperAdmin | **Implement**: Update `supermandi-superadmin/src/App.css`: `.card { border-radius: 18px }` → `8px`. `.sidebar { border-radius: 16px }` → `0` (sidebars no radius). `.loginCard { border-radius: 18px }` → `8px`. `.modal { border-radius: 20px }` → `12px`. `.banner { border-radius: 16px }` → `8px`. `.loginField input { border-radius: 12px }` → `6px`. Per DESIGN_TOKENS.md spec: cards 8px, inputs/buttons 6px, modals 12px. |

---

### CATEGORY N: NAVIGATION & LAYOUT (P0)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-081 | Replace retailer admin emoji nav icons with Lucide SVG icons | Retailer Admin | **Implement**: (1) Install `lucide-react` as dependency. (2) Update `retailer-admin/src/components/ProtectedLayout.tsx` `navItems` array: replace `icon` emoji strings with Lucide components — `📊`→LayoutDashboard, `📦`→Package, `📋`→ClipboardList, `🏪`→Store, `🛒`→ShoppingCart, `📄`→FileText, `📑`→FileSpreadsheet, `⚙️`→Settings, `💳`→CreditCard, `📱`→Smartphone, `🧾`→Receipt, `✅`→CheckCircle, `📝`→PenSquare. (3) Render icons at 20×20 with `opacity: 0.7` inactive, `1.0` active. (4) Update admin section icons similarly. |
| T-082 | Replace supplier portal emoji nav icons with Lucide SVG icons | Supplier Portal | **Implement**: (1) Install `lucide-react` as dependency. (2) Update `supplier-portal/src/app/(dashboard)/layout.tsx` `navItems`: `📊`→LayoutDashboard, `📦`→Package, `📄`→FileSpreadsheet, `🛒`→ShoppingCart, `📋`→ClipboardList, `💰`→DollarSign, `🧾`→Receipt, `👤`→User. (3) Render icons with `className="w-5 h-5"`. Match active/inactive opacity to retailer admin. |
| T-083 | Add Lucide SVG icons to SuperAdmin sidebar | SuperAdmin | **Implement**: (1) Install `lucide-react` as dependency. (2) Update `supermandi-superadmin/src/App.tsx` sidebar items: Add icon before each text label — Events→Activity, Stores→Store, Devices→Smartphone, Staff→Users, GRN Alerts→AlertTriangle, Invoices→Receipt, Applications→FileCheck, Registrations→UserPlus, Documents→FileText, Suppliers→Truck, Payments→CreditCard, Analytics→BarChart3, Audit→Shield, Users→UserCog, Settings→Settings. (3) Style: 18×18 icon, `opacity: 0.6` inactive, `1.0` active, `marginRight: 10px`. |
| T-084 | Update retailer admin sidebar brand logo | Retailer Admin | **Implement**: Update `retailer-admin/src/components/ProtectedLayout.tsx` sidebar header: Replace gradient text "SuperMandi" with `<img>` referencing white shortmark SVG from `shared/brand/logo-white.svg` (24×24) + "SuperMandi" text in white (`#FFFFFF`, Inter 600, 1.25rem). Keep store name + green status dot below. |
| T-085 | Update supplier portal sidebar brand logo | Supplier Portal | **Implement**: Update `supplier-portal/src/app/(dashboard)/layout.tsx` sidebar header: Replace `bg-gradient-to-r from-primary-400 to-accent-400 bg-clip-text text-transparent` text with white shortmark SVG (24×24) + "SuperMandi" text in `text-white font-semibold text-xl`. Keep "Supplier Portal" subtitle in `text-slate-400 text-xs`. |
| T-086 | Add brand header to SuperAdmin sidebar | SuperAdmin | **Implement**: Add brand section at top of `.sidebar` in `supermandi-superadmin/src/App.tsx`: White shortmark SVG (24×24) + "SuperMandi" text in white (`#FFFFFF`, Inter 600, 18px) + "SuperAdmin" subtitle in `#94A3B8` (12px). Keep health status indicator. Replace `.brandPill` usage with proper header. |
| T-087 | Add mobile hamburger menu to supplier portal | Supplier Portal | **Implement**: Update `supplier-portal/src/app/(dashboard)/layout.tsx`: (1) Add `useState` for `sidebarOpen`. (2) Sidebar: `className="hidden md:flex ..."` by default. When open on mobile: `fixed inset-y-0 left-0 z-50 flex w-64 ...`. (3) Add hamburger button: `md:hidden fixed top-4 left-4 z-40` with Menu icon (Lucide). (4) Add backdrop: `fixed inset-0 bg-black/50 z-40` when open. (5) Close on nav link click, close on backdrop click. (6) Add X close button inside mobile sidebar. |
| T-088 | Add mobile hamburger menu to retailer admin | Retailer Admin | **Implement**: Update `retailer-admin/src/components/ProtectedLayout.tsx`: (1) Add `sidebarOpen` state. (2) Add hamburger button (Menu icon from Lucide) visible only below 768px: `display: none` desktop, `display: flex` mobile. (3) Sidebar: add `transform: translateX(0)` when open, keep `translateX(-100%)` when closed on mobile. (4) Add overlay backdrop div. (5) Close on nav click, close on backdrop click. (6) Update `index.css` `@media (max-width: 768px)` for sidebar open state class. |

---

### CATEGORY O: COMPONENT CONSISTENCY (P1)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-089 | Refactor retailer admin sidebar from inline styles to CSS classes | Retailer Admin | **Implement**: Refactor `retailer-admin/src/components/ProtectedLayout.tsx`: Remove ALL inline `style={}` objects for sidebar, nav items, footer, brand section. Use existing CSS classes from `index.css` (`.sidebar`, `.nav-link`, `.nav-link.active`). Add missing classes to `index.css` for dark sidebar gradient, white text, hover states. Remove all `onMouseOver`/`onMouseOut` handlers — use CSS `:hover` instead. Zero visual change for end users. |
| T-090 | Refactor retailer admin login page from inline styles to CSS | Retailer Admin | **Implement**: Refactor `retailer-admin/src/pages/LoginPage.tsx`: Remove the massive `styles` const object. Use existing CSS classes: `.login-page`, `.login-card`, `.login-title`, `.form-group`, `.form-label`, `.form-input`, `.btn`, `.btn-primary`. Add any missing auth-specific classes to `index.css`. Clean JSX. |
| T-091 | Create shared modal component for retailer admin | Retailer Admin | **Implement**: Extract `retailer-admin/src/components/Modal.tsx` from inline modals in ProtectedLayout (session warning, logout confirm). Props: `isOpen: boolean`, `onClose: () => void`, `title: string`, `children: ReactNode`, `actions?: ReactNode`. Styles: overlay `position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 50`, card `background: white; border-radius: 12px; padding: 24px; max-width: 400px; width: 90%`. Replace both inline modals. |
| T-092 | Create shared modal component for supplier portal | Supplier Portal | **Implement**: Create `supplier-portal/src/components/Modal.tsx` matching UX of retailer admin modal (T-091). Props: `isOpen`, `onClose`, `title`, `children`, `footer`. Tailwind: overlay `fixed inset-0 bg-black/50 flex items-center justify-center z-50`, card `bg-white rounded-xl shadow-xl p-6 max-w-sm w-full mx-4`. Replace logout modal and email verification modal in layout. |
| T-093 | Standardize status badge design across all portals | All Web Portals | **Implement**: Unify badge/pill design: (1) Retailer `index.css`: `.badge-success` = `background: #DCFCE7; border: 1px solid #86EFAC; color: #166534`, `.badge-warning` = `background: #FEF3C7; border: 1px solid #FCD34D; color: #92400E`, `.badge-danger` = `background: #FEE2E2; border: 1px solid #FCA5A5; color: #991B1B`. Add `.badge-info` = `background: #DBEAFE; border: 1px solid #93C5FD; color: #1E40AF`. (2) Supplier: Tailwind badge classes. (3) SuperAdmin: align `.badgeOk/.badgeWarn/.badgeError` to same colors. |
| T-094 | Standardize toast notification system across portals | Retailer + SuperAdmin | **Implement**: (1) Add `react-hot-toast` to Retailer Admin and SuperAdmin `package.json`. (2) Retailer: add `<Toaster>` in App.tsx — position: `top-center`, duration: 4000 (success) / 6000 (error), style: `background: '#0F172A', color: '#FFFFFF', borderRadius: '8px'`. (3) SuperAdmin: same config. Supplier already uses react-hot-toast — update config to match. |
| T-095 | Unify login page header across all portals | All Web Portals | **Implement**: All three login pages: 64px header bar, white background, `border-bottom: 1px solid #E2E8F0`. Left: shortmark SVG (20×20) + "SuperMandi" text (`#2563EB`, Inter 600, 18px) + "|" separator + portal name (`#64748B`, 16px). Update: Retailer `LoginPage.tsx`, Supplier `(auth)/layout.tsx`, SuperAdmin `LoginGate.tsx`. |
| T-096 | Unify login card design across all portals | All Web Portals | **Implement**: All login cards: max-width 448px, white, border `1px solid #E2E8F0`, border-radius 8px, shadow, padding 32px. India locale: phone placeholder `+91 98765 43210`, PIN placeholder `Enter 6-digit PIN`, currency `₹`, date `DD/MM/YYYY`. (1) SuperAdmin: `.loginCard` radius 18px→8px, `.loginField input` 12px→6px, `.loginButton`→6px. (2) Retailer: match spec + India placeholders. (3) Supplier: match spec + India placeholders. |
| T-097 | Unify footer design across all web portals | All Web Portals | **Implement**: Standard footer: `background: #F8FAFC`, `border-top: 1px solid #E2E8F0`, `padding: 12px 24px`, `font-size: 12px`, `color: #94A3B8`. Left: `© 2026 SuperMandi Tech Pvt Ltd · Made in India`, Right: `<BuildStamp />`. Update all 3 portals. |
| T-098 | Standardize error/warning/success banner design | All Web Portals | **Implement**: Unified alert banner: border-radius 8px, padding 12px 16px. Error: `bg: #FEF2F2; border: #FCA5A5; color: #991B1B`. Warning: `bg: #FFFBEB; border: #FCD34D; color: #92400E`. Success: `bg: #F0FDF4; border: #86EFAC; color: #166534`. Update retailer `index.css`, SuperAdmin `App.css`, supplier Tailwind classes. |

---

### CATEGORY P: LOADING STATES & FEEDBACK (P1)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-099 | Add skeleton loading components to retailer admin | Retailer Admin | **Implement**: (1) Create `retailer-admin/src/components/Skeleton.tsx`: animated shimmer div with `@keyframes shimmer`. (2) Create `retailer-admin/src/components/TableSkeleton.tsx`: N skeleton rows matching table layout. (3) Apply to: DashboardPage (stat cards), ProductsPage (table), InventoryPage (ledger). Replace blank-space-during-load with shimmer. |
| T-100 | Add skeleton loading to supplier portal pages | Supplier Portal | **Implement**: (1) Create `supplier-portal/src/components/Skeleton.tsx` using Tailwind `animate-pulse`. (2) Update `(dashboard)/loading.tsx` from spinner to skeleton layout. (3) Skeleton variants for dashboard (stat cards + table), products (rows), orders (list items). |
| T-101 | Create branded empty state component for retailer admin | Retailer Admin | **Implement**: Create `retailer-admin/src/components/EmptyState.tsx`. Props: `icon`, `title`, `description`, `action?`. Design: centered, icon in 48px `#EFF6FF` circle with `#2563EB` icon, title 18px/600, description 14px `#64748B`. Apply to: Products, Inventory, Suppliers, Orders empty states. |
| T-102 | Create branded empty state component for supplier portal | Supplier Portal | **Implement**: Create `supplier-portal/src/components/EmptyState.tsx` Tailwind version. Apply to: Products, Orders, Earnings, Invoices empty states. |
| T-103 | Add subtle page entrance animations to web portals | Retailer + SuperAdmin | **Implement**: (1) Retailer: `@keyframes fadeIn { from { opacity: 0; transform: translateY(8px) } to { opacity: 1; transform: translateY(0) } }`. (2) SuperAdmin: verify `fadeUp`. (3) All: honor `prefers-reduced-motion: reduce`. |

---

### CATEGORY Q: LANDING PAGE BRAND ALIGNMENT (P1)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-104 | Update landing page primary buttons to brand blue | Landing Page | **Implement**: Update `supermandi-landing/index.html` CSS: `.nav-btn-primary` background from `var(--foreground)` (black) to `#2563EB`, hover to `#1D4ED8`. Update `::selection` and `.portal-card:hover` accent to `#2563EB`. |
| T-105 | Replace landing page triangle logo with brand shortmark | Landing Page | **Implement**: Replace `.logo-mark` inline triangle SVG with shortmark from `shared/brand/logo-shortmark.svg`. Update `.logo-text` "supermandi" → "SuperMandi" (PascalCase). |
| T-106 | Add portal entry section to landing page | Landing Page | **Implement**: 3 portal cards below hero: "Retailer Portal" → `/retailer/login`, "Supplier Portal" → `/supplier/login`, "SuperAdmin" → `/admin/`. White cards, `border: 1px solid #E2E8F0`, `border-radius: 8px`. Responsive: 3-col desktop, stacked mobile. |

---

### CATEGORY R: POS APP BRAND POLISH (P1)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-107 | Update POS splash screen with brand shortmark | POS App | **Implement**: Replace text-only "Welcome To SuperMandi" with shortmark icon (64×64 white on `#2563EB`) + "SuperMandi" text (Inter Bold 28px white) + "POS" subtitle. Background: solid `#2563EB`. |
| T-108 | Update POS menu screen header with brand identity | POS App | **Implement**: Add shortmark icon (24×24) next to "SuperMandi POS" title. Ensure header uses `theme.colors.primary` (`#2563EB` after T-076). |
| T-109 | Add branded empty states to POS screens | POS App | **Implement**: Branded empty states for: SalesHistoryScreen ("No sales yet"), OrderHistoryScreen ("No orders yet"), StockStatementScreen ("No stock data"), BnplDuesScreen ("No outstanding dues"). Use `theme.colors.primarySoft` background circle + `theme.colors.primary` icon. |

---

### CATEGORY S: CROSS-PLATFORM CONSISTENCY VERIFICATION (P2)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-110 | Cross-portal visual consistency audit | All Platforms | **Implement**: Verify all prior UX tickets achieved consistency: sidebar 256px, Lucide icons, login headers, favicons, badge colors, card radius 8px, button/input radius 6px, toast style, footer, empty states. Document remaining gaps as micro-fixes. Run `pnpm -r typecheck`. |
| T-111 | Full production build verification for all portals | All Platforms | **Implement**: Run full production builds: `retailer-admin pnpm build`, `supplier-portal pnpm build`, `supermandi-superadmin pnpm build`, POS `pnpm -r typecheck`. Fix any build errors. |

---

## EXECUTION ORDER (T-074 → T-111)

```
Phase 3A: Brand Foundation (MUST do first)
  T-074  Design tokens specification
  T-075  SVG brand logo + shortmark
  T-076  POS mobile color alignment
  T-077  SuperAdmin font + heading + radius alignment
  T-078  Replace all favicons
  T-079  Standardize sidebar width 256px
  T-080  Standardize SuperAdmin border radii

Phase 3B: Navigation & Layout (depends on T-075)
  T-081  Retailer admin: emoji → Lucide SVG icons
  T-082  Supplier portal: emoji → Lucide SVG icons
  T-083  SuperAdmin: add Lucide SVG icons
  T-084  Retailer admin: sidebar brand logo
  T-085  Supplier portal: sidebar brand logo
  T-086  SuperAdmin: sidebar brand header
  T-087  Supplier portal: mobile hamburger
  T-088  Retailer admin: mobile hamburger

Phase 3C: Component Consistency (after Phase 3A)
  T-089  Retailer: refactor sidebar inline styles → CSS
  T-090  Retailer: refactor login inline styles → CSS
  T-091  Retailer: shared Modal component
  T-092  Supplier: shared Modal component
  T-093  Standardize badges across portals
  T-094  Standardize toast notifications
  T-095  Unify login page header
  T-096  Unify login card design
  T-097  Unify footer design
  T-098  Standardize alert banners

Phase 3D: Loading States (after Phase 3A)
  T-099  Retailer: skeleton loading
  T-100  Supplier: skeleton loading
  T-101  Retailer: branded empty states
  T-102  Supplier: branded empty states
  T-103  Page entrance animations

Phase 3E: Landing Page (depends on T-075)
  T-104  Landing page: brand blue buttons
  T-105  Landing page: brand shortmark logo
  T-106  Landing page: portal entry cards

Phase 3F: POS App (depends on T-075 + T-076)
  T-107  POS splash screen brand polish
  T-108  POS menu screen brand header
  T-109  POS branded empty states

Phase 3G: Verification (MUST be last)
  T-110  Cross-portal visual consistency audit
  T-111  Full production build verification
```

---

## ZERO REGRESSION RULES FOR PHASE 3

1. **Every ticket passes typecheck**: `pnpm -r typecheck` must be clean after every commit.
2. **No functionality changes**: UX tickets change appearance only — zero behavior/API/DB changes.
3. **Fix inline**: If T-081 reveals a missing CSS class, add it in same commit.
4. **Store isolation unchanged**: No route or middleware changes in UX tickets.
5. **Build verification**: T-111 ensures all portals build successfully.
6. **Responsive safety**: Mobile changes (T-087, T-088) must not break desktop layout.
7. **Accessibility preserved**: `prefers-reduced-motion` still honored after T-103 animations.

---

## PHASE 4: WIRING & NAVIGATION (T-112 → T-127)

> 16 tickets. Navigation guards, breadcrumbs, deep linking, 404 pages, modal persistence, error boundaries.
> All platforms share common patterns. Execution: breadcrumbs/404 → deep linking → state persistence → POS nav.
> Zero regression: wiring tickets add UI chrome, never change business logic or API behavior.

---

### CATEGORY T: BREADCRUMBS & PATH INDICATORS (P1)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-112 | Add breadcrumb component + apply to retailer admin pages | Retailer Admin | **Implement**: (1) Create `retailer-admin/src/components/Breadcrumb.tsx`. Props: `items: Array<{label, path?}>`. Design: `›` separator, 13px `#64748B`, last item `#0F172A` bold. (2) Wire: Dashboard→"Home", Products→"Home › Products", Inventory→"Home › Inventory", Settings→"Home › Settings", etc. Use `useLocation()`. |
| T-113 | Add breadcrumb component + apply to supplier portal pages | Supplier Portal | **Implement**: (1) Create `supplier-portal/src/components/Breadcrumb.tsx` Tailwind. `flex items-center gap-2 text-sm text-slate-500`. (2) Wire: Dashboard→"Home", Products→"Home › Products", Orders→"Home › Orders", etc. Use `usePathname()`. |
| T-114 | Add tab path indicator + browser history to SuperAdmin | SuperAdmin | **Implement**: (1) Store active tab in URL hash: `#events`, `#stores`, etc. Read on mount, push on switch. (2) Breadcrumb: "SuperAdmin › [Tab Name]". (3) Browser back navigates previous tab. |

---

### CATEGORY U: 404 & ERROR PAGES (P1)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-115 | Create branded 404 page for retailer admin | Retailer Admin | **Implement**: `retailer-admin/src/pages/NotFoundPage.tsx`. "404" large text, title, description, "Back to Dashboard" button. Update catch-all route. |
| T-116 | Create branded 404 page for supplier portal | Supplier Portal | **Implement**: `supplier-portal/src/app/not-found.tsx` (Next.js convention). Same design as T-115. |
| T-117 | Add per-screen error boundaries to POS app | POS App | **Implement**: `src/components/ui/ScreenErrorBoundary.tsx` — wrap each major screen. Error icon, "Something went wrong", "Try Again" button. One screen crash doesn't take down the app. |

---

### CATEGORY V: DEEP LINKING & STATE PERSISTENCE (P1)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-118 | Add deep linking support to SuperAdmin tabs | SuperAdmin | **Implement**: External links like `/admin/#suppliers` open directly. Query params for filters: `#suppliers?status=pending`. Share button copies deep link. |
| T-119 | Persist modal state across navigation in SuperAdmin | SuperAdmin | **Implement**: Store open modal in `sessionStorage`. Re-open on tab restore. "Unsaved changes?" warning on dirty form + tab switch. Clean up on modal close. |
| T-120 | Add navigation state to retailer admin store context | Retailer Admin | **Implement**: Use `useSearchParams()` to persist filter/sort in URL. Products: `?search=flour&page=2`. Inventory: `?product=xyz`. Browser back restores filters. |
| T-121 | Add navigation state to supplier portal pages | Supplier Portal | **Implement**: Next.js `useSearchParams()` for filters. Products: `?status=approved&page=2`. Orders: `?status=confirmed`. Browser back restores. |

---

### CATEGORY W: POS APP NAVIGATION POLISH (P1)

| # | Title | Scope | Implementation |
|---|-------|-------|----------------|
| T-122 | Add screen-level back navigation to POS detail screens | POS App | **Implement**: Back arrow (ChevronLeft) on all detail screens. 40×40 touch target. Handle Android `BackHandler`. |
| T-123 | Add session timeout to POS app | POS App | **Implement**: Track last interaction. 30 min idle → warning. 35 min idle → auto-logout. Hook: `src/hooks/useSessionTimeout.ts`. Reset on touch/scan. |
| T-124 | Add tab switch confirmation when cart has items in POS | POS App | **Implement**: Cart non-empty + tab switch → "You have N items. Switching clears cart. Continue?" Stay/Switch buttons. |
| T-125 | Add pull-to-refresh on POS list screens | POS App | **Implement**: `RefreshControl` on SalesHistory, OrderHistory, PurchaseHistory, StockStatement, BnplDues. Color: `theme.colors.primary`. |
| T-126 | Add offline indicator banner to POS app | POS App | **Implement**: `src/components/ui/OfflineBanner.tsx`. Warning yellow banner "No internet connection — working offline". Uses `NetInfo`. Animated slide-down. |
| T-127 | Ensure all POS modals close on hardware back button | POS App | **Implement**: Shared hook `src/hooks/useModalBackHandler.ts`. All modals: hardware back closes modal (not navigate away). No modal open → default behavior. |

---

## EXECUTION ORDER (T-112 → T-127)

```
Phase 4A: Breadcrumbs (independent of each other)
  T-112  Retailer admin breadcrumbs
  T-113  Supplier portal breadcrumbs
  T-114  SuperAdmin tab path indicator

Phase 4B: 404 & Error Pages
  T-115  Retailer admin 404 page
  T-116  Supplier portal 404 page
  T-117  POS per-screen error boundaries

Phase 4C: Deep Linking & State
  T-118  SuperAdmin deep linking
  T-119  SuperAdmin modal persistence
  T-120  Retailer admin URL state
  T-121  Supplier portal URL state

Phase 4D: POS Navigation Polish
  T-122  POS back navigation
  T-123  POS session timeout
  T-124  POS cart switch confirmation
  T-125  POS pull-to-refresh
  T-126  POS offline banner
  T-127  POS modal back handler
```

---

## ZERO REGRESSION RULES FOR PHASE 4

1. **Navigation changes never break auth**: Route guards remain intact.
2. **URL state is additive**: Pages work without query params (graceful fallback).
3. **Back button never bypasses auth**: Browser/hardware back from login does NOT enter dashboard.
4. **Modal state is defensive**: Stale sessionStorage → silently discard.
5. **POS stability**: Error boundaries per-screen — one crash never takes down the app.
6. **Typecheck clean**: `pnpm -r typecheck` after every ticket.

---

## PHASE 5: PRODUCTION AUDIT — POS + CROSS-PLATFORM GAPS (T-128 → T-199)

> 72 tickets across 8 categories (X→AE). Comprehensive audit of POS sell/buy flows, payments, product images, barcode labels, data sync, cross-platform integration, and business logic.
> P0 Go-Live Blockers: T-147 (price continuity), T-149 (QR expiry), T-150 (refund flow), T-173 (real-time sync), T-177 (stock locking), T-184 (token revocation), T-188 (batch approval)

| Category | Range | Count | Priority | Description |
|----------|-------|-------|----------|-------------|
| X: POS Sell Flow & Scan | T-128 → T-138 | 11 | P0-P2 | Manual barcode, search debounce, fuzzy search, product images, voice Hindi |
| Y: POS Purchase Tab (B2B) | T-139 → T-148 | 10 | P0-P2 | Purchase images, MOQ, batch/lot, price continuity, unified flows |
| Z: Payment & UPI | T-149 → T-158 | 10 | P0-P2 | QR expiry, refund flow, Khata, customer profiles, BNPL partial |
| AA: Product Images | T-159 → T-165 | 7 | P1-P2 | Image schema, GCS upload, supplier UI, placeholders, optimization |
| AB: Barcode Sheets | T-166 → T-172 | 7 | P2 | Category filter, custom selection, preview, label enrichment |
| AC: Data Sync & Offline | T-173 → T-179 | 7 | P0-P1 | Real-time SSE, stock locking, deadletter, auto-sync |
| AD: Cross-Platform | T-180 → T-190 | 11 | P0-P2 | PO visibility, batch approval, token revocation, max devices |
| AE: Business Logic | T-191 → T-199 | 9 | P1-P2 | Z-report, shift management, returns, customer management |

### CATEGORY X: POS SELL FLOW & SCAN (T-128 → T-138)

| # | Title | Priority |
|---|-------|----------|
| T-128 | Manual barcode entry fallback to POS sell screen | P0 |
| T-129 | 300ms search debounce to POS sell screen | P1 |
| T-130 | Recent search history to POS sell screen | P2 |
| T-131 | Frequently sold products when search empty | P2 |
| T-132 | Fuzzy/typo-tolerant search via pg_trgm | P1 |
| T-133 | Bulk quantity selector on product cards | P2 |
| T-134 | Product images on POS sell screen cards | P1 |
| T-135 | Voice command Hindi language indicator | P2 |
| T-136 | Product substitution suggestions (out of stock) | P2 |
| T-137 | Search autocomplete/suggestions | P2 |
| T-138 | Audio/haptic feedback on scan add | P2 |

### CATEGORY Y: POS PURCHASE TAB B2B (T-139 → T-148)

| # | Title | Priority |
|---|-------|----------|
| T-139 | Product images on purchase catalog cards | P1 |
| T-140 | Delivery date picker in purchase flow | P1 |
| T-141 | Always show MOQ on purchase cards | P1 |
| T-142 | Show actual available quantity from supplier | P1 |
| T-143 | Recently purchased quick-reorder section | P2 |
| T-144 | Batch/lot number + expiry date in GRN | P1 |
| T-145 | Backend cart backup for purchase cart | P1 |
| T-146 | Offline catalog browsing for purchase tab | P1 |
| T-147 | Prevent product disappearance during supplier price edit | P0 |
| T-148 | Unify Quick Purchase and Live Supplier flows | P2 |

### CATEGORY Z: PAYMENT & UPI (T-149 → T-158)

| # | Title | Priority |
|---|-------|----------|
| T-149 | UPI QR expiry 5 minutes + countdown timer | P0 |
| T-150 | Payment refund flow (refunds table + API + POS UI) | P0 |
| T-151 | Payment reconciliation dashboard (Retailer Admin) | P1 |
| T-152 | Three-way split payment support | P2 |
| T-153 | BNPL partial payment option | P1 |
| T-154 | Khata (credit book) UI to POS | P1 |
| T-155 | Customer profiles for regular buyers | P1 |
| T-156 | Payment receipt customization | P2 |
| T-157 | Bank transfer option for supplier purchases | P2 |
| T-158 | Configurable BNPL interest rates per supplier | P2 |

### CATEGORY AA: PRODUCT IMAGES (T-159 → T-165)

| # | Title | Priority |
|---|-------|----------|
| T-159 | image_url column to supplier/store/products tables | P1 |
| T-160 | Image upload endpoint with GCS storage | P1 |
| T-161 | Image upload UI in supplier portal product creation | P1 |
| T-162 | Image preview in SuperAdmin product approval | P1 |
| T-163 | Placeholder image component for products without photos | P1 |
| T-164 | Image optimization/resizing pipeline (sharp) | P2 |
| T-165 | Image column in CSV import for supplier products | P2 |

### CATEGORY AB: BARCODE SHEETS (T-166 → T-172)

| # | Title | Priority |
|---|-------|----------|
| T-166 | Category-wise filtering for barcode sheet | P2 |
| T-167 | Custom product selection for barcode sheet | P2 |
| T-168 | Barcode sheet preview before download | P2 |
| T-169 | Print settings for barcode labels | P2 |
| T-170 | Batch printing (N copies of same barcode) | P2 |
| T-171 | Enrich labels with price, unit, category | P2 |
| T-172 | Auto-generate labels after GRN | P2 |

### CATEGORY AC: DATA SYNC & OFFLINE (T-173 → T-179)

| # | Title | Priority |
|---|-------|----------|
| T-173 | Real-time product sync via SSE | P0 |
| T-174 | Real-time settings sync from web to POS | P0 |
| T-175 | Sync progress indicator + queue depth | P1 |
| T-176 | Deadletter recovery for failed sync events | P1 |
| T-177 | Stock locking (optimistic concurrency) | P0 |
| T-178 | Periodic stock reconciliation POS↔server | P1 |
| T-179 | Background auto-sync configurable interval | P1 |

### CATEGORY AD: CROSS-PLATFORM (T-180 → T-190)

| # | Title | Priority |
|---|-------|----------|
| T-180 | POS purchase order visibility in Retailer Admin | P1 |
| T-181 | PO-to-invoice linkage for reconciliation | P1 |
| T-182 | Supplier catalog browsing from POS | P1 |
| T-183 | Auto-refresh on Retailer Admin inventory page | P1 |
| T-184 | Immediate token revocation via Redis blacklist | P0 |
| T-185 | Max devices per store enforcement | P1 |
| T-186 | Align CSV import validation with product form | P1 |
| T-187 | Populate categoryId in product creation flow | P1 |
| T-188 | Batch approval/rejection in SuperAdmin | P0 |
| T-189 | Margin analysis report (SuperAdmin analytics) | P2 |
| T-190 | Compliance/KYC doc upload from POS app | P2 |

### CATEGORY AE: POS MENU & BUSINESS LOGIC (T-191 → T-199)

| # | Title | Priority |
|---|-------|----------|
| T-191 | Daily cash closing / Z-report | P1 |
| T-192 | Shift management with cash count | P1 |
| T-193 | Collection/dunning for overdue DUE payments | P1 |
| T-194 | Return/refund processing screen | P1 |
| T-195 | Thermal printer configuration screen | P2 |
| T-196 | Customer management screen | P1 |
| T-197 | Auto-categorization of products by name | P2 |
| T-198 | Opening stock ledger creation from POS | P1 |
| T-199 | Daily closing printable report | P2 |

### EXECUTION ORDER

```
Phase 5A: Schema Foundation (DB migrations)
  T-159, T-154, T-155, T-144, T-145, T-150, T-177, T-191, T-192

Phase 5B: Backend Core APIs
  T-147 (P0), T-184 (P0), T-149 (P0), T-173 (P0), T-132, T-160, T-131, T-143, T-186, T-185, T-188 (P0)

Phase 5C: POS App Features
  T-128 (P0), T-129, T-134, T-139-T-142, T-146, T-153, T-174-T-179

Phase 5D: POS New Screens
  T-154, T-155, T-191, T-192, T-194, T-196, T-198

Phase 5E: Web Portal Features
  T-161-T-163, T-151, T-180-T-181, T-183, T-187, T-188

Phase 5F-5I: UX + Advanced + Barcode
  T-130, T-133, T-135-T-138, T-148, T-152, T-156-T-158, T-164-T-172, T-189-T-190, T-193, T-195, T-197, T-199
```

### ZERO REGRESSION RULES FOR PHASE 5

1. **Schema migrations are additive only** — new columns with DEFAULT null, new tables. Never alter existing columns.
2. **Stock integrity**: `stock_balances.quantity = SUM(inventory_ledger.delta_qty)` must hold.
3. **Store isolation**: All new endpoints derive `store_id` from JWT only.
4. **Price integrity**: All money in minor units (paise). No floating point. Integer arithmetic only.
5. **Supplier gate**: T-147 does NOT bypass approval — old price stays visible while change is pending.
6. **Offline safety**: Cache is read-only fallback. Mutations always through server when online.
7. **India market**: DD/MM/YYYY, INR (₹), +91 on all new screens.
8. **Typecheck clean**: `pnpm -r typecheck` after every batch.

---

## PHASE 6: 360° CTO PRODUCTION READINESS AUDIT (T-200 → T-235)

> 36 tickets from comprehensive CTO-level audit across ALL platforms.
> Audit method: 5 parallel deep-dive agents + 1 reconciliation agent. ~150+ raw findings → 9 false positives dropped → 36 final tickets.
> Priority: 4 P0 blockers, 11 P1 high, 21 P2 medium.
> Estimated effort: ~490 hours (7 S, 15 M, 10 L, 2 XL).

### FALSE POSITIVES DROPPED (9 items that ALREADY WORK)

1. `POST /api/v1/orders/create` "missing" → Backend has `/api/v1/pos/purchases` (correct route name)
2. Webhooks/payments "missing" → Exists as `/razorpay/payments`
3. Supplier CSV upload "missing" → Exists at `upload/page.tsx` with `uploadProductsCsv`
4. Split payment "not implemented" → Fully implemented (`payments.ts` lines 361-606)
5. BNPL dispute false success → Already fixed (catch block shows "Failed")
6. Stock cap silent → Toast IS shown (`SellScanScreen.tsx:1856-1873`)
7. Hindi voice NLU missing → Defaults to Hindi (`voiceOrderService.ts:386`)
8. Store isolation "not enforced" → Middleware + query-level isolation comprehensive (reframed as P2 RLS)
9. CSP/Helmet missing → WORKING (api-gateway has Helmet with HSTS, X-Frame-Options)

---

### P0 GO-LIVE BLOCKERS (4 tickets — platform BREAKS without these)

| # | Title | Platform | What's Wrong | Impact | Fix | Effort |
|---|-------|----------|-------------|--------|-----|--------|
| T-200 | POS B2B order placement stubbed to "Coming Soon" | POS | `PurchaseScreen.tsx:929-931` — "Place Order" shows `Alert.alert("Coming Soon")` instead of calling `POST /api/v1/pos/purchases`. Backend fully implemented. | Retailers CANNOT place purchase orders from POS. B2B flow dead. | Wire button to purchases API, navigate to confirmation screen | M |
| T-201 | Purchase history shows hardcoded Rs.0 for all orders | POS | `PurchaseHistoryScreen.tsx:47-54` — `totalValue: 0` hardcoded because ledger API doesn't return `unitCost`. | Financial tracking useless. Every purchase displays Rs.0. | Include `unit_cost` in ledger API response, update grouping logic | M |
| T-202 | Retailer bank account fields not persisted | Retailer Web | `PaymentsPage.tsx:49-50` — bank/IFSC fields load empty with "Not stored in backend yet" comments. | Retailers can't configure bank details for payouts. | Add `bank_account_number` + `ifsc_code` to `platform.stores`, update settings API | M |
| T-204 | UPI QR code has no visual expiry countdown | POS | Backend returns `expiresAt` (5-min expiry) but POS shows no countdown. QR expires silently. | Cashiers/customers wait forever. UPI (India's #1 payment) broken UX. | Add countdown timer, auto-refresh on expiry, "Tap to regenerate" | M |

---

### P1 HIGH PRIORITY (11 tickets — platform works but has serious gaps)

| # | Title | Platform | Category | Fix | Effort |
|---|-------|----------|----------|-----|--------|
| T-205 | Supplier commission/fee transparency missing | Supplier Web | Business Logic | Add commission rate, gross, platform fee, net payout columns to earnings | M |
| T-206 | Product images not displayed in product cards | Cross-Platform | UI-UX | Wire image display into POS/web cards. Backend upload works, DB stores URLs, but cards show placeholders | L |
| T-207 | Stock-in PO validation missing | Backend | Data Integrity | Add PO existence validation before GRN creation in `stockIn.ts` | S |
| T-208 | OTP verification rate limiting needs hardening | Backend | Security | 5 attempts per phone per 15 min on verification + exponential backoff + lockout | S |
| T-209 | npm audit — 25 high-severity vulnerabilities | Backend | Security | `npm audit fix` + manual upgrades for breaking changes | M |
| T-210 | Replace console.log with structured logging | Backend | Infrastructure | Introduce pino/winston, JSON output, correlation IDs. Replace 68+ console.* calls | L |
| T-211 | Webhook idempotency uses in-memory Map | Backend | Infrastructure | Move `webhooks.ts:22-23` Map to Redis-based idempotency with TTL for multi-instance safety | M |
| T-212 | Sales analytics dashboard missing on Retailer Admin | Retailer Web | UI-UX | Create AnalyticsPage with date range, charts, top products, payment breakdown | L |
| T-213 | Offline sync conflict UI missing on POS | POS | UI-UX | Add SyncConflictScreen with pending/failed items and resolution options | M |
| T-214 | Password strength validation missing | Backend | Security | Enforce min 8 chars, 1 number + 1 letter, common password blocklist | S |

---

### P2 MEDIUM PRIORITY (21 tickets — fix post-launch or in parallel)

| # | Title | Platform | Category | Fix | Effort |
|---|-------|----------|----------|-----|--------|
| T-215 | UPI VPA regex inconsistency between POS and web | Cross-Platform | Data Integrity | Centralize VPA regex: `^[a-zA-Z0-9._-]+@[a-zA-Z0-9]+$` | S |
| T-216 | Database RLS not enabled (defense-in-depth) | Backend | Security | Add PostgreSQL RLS policies on critical tables keyed on store_id | L |
| T-217 | Hindi/regional language missing on web portals | Cross-Platform | UI-UX | Integrate react-i18next/next-intl, start with Hindi for nav/buttons/labels | XL |
| T-218 | Customer CRM not exposed in Retailer Admin | Retailer Web | Business Logic | Create CustomersPage with list, search, due balances, purchase history | L |
| T-219 | UPI refunds stay "pending" forever | Cross-Platform | Business Logic | Integrate Razorpay refund API for UPI, add admin UI for pending refunds | L |
| T-220 | Error retry buttons missing on POS | POS | UI-UX | Add shared ErrorState component with retry callback across all screens | M |
| T-221 | Mobile responsive untested on web portals | Cross-Platform | UI-UX | Audit for 360-414px viewports, add media queries | L |
| T-222 | WCAG accessibility gaps | Cross-Platform | UI-UX | ARIA labels, keyboard nav, contrast check, skip-nav links | XL |
| T-223 | Cloud Monitoring alerts not configured | Backend | Infrastructure | Alert policies for 5xx rate, p95 latency, memory, payment failures | M |
| T-224 | Staff tracking on sales missing | POS | Business Logic | Add staff_id to sales, populate from POS staff context, show in receipts | M |
| T-225 | Daily closing report not fully wired on POS | POS | UI-UX | Wire DailyClosingScreen to backend API, show cash/UPI breakdown | M |
| T-226 | Supplier order acceptance flow incomplete | Supplier Web | Business Logic | Complete accept/reject/ship workflow, propagate status to retailer+POS | L |
| T-227 | Khata integration needs verification | POS | Business Logic | Verify khata screen wired to backend, integrates with DUE payment checkout | M |
| T-228 | Invoice PDF service has uncommitted changes | Backend | Infrastructure | Review, test, commit `invoicePdfService.ts` + `invoices.ts` changes | S |
| T-229 | Voice product search returns empty | POS | Business Logic | Implement product search callback in voice.ts to query store_products by name | M |
| T-230 | Auto-reorder suggestions not wired E2E | Cross-Platform | Business Logic | Verify reorder algorithm, wire retailer-admin page to create POs from suggestions | L |
| T-231 | No overdue payment reminders | Backend | Business Logic | Cloud Scheduler job to check overdue + send SMS/push notifications | L |
| T-232 | GRN alerts have no delivery mechanism | Backend | Business Logic | Wire to FCM push or in-app notification center | M |
| T-233 | Barcode sheet printing UX unverified | SuperAdmin | UI-UX | Verify API returns printable PDF, ensure retailer-admin has download UI | S |
| T-234 | Feature flag admin UI missing | SuperAdmin | Infrastructure | Add FeatureFlagsPage to superadmin with toggle controls per store | M |
| T-235 | GST compliance document flow incomplete | Cross-Platform | Business Logic | Verify GST summary report, GSTR-1 export, document storage working E2E | M |

---

### EXECUTION ORDER (Phase 6)

```
Wave 1 — P0 Blockers (before ANY deployment):
  T-200 → T-201 → T-202 → T-204

Wave 2 — P1 Security (before production exposure):
  T-208 → T-214 → T-209 → T-211

Wave 3 — P1 Infrastructure:
  T-210 → T-207

Wave 4 — P1 Features:
  T-205 → T-206 → T-212 → T-213

Wave 5 — P2 Quick Wins (S effort):
  T-215 → T-228 → T-233

Wave 6 — P2 Medium (parallel work):
  T-218, T-219, T-220, T-223, T-224, T-225, T-226, T-227, T-229, T-230, T-231, T-232, T-234, T-235

Wave 7 — P2 Large (post-launch):
  T-216, T-217, T-221, T-222
```

### ZERO REGRESSION RULES FOR PHASE 6

1. **P0 blockers first**: No deployment until T-200, T-201, T-202, T-204 are all resolved.
2. **Security before exposure**: OTP hardening (T-208) and password strength (T-214) before any public access.
3. **Schema additive only**: New columns with DEFAULT null/new tables. Never alter existing column types.
4. **Store isolation**: All new endpoints derive `store_id` from JWT only.
5. **Price integrity**: All money in minor units (paise). Integer arithmetic only.
6. **India market**: DD/MM/YYYY, INR, +91 on all new screens.
7. **Typecheck clean**: `pnpm -r typecheck` after every batch.
8. **Multi-instance safety**: T-211 webhook fix must work across Cloud Run instances.

---

## GRAND TOTAL SUMMARY

| Phase | Range | Count | Status |
|-------|-------|-------|--------|
| Phase 1: Staging UI/UX Fixes | T-001 → T-053 | 53 | ALL DONE |
| Phase 2: E2E Production Implementation | T-054 → T-073 | 20 | ALL DONE |
| Phase 3: UI/UX Professional Polish | T-074 → T-111 | 38 | ALL DONE |
| Phase 4: Wiring & Navigation | T-112 → T-127 | 16 | ALL DONE |
| Phase 5: Production Audit (POS+Cross) | T-128 → T-199 | 72 | ALL DONE |
| Phase 6: 360° CTO Audit | T-200 → T-235 | 36 | ALL DONE |
| Phase 7: B2B Reorder System | T-236 → T-252 | 17 | ALL DONE |
| Phase 8: FCM Push + Deferred | T-219, T-223, T-231, T-232, T-235 | 5 | ALL DONE |
| **Phase 9: Payments + Finance + WhatsApp + AI** | **T-253 → T-316** | **64** | **QUEUED** |
| **GRAND TOTAL** | **T-001 → T-316** | **316** | **252 DONE / 64 QUEUED** |

---

## PHASE 7: B2B REORDER SYSTEM — Production-Grade (T-236 → T-252)

> 17 tickets from deep reorder system audit. Complete B2B reorder loop: auto-detect low stock → suggest reorder → retailer approves → PO to supplier with payment terms → supplier confirms delivery → scan at counter enters purchase ledger.
> Audit finding: stock monitor EXISTS but queries wrong tables. POS screens ~80% done. Retailer Admin = zero UI. Supplier Portal = zero reorder awareness.
> Priority: 10 P0 must-have, 5 P1 important, 2 P2 post-launch. Estimated effort: ~180 hours.

### CATEGORY A: SCHEMA & DATA FOUNDATION

| # | Title | Priority | Platform | Effort | Dependencies |
|---|-------|----------|----------|--------|-------------|
| T-236 | Reconcile reorder schema — unify dual table sets (007 vs 044) | P0 | Backend Schema | M | None |
| T-237 | Add payment terms snapshot to purchase orders | P0 | Backend Schema | S | T-236 |

### CATEGORY B: SUGGESTION ENGINE

| # | Title | Priority | Platform | Effort | Dependencies |
|---|-------|----------|----------|--------|-------------|
| T-238 | Wire reorder-service stock monitor to correct schema + startup | P0 | Backend | M | T-236 |
| T-239 | Add max_reorder_qty enforcement to suggestion engine | P1 | Backend | S | T-236, T-238 |

### CATEGORY C: POS APP ENHANCEMENTS

| # | Title | Priority | Platform | Effort | Dependencies |
|---|-------|----------|----------|--------|-------------|
| T-240 | Display payment terms on POS reorder screens | P0 | POS App | M | T-237 |
| T-241 | One-tap reorder enablement from purchase history | P1 | POS + Backend | L | T-236 |
| T-242 | POS reorder policy edit — add max qty field | P1 | POS App | S | T-239 |

### CATEGORY D: RETAILER ADMIN PORTAL

| # | Title | Priority | Platform | Effort | Dependencies |
|---|-------|----------|----------|--------|-------------|
| T-243 | Fix retailer admin reorder backend routes (column mismatches) | P0 | Backend | S | T-236 |
| T-244 | Build Retailer Admin reorder dashboard page (Settings + Policies + Pending) | P0 | Retailer Web | L | T-243 |

### CATEGORY E: SUPPLIER PORTAL INTEGRATION

| # | Title | Priority | Platform | Effort | Dependencies |
|---|-------|----------|----------|--------|-------------|
| T-245 | Backend — add reorder context + delivery confirmation to supplier order endpoints | P0 | Backend | M | T-237 |
| T-246 | Supplier Portal — reorder badge, delivery confirmation UI, payment terms | P0 | Supplier Web | L | T-245 |
| T-247 | Supplier notification for new reorder POs (SSE + badge) | P1 | Backend + Supplier Web | M | T-245 |

### CATEGORY F: PAYMENT TERMS

| # | Title | Priority | Platform | Effort | Dependencies |
|---|-------|----------|----------|--------|-------------|
| T-248 | Cross-platform payment terms verification (POS + Retailer + Supplier) | P1 | Cross-Platform | M | T-240, T-244, T-246 |

### CATEGORY G: GRN UNIFICATION

| # | Title | Priority | Platform | Effort | Dependencies |
|---|-------|----------|----------|--------|-------------|
| T-249 | Unify POS stock-in with formal PO GRN for reorder deliveries | P0 | Backend + POS | XL | T-236, T-245 |
| T-250 | Retailer admin PO tracking with receive history | P1 | Retailer Web | M | T-249 |

### CATEGORY H: CLEANUP & TESTING

| # | Title | Priority | Platform | Effort | Dependencies |
|---|-------|----------|----------|--------|-------------|
| T-251 | Clean up legacy reorder tables (007) | P2 | Backend Schema | S | T-236, T-238 |
| T-252 | End-to-end reorder integration tests | P0 | E2E | L | T-238, T-243, T-245, T-249 |

### EXECUTION ORDER (Phase 7)

```
Wave 1 — Schema Foundation:
  T-236 (unify dual tables) → T-237 (payment terms columns)

Wave 2 — Engine + Backend Fixes (parallel):
  T-238 (fix stock monitor) | T-243 (fix retailer admin routes) | T-239 (max qty)

Wave 3 — POS Enhancements (parallel):
  T-240 (payment terms display) | T-241 (one-tap reorder) | T-242 (max qty UI)

Wave 4 — Portal Build-Out:
  T-244 (retailer admin page, needs T-243)
  T-245 (supplier backend) → T-246 (supplier UI) → T-247 (notifications)

Wave 5 — GRN Unification:
  T-249 (unified receive flow) → T-250 (retailer PO tracking)

Wave 6 — Integration & Cleanup:
  T-248 (payment terms verify) → T-252 (E2E tests) → T-251 (legacy cleanup)
```

### ZERO REGRESSION RULES FOR PHASE 7

1. **Schema additive only**: New columns with DEFAULT null, new tables. Never alter existing column types.
2. **Stock integrity**: `stock_balances.quantity = SUM(inventory_ledger.delta_qty)` must hold after GRN.
3. **Store isolation**: All new endpoints derive `store_id` from JWT only.
4. **Price integrity**: All money in minor units (paise). Integer arithmetic only.
5. **Idempotency**: GRN receive must be idempotent (use idempotency keys per PO+receive batch).
6. **No double-counting**: Unified GRN path must be the ONLY stock-in for PO-linked deliveries.
7. **Payment terms immutable on PO**: Snapshot at creation time, never recalculated.
8. **India market**: DD/MM/YYYY, INR (₹), +91, Hindi-ready labels on all new screens.

---

## PHASE 9: PAYMENTS + B2B FINANCE + WHATSAPP + AI AUTOMATION (T-253 → T-316)

> 64 tickets across 4 major areas. ~1100 hours estimated effort.
> **Area 1**: UPI Payment Gateway — Razorpay (10 tickets, P0 launch blocker)
> **Area 2**: B2B Finance — 14 direct financers across 5 tiers + platform UI (28 tickets, P1)
> **Area 3**: WhatsApp + In-App Chat — Hybrid model (12 tickets, P1)
> **Area 4**: AI Automation — Full suite with expo-speech TTS (14 tickets, P1-P2)
> **External deps**: Razorpay account, Meta WhatsApp Business verification, BNPL provider partnerships
>
> **📋 R&D Reference**: See **`RELEASES/PHASE9_INTEGRATION_GUIDE.md`** for per-ticket implementation details including:
> SDK docs, API endpoints, sandbox URLs, npm packages, environment variables, known bugs, code patterns.
> **Integration Readiness**: 41 tickets (64%) can start immediately with NO external dependencies.
> 6 tickets need API keys only. 13 tickets need partnership agreements. 4 tickets fix existing code.

---

### AREA 1: UPI PAYMENT GATEWAY — Razorpay (T-253 → T-262)

> Razorpay SDK is integrated but NOT go-live ready. No API keys, UPI uses plain intent strings, payouts disabled, refund API missing.

| # | Title | Priority | Platform | Effort | What |
|---|-------|----------|----------|--------|------|
| T-253 | Wire Razorpay SELL webhook handler | P0 | Backend | M | Handle `payment.captured`/`payment.failed` events → update `sell_payments` status |
| T-254 | Real UPI order tracking via Razorpay Orders API | P0 | Backend + POS | M | Create Razorpay order → link to sell_payment → poll/webhook for confirmation |
| T-255 | UTR verification via Razorpay gateway API | P1 | Backend | S | Query Razorpay API to verify UTR against real payment (not just format check) |
| T-256 | Enable supplier payouts via RazorpayX | P0 | Backend | L | Contact creation → fund account → payout execution → webhook tracking |
| T-257 | Supplier bank/UPI KYC collection UI | P1 | Supplier Portal + POS | M | UI to enter bank details, POS to enter supplier UPI VPA |
| T-258 | Payout retry and failure handling | P1 | Backend | M | Retry failed payouts with exponential backoff, alert on 3x failure |
| T-259 | Refund flow via Razorpay Refund API | P0 | Backend + POS | M | Initiate refund via Razorpay API → track status → update sell_payments |
| T-260 | Payment reconciliation dashboard | P1 | Retailer Admin | L | Daily settlement, pending, failed payments. Export CSV. INR format |
| T-261 | Dynamic QR expiry countdown + auto-refresh UI | P0 | POS App | S | Countdown timer on POS, auto-refresh QR after 5-min expiry |
| T-262 | Payment event outbox processor | P1 | Backend | M | Worker to publish payment events from outbox table to BullMQ consumers |

---

### AREA 2: B2B FINANCE — 14 Direct Financers + Platform (T-263 → T-290)

> **Tier 1 (Trade Credit)**: Rupifi, KredX, Mintifi, Trevex — Pay supplier at PO checkout
> **Tier 2 (Credit Lines)**: Lendingkart, FlexiLoans, Progcap, NeoGrowth — Working capital
> **Tier 3 (Rajasthan NBFC)**: Finova Capital (HQ Jaipur, 180 branches)
> **Tier 4 (LaaS)**: Cashfree Embedded Lending — Single API → multiple NBFCs
> **Tier 5 (Supplier Invoice Discounting)**: KredX, M1xchange, Vayana, Credlix
> ALL under SuperMandi umbrella. SuperAdmin monitors ALL applications across ALL providers.

| # | Title | Priority | Platform | Effort | What |
|---|-------|----------|----------|--------|------|
| T-263 | Credit provider abstraction layer | P0 | Backend | L | `CreditProvider` interface: TradeCredit + CreditLine modes. `checkEligibility()`, `createDrawdown()`, `getRepaymentSchedule()`, `processRepayment()`, `getBalance()`, `getOffers()` |
| T-264 | Rupifi integration (Trade Credit, Tier 1) | P1 | Backend | L | OAuth + onboarding + credit check + drawdown + repayment |
| T-265 | KredX integration (Trade Credit, Tier 1) | P1 | Backend | L | Channel finance — reverse factoring, credit line, drawdown |
| T-266 | Mintifi integration (Trade Credit, Tier 1) | P1 | Backend | L | Supply chain finance — brand-anchored, invoice financing |
| T-267 | Trevex integration (Trade Credit, Tier 1) | P1 | Backend | L | White-label BNPL — instant supplier payout |
| T-268 | Lendingkart integration (Credit Line, Tier 2) | P1 | Backend | L | 2gthr API — working capital credit line, EMI |
| T-269 | FlexiLoans integration (Credit Line, Tier 2) | P1 | Backend | L | REST API — business loan, disbursement to bank |
| T-270 | Progcap integration (Credit Line, Tier 2) | P1 | Backend | L | FRCL — fast rotation credit for stock |
| T-271 | NeoGrowth integration (Credit Line, Tier 2) | P1 | Backend | L | POS-based lending, deduction-based repay |
| T-272 | Finova Capital integration (Rajasthan NBFC, Tier 3) | P1 | Backend | L | Jaipur HQ, kirana-focused, 30K+ customers |
| T-273 | Cashfree Embedded Lending (LaaS, Tier 4) | P1 | Backend | L | Single API → multiple additional NBFCs, escrow + disbursement + reconciliation |
| T-274 | Provider selection UI (POS + Retailer Web) | P1 | POS + Retailer | L | At PO checkout: trade credit offers. On dashboard: credit line offers. Sort by best terms |
| T-275 | Multi-provider repayment tracking | P1 | Backend | M | Track across all providers, auto paid/overdue, partial payments, EMI schedules |
| T-276 | KYC routing (provider-specific) | P1 | Backend | L | Route PAN + Aadhaar + GSTIN through each provider's KYC API. Shared where possible |
| T-277 | Credit dashboard (Retailer Admin) | P1 | Retailer Admin | L | Aggregated: total credit across ALL providers, per-provider breakdown, drawdowns, repayment calendar, credit score |
| T-278 | Settlement reconciliation (multi-provider) | P1 | Backend + Retailer | L | Match disbursements from each provider to POs/withdrawals, multi-provider reconciliation report |
| T-279 | Auto-overdue maturation job | P1 | Backend | S | Cron: check all providers' drawdowns/EMIs, mark overdue, push + WhatsApp alerts |
| T-280 | Supplier-side BNPL visibility | P1 | Supplier Portal | M | Which POs are BNPL-backed, payment guaranteed, which provider, expected payout date |
| T-281 | Provider health monitoring | P2 | SuperAdmin | M | API health, response times, approval rates, volumes per provider |
| T-282 | Provider comparison engine | P2 | Backend + POS | M | Side-by-side offers: sort by total cost, show APR, credit limit, tenure |
| T-283 | KredX invoice discounting (Supplier, Tier 5) | P1 | Backend + Supplier | L | Supplier uploads invoice → KredX API → 80-90% in 24-72h |
| T-284 | M1xchange TReDS integration (Supplier, Tier 5) | P1 | Backend + Supplier | L | RBI-licensed TReDS — banks bid on invoices → lowest rate → instant funding |
| T-285 | Vayana trade credit (Supplier, Tier 5) | P1 | Backend + Supplier | L | Supply chain finance API — payables/receivables financing |
| T-286 | Credlix invoice factoring (Supplier, Tier 5) | P1 | Backend + Supplier | L | 90% of invoice in 24h, PO financing up to 40Cr |
| T-287 | Supplier financing UI (Supplier Portal) | P1 | Supplier Portal | L | "Get Paid Now" button on invoices, application flow, status tracking, repayment schedule |
| T-288 | Retailer bulk purchase credit UI (POS + Web) | P1 | POS + Retailer | L | "Finance this purchase" at checkout for large POs. Show available credit offers |
| T-289 | SuperAdmin finance monitoring dashboard | P1 | SuperAdmin | XL | Real-time: all applications, approvals, disbursements, repayments, provider health across ALL providers (retailer + supplier) |
| T-290 | SuperAdmin provider management | P2 | SuperAdmin | M | Enable/disable providers per store, set commission rates, configure credit limits |

---

### AREA 3: WHATSAPP + IN-APP CHAT — Hybrid (T-291 → T-302)

> **Option C: Hybrid** — In-app chat (retailer↔supplier via Socket.io) + Meta WhatsApp Cloud API direct (retailer→consumer, BSP fallback if Meta approval difficult)

| # | Title | Priority | Platform | Effort | What |
|---|-------|----------|----------|--------|------|
| T-291 | Chat database schema | P0 | Backend | M | `messages`, `conversations`, `conversation_participants` tables with store isolation |
| T-292 | Chat backend API | P0 | Backend | L | CRUD endpoints: create conversation, send message, list messages, mark read |
| T-293 | Real-time chat via Socket.io | P0 | Backend | L | WebSocket server alongside Express, auth via JWT, room per conversation |
| T-294 | POS chat screen (in-app) | P1 | POS App | L | Chat list + conversation view + send messages to suppliers/SuperMandi team |
| T-295 | Supplier portal chat UI | P1 | Supplier Portal | L | Supplier sees retailer messages, can reply, delivery confirmations |
| T-296 | WhatsApp Cloud API integration (Meta direct) | P1 | Backend | L | Meta WhatsApp Cloud API directly (no BSP). Setup: Meta Business verification + developer app + webhook |
| T-297 | WhatsApp order receipt to consumer | P2 | Backend + POS | M | After sale, send receipt via WhatsApp to consumer phone (if provided) |
| T-298 | WhatsApp reorder alert to supplier | P2 | Backend | M | When reorder PO created, send WhatsApp notification to supplier |
| T-299 | Push notifications (FCM + Expo) | P1 | Backend + POS | L | Wire firebase-admin for push, expo-notifications for POS app. Extend existing FCM infra |
| T-300 | SuperMandi support chat channel | P1 | Backend + POS | M | Dedicated channel for retailer↔SuperMandi team communication |
| T-301 | Chat attachment support (image/PDF) | P2 | Backend + POS | M | Image/PDF upload in chat messages (GCS storage) |
| T-302 | WhatsApp message template management | P2 | SuperAdmin | M | SuperAdmin portal to create/edit WhatsApp template messages for approval |

---

### AREA 4: AI AUTOMATION — Full Suite (T-303 → T-316)

> expo-speech for TTS (free, built-in, Hindi, offline). NOT ElevenLabs.
> Voice STT already works (Claude/Anthropic API). Intent parsing already works (GPT-4o-mini).
> Goal: Make AI feel like a virtual store manager.

| # | Title | Priority | Platform | Effort | What |
|---|-------|----------|----------|--------|------|
| T-303 | AI onboarding assistant | P2 | POS App | L | First-time setup: AI walks retailer through store setup, first product add, first sale |
| T-304 | Hindi NLU expansion (Marathi, Gujarati, Tamil) | P2 | Backend | M | Add support for regional number words and product aliases |
| T-305 | Voice TTS response (AI speaks back) | P1 | POS App | L | After voice command, AI responds with spoken Hindi/English using expo-speech (free, built-in, offline) |
| T-306 | Multi-turn voice conversation | P1 | POS App | L | Context-aware: "Add rice" → "Which rice? Basmati or Sona Masoori?" → "Basmati" → done |
| T-307 | Proactive AI alerts (push) | P1 | POS + Backend | L | Daily alerts: low stock, expiring items, overdue payments, unusual patterns |
| T-308 | Demand forecasting engine | P2 | Backend | XL | 4-week rolling sales data to predict daily demand per SKU |
| T-309 | Smart reorder suggestions (forecast-driven) | P1 | Backend | L | Enhance stock monitor: demand forecast + supplier lead time + buffer days |
| T-310 | Auto daily closing summary | P1 | POS + Backend | M | AI generates end-of-day report: total sales, cash count, UPI collected, dues created |
| T-311 | Supplier price comparison | P1 | POS + Backend | M | "Supplier B is X cheaper for same SKU" when adding item to PO |
| T-312 | Customer purchase insights | P2 | POS + Backend | M | "Top 10 customers by value", "Customers who haven't visited in 7 days" |
| T-313 | Slow mover detection | P2 | Backend | M | Flag items with <2 sales in 30 days, suggest discount or discontinue |
| T-314 | Expiry tracking alerts | P1 | POS + Backend | L | Scan expiry dates → alert 30/15/7 days before → suggest markdown |
| T-315 | Voice-driven full workflow | P1 | POS App | L | "Place reorder for all low stock items" → AI shows list → retailer approves → POs created |
| T-316 | Anomaly detection | P2 | Backend | M | Flag: "Sales dropped 40% vs last Tuesday" or "Unusual 50-item return" |

> **AI Ticket Dependencies:**
> - T-305 (TTS) → PREREQUISITE for T-303 (onboarding), T-306 (multi-turn), T-315 (workflows)
> - Product search (`voice.ts:72`) → Must wire to `storeProducts.ts` search before T-306/T-315 work server-side
> - T-308 (forecasting) → PREREQUISITE for T-309 (smart reorder)
> - T-305 + T-306 → PREREQUISITE for T-315 (voice workflows)
>
> **ALREADY EXISTS — Phase 9 voice tickets are ADDITIVE, not replacing:**
> - Audio recording (`expo-av`) ✅, `VoiceButton.tsx` ✅, `VoiceSheet.tsx` ✅, voice routes ✅
> - STT (OpenAI Whisper via `openaiProvider.ts`) ✅, Intent parsing (GPT-4o-mini) ✅
> - `SellScanScreen.tsx` voice integration ✅, `voiceEnabled` feature flag ✅
> - Voice service microservice (port 3009, Anthropic Claude STT) ✅
> - Phase 9 ADDS: TTS output (`expo-speech`), multi-turn context, alerts, forecasting, anomalies

---

### EXECUTION WAVES (Phase 9)

```
Wave A — UPI Core (P0 Launch Critical):
  T-253 (Razorpay SELL webhook) → T-254 (real UPI tracking) → T-255 (UTR verify)
  T-262 (payment outbox) → T-259 (refund flow) → T-261 (QR expiry UI)
  → Result: SELL payments fully confirmed via Razorpay gateway

Wave B — BNPL Foundation + First 2 Providers:
  T-263 (abstraction layer) → T-264 (Rupifi) → T-270 (Progcap)
  T-274 (provider selection UI) → T-275 (repayment tracking) → T-279 (overdue job)
  → Result: Retailers can get BNPL + working capital from 2 providers

Wave C — Supplier Payouts + Trade Credit Providers:
  T-256 (RazorpayX payouts) → T-257 (supplier KYC) → T-258 (retry)
  T-265 (KredX) → T-266 (Mintifi) → T-267 (Trevex)
  → Result: Retailer→supplier payouts live + 4 trade credit providers

Wave C2 — Credit Lines + LaaS:
  T-268 (Lendingkart) → T-269 (FlexiLoans) → T-271 (NeoGrowth)
  T-272 (Finova Capital) → T-273 (Cashfree Embedded Lending)
  → Result: ALL 10 direct financers + LaaS pipe active

Wave D — In-App Chat + Push Notifications:
  T-291 (chat schema) → T-292 (chat API) → T-293 (Socket.io)
  T-294 (POS chat) → T-295 (supplier chat) → T-299 (push)
  → Result: Retailer↔Supplier real-time chat working

Wave E — AI Core (Voice + Automation):
  T-305 (TTS expo-speech) → T-306 (multi-turn voice)
  T-307 (proactive alerts) → T-310 (auto daily closing)
  → Result: AI speaks Hindi/English, proactive alerts

Wave F — WhatsApp + Supplier Finance:
  T-296 (WhatsApp Cloud API) → T-297 (receipts) → T-298 (reorder alerts)
  T-300 (support channel) → T-301 (attachments) → T-302 (templates)
  T-283 (KredX invoice) → T-284 (M1xchange) → T-285 (Vayana) → T-286 (Credlix) → T-287 (supplier UI)
  → Result: Full WhatsApp + supplier invoice discounting

Wave G — Finance Dashboards + Reconciliation:
  T-276 (KYC routing) → T-277 (credit dashboard) → T-278 (reconciliation)
  T-280 (supplier BNPL visibility) → T-281 (provider health) → T-282 (comparison engine)
  T-288 (bulk purchase credit) → T-289 (SuperAdmin monitoring) → T-290 (provider mgmt)
  T-260 (payment reconciliation)
  → Result: Full financial visibility across all providers

Wave H — AI Intelligence (Forecasting + Insights):
  T-308 (demand forecasting) → T-309 (smart reorder)
  T-311 (supplier price comparison) → T-312 (customer insights) → T-315 (voice workflows)
  → Result: AI predicts demand, compares suppliers, knows customers

Wave I — AI Polish + Scale:
  T-313 (slow mover) → T-314 (expiry tracking)
  T-303 (AI onboarding) → T-316 (anomaly detection) → T-304 (Hindi NLU expansion)
  → Result: Complete AI retail assistant
```

### EXTERNAL DEPENDENCIES (Operator Action Required)

| Dependency | For | Action |
|------------|-----|--------|
| Razorpay Standard account | UPI SELL | Sign up at razorpay.com, get API keys |
| RazorpayX account | Supplier payouts | Contact Razorpay sales for business account |
| Meta Business verification | WhatsApp API | Verify business at business.facebook.com |
| Rupifi partnership | Trade Credit | Apply at rupifi.com/partners |
| KredX partnership | Trade Credit + Invoice Discounting | Apply at kredx.com/channel-finance |
| Mintifi partnership | Trade Credit | Contact mintifi.com |
| Trevex partnership | Trade Credit | Contact trevex.io |
| Lendingkart partnership | Credit Line | Contact lendingkart.com (sandbox at gateway-qa.lendingkart.io) |
| FlexiLoans partnership | Credit Line | Apply at flexiloans.com/partners |
| Progcap partnership | Credit Line | Contact progcap.com |
| NeoGrowth partnership | Credit Line | Contact neogrowth.in |
| Finova Capital partnership | Rajasthan NBFC | Contact Jaipur HQ |
| Cashfree Embedded Lending | LaaS | Sign up at cashfree.com/embedded-lending |
| M1xchange partnership | TReDS | Contact M1xchange for API access |
| Vayana Network partnership | Trade finance | Contact vayana.com |
| Credlix partnership | Invoice factoring | Contact credlix.com |

### KEY TECHNICAL NOTES

- **TTS**: Using `expo-speech` (React Native built-in, FREE, offline, Hindi supported). NOT ElevenLabs.
- **WhatsApp**: Meta Cloud API directly (no BSP). BSP (Interakt/AiSensy/Gupshup) as fallback if Meta approval difficult.
- **Razorpay**: SDK integrated but NOT go-live ready. No API keys configured. UPI uses plain `upi://pay?` intent strings. All payout features behind disabled flags.
- **BNPL Sandboxes**: Lendingkart confirmed (gateway-qa.lendingkart.io). Cashfree likely. All others require partnership agreements.
- **All finance under SuperMandi umbrella**: Retailers/suppliers never leave the platform. SuperAdmin monitors ALL providers.

### ZERO REGRESSION RULES FOR PHASE 9

1. **Payment integrity**: All money in minor units (paise). Integer arithmetic only. Never floating point.
2. **Idempotency**: All payment webhooks (Razorpay + BNPL providers) must be idempotent via Redis/DB dedup.
3. **Store isolation**: All new endpoints derive store_id from JWT only. Chat/finance/payment all store-scoped.
4. **Provider abstraction**: Adding a new BNPL provider MUST NOT require changes to POS/web UI code. Only backend adapter.
5. **Graceful degradation**: If a BNPL provider API is down, other providers still work. No cascade failure.
6. **Chat security**: Messages only visible to conversation participants. No cross-store leakage.
7. **WhatsApp rate limits**: Respect Meta rate limits. Queue messages via BullMQ, not direct API calls.
8. **AI safety**: Voice commands that involve money (reorder, payment) ALWAYS require explicit confirmation.
9. **India market**: DD/MM/YYYY, INR, +91, Hindi-ready on all new screens.
