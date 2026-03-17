# V3 Remaining Tickets — Production Gap Closure

> Source of truth: https://supermanditech.github.io/supermandi-pos/RELEASES/supermandi-pos-v3.html
> HEAD: 42abc9ec | 180 fixes | Zero drift | 71 v3 tickets done

## Phase A: GCP Deploy + Backend (CRITICAL — unblocks everything)

### V3-038: Redeploy staging to GCP with HEAD 42abc9ec
- Trigger CD pipeline (push already done)
- Verify all 6 Cloud Run services update
- Apply migration 190 + 191 to staging DB
- Verify OTP endpoints respond at staging.supermandi.tech
- **Blocks**: All device testing

### V3-039: Register 4 wholesale routes in Express app
- backend/src/routes/v1/pos/index.ts — add wholesale, lastPurchase, masterCatalog, salesVelocity
- Verify routes respond on staging after deploy

## Phase B: Wire Remaining Demo Screens to Real APIs (6 screens)

### V3-040: CounterPurchaseScreenV3 — wire real barcode + createPurchase
- Replace DEMO_ITEMS with barcode scan → productsStore lookup
- Wire supplier selector to real suppliersApi
- Wire "Save Purchase" to createPurchase API
- Add loading + error + empty states

### V3-041: GRNScreenV3 — wire real pending PO items
- Replace DEMO_ITEMS with getPendingOrders from reorderApi
- Wire receive action to confirmGRN API
- Wire barcode scan for item verification
- Add loading + error + empty states

### V3-042: ReorderScreenV3 — wire real reorder suggestions
- Replace DEMO items with getPendingReorders
- Wire approve/dismiss actions
- Wire sales velocity for "days of stock" display
- Add loading + error + empty states

### V3-043: StockScreenV3 — wire real inventory
- Replace DEMO_STOCK with getStockStatement from inventoryApi
- Wire search/filter to real data
- Add loading + error + empty states

### V3-044: ReportsScreenV3 — wire real daily/weekly/monthly stats
- Wire getDailySummary for Today tab
- Wire date range queries for Week/Month tabs
- Wire payment split breakdown
- Add loading + error + empty states

### V3-045: FinanceScreenV3 — wire credit offers
- Wire getCreditOffers (feature-gated)
- Wire BNPL drawdown display
- Wire BulkPurchaseCredit offers
- Add loading + error + empty states

## Phase C: Auth Flow Polish

### V3-046: SplashScreenV3 — animated logo + session check
- Replace placeholder with animated SuperMandi shortmark
- Check AsyncStorage for existing session token
- If valid → navigate to PosRootLayoutV3
- If invalid → navigate to PhoneScreenV3
- Wire ForceUpdate + DeviceBlocked checks

## Phase D: Delete Old Code

### V3-047: Delete old 44 screen files
- Remove all src/screens/*.tsx (except v3/ folder)
- Update App.tsx imports — only v3 screens + system screens
- Remove old component files not used by v3
- Verify typecheck passes after deletion

### V3-048: Clean App.tsx navigation stack
- Remove all old screen registrations (SalesHistory, BillDetail, etc.)
- Keep only: Splash → Phone → OTP → PosRootLayoutV3 → v3 sub-screens
- Verify all navigation works on device

### V3-049: Delete unused stores/services
- Audit which stores are still used by v3 screens
- Remove any dead imports
- Verify typecheck + tests pass

## Phase E: Edge Cases + Polish

### V3-050: Offline mode for all screens
- BuyScreenV3: show cached catalogue when offline
- CounterPurchaseScreenV3: queue purchases in outbox
- KhataScreenV3: queue entries in outbox
- Show OfflineBanner consistently across all screens

### V3-051: Empty states for all list screens
- GRNScreenV3: "No pending deliveries"
- ReorderScreenV3: "All stock levels healthy"
- StockScreenV3: "No products in inventory"
- ReportsScreenV3: "No sales data for this period"
- FinanceScreenV3: "No credit offers available"
- CustomersScreenV3: "No customers yet"

### V3-052: Error states for all API screens
- Verify try/catch on every API call
- Show user-friendly error toast (not raw error)
- Add retry button on error states

### V3-053: Loading states polish
- Skeleton loaders instead of ActivityIndicator where possible
- Consistent loading patterns across all screens

## Phase F: Device Testing + APK

### V3-054: Build release APK from clean state
- Full clean build (gradlew clean + assembleRelease)
- Verify APK size and signing
- Install on Redmi test device

### V3-055: Full E2E device testing
- Auth flow: Phone → OTP → POS
- Sell flow: search → add → cart → payment → receipt
- Buy flow: browse catalogue → compare → add to purchase cart
- Store flow: stock report, GRN, reorder
- More flow: dashboard, khata, finance, reports, customers, settings
- Offline: turn off WiFi, verify graceful degradation
- HID scanner: test barcode scan on sell + buy screens

### V3-056: Cross-device compatibility
- Test on Redmi (primary)
- Test on other Android phones if available
- Verify responsive layout on different screen sizes

## Summary

| Phase | Tickets | Description |
|-------|---------|-------------|
| A | V3-038..039 | GCP deploy + backend routes |
| B | V3-040..045 | Wire 6 remaining screens to real APIs |
| C | V3-046 | Splash animation + session check |
| D | V3-047..049 | Delete old code |
| E | V3-050..053 | Edge cases + polish |
| F | V3-054..056 | Device testing |

**Total: 19 remaining tickets (V3-038 → V3-056)**
**After completion: Old app fully replaced, v3 production-ready**
