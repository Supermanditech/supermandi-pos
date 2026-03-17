# Pre-GCP Staging Deployment Audit

> HEAD: d1971cba | 106 fixes | Zero drift | 2026-03-17
> Source of truth: https://supermanditech.github.io/supermandi-pos/RELEASES/supermandi-pos-v3.html

## Section 1: UI / UX / Wiring / Navigation

### Status: 25 v3 screens, 15 v3 components, 23 Stack.Screen entries
### Navigation: 0 dead targets (all navigate() calls resolve)

| Issue ID | Severity | Screen | Issue |
|----------|----------|--------|-------|
| PD-001 | HIGH | BillDetailScreenV3 | Props-only screen, no navigation wiring from MoreScreenV3 — cannot be reached |
| PD-002 | MEDIUM | ReorderScreenV3 | api=0 — uses listPendingReorders but import may not be called (store=0) |
| PD-003 | LOW | CustomersScreenV3 | 76 lines — minimal UI, no WhatsApp deep link wired to actual Linking.openURL |
| PD-004 | LOW | FinanceScreenV3 | 85 lines — tabs exist but Loans/Bills tabs show same static offer cards |
| PD-005 | MEDIUM | SellScreenV3 | Only 2 FlatList virtualization settings — needs maxToRenderPerBatch for 5000+ |
| PD-006 | LOW | 21 screens | i18n: Most screens have useTranslation but some hardcoded English strings remain |

## Section 2: Device and Performance

| Issue ID | Severity | Issue |
|----------|----------|-------|
| PD-007 | HIGH | No responsive layout testing done — only Redmi tested |
| PD-008 | MEDIUM | PaymentScreenV3 (389L) + SellScreenV3 (357L) are large — may cause re-render lag on low-end devices |
| PD-009 | MEDIUM | Only 2 FlatList optimization settings across all screens — needs windowSize/maxToRenderPerBatch on all product lists |
| PD-010 | LOW | No Hermes engine optimization verified (Expo default) |

## Section 3: Offline and Sync

### Global: PosRootLayoutV3 has offline banner (isOnline check every 15s)
### Per-screen: Only 4 of 25 screens have explicit offline handling

| Issue ID | Severity | Screen | Issue |
|----------|----------|--------|-------|
| PD-011 | HIGH | BuyScreenV3 | No offline fallback — API call fails silently, no cached catalogue shown |
| PD-012 | HIGH | PaymentScreenV3 | No offline check before createSale — will fail with confusing error |
| PD-013 | HIGH | CounterPurchaseScreenV3 | No offline check before recordManualInward — silent failure |
| PD-014 | MEDIUM | KhataScreenV3 | Uses khataStore (has internal cache) but no explicit offline banner |
| PD-015 | MEDIUM | GRNScreenV3 | No offline check — orderApi calls will fail |
| PD-016 | MEDIUM | ReportsScreenV3 | No offline check — getDailySummary will fail |
| PD-017 | MEDIUM | StockScreenV3 | No offline check — getStockStatement will fail |
| PD-018 | LOW | CompareScreenV3 | No offline check — supplier comparison unavailable offline |
| PD-019 | LOW | StoreHubScreenV3 | No offline check — recent orders fail silently |

## Section 4: Cross-Platform Functional Integrity

| Issue ID | Severity | Issue |
|----------|----------|-------|
| PD-020 | HIGH | SKU lifecycle: Supplier product -> SuperAdmin approval -> Retailer POS visibility requires admin_approved_at to be set. Backend catalog API does NOT filter by admin_approved_at yet — unapproved SKUs visible |
| PD-021 | MEDIUM | Retailer Web product edits do NOT trigger SSE sync event to POS (SSE polls stock_balances + store_products updated_at, but web edits may use different update path) |
| PD-022 | MEDIUM | SuperAdmin margin (admin_retail_price_minor) not consumed by POS BuyScreen — BuyScreen shows purchase_price, not margin-applied price |
| PD-023 | LOW | Supplier Portal order status updates visible in POS only after refresh (no push notification) |

## Section 5: V3 Prototype Alignment

### 27/27 prototype screens mapped to code (26 exact + 1 partial)

| Issue ID | Severity | Proto Screen | Issue |
|----------|----------|-------------|-------|
| PD-024 | MEDIUM | sales | Sales History is inline in MoreScreenV3, not a dedicated sub-screen with bill list + detail drill-down as shown in prototype |
| PD-025 | LOW | cart | Prototype shows "Park" button as a full feature with parked carts count badge — code has toast-only placeholder |
| PD-026 | LOW | sell | Prototype shows "Frequent" category as frequency-sorted — code shows first N products (no frequency algorithm) |
| PD-027 | LOW | voice | Prototype shows Hindi transcription "2 Parle-G bada wala" — code sends to voice API but Hindi UX not verified |

## Section 6: Impact Analysis

### High-Impact Files
| File | Lines | Risk |
|------|-------|------|
| App.tsx | 175 | LOW — clean v3-only nav, well-structured |
| SellScreenV3.tsx | 357 | MEDIUM — core checkout, many store connections |
| PaymentScreenV3.tsx | 389 | HIGH — handles money, UPI, split payment |
| CounterPurchaseScreenV3.tsx | 276 | MEDIUM — stock mutations |
| backend/src/routes/v1/pos/otpAuth.ts | 141 | HIGH — authentication gateway |
| backend/src/routes/v1/admin/catalog.ts | 420 | MEDIUM — margin control + SKU approval |

### Migrations Pending Apply (staging DB)
| Migration | Purpose | Risk |
|-----------|---------|------|
| 188 | consent_records table | LOW |
| 189 | platform columns | LOW |
| 190 | wholesale fields on supplier_products | MEDIUM |
| 191 | pos_otp table | HIGH (required for auth) |
| 192 | admin margin control columns | MEDIUM |
| 193 | compat views for CI tests | LOW |

### No regression risks identified:
- All old screens deleted (no ghost imports)
- All old components deleted (no ghost imports)
- All workflow tickets updated to v3 paths
- Fix ledger: 106 active, 77 superseded, 0 missing files
- TypeScript: 0 errors (frontend + backend)

## Section 7: Execution-Ready Tickets

### CRITICAL (blocks staging deploy)

| Ticket | Problem | Scope | Files | Acceptance |
|--------|---------|-------|-------|-----------|
| PD-012 | PaymentScreenV3 no offline check before createSale | Frontend | PaymentScreenV3.tsx | isOnline() check before sale, show "Sales queued offline" toast, queue in outbox |
| PD-013 | CounterPurchaseScreenV3 no offline check before recordManualInward | Frontend | CounterPurchaseScreenV3.tsx | isOnline() check, queue in outbox if offline |
| PD-020 | Unapproved supplier SKUs visible in POS BuyScreen | Backend | catalog-service search query | Add WHERE admin_approved_at IS NOT NULL filter, or WHERE is_active = true |

### HIGH (required for production quality)

| Ticket | Problem | Scope | Files | Acceptance |
|--------|---------|-------|-------|-----------|
| PD-001 | BillDetailScreenV3 unreachable — no navigation from MoreScreenV3 | Frontend+Nav | MoreScreenV3.tsx, App.tsx | Wire "Sales History" menu item to bill detail screen |
| PD-007 | No multi-device responsive testing | Testing | All v3 screens | Test on 3+ screen sizes, document results |
| PD-011 | BuyScreenV3 no offline fallback | Frontend | BuyScreenV3.tsx | Show cached catalogue when offline, banner visible |
| PD-022 | SuperAdmin margin not reflected in BuyScreen price | Frontend+Backend | BuyScreenV3.tsx, catalog query | Show admin_retail_price_minor as retailer purchase price |

### MEDIUM

| Ticket | Problem | Scope | Files |
|--------|---------|-------|-------|
| PD-005 | SellScreenV3 needs maxToRenderPerBatch for 5000+ products | Frontend | SellScreenV3.tsx |
| PD-008 | PaymentScreenV3 + SellScreenV3 re-render optimization | Frontend | PaymentScreenV3.tsx, SellScreenV3.tsx |
| PD-009 | Add FlatList optimization to all product list screens | Frontend | Buy, Stock, Reorder, Customers |
| PD-014 | KhataScreenV3 explicit offline handling | Frontend | KhataScreenV3.tsx |
| PD-015 | GRNScreenV3 offline check | Frontend | GRNScreenV3.tsx |
| PD-016 | ReportsScreenV3 offline check | Frontend | ReportsScreenV3.tsx |
| PD-017 | StockScreenV3 offline check | Frontend | StockScreenV3.tsx |
| PD-021 | Retailer Web edits trigger SSE sync | Backend | SSE endpoint + web API |
| PD-024 | Sales History dedicated sub-screen | Frontend | NEW SalesHistoryScreenV3.tsx |

### LOW

| Ticket | Problem | Scope |
|--------|---------|-------|
| PD-003 | CustomersScreenV3 WhatsApp link | Frontend |
| PD-004 | FinanceScreenV3 Loans/Bills real data | Frontend |
| PD-006 | Hardcoded English strings | Frontend (i18n) |
| PD-010 | Hermes engine verification | Build config |
| PD-018 | CompareScreenV3 offline check | Frontend |
| PD-019 | StoreHubScreenV3 offline check | Frontend |
| PD-023 | Supplier order push notification | Backend |
| PD-025 | Park cart full implementation | Frontend |
| PD-026 | Frequency-sorted products | Frontend+Backend |
| PD-027 | Hindi voice UX verification | Testing |

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 3 |
| HIGH | 4 |
| MEDIUM | 9 |
| LOW | 10 |
| **TOTAL** | **26** |

### Verdict: 3 CRITICAL tickets must be resolved before staging deploy.
All others can be addressed post-deploy without regression risk.
