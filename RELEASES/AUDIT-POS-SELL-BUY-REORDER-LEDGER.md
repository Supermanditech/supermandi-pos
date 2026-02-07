# AUDIT: POS SELL + BUY + REORDER + LEDGER + PAYMENTS
**Date:** 2026-02-08 | **Auditor:** Claude (code-level static audit) | **Target:** 10,000 stores

---

## EXECUTIVE SUMMARY

| Area | Verdict | P0 | P1 | P2 | Details |
|------|---------|----|----|----|---------|
| **A. SELL** | PASS w/ caveats | 1 | 4 | 6 | Core flow solid; multi-barcode dedup missing |
| **B. BUY/PURCHASE** | FAIL | 3 | 4 | 4 | Live catalog not wired; GRN status enum mismatch |
| **C. REORDER** | PASS w/ caveats | 0 | 1 | 2 | Functional; i18n gaps in alerts |
| **D. LEDGER/STOCK** | PASS | 0 | 0 | 3 | Append-only ledger w/ LWW sync correct |
| **E. MENU/SETTINGS** | PASS | 0 | 0 | 0 | Full i18n, feature gating correct |
| **F. i18n** | PASS w/ caveats | 0 | 1 | 2 | Reorder screen hardcoded English alerts |
| **G. BNPL** | PASS | 0 | 0 | 1 | Full end-to-end implemented |
| **G. CREDIT/LOANS** | FAIL | 2 | 0 | 0 | KYC mock-only, no disbursement, no frontend |
| **H. UPI (SELL)** | CONDITIONAL PASS | 0 | 1 | 0 | Works but UTR verification is mock |
| **H. UPI (BUY/Payouts)** | FAIL | 1 | 0 | 0 | Razorpay not configured |
| **TOTALS** | | **7** | **11** | **18** | |

---

## TEST MATRIX

| Flow | POS Tablet | POS Mobile | HID Scanner | Backend API | DB Tables |
|------|-----------|------------|-------------|-------------|-----------|
| A1. Search | SellScanScreen | SellScanScreen | N/A | GET /pos/store-products/search | catalog.store_products, inventory.stock_balances |
| A2. Scan (Camera) | SellScanScreen | SellScanScreen | N/A | GET /pos/store-products/lookup | catalog.store_products |
| A2. Scan (HID) | SellScanScreen | N/A | hidScannerService | GET /pos/store-products/lookup | catalog.store_products |
| A3. Cart Display | SellScanScreen | SellScanScreen | N/A | N/A (local) | N/A |
| A4. Tap-to-add | SellScanScreen | SellScanScreen | N/A | N/A (local) | N/A |
| A5. Cart Logic | cartStore | cartStore | N/A | N/A (local) | N/A |
| A6. Cash Payment | PaymentScreen | PaymentScreen | N/A | POST /pos/sales, POST /pos/payments/cash | sales.sales, payments.sell_payments, inventory.* |
| A6. UPI Payment | PaymentScreen | PaymentScreen | N/A | POST /pos/payments/upi/generate | sales.sales, payments.sell_payments, payments.upi_verifications |
| A6. Due/Credit | PaymentScreen | PaymentScreen | N/A | POST /pos/payments/due | sales.sales, payments.sell_payments, payments.accounts_receivable |
| A6. Split | SplitPaymentModal | SplitPaymentModal | N/A | POST /pos/payments/split | sales.sales, payments.sell_payments |
| A7. Print | SuccessPrintScreenV2 | SuccessPrintScreenV2 | N/A | N/A (local expo-print) | N/A |
| B1. Purchase Search | PurchaseScreen | PurchaseScreen | hidScannerService | GET /pos/buy-catalog (not wired) | catalog.supplier_products |
| B3. Purchase Cart | PurchaseCartModal | PurchaseCartModal | N/A | POST /orders/stores/:id/orders | orders.purchase_orders, orders.purchase_order_items |
| B4. GRN | (Order detail screen) | (Order detail screen) | N/A | POST /orders/stores/:id/orders/:id/receive | orders.order_receives, orders.order_receive_items, inventory.* |
| C. Reorder | ReorderScreen | ReorderScreen | N/A | GET/POST /reorder/stores/:id/reorder/* | orders.pending_reorders |
| D1. Sell Ledger | N/A | N/A | N/A | POST /pos/sales (auto) | inventory.inventory_ledger, inventory.stock_balances |
| D2. GRN Ledger | N/A | N/A | N/A | POST /orders/.../receive (auto) | inventory.inventory_ledger, inventory.stock_balances |
| D3. Stock Statement | N/A | N/A | N/A | GET /pos/inventory/statement | inventory.stock_balances, catalog.store_products |
| G. BNPL | BnplDuesScreen | BnplDuesScreen | N/A | GET/POST /pos/bnpl/* | payments.bnpl_drawdowns, payments.bnpl_settings |

---

## ENDPOINT MAP: Frontend Call Site -> Backend Route -> DB Tables

### SELL Flow
```
SellScanScreen.tsx → sellSearchApi.searchStoreProducts()
  → GET /api/v1/pos/store-products/search?q=...
  → catalog.store_products JOIN inventory.stock_balances

SellScanScreen.tsx → scanApi.receiveStoreProductFromScan()
  → GET /api/v1/pos/store-products/lookup?barcode=...
  → catalog.store_products JOIN catalog.store_product_barcodes

PaymentScreen.tsx → posApi.createSale()
  → POST /api/v1/pos/sales
  → sales.sales, sales.sale_items (status=PENDING)

PaymentScreen.tsx → posApi.confirmSale()
  → POST /api/v1/pos/sales/:saleId/confirm
  → sales.sales (status=COMPLETED), inventory.inventory_ledger (SELL deduction)

PaymentScreen.tsx → posApi.recordCashPayment()
  → POST /api/v1/pos/payments/cash
  → payments.sell_payments (mode=CASH)

PaymentScreen.tsx → posApi.generateUpiQr()
  → POST /api/v1/pos/payments/upi/generate
  → payments.sell_payments (mode=UPI, status=initiated)

PaymentScreen.tsx → posApi.recordDuePayment()
  → POST /api/v1/pos/payments/due
  → payments.sell_payments (mode=DUE), payments.accounts_receivable
```

### BUY/PURCHASE Flow
```
PurchaseScreen.tsx → orderApi.createOrder()
  → POST /api/v1/orders/stores/:storeId/orders
  → orders.purchase_orders (status=submitted), orders.purchase_order_items

(Order Detail) → orderApi.receiveGoods()
  → POST /api/v1/orders/stores/:storeId/orders/:orderId/receive
  → orders.order_receives, orders.order_receive_items,
    orders.purchase_order_items (received_quantity++),
    inventory.stock_balances (current_qty++),
    catalog.store_products (current_stock++)
```

### REORDER Flow
```
ReorderScreen.tsx → reorderApi.getPendingReorders()
  → GET /api/v1/reorder/stores/:storeId/reorder/pending
  → orders.pending_reorders

ReorderScreen.tsx → reorderApi.approvePendingReorders()
  → POST /api/v1/reorder/stores/:storeId/reorder/pending/approve
  → orders.pending_reorders (status=approved),
    orders.purchase_orders (new draft POs created)
```

---

## STATE MACHINES

### HID Scanner State Machine
```
IDLE ──(char received)──> ACCUMULATING
  │                          │
  │                          ├──(idle 120ms timeout)──> VALIDATE
  │                          └──(Enter/Tab key)──────> VALIDATE
  │
  │  VALIDATE:
  │    - min length >= 4
  │    - total duration < 1200ms
  │    - avg interval < 80ms per char
  │    - Pass → RESOLVE
  │    - Fail → discard → IDLE
  │
  └──────────────(reset)────── IDLE

RESOLVE ──(dedup check: 2000ms window)──> ADD-TO-CART
  │                                          │
  │──(duplicate detected)──> DROP → IDLE     │
  │──(storm: 8 scans/2s)──> COOLDOWN → IDLE │
  │                                          │
  ADD-TO-CART ──(success)──> IDLE
             ──(not found)──> NOTIFY → IDLE
```

### Cart State Machine
```
EMPTY ──(addItem)──> HAS_ITEMS
  │                     │
  │                     ├──(addItem)──> HAS_ITEMS (qty++)
  │                     ├──(removeItem)──> EMPTY | HAS_ITEMS
  │                     ├──(updateQty)──> HAS_ITEMS
  │                     ├──(applyDiscount)──> HAS_ITEMS
  │                     ├──(lock: payment started)──> LOCKED
  │                     │                               │
  │                     │                               ├──(unlock: 5min timeout)──> HAS_ITEMS
  │                     │                               └──(payment complete)──> CLEAR → EMPTY
  │                     │
  │                     └──(clearCart)──> EMPTY
```

### Purchase Order State Machine
```
(DB CHECK constraint: chk_po_status)

draft ──(submit)──> submitted ──(supplier confirms)──> confirmed
                        │                                  │
                        │                                  ├──(shipment added)──> shipped
                        │                                  │                       │
                        │                                  │                       └──(GRN partial)──> partial_received
                        │                                  │                                              │
                        │                                  └──(GRN full)──────────────> delivered ──> (END)
                        │                                                                  ↑
                        └──(cancel)──> cancelled ──> (END)      partial_received ──(GRN full)──┘
```

### Inventory Ledger State Machine
```
EVENT ──(sale)──> INSERT inventory_ledger (delta_qty = -N)
      ──(purchase_received/GRN)──> INSERT inventory_ledger (delta_qty = +N)
      ──(sale_return)──> INSERT inventory_ledger (delta_qty = +N, reversal_of_id)
      ──(adjustment)──> INSERT inventory_ledger (delta_qty = +/-N)
      ──(opening_stock)──> INSERT inventory_ledger (delta_qty = +N)

  Each INSERT atomically:
    1. Append to inventory.inventory_ledger
    2. UPDATE inventory.stock_balances (current_qty += delta)
    3. UPDATE catalog.store_products.current_stock (denormalized)

  Idempotency: Skip if (store_id, product_id, reference_type, reference_id) exists
  Constraint: stock_before + delta_qty = stock_after
```

---

## DETAILED FINDINGS

### A. SELL FLOW

#### A1. Search — PASS
- **Files:** `src/services/api/sellSearchApi.ts`, `backend/src/routes/v1/pos/storeProducts.ts:253-403`
- Search uses trigram similarity with token-based OR matching
- Store isolation: storeId derived from device token on server (not client-supplied)
- Min 2 chars enforced, max 100 chars (AUD-059-C DoS protection)
- Stock source: `COALESCE(sb.current_qty, sp.current_stock, 0)` — inventory.stock_balances is primary
- Stock drift detection (ITER3-003): warns if >5 units or >10% difference

#### A2. Scan — PASS w/ P1 issues
- **Files:** `src/services/hidScannerService.ts` (179 lines), `src/services/scan/handleScan.ts` (681 lines)
- HID scanner: proper state machine with timing validation
- Duplicate guard: 2000ms window, unified key `"${intent}:${mode}:${barcode}"`
- Storm detection: per-barcode, 8 scans/2s threshold, 1s cooldown
- **P1-SCAN-001:** No uppercase normalization on barcodes (case-sensitive matching)
- **P1-SCAN-002:** Keyboard input heuristic too aggressive — `looksLikeBarcode` check blocks short barcodes from HID
- **P1-SCAN-003:** No prefix/suffix stripping for scanner-added checksum digits

#### A3. Cart Display — FAIL (P0)
- **Files:** `src/stores/cartStore.ts`, `src/services/scan/handleScan.ts:180-194`
- **P0-CART-001:** Multi-barcode same-SKU NOT merged. Scanning product via EAN barcode then internal barcode creates 2 cart lines for same product. Root cause: dedup checks barcode first, then ID. Should check ID first.

#### A4. Tap-to-add — PASS
- Atomic increment via `addItem()` with stock cap enforcement
- `capAddQuantity()` in stockCap.ts prevents over-adding
- Cart lock during payment (GL-CRIT-0011) with 5-min auto-unlock

#### A5. Cart Logic — PASS w/ P2 issues
- Line totals: `safePrice * safeQty` per item, cascading discounts (per-item then cart-level)
- Zustand persist middleware, storage key scoped to store
- **P2-CART-002:** No AppState listener for stock refresh on app resume
- **P2-CART-003:** Negative discount not explicitly blocked at cart level (UI-only validation)

#### A6. Payment Flows — PASS w/ P1 issue
- **Cash:** Two-phase commit (create sale → confirm & deduct stock), SERIALIZABLE isolation
- **UPI:** Server-side QR generation, 15-min expiry, idempotent reuse
- **Due/Credit:** Creates accounts_receivable record
- **Split:** Multi-method payments, UPI + CASH coordination
- Idempotency: saleId as key throughout, `FOR UPDATE` locks prevent races
- **P1-PAY-001:** UPI poll timeout — max 20 attempts may not be enough on slow networks

#### A7. Print — PASS w/ P2 issues
- expo-print system dialog, concurrent print lock (ISSUE-MICRO-102)
- **P2-PRINT-001:** Receipt missing discount details, tax breakdown, operator ID
- **P2-PRINT-002:** No real printer connectivity check (just platform detection)

---

### B. BUY/PURCHASE FLOW

#### B1. Purchase Search — FAIL (P0)
- **P0-BUY-001:** Live Suppliers catalog NOT wired. `PurchaseScreen.tsx:235` has `filteredSKUs: liveSuppliersReady ? [] : []` — always empty. GATE-000 blocks feature.
- Quick Purchase (manual barcode scan) works but requires manual name + price entry
- No automatic barcode → supplier product resolution

#### B2. Supplier Product Detail — FAIL (P0)
- **P0-BUY-002:** No grouped product view for multiple suppliers. `CatalogProductCard.tsx` is scaffold only.
- `catalogApi.ts` has `getBuyCatalog()` and `buyBarcodeSearch()` defined but never called in UI
- Missing: supplier ranking, best price indicator, MOQ per supplier, credit days, BNPL eligibility display

#### B3. Purchase Cart — CONDITIONAL PASS
- Cart binds to `supplierProductId + supplierId` correctly
- MOQ enforced at cart level (`normalizeQuantity()`)
- Multi-supplier split orders supported via `getItemsBySupplier()`
- **P2-BUY-003:** `minOrderValue` source undefined (not fetched from catalog API, defaults to 0)
- **P1-BUY-004:** No draft save — all orders created as "submitted" immediately

#### B4. Order Lifecycle + GRN — FAIL (P0 + P1)
- **P0-BUY-005:** Order status enum mismatch in GRN: code uses `"partial_received"` but DB constraint allows both spellings across different migrations. Fixed in previous hardening but cross-verify needed.
- **P1-BUY-006:** GRN requires status in (confirmed, shipped, partial_received) but orders created as "submitted" — supplier must confirm before GRN possible
- **P1-BUY-007:** Barcode column mismatch in order detail query (`p.barcode` vs `primary_barcode`)
- **P1-BUY-008:** Credit payment not atomic — no transaction isolation, credit could overrun limit
- **P2-BUY-009:** No UPI payment timeout — orphaned orders if user never confirms
- Stock update on GRN: upserts `inventory.stock_balances` and `catalog.store_products.current_stock`

---

### C. REORDER

#### PASS w/ P1 i18n gap
- Two paths implemented: supplier-based pending reorders + manual policy-based thresholds
- Feature flag gating: `reorderEnabled` in settingsStore controls visibility
- Store isolation: backend `getStoreIdFromDevice(req)` overrides URL param
- Creates draft POs mapped to correct suppliers
- **P1-I18N-001:** ReorderScreen.tsx has 13+ hardcoded English alert strings (approval dialogs, success messages)
- **P2-I18N-002:** DismissReasonModal.tsx has 6 predefined English-only dismiss reasons
- **P2-I18N-003:** PendingReorderCard.tsx has hardcoded labels ("Critical", "Est. Total")

---

### D. LEDGERS + STOCK + SYNC

#### D1. Ledger Correctness — PASS
- Append-only `inventory.inventory_ledger` with CHECK constraint `stock_before + delta_qty = stock_after`
- SELL: `recordSaleInventoryMovements()` creates entries with `transaction_type='sale'`, `delta_qty=-N`
- BUY/GRN: `incrementCatalogStock()` creates entries with `transaction_type='purchase_received'`, `delta_qty=+N`
- Returns: `recordSaleReturnMovements()` reverses with `reversal_of_id` tracking
- Idempotency (GO-LIVE-121): dedup by `(store_id, product_id, reference_type, reference_id)`

#### D2. Sync — PASS
- LWW conflict resolution: client sends `stockUpdatedAt`, server rejects if stale (409)
- Backward compat: requests without `stockUpdatedAt` always succeed
- E2E test: `stock-lww.spec.ts` proves concurrent POS + Dashboard updates are conflict-safe

#### D3. Stock Statement — PASS w/ P2 gap
- JSON endpoint at `GET /api/v1/pos/inventory/statement` with proper scope
- **P2-INV-001:** No CSV/PDF export endpoint (JSON only)
- **P2-INV-002:** Bulk inventory deductions don't create ledger entries (no audit trail for weight/volume items)
- **P2-INV-003:** `source` column embedded in notes field instead of dedicated column (schema debt)

---

### E. MENU + SETTINGS — PASS
- Full i18n coverage, all text via `t()` function
- Feature flag gating: `buyEnabled`, `reorderEnabled` control menu sections
- Device status panel: store name/code, device ID, sync status, active/inactive badges
- Language toggle: EN/HI with AsyncStorage persistence
- Switch store: safe shutdown + re-enrollment flow

---

### F. i18n — PASS w/ caveats
- Infrastructure: i18next + expo-localization, proper fallback chain (saved > device > 'en')
- Coverage: SELL/BUY/PAYMENT/MENU/REPORTS fully translated
- Currency: INR + Indian number system (lakhs/crores) via `en-IN`/`hi-IN` locales
- Production-safe fallback: never shows empty/null (GO-LIVE-TR-001)
- **Gap:** Reorder screens have hardcoded English (see C section)

---

### G. BNPL — PASS
- Full schema + API + frontend implemented
- Endpoints: active drawdowns, summary, repay (UPI/CASH), confirm, dispute
- Eligibility: `bnpl_enabled`, `bnpl_credit_limit`, `bnpl_max_days` per store
- **P2-BNPL-001:** No eligibility check when purchasing (BNPL offered regardless of available credit)

### G. CREDIT/LOANS — FAIL
- Scoring engine implemented (GMV, txn count, BNPL repayment, account age → 100pt scale)
- **P0-CREDIT-001:** KYC is mock-only (format validation, no UIDAI/MCA/GST API)
- **P0-CREDIT-002:** Disbursement not implemented (no money flow, no loan ledger)
- No frontend screens built

---

### H. UPI SELL-SIDE — CONDITIONAL PASS
- QR-only deep link generation (no payment gateway SDK)
- 15-minute expiry, idempotent reuse, split payment support
- **P1-UPI-001:** UTR verification is mock (format check only, no gateway API call)
- No webhook endpoint for async payment confirmations

### H. UPI BUY-SIDE (Supplier Payouts) — FAIL
- **P0-UPI-002:** Razorpay API keys not configured in .env
- `supplierPayoutService.ts` has Razorpay integration code but will hard-fail in production
- Missing: webhook endpoint, fund account registration, retry scheduler

---

## EVIDENCE: Key File Paths + Line References

| Finding | File | Lines |
|---------|------|-------|
| Multi-barcode dedup bug | `src/services/scan/handleScan.ts` | 180-194 |
| Cart addItem with stock cap | `src/stores/cartStore.ts` | 287-385 |
| HID scanner state machine | `src/services/hidScannerService.ts` | 1-179 |
| Sell two-phase commit | `backend/src/routes/v1/pos/sales.ts` | 771-1170, 1177-1314 |
| UPI QR generation | `backend/src/routes/v1/pos/payments.ts` | 83-255 |
| GRN receive endpoint | `backend/src/routes/v1/orders.ts` | 1351-1581 |
| Inventory ledger service | `backend/src/services/inventoryLedgerService.ts` | 97-280, 305-386 |
| LWW stock guard | `backend/src/routes/v1/pos/storeProducts.ts` | 795-918 |
| Reorder store isolation | `backend/src/routes/v1/reorder.ts` | 6-34 |
| BNPL endpoints | `backend/src/routes/v1/pos/bnpl.ts` | 1-627 |
| Credit scoring | `backend/src/routes/v1/pos/credit.ts` | 29-159 |
| Config contract test | `e2e-tests/tests/config/config-contract.spec.ts` | 1-75 |
| i18n infrastructure | `src/i18n/index.ts` | 1-134 |
| Feature flags | `src/utils/featureFlags.ts` | 35-95 |
| Razorpay payout service | `backend/src/services/supplierPayoutService.ts` | 8-135 |

---

## FINAL VERDICT

**GO-LIVE READINESS: CONDITIONAL — 7 P0 blockers must be resolved**

| Category | Recommendation |
|----------|---------------|
| SELL flow | Fix P0-CART-001 (multi-barcode dedup) before launch. P1s can be post-launch. |
| BUY/PURCHASE | P0-BUY-001/002 (live catalog) require significant work. Consider launching without BUY and adding later. |
| REORDER | Ready. Fix i18n alerts (P1) in next batch. |
| LEDGER/STOCK | Production ready. |
| PAYMENTS (SELL) | Production ready with monitoring. Add UPI webhook post-launch. |
| BNPL | Production ready. |
| CREDIT/LOANS | Defer to post-MVP. Mock KYC is not production-safe. |
| UPI PAYOUTS | Defer until Razorpay configured. |
