# System Audit Tickets — 10-Section Production Validation

> HEAD: 50d117be | 106 fixes | Zero drift
> Source: 3-layer parallel audit across 10 sections
> Date: 2026-03-17
> Scope: UI/UX, API, Backend, DB, Migrations, GCP, Business Logic, Payments, WhatsApp

---

## Audit Summary

| Section | Requirement | Status |
|---------|-------------|--------|
| Sec 1: UI/UX/Wiring/API/Backend/DB/GCP | Full stack audit | DONE (26 RI tickets, all verified) |
| Sec 2: Product Ledger & Metadata Sync | Schema, CSV, append-only ledger | IMPLEMENTED |
| Sec 3: Supplier→SuperAdmin→Retailer SKU | Approval flow, publication | IMPLEMENTED (1 gap) |
| Sec 4: SuperAdmin Pricing Control | % margin + fixed margin per SKU | IMPLEMENTED |
| Sec 5: Retailer POS SKU Availability | Approved SKUs in POS | IMPLEMENTED (1 gap) |
| Sec 6: Retailer Store Capacity 5000+ | DB indexes, pagination, FlatList perf | IMPLEMENTED |
| Sec 7: POS Performance & Device | HID buffer, camera scan, responsive UI | IMPLEMENTED |
| Sec 8: Authentication Flow | OTP→verify→session, approval gate | IMPLEMENTED |
| Sec 9: Ledger Integrity & Sync | Append-only, SSE sync, LWW conflict | IMPLEMENTED |
| Sec 10: Payments & WhatsApp | UPI QR, retailer VPA, WhatsApp Cloud API | IMPLEMENTED |

---

## GAP TICKETS (2 items)

### SYS-001: Add maximum SKU capacity per supplier catalogue
- **Section**: 3 (Supplier→Admin→Retailer)
- **Problem**: No limit on how many SKUs a single supplier can register. Unbounded INSERT into supplier_products.
- **Risk**: Single supplier can flood the catalogue with unlimited SKUs, impacting DB performance and admin review workload.
- **Files**: backend/src/routes/v1/supplier/products.ts (CSV upload + single product create)
- **Fix**:
  1. Add `max_sku_capacity INTEGER DEFAULT 3000` column to `supplier.suppliers` table (new migration)
  2. Before INSERT in supplier/products.ts, check: `SELECT COUNT(*) FROM catalog.supplier_products WHERE supplier_id = $1`
  3. If count >= max_sku_capacity, return 400: "SKU limit reached for this supplier"
  4. SuperAdmin can adjust limit per supplier via admin API
- **Severity**: MEDIUM
- **Impact**: DB performance, admin workflow

### SYS-002: Add stock balance reconciliation between inventory.stock_balances and catalog.store_products
- **Section**: 5 (Retailer POS SKU Availability)
- **Problem**: Two tables track stock: `inventory.stock_balances` (source of truth with optimistic locking) and `catalog.store_products.current_stock` (read cache for POS). If ledger processing fails mid-flight, these can diverge.
- **Risk**: POS shows stale stock quantity; overselling possible if cache is ahead of ledger.
- **Files**: backend/src/services/inventoryLedgerService.ts, backend/src/routes/v1/pos/storeProducts.ts
- **Fix**:
  1. Add reconciliation query: `SELECT sp.id, sp.current_stock, sb.current_qty FROM catalog.store_products sp JOIN inventory.stock_balances sb ON sp.store_id = sb.store_id AND sp.product_id = sb.product_id WHERE sp.current_stock != sb.current_qty`
  2. Run as scheduled job (daily or after each batch sync)
  3. Auto-correct store_products.current_stock from stock_balances when diverged
  4. Log corrections to audit table
- **Severity**: MEDIUM
- **Impact**: Stock accuracy, oversell prevention

---

## PASS ITEMS (verified production-ready, no action needed)

### Section 2 — Product Ledger
- Product schema: SKU, name, category, units, pricing, tax, supplier linkage, barcode — ALL present in migration 004
- CSV upload: Supplier (SM-007) + Retailer (RCAT-CSV) — both endpoints operational
- Append-only ledger: INSERT-only with stock_consistency CHECK constraint
- POS metadata sync: productsStore.ts fetches full catalog via API

### Section 3 — Supplier Flow
- Supplier uploads → auto-approval check → pending queue
- SuperAdmin CatalogTab: view, edit category, batch approve
- Publish to retailer: creates store_products rows per store
- Three-layer approval fully implemented

### Section 4 — Pricing Control
- POST /admin/catalog/supplier-products/:id/margin — accepts marginPct OR marginFixedMinor
- Retailer buy-catalog returns margin-adjusted bestPrice
- SuperAdmin pricing visibility endpoint exists

### Section 6 — Capacity
- Migration 132: scalability indexes (trigram, composite, partial)
- Pagination: limit/offset on all list endpoints, no global cap
- FlatList: all 5 perf props (removeClippedSubviews, windowSize, maxToRenderPerBatch, initialNumToRender, updateCellsBatchingPeriod)

### Section 7 — Performance
- HID scanner: 150ms debounce, 1200ms max duration, idle timeout, duplicate prevention
- Camera: expo-camera@16.0.18 configured
- Responsive: flex layouts throughout, no hardcoded container widths

### Section 8 — Auth
- OTP flow: send→verify→multi-store select→session create
- Approval gate: stores.status='ACTIVE' checked twice (send + verify)
- Token: SecureStore encrypted, in-memory cache, JWT exp validation
- Session persistence: restored on restart via SplashScreenV3

### Section 9 — Ledger
- Append-only: dual-write to inventory_ledger + public.inventory_ledger
- Sale→ledger automatic via recordSaleInventoryMovements
- Sync: SSE real-time + batch offline replay
- Conflict: LWW timestamps + stock_version optimistic concurrency
- Movement types: sale, sale_return, purchase_received, adjustment, refund

### Section 10 — Payments
- WhatsApp: Meta Cloud API v22.0, webhook signature verification, rate limiting
- UPI: Dynamic QR per transaction, retailer VPA (no escrow), 5-min expiry
- Razorpay: Optional gateway, graceful fallback to manual UTR
- Split payment: 2-3 modes supported
