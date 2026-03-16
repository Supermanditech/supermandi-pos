# SuperMandi POS v3 — Implementation Plan

> **Source of truth**: `RELEASES/supermandi-pos-v3.html` (locked prototype)
> **Scope**: Replace existing 44-screen POS with 21-screen v3 architecture
> **Approach**: Incremental migration — no big bang rewrite
> **Git discipline**: One ticket = one commit = one tag = 14-gate pre-commit

---

## Strategy: Parallel Shell + Incremental Migration

**Why NOT big bang rewrite**: The existing 44 screens have 551 battle-tested tickets, 148 registered fixes, 8005-line SellScanScreen with working barcode/voice/cart logic. Rewriting from scratch would lose all of this and introduce regressions.

**Instead**: Build new v3 screens as NEW files alongside existing ones. Migrate one screen at a time. Each migration is a ticket. Old screen stays until new screen passes all gates. Then swap the route.

```
Phase 1: Foundation (new files, no existing code touched)
Phase 2: Core Sell Flow (migrate SellScanScreen → new SellScreen)
Phase 3: Buy/Purchase Flow (new BUY tab + Counter Purchase)
Phase 4: Store/Stock Hub (consolidate 10 screens → 4)
Phase 5: More/Dashboard (consolidate Menu + Credit + Reports)
Phase 6: Cleanup (remove old screens, dead code)
```

---

## Phase 0: Pre-Implementation Setup (1 ticket)

### STG-552: Scaffold v3 navigation shell

**What**: Create new `PosRootLayoutV3.tsx` with 4-tab bottom nav (SELL/BUY/STORE/MORE) alongside existing `PosRootLayout.tsx`. Feature flag `POS_V3_ENABLED` in settingsStore controls which layout loads. Both layouts coexist.

**Files**:
- NEW `src/screens/v3/PosRootLayoutV3.tsx` — 4-tab Material 3 nav
- NEW `src/screens/v3/BottomNavV3.tsx` — SVG icons, active states, badges
- EDIT `src/stores/settingsStore.ts` — add `posV3Enabled: boolean`
- EDIT `src/screens/PosRootLayout.tsx` — if v3 flag, render V3 layout

**Test**: Toggle flag → correct layout renders. All existing screens still accessible.

**Risk**: LOW — new files only, old code untouched behind flag.

**Gates**: A1-A4, C1-C2, E1-E3, F1-F3, G1-G2

---

## Phase 1: Sell Flow (8 tickets)

### STG-553: Create SellScreenV3 — product grid with wholesale toggle

**What**: New sell screen with branded header (SuperMandi logo + online status), search bar (SVG icons), category chips, product grid (3-col), Retail/Bulk customer toggle. Uses existing `productsStore` and `cartStore` — no backend changes.

**Files**:
- NEW `src/screens/v3/SellScreenV3.tsx`
- NEW `src/components/v3/ProductTile.tsx` — tile with stock dot, cart badge, case size label
- NEW `src/components/v3/CustomerTypeToggle.tsx` — Retail/Bulk switch
- NEW `src/components/v3/BrandedHeader.tsx` — SuperMandi logo + online + menu

**Dependencies**: STG-552 (nav shell)

**Backend**: None — reads from existing productsStore

---

### STG-554: Cart strip + 3-state cart sheet

**What**: Persistent cart strip (always visible below product grid). Three states: strip (collapsed showing count+total+PAY), peek (40% height with qty controls), full (80% with discounts, customer, notes). Uses existing `cartStore` — no backend changes.

**Files**:
- NEW `src/components/v3/CartStrip.tsx` — persistent bottom strip
- NEW `src/components/v3/CartSheet.tsx` — 3-state bottom sheet (react-native-reanimated)
- NEW `src/components/v3/CartItemRow.tsx` — item with qty stepper, case conversion, HSN

**Dependencies**: STG-553 (sell screen)

---

### STG-555: Wholesale cart — GST split, case packing, trade discounts

**What**: When sellMode='bulk', cart shows: trade price (not MRP), case conversion ("2 cases × 48 = 96 units"), GST breakdown (CGST + SGST), trade discount savings, HSN per item. Uses existing `cartStore.addItem` — extends metadata.

**Files**:
- EDIT `src/stores/cartStore.ts` — add `sellMode`, `tradePrice`, `caseSize`, `hsnCode` to CartItem
- NEW `src/components/v3/CartSummaryV3.tsx` — GST split, margin, savings display

**Backend**: None — calculation is client-side. GST rates come from product metadata.

**DB**: None — existing product table already has `hsn_code`, `gst_rate` columns (added in migration 188).

---

### STG-556: Payment screen v3 — Cash/UPI/Udhar with quick amounts

**What**: 3 big payment buttons (Cash/UPI/Udhar — not "DUE"), quick cash amounts (EXACT/₹200/₹500/₹1000), express checkout toggle. Reuses existing `PaymentScreen` API calls — only UI changes.

**Files**:
- NEW `src/screens/v3/PaymentScreenV3.tsx`
- EDIT existing payment API calls — no changes needed, same endpoints

---

### STG-557: Success screen v3 — profit display, streak, confetti, WhatsApp bill

**What**: New success screen with: profit per bill ("Margin: ₹24 (15%)"), sale streak ("🔥 12 sales today"), confetti animation, WhatsApp bill send (existing share logic), New Sale button.

**Files**:
- NEW `src/screens/v3/SuccessScreenV3.tsx`
- NEW `src/components/v3/Confetti.tsx` — particle animation
- NEW `src/components/v3/ProfitBadge.tsx`
- Reuse existing `shareCartViaWhatsApp` from SellScanScreen

---

### STG-558: Voice input v3 — always-accessible mic button

**What**: Move voice button from hidden sheet to always-visible header icon. Reuses existing `VoiceSheet`, `startRecording`, `stopRecording`, `submitVoiceCommand` — only changes the trigger location and UI.

**Files**:
- EDIT `src/components/voice/VoiceButton.tsx` — new placement in header
- EDIT `src/screens/v3/SellScreenV3.tsx` — voice button in search bar

---

### STG-559: Barcode scan v3 — context-aware (sell/stock-in/new product)

**What**: Unified scan screen with context toggle (Sell / Stock In / New Product). Reuses existing `onBarcodeScanned`, `handleScan`, camera + HID scanner services. New: context determines what happens after scan.

**Files**:
- NEW `src/screens/v3/ScanScreenV3.tsx` — context toggle + scan result panel
- Reuse existing `src/services/scan/handleScan.ts`
- Reuse existing `src/services/hidScannerService.ts`

---

### STG-560: Search v3 — context-aware universal search

**What**: One search bar, context determines data source. On SELL tab → store inventory (offline-first). On BUY tab → supplier catalogue (API). Reuses existing `sellSearchApi` and `catalogApi`.

**Files**:
- NEW `src/components/v3/UniversalSearch.tsx` — context-aware search
- Reuse existing `src/services/api/sellSearchApi.ts`
- Reuse existing `src/services/api/catalogApi.ts`

---

## Phase 2: Buy/Purchase Flow (6 tickets)

### STG-561: BUY tab — supplier catalogue with wholesale metadata

**What**: New BUY tab showing supplier products with: PTR, PTS, MRP, HSN, GST%, case size, MOQ, trade discount, scheme, margin %, stock level, delivery time. Reuses existing `BuyScreen` data fetching — new UI.

**Files**:
- NEW `src/screens/v3/BuyScreenV3.tsx`
- NEW `src/components/v3/SupplierProductCard.tsx` — full wholesale metadata card
- NEW `src/components/v3/SupplierFilter.tsx` — supplier pills

**Backend**: Existing `/api/v1/pos/catalog` endpoint already returns supplier, price, pack_size. May need to add: `ptr`, `pts`, `trade_discount`, `scheme`, `moq`, `credit_days` to response.

**DB**: May need new columns on `supplier_products` table or a `trade_terms` JSON column.

---

### STG-562: Supplier price comparison screen

**What**: Tap product on BUY → see all suppliers offering it, ranked by price. Shows MOQ, delivery, BNPL, margin for each. Existing `catalogApi.getProductSuppliers()` may need to be created.

**Files**:
- NEW `src/screens/v3/CompareScreen.tsx`
- NEW API: `GET /api/v1/pos/catalog/compare/:productId` (if not exists)

---

### STG-563: Counter Purchase screen — scan + full metadata entry

**What**: The core B2B purchase flow. Supplier at counter → scan products → auto-fill existing, prompt for new → edit qty/price/trade terms → confirm purchase. Three product states: Repeat (auto-fill from last order), Existing (found, needs price), New (full entry).

**Files**:
- NEW `src/screens/v3/CounterPurchaseScreen.tsx`
- NEW `src/components/v3/PurchaseItemCard.tsx` — 3 states (repeat/existing/new)
- NEW `src/components/v3/ExpandableDetails.tsx` — (+) collapsible tax/batch/terms
- EDIT `src/services/api/purchaseApi.ts` — add `getLastPurchase(barcode, supplierId)`

**Backend**: New endpoint `GET /api/v1/pos/purchase/last/:barcode` — returns last purchase price, qty, supplier, date for repeat detection.

**DB**: Query `purchase_items` table joined with `purchases` for last order per barcode.

---

### STG-564: New product digitization — scan-to-add in 10 seconds

**What**: Unknown barcode scanned → if in SuperMandi master DB, auto-fill name/brand/category/MRP. Retailer only enters sell price. If not in DB → full entry form with photo.

**Files**:
- NEW `src/screens/v3/NewProductScreen.tsx`
- EDIT `src/services/scan/handleScan.ts` — add master DB lookup fallback
- NEW API: `GET /api/v1/catalog/master/:barcode` — lookup in shared product DB

**Backend**: New endpoint to query `products` (master catalog) table for barcode match.

---

### STG-565: Purchase cart + GST invoice summary

**What**: Purchase cart with supplier grouping, GST breakdown (CGST+SGST per item based on HSN), trade discounts applied, case/unit conversion, credit terms display, WhatsApp order send.

**Files**:
- EDIT `src/stores/purchaseCartStore.ts` — add GST calculation, trade terms
- NEW `src/components/v3/PurchaseCartSummary.tsx`

---

### STG-566: WhatsApp integration — send order to supplier

**What**: Generate purchase order text (items, qty, price, total) → open WhatsApp with pre-filled message to supplier's phone number. Also: send order confirmation, delivery reminder.

**Files**:
- NEW `src/services/whatsapp/purchaseOrder.ts`
- Reuse existing `Linking.openURL('whatsapp://send?...')`

---

## Phase 3: Store Hub (4 tickets)

### STG-567: Store hub screen — 4 action cards with SVG illustrations

**What**: Replaces old 5-tab layout. Four cards: Receive Stock, Reorder, Stock Report, Barcode Labels. Recent orders list below.

**Files**:
- NEW `src/screens/v3/StoreHubScreen.tsx`

---

### STG-568: GRN v3 — HID scan + camera + edit details per item

**What**: Receive stock with HID scanner bar, camera scan, per-item edit (price, batch, expiry, notes), PO matching, bulk "receive all". Reuses existing GRN API.

**Files**:
- NEW `src/screens/v3/GRNScreenV3.tsx`
- NEW `src/components/v3/GRNItemRow.tsx` — expandable edit panel
- Reuse existing `src/services/api/grnApi.ts`

---

### STG-569: Reorder v3 — stock runout prediction + WhatsApp send

**What**: Smart reorder with "runs out in X days" based on sales velocity. Approve/edit/dismiss. Send reorder list to suppliers via WhatsApp.

**Files**:
- NEW `src/screens/v3/ReorderScreenV3.tsx`
- EDIT `src/services/api/reorderApi.ts` — add sales velocity calculation

---

### STG-570: Stock screen — current/unsold/movement tabs

**What**: Consolidates StockStatementScreen + OpeningStockScreen + BarcodeSheetScreen into one tabbed screen.

**Files**:
- NEW `src/screens/v3/StockScreenV3.tsx` — 3 tabs

---

## Phase 4: More/Dashboard (6 tickets)

### STG-571: More screen — dashboard cards + quick access menu

**What**: Replaces 25-item MenuScreen. Morning brief card, today's stats, credit/finance banner, quick access links.

**Files**:
- NEW `src/screens/v3/MoreScreenV3.tsx`
- Reuse existing `getDailySummary`, `fetchUiStatus` APIs

---

### STG-572: Khata v3 — overdue alerts + WhatsApp reminders

**What**: Unified khata with overdue section (pulsing red), pending section, per-customer WhatsApp remind, bulk remind all, collect payment.

**Files**:
- NEW `src/screens/v3/KhataScreenV3.tsx`
- Reuse existing `src/stores/khataStore.ts`

---

### STG-573: Credit & Finance v3 — BNPL/credit line/bill discounting

**What**: Tabbed screen (Offers/My Loans/Bill Discount). Shows fintech partner offers. Feature-gated.

**Files**:
- NEW `src/screens/v3/FinanceScreenV3.tsx`
- Reuse existing `src/services/api/creditApi.ts`, `bnplApi.ts`

---

### STG-574: Reports v3 — today/week/month with payment split charts

**What**: Consolidates DailyClosingScreen + DailyReportScreen + SalesStatementScreen.

**Files**:
- NEW `src/screens/v3/ReportsScreenV3.tsx`
- Reuse existing `src/services/api/dailySummaryApi.ts`

---

### STG-575: Customers v3 — with WhatsApp contact

**What**: Customer list with WhatsApp button per customer, purchase history, udhar balance inline.

**Files**:
- NEW `src/screens/v3/CustomersScreenV3.tsx`
- DELETE `src/screens/CustomerManagementScreen.tsx` (duplicate)

---

### STG-576: Settings v3 — unified with language toggle

**What**: All settings in one screen. Language EN/Hindi toggle, dark mode, printer, HID scanner, UPI, express checkout.

**Files**:
- NEW `src/screens/v3/SettingsScreenV3.tsx`

---

## Phase 5: Backend Additions (4 tickets)

### STG-577: Add wholesale fields to product/supplier APIs

**What**: Add PTR, PTS, trade_discount, scheme, moq, credit_days to supplier product endpoints.

**Backend files**:
- EDIT `backend/services/catalog-service/routes/catalog.ts`
- Migration: add `ptr`, `pts`, `trade_discount_pct`, `scheme`, `moq`, `credit_days` to `supplier_products` or `trade_terms` table

---

### STG-578: Last purchase lookup API for repeat detection

**What**: `GET /api/v1/pos/purchase/last/:barcode?supplierId=X` returns last purchase record.

**Backend files**:
- NEW route in `backend/services/pos-service/routes/purchase.ts`
- SQL: `SELECT * FROM purchase_items pi JOIN purchases p ON pi.purchase_id = p.id WHERE pi.barcode = $1 AND p.supplier_id = $2 ORDER BY p.created_at DESC LIMIT 1`

---

### STG-579: Master product catalog lookup API

**What**: `GET /api/v1/catalog/master/:barcode` — looks up barcode in shared product database for auto-fill during new product creation.

---

### STG-580: Sales velocity calculation for reorder prediction

**What**: Calculate average daily sales per product over last 14 days. Used by reorder screen to show "runs out in X days".

---

## Phase 6: Migration + Cleanup (4 tickets)

### STG-581: Route swap — replace old screens with v3

**What**: Update `PosRootLayout` to use v3 screens by default. Remove feature flag. Old screens remain as imports but are not rendered.

---

### STG-582: Delete old screens

**What**: Remove 23 old screen files that are replaced by v3:
- SellScanScreen.tsx (8005 lines) → SellScreenV3.tsx
- PaymentScreen.tsx → PaymentScreenV3.tsx
- MenuScreen.tsx → MoreScreenV3.tsx
- CreditScreen.tsx, BnplDuesScreen.tsx, BulkPurchaseCreditScreen.tsx, OverdueDuesScreen.tsx → merged screens
- CustomerManagementScreen.tsx (duplicate)
- ChatListScreen.tsx, ChatConversationScreen.tsx, UiShowcaseScreen.tsx (removed)
- etc.

---

### STG-583: Delete old components

**What**: Remove components only used by deleted screens.

---

### STG-584: Update FIX_LEDGER — mark old fixes as SUPERSEDED

**What**: All 148 fixes in deleted files get status SUPERSEDED with reason "migrated to v3".

---

## Implementation Order (Dependency-Aware)

```
Layer 0: STG-552 (nav shell)
Layer 1: STG-553, 554, 555 (sell grid + cart + wholesale) — parallel OK, different files
Layer 2: STG-556, 557, 558, 559, 560 (payment, success, voice, scan, search)
Layer 3: STG-561, 562, 563, 564, 565, 566 (buy flow) — depends on Layer 1 for cart pattern
Layer 4: STG-567, 568, 569, 570 (store hub)
Layer 5: STG-571, 572, 573, 574, 575, 576 (more/dashboard)
Layer 6: STG-577, 578, 579, 580 (backend additions)
Layer 7: STG-581, 582, 583, 584 (migration + cleanup)
```

## Total: 33 tickets (STG-552 → STG-584)

---

## Git Discipline

Every ticket follows the 9-phase workflow:

```
Phase 0: READ ticket
Phase 1: PRE-FLIGHT — fix-guard check, git clean, FIX_LEDGER read
Phase 2: SCOPE — announce files, get operator OK
Phase 3: IMPLEMENT — new files first, edits second
Phase 4: TEST — ticket-specific tests, full suite
Phase 5: VERIFY — 21-item checklist (7 layers)
Phase 6: REGISTER — fix-guard register with checksum
Phase 7: COMMIT — one commit, 14-gate hook, tag
Phase 8: PARK — update STAGING_TICKETS.md + IMPLEMENTATION_STATE.json
```

**Key safety rules**:
- All new v3 screens are NEW files (`src/screens/v3/`) — no editing existing screens until Phase 6
- Feature flag controls which layout renders — instant rollback by toggling flag
- Old screens remain functional throughout Phases 1-5
- Only Phase 6 (cleanup) deletes old files — after full E2E verification
- Each ticket's test file verifies the new screen independently
- fix-guard ensures zero drift on all 148 existing fixes throughout

---

## Rollback Strategy

At any point during implementation:

1. **Toggle `posV3Enabled = false`** → entire app reverts to current 44-screen layout
2. **No old code deleted until Phase 6** → all existing functionality preserved
3. **Each v3 screen is independent** → can merge partial progress (e.g., sell flow works, buy flow still old)
4. **FIX_LEDGER checksums monitored** → any drift = stop and fix before continuing

---

## Risk Assessment

| Risk | Impact | Mitigation |
|------|--------|------------|
| SellScanScreen split loses features | HIGH | Map every function from 8005-line file to new components. Checklist. |
| Cart state migration breaks checkout | HIGH | Same cartStore, just new UI. Cart data model unchanged for retail. |
| Wholesale fields break existing flows | MEDIUM | Wholesale fields are additive. Retail mode = same as current. |
| 148 fix checksums drift | HIGH | New files only (Phase 1-5). Fix-guard monitors. |
| Hindi translations incomplete | LOW | i18n keys additive. English fallback always works. |
| WhatsApp deep links fail on some devices | LOW | Existing pattern works. Same Linking.openURL approach. |

---

## Success Criteria

- [ ] All 21 v3 screens render correctly
- [ ] Sell flow: scan → cart → payment → receipt in ≤ 3 taps
- [ ] Buy flow: supplier catalogue with wholesale metadata visible
- [ ] Counter purchase: scan → auto-fill repeat → edit → confirm
- [ ] WhatsApp on: receipt, khata remind, purchase order, report share
- [ ] Hindi/English toggle works across all screens
- [ ] Zero regression on existing 551 tickets
- [ ] All 148 fixes intact (fix-guard zero drift)
- [ ] Full E2E test suite passes
- [ ] Feature flag rollback works instantly
