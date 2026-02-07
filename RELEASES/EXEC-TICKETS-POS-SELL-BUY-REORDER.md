# EXECUTION TICKETS: POS SELL + BUY + REORDER + LEDGER + PAYMENTS
**Generated:** 2026-02-08 | **Source:** AUDIT-POS-SELL-BUY-REORDER-LEDGER.md

**Rule:** Tickets are atomic, testable, with acceptance criteria, exact file targets, and batch ordering.
**Priority:** P0 blockers first, then P1, then P2.

---

## BATCH-A: P0 BLOCKERS (Must fix before go-live)

### POS-SELL-001: Fix multi-barcode same-SKU cart deduplication
- **Priority:** P0
- **Risk Class:** B (API/logic)
- **Files:**
  - `src/services/scan/handleScan.ts` lines 180-194
- **Problem:** When same product has multiple barcodes (EAN + internal), scanning both creates 2 separate cart lines instead of incrementing quantity on the existing line.
- **Root Cause:** Dedup checks `barcode` first, then `id`. Should check `id` first.
- **Fix:** In `addToSellCart()`, swap the lookup order — find by `productId` first, then by `barcode` as fallback.
- **Acceptance Criteria:**
  - [ ] Scan product via barcode A → 1 cart line, qty 1
  - [ ] Scan same product via barcode B → same cart line, qty 2
  - [ ] Cart total reflects single product at correct price
- **E2E Tag:** `@pos_sell`

---

### POS-BUY-001: Wire live supplier catalog to PurchaseScreen
- **Priority:** P0
- **Risk Class:** B (API/logic)
- **Files:**
  - `src/screens/PurchaseScreen.tsx` line 235 (GATE-000 block)
  - `src/services/api/catalogApi.ts` lines 239-263 (`getBuyCatalog()`)
  - `src/services/api/catalogApi.ts` lines 279-286 (`buyBarcodeSearch()`)
- **Problem:** PurchaseScreen shows empty catalog. `filteredSKUs` is always `[]`. GATE-000 runtime check blocks the feature.
- **Fix:**
  1. Remove GATE-000 blocking condition
  2. Call `getBuyCatalog()` on screen mount
  3. Integrate `buyBarcodeSearch()` for barcode scan → supplier product resolution
  4. Display supplier offers with price, MOQ, stock status
- **Acceptance Criteria:**
  - [ ] PurchaseScreen loads supplier catalog for store
  - [ ] Barcode scan resolves to supplier product offers
  - [ ] Tap on product shows supplier details (price, MOQ)
  - [ ] Add to cart binds to `supplierProductId + supplierId`
- **E2E Tag:** `@pos_buy`

---

### POS-BUY-002: Implement grouped supplier product view
- **Priority:** P0
- **Risk Class:** A (UI)
- **Files:**
  - `src/components/buy/CatalogProductCard.tsx` (scaffold only, ~220 lines)
  - `src/services/api/catalogApi.ts` lines 365-383 (`getBestSupplier()`, `getPreferredOrBestSupplier()`)
- **Problem:** No multi-supplier offer comparison. Same product from multiple suppliers shows as flat list instead of grouped view.
- **Fix:**
  1. Implement `CatalogProductCard` to show grouped product with multiple supplier offers
  2. Use `getBestSupplier()` / `getPreferredOrBestSupplier()` helpers
  3. Show: supplier name, price, MOQ, credit days, BNPL eligibility, stock status
  4. Sort by: preferred supplier first, then best price
- **Acceptance Criteria:**
  - [ ] Same product from 3 suppliers shows as 1 card with 3 offers
  - [ ] Best price highlighted
  - [ ] Preferred supplier marked
  - [ ] Tap selects specific supplier offer for cart
- **E2E Tag:** `@pos_buy`

---

### POS-BUY-005: Cross-verify order status enum consistency
- **Priority:** P0
- **Risk Class:** E (DB/schema)
- **Files:**
  - `backend/src/routes/v1/orders.ts` lines 1406, 1519
  - `backend/src/routes/v1/supplier/orders.ts` lines 455, 489-496
  - `backend/migrations/006_orders_schema.sql` lines 71-73 (CHECK constraint)
- **Problem:** Previous hardening batch fixed status values but need full cross-verification that ALL code paths use values matching the DB CHECK constraint: `draft, submitted, confirmed, shipped, partial_received, delivered, cancelled`.
- **Fix:** Grep entire codebase for all order status string literals. Verify each matches the constraint.
- **Acceptance Criteria:**
  - [ ] `grep -r "partially_received\|partial_recieved" backend/src/` returns 0 results
  - [ ] All supplier status transitions use constraint-valid values
  - [ ] E2E pipeline test passes full order lifecycle
- **E2E Tag:** `@prod`

---

### POS-CREDIT-001: Disable credit/loans feature for MVP
- **Priority:** P0
- **Risk Class:** B (API/logic)
- **Files:**
  - `backend/src/routes/v1/pos/credit.ts` (605 lines)
  - `src/utils/featureFlags.ts`
- **Problem:** Credit feature has mock KYC (format-only validation, no UIDAI/MCA/GST API). Enabling this in production is a compliance risk.
- **Fix:** Add feature flag `creditEnabled = false` (default). Gate all credit routes behind it. Remove from any menu items that reference it.
- **Acceptance Criteria:**
  - [ ] `GET /api/v1/pos/credit/offers` returns 403 or feature-disabled response
  - [ ] No credit-related menu items visible in POS app
  - [ ] Feature can be re-enabled when real KYC integration is ready
- **E2E Tag:** `@pos_buy`

---

### POS-CREDIT-002: Disable credit/loans frontend UI stubs
- **Priority:** P0
- **Risk Class:** A (UI)
- **Files:**
  - `src/components/buy/PaymentOptionsSheet.tsx` (references credit)
  - `src/screens/MenuScreen.tsx` (if credit menu items exist)
- **Problem:** Any UI reference to credit/loans that leads to non-functional endpoints must be hidden.
- **Fix:** Gate behind `creditEnabled` feature flag. Show nothing rather than broken UI.
- **Acceptance Criteria:**
  - [ ] No "Apply for Credit" or "Credit Score" buttons visible
  - [ ] PaymentOptionsSheet does not show credit option
- **E2E Tag:** `@pos_buy`

---

### POS-UPI-002: Configure or gate Razorpay supplier payouts
- **Priority:** P0
- **Risk Class:** F (Infra)
- **Files:**
  - `backend/src/services/supplierPayoutService.ts` lines 8-11
  - `backend/src/routes/v1/orders.ts` (pay endpoint)
- **Problem:** Razorpay API keys not in .env. Production will hard-fail on supplier payout.
- **Fix (Option A):** Configure Razorpay sandbox keys for staging, production keys for prod.
- **Fix (Option B):** Gate supplier payouts behind feature flag. Orders can be placed but payouts are manual until Razorpay is configured.
- **Acceptance Criteria:**
  - [ ] Either: Razorpay keys configured and payout test succeeds in staging
  - [ ] Or: Payout feature gracefully disabled with operator notification
- **E2E Tag:** `@pos_buy`

---

## BATCH-B: P1 HIGH PRIORITY (Must fix before prod, can be post-launch if operationally acceptable)

### POS-SCAN-001: Normalize barcode case before comparison
- **Priority:** P1
- **Risk Class:** B (API/logic)
- **Files:**
  - `src/services/scan/handleScan.ts` line 359
- **Problem:** Barcode comparison is case-sensitive. Same barcode in uppercase vs lowercase treated as different.
- **Fix:** Add `const normalized = trimmed.toUpperCase();` before all barcode comparisons.
- **Acceptance Criteria:**
  - [ ] Scan "abc123" and "ABC123" resolves to same product
  - [ ] Storm detection works with mixed-case inputs
- **E2E Tag:** `@hid_scan`

---

### POS-SCAN-002: Relax keyboard input barcode heuristic
- **Priority:** P1
- **Risk Class:** B (API/logic)
- **Files:**
  - `src/services/scan/handleScan.ts` lines 406-410
- **Problem:** `looksLikeBarcode` check blocks short barcodes (< 8 chars without digit) entered via keyboard/HID.
- **Fix:** Reduce min length to 3 OR remove the keyboard vs scanner discrimination entirely (let the duplicate guard handle it).
- **Acceptance Criteria:**
  - [ ] Short barcode "SKU5" entered via HID scanner resolves correctly
  - [ ] Product lookup attempted for any non-empty scanned input
- **E2E Tag:** `@hid_scan`

---

### POS-SCAN-003: Strip scanner prefix/suffix from barcodes
- **Priority:** P1
- **Risk Class:** B (API/logic)
- **Files:**
  - `src/services/scan/handleScan.ts` line 322
  - `src/services/hidScannerService.ts`
- **Problem:** Some HID scanners add prefix (e.g., `]C1`) or suffix (e.g., checksum digit). Not stripped before lookup.
- **Fix:** Add configurable prefix/suffix strip patterns. Default: strip leading `]` + letter + digit pattern.
- **Acceptance Criteria:**
  - [ ] Barcode `]C18901234567890` resolves same as `8901234567890`
  - [ ] Configurable strip pattern in settings
- **E2E Tag:** `@hid_scan`

---

### POS-PAY-001: Increase UPI poll timeout with fallback
- **Priority:** P1
- **Risk Class:** B (API/logic)
- **Files:**
  - `src/components/sell/SplitPaymentModal.tsx` lines 129-148
  - `src/screens/PaymentScreen.tsx` (UPI polling)
- **Problem:** Max 20 poll attempts may timeout on slow networks. No fallback to manual verification.
- **Fix:** Increase max attempts to 40 (5 min total with 8s interval). Add "Enter UTR manually" fallback button after 10 failed polls.
- **Acceptance Criteria:**
  - [ ] UPI polling continues for at least 5 minutes
  - [ ] After 10 failed polls, "Enter UTR" button appears
  - [ ] Manual UTR entry completes the payment
- **E2E Tag:** `@payments`

---

### POS-BUY-004: Add draft save for purchase orders
- **Priority:** P1
- **Risk Class:** B (API/logic)
- **Files:**
  - `backend/src/routes/v1/orders.ts` line 169
  - `src/components/buy/PurchaseCartModal.tsx` lines 241-250
- **Problem:** All orders created as "submitted" immediately. No save-as-draft. User loses work on app crash.
- **Fix:** Add `status` parameter to order creation. Default "submitted" for backward compat, allow "draft" for save.
- **Acceptance Criteria:**
  - [ ] "Save Draft" button in PurchaseCartModal saves order with status "draft"
  - [ ] Draft orders visible in order list with "Draft" badge
  - [ ] Draft orders can be edited and submitted later
- **E2E Tag:** `@pos_buy`

---

### POS-BUY-006: Fix barcode column in order detail query
- **Priority:** P1
- **Risk Class:** E (DB/schema)
- **Files:**
  - `backend/src/routes/v1/orders.ts` line 449
- **Problem:** Order detail query references `p.barcode` but `catalog.products` column is `primary_barcode`.
- **Fix:** Change `p.barcode` to `p.primary_barcode` in the LEFT JOIN.
- **Acceptance Criteria:**
  - [ ] Order detail returns correct barcode for each line item
  - [ ] No null barcodes in order detail response
- **E2E Tag:** `@pos_buy`

---

### POS-BUY-007: Add atomic credit deduction for CREDIT payment
- **Priority:** P1
- **Risk Class:** B (API/logic)
- **Files:**
  - `backend/src/routes/v1/orders.ts` lines 1161-1191
- **Problem:** Credit payment doesn't use transaction isolation. Concurrent requests could overrun credit limit.
- **Fix:** Wrap credit deduction in `SELECT ... FOR UPDATE` on store credit balance. Reject if insufficient credit.
- **Acceptance Criteria:**
  - [ ] Two concurrent credit payments for same store: one succeeds, one rejected
  - [ ] Credit balance never goes negative
- **E2E Tag:** `@pos_buy`

---

### POS-BUY-008: Add UPI payment timeout for purchase orders
- **Priority:** P1
- **Risk Class:** B (API/logic)
- **Files:**
  - `backend/src/routes/v1/orders.ts` lines 1013-1062
  - `src/components/buy/PurchaseCartModal.tsx`
- **Problem:** If user initiates UPI for purchase order but never confirms, order + cart items are orphaned.
- **Fix:** Add 15-min expiry check on purchase UPI payments. Status poll endpoint returns "expired" after timeout. Frontend clears cart items.
- **Acceptance Criteria:**
  - [ ] After 15 minutes, UPI payment status returns "failed/expired"
  - [ ] Cart items for that order are cleared
  - [ ] Order status reverts to "submitted" (payment not completed)
- **E2E Tag:** `@pos_buy`

---

### POS-I18N-001: Extract ReorderScreen alert messages to i18n
- **Priority:** P1
- **Risk Class:** A (UI)
- **Files:**
  - `src/screens/ReorderScreen.tsx` lines 195-248
  - `src/i18n/locales/en.json`
  - `src/i18n/locales/hi.json`
- **Problem:** 13+ hardcoded English strings in Alert.alert() calls. Hindi users see English approval dialogs.
- **Fix:** Add translation keys: `reorder.approveTitle`, `reorder.approveConfirmation`, `reorder.approvedTitle`, `reorder.approvedMessage`, `reorder.approveFailed`, `reorder.goToCart`, `reorder.stayHere`, `reorder.noCaughtUp`. Add Hindi translations.
- **Acceptance Criteria:**
  - [ ] Switch to Hindi → approve reorders → all dialogs show Hindi text
  - [ ] Switch to English → approve reorders → all dialogs show English text
  - [ ] No hardcoded English strings in ReorderScreen.tsx Alert.alert() calls
- **E2E Tag:** `@pos_reorder`

---

### POS-UPI-001: Add payment gateway UTR verification
- **Priority:** P1
- **Risk Class:** B (API/logic)
- **Files:**
  - `backend/src/routes/v1/pos/payments.ts` line 890 (TODO comment)
- **Problem:** UTR verification is format-only (mock). No actual payment gateway API call.
- **Fix:** Integrate Razorpay/bank API for UTR verification. If integration not ready, add monitoring: log all UTR confirmations for manual audit.
- **Acceptance Criteria:**
  - [ ] Either: UTR verified against payment gateway API
  - [ ] Or: All UTR confirmations logged with amounts for manual audit trail
- **E2E Tag:** `@payments`

---

## BATCH-C: P2 MEDIUM PRIORITY (Post-launch improvements)

### POS-CART-002: Add AppState listener for stock refresh
- **Priority:** P2
- **Files:** `src/screens/SellScanScreen.tsx`
- **Fix:** Add `useEffect` with `AppState.addEventListener` to refresh stock cache when app returns to foreground.
- **E2E Tag:** `@pos_sell`

### POS-CART-003: Block negative discounts at cart level
- **Priority:** P2
- **Files:** `src/stores/cartStore.ts`
- **Fix:** Add `Math.max(0, discount)` validation in `calculateDiscountAmount()`.
- **E2E Tag:** `@pos_sell`

### POS-PRINT-001: Add discount/tax/operator to receipt
- **Priority:** P2
- **Files:** `src/screens/SuccessPrintScreenV2.tsx` lines 50-77
- **Fix:** Add discount amount, tax breakdown (if applicable), and operator ID to receipt format.
- **E2E Tag:** `@pos_sell`

### POS-PRINT-002: Add printer connectivity check
- **Priority:** P2
- **Files:** `src/services/printerService.ts`
- **Fix:** Attempt test print on init to verify printer reachable. Show status in settings.
- **E2E Tag:** `@pos_sell`

### POS-I18N-002: Translate dismiss reason options
- **Priority:** P2
- **Files:** `src/components/reorder/DismissReasonModal.tsx` lines 35-42, `src/i18n/locales/*.json`
- **Fix:** Extract 6 predefined reasons to i18n keys. Add Hindi translations.
- **E2E Tag:** `@pos_reorder`

### POS-I18N-003: Translate PendingReorderCard labels
- **Priority:** P2
- **Files:** `src/components/reorder/PendingReorderCard.tsx`
- **Fix:** Wrap "Critical", "Current", "Min", "Target", "Est. Total" with `t()`.
- **E2E Tag:** `@pos_reorder`

### POS-BUY-003: Fetch minOrderValue from catalog API
- **Priority:** P2
- **Files:** `src/stores/purchaseCartStore.ts` line 103, `src/services/api/catalogApi.ts`
- **Fix:** Fetch `supplier_store_links.minimum_order_value` and pass to cart store.
- **E2E Tag:** `@pos_buy`

### POS-BUY-009: Add UPI payment timeout for purchase orders
- **Priority:** P2
- **Files:** `backend/src/routes/v1/orders.ts`, `src/components/buy/PurchaseCartModal.tsx`
- **Fix:** Clear orphaned cart items + revert order if UPI not confirmed within 15 min.
- **E2E Tag:** `@pos_buy`

### POS-INV-001: Add CSV export for stock statement
- **Priority:** P2
- **Files:** `backend/src/routes/v1/pos/inventory.ts`
- **Fix:** Add `GET /api/v1/pos/inventory/statement/export?format=csv` endpoint.
- **E2E Tag:** `@pos_ledger`

### POS-INV-002: Add ledger entries for bulk inventory deductions
- **Priority:** P2
- **Files:** `backend/src/services/inventoryService.ts` lines 293-376
- **Fix:** Insert `inventory.inventory_ledger` entry with `transaction_type='bulk_sale'` in `applyBulkDeductions()`.
- **E2E Tag:** `@pos_ledger`

### POS-INV-003: Formalize source column in inventory_ledger
- **Priority:** P2
- **Files:** `backend/migrations/` (new migration), `backend/src/services/inventoryLedgerService.ts`
- **Fix:** Add `source VARCHAR(50)` column to `inventory.inventory_ledger`. Migrate existing `[source=X]` notes.
- **E2E Tag:** `@pos_ledger`

### POS-BNPL-001: Add BNPL eligibility check before purchase
- **Priority:** P2
- **Files:** `backend/src/routes/v1/orders.ts` (payment options endpoint)
- **Fix:** Check store's available BNPL credit before offering BNPL option.
- **E2E Tag:** `@pos_buy`

### POS-DUE-001: Implement customer due management API
- **Priority:** P2
- **Files:** `backend/src/routes/v1/pos/` (new route file)
- **Fix:** Add endpoints: list dues by customer, record partial payment, aging report.
- **E2E Tag:** `@payments`

### POS-DUE-002: Auto-create customer_dues record on DUE payment
- **Priority:** P2
- **Files:** `backend/src/routes/v1/pos/payments.ts` (DUE payment handler)
- **Fix:** When `mode='DUE'` payment created, also INSERT into `payments.customer_dues`.
- **E2E Tag:** `@payments`

---

## BATCH ORDER SUMMARY

| Batch | Tickets | Scope | Estimated Effort |
|-------|---------|-------|-----------------|
| **BATCH-A** | 7 tickets | P0 blockers | Critical path |
| **BATCH-B** | 11 tickets | P1 high priority | Pre-production |
| **BATCH-C** | 14 tickets | P2 improvements | Post-launch |
| **TOTAL** | **32 tickets** | | |

---

## MIGRATION NEEDS

| Ticket | Migration Required | Notes |
|--------|-------------------|-------|
| POS-BUY-006 | No (code fix only) | Change column reference |
| POS-INV-003 | Yes | `ALTER TABLE inventory.inventory_ledger ADD COLUMN IF NOT EXISTS source VARCHAR(50)` |
| POS-DUE-001 | Possibly | May need indexes on `payments.customer_dues` |

All migrations must be idempotent (`IF NOT EXISTS` / `ADD COLUMN IF NOT EXISTS`).

---

## E2E TEST TAGS TO ADD

| Tag | Scope |
|-----|-------|
| `@pos_sell` | SELL flow: search, scan, cart, payment, print |
| `@pos_buy` | BUY flow: catalog, cart, orders, GRN |
| `@pos_reorder` | REORDER: pending, approve, dismiss, policies |
| `@pos_ledger` | Ledger/stock: movements, sync, statement |
| `@payments` | Payment flows: cash, UPI, due, split, BNPL |
| `@hid_scan` | HID barcode scanner behavior |
| `@pos_i18n` | i18n: language switch, translations |
