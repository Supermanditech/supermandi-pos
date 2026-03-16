# V3 App Implementation Tickets

> **Source of truth**: https://supermanditech.github.io/supermandi-pos/RELEASES/supermandi-pos-v3.html
> **Directive**: All development must strictly follow the V3 UI prototype
> **Approach**: Full replacement of old 44-screen app with V3 21-screen architecture
> **Next ticket**: V3-001

---

## Gap Analysis Summary

| Area | Current State | Required State |
|------|--------------|----------------|
| **Sell flow** | SellScreenV3 reads real productsStore + cartStore | Wire scan, voice, payment navigation, checkout API |
| **Buy flow** | Demo data in BuyScreenV3 | Wire catalogApi, supplierApi, purchaseCartStore |
| **Store flow** | Demo data in GRN, Reorder, Stock | Wire grnApi, reorderApi, inventoryApi |
| **More flow** | Demo data in Khata, Reports, Customers | Wire khataStore, dailySummaryApi, customerStore |
| **Navigation** | Flat tabs only, no sub-screen navigation | React Navigation stack for all sub-screens |
| **Backend** | 4 new route files created, NOT registered | Register in app.ts, verify DB columns |
| **DB** | No wholesale columns on supplier_products | Migration 190+ for PTR/PTS/MOQ/scheme/trade_discount |
| **Offline** | Not wired in v3 screens | Reuse existing offline services |
| **Old screens** | 44 files still exist | Delete after v3 verified |

---

## Phase 1: Navigation & Routing (V3-001 → V3-005)

### V3-001: Wire React Navigation stack in PosRootLayoutV3
- Add NativeStackNavigator inside each tab for sub-screen navigation
- SELL tab: SellScreen → ScanScreen / VoiceOverlay / CartSheet → PaymentScreen → SuccessScreen
- BUY tab: BuyScreen → CompareScreen / CounterPurchaseScreen / NewProductScreen
- STORE tab: StoreHub → GRNScreen / ReorderScreen / StockScreen
- MORE tab: MoreScreen → KhataScreen / FinanceScreen / ReportsScreen / CustomersScreen / SettingsScreen
- **Files**: PosRootLayoutV3.tsx (major rewrite with navigation containers)

### V3-002: Wire CartSheet → Payment → Success flow
- CartSheetV3 onCheckout → navigate to PaymentScreenV3
- PaymentScreenV3 onComplete → call existing createSale API → navigate to SuccessScreenV3
- SuccessScreenV3 onNewSale → clearCart → navigate back to SellScreen
- **Files**: CartSheetV3.tsx, PaymentScreenV3.tsx, SuccessScreenV3.tsx

### V3-003: Wire ScanScreen + VoiceOverlay from SellScreen
- Scan icon in SellScreenV3 → open ScanScreenV3 as modal
- ScanScreenV3 onProductFound → add to cart via cartStore → dismiss
- ScanScreenV3 onNewProduct → open NewProductScreenV3
- Voice button → VoiceOverlayV3 onProductMatched → add to cart
- **Files**: SellScreenV3.tsx, ScanScreenV3.tsx, VoiceOverlayV3.tsx, NewProductScreenV3.tsx

### V3-004: Wire BUY sub-screens
- BuyScreenV3 product tap → CompareScreenV3
- BuyScreenV3 Counter Purchase CTA → CounterPurchaseScreenV3
- BuyScreenV3 scan button → ScanScreenV3 (stock_in context)
- **Files**: BuyScreenV3.tsx, CompareScreenV3.tsx, CounterPurchaseScreenV3.tsx

### V3-005: Wire MORE sub-screens
- MoreScreenV3 menu items → navigate to KhataScreenV3, FinanceScreenV3, ReportsScreenV3, CustomersScreenV3, SettingsScreenV3, StockScreenV3
- Back buttons on all sub-screens → navigate back to MoreScreen
- **Files**: MoreScreenV3.tsx, all sub-screen onClose callbacks

---

## Phase 2: Real Data Wiring — SELL Flow (V3-006 → V3-012)

### V3-006: SellScreenV3 — full product grid with real data
- Already reads productsStore ✓
- Add pull-to-refresh (checkAndRefresh)
- Add category filtering from real categories (getFmcgCategories API)
- Add search integration (sellSearchApi) replacing placeholder onfocus
- Wire offline product cache (existing offlineDb)
- **Files**: SellScreenV3.tsx

### V3-007: CartSheetV3 — real cart with existing cartStore
- Already reads cartStore ✓
- Wire discount section (applyDiscount, removeDiscount)
- Wire customer info (setCartCustomer for DUE sales)
- Wire parked carts (existing park/resume logic from SellScanScreen)
- Add swipe-to-delete on cart items
- **Files**: CartSheetV3.tsx, CartItemRowV3.tsx

### V3-008: PaymentScreenV3 — wire createSale API
- Connect to existing createSale service
- Wire UPI payment flow (existing UPI QR + polling)
- Wire cash payment with change calculation
- Wire DUE/Udhar with customer selection from customerStore
- Wire split payment modal
- Stock validation before sale (GO-LIVE-233)
- Cart lock during payment (existing lockCart/unlockCart)
- **Files**: PaymentScreenV3.tsx

### V3-009: SuccessScreenV3 — wire receipt printing + WhatsApp
- Connect to existing printerService for auto-print
- Calculate real profit from cart items (cost vs sell price)
- Wire WhatsApp bill send (existing share logic)
- Wire void/refund (existing refund API)
- Sale streak from AsyncStorage (count bills today)
- **Files**: SuccessScreenV3.tsx

### V3-010: ScanScreenV3 — wire real barcode handling
- Connect to existing onBarcodeScanned from handleScan.ts
- Wire HID scanner service (existing hidScannerService)
- Wire camera barcode (existing CameraView + expo-camera)
- Context-aware: sell → addToCart, stock_in → stockInApi, new_product → navigate
- **Files**: ScanScreenV3.tsx

### V3-011: VoiceOverlayV3 — wire real voice service
- Connect to existing startRecording, stopRecording, submitVoiceCommand
- Wire voice result → product match → addToCart
- Wire clarification flow (VoiceClarifyOption)
- Wire rate limiting (VoiceRateLimitError)
- **Files**: VoiceOverlayV3.tsx

### V3-012: NewProductScreenV3 — wire product creation
- Connect to existing upsertLocalProduct from scan service
- Wire photo capture (expo-image-picker or camera)
- Wire master DB lookup (new API from STG-579 — register route)
- Save to offlineDb + sync to backend
- **Files**: NewProductScreenV3.tsx

---

## Phase 3: Real Data Wiring — BUY Flow (V3-013 → V3-018)

### V3-013: BuyScreenV3 — wire supplier catalogue API
- Replace DEMO_PRODUCTS with real catalogApi.getSupplierProducts()
- Wire supplier filter from real suppliersApi
- Wire category filter from real categories
- Wire search (catalogApi.searchProducts)
- Wire purchase cart strip from purchaseCartStore
- **Files**: BuyScreenV3.tsx

### V3-014: CompareScreenV3 — wire supplier comparison API
- Replace DEMO_OFFERS with real wholesaleFields API (STG-577 — register route)
- Wire order action → create purchase order via purchaseApi
- Show real current stock and sell price from store inventory
- Calculate real weekly need from sales velocity API (STG-580)
- **Files**: CompareScreenV3.tsx

### V3-015: CounterPurchaseScreenV3 — wire scan + purchase creation
- Wire barcode scan → real product lookup (existing + master DB)
- Wire repeat detection from lastPurchase API (STG-578 — register route)
- Wire supplier selection from suppliersApi
- Wire purchase creation → existing createPurchase service
- Wire stock update after purchase confirmation
- **Files**: CounterPurchaseScreenV3.tsx, PurchaseItemCardV3.tsx

### V3-016: Register 4 new backend routes in Express app
- Register posWholesaleRouter in app.ts
- Register posLastPurchaseRouter in app.ts
- Register posMasterCatalogRouter in app.ts
- Register posSalesVelocityRouter in app.ts
- Verify all SQL queries against actual DB schema
- **Files**: backend/src/app.ts, 4 route files

### V3-017: Migration 190 — wholesale fields on supplier_products
- ADD COLUMN ptr_minor INTEGER (price to retailer)
- ADD COLUMN pts_minor INTEGER (price to stockist)
- ADD COLUMN trade_discount_pct NUMERIC(5,2)
- ADD COLUMN scheme VARCHAR(100)
- ADD COLUMN moq INTEGER DEFAULT 1
- ADD COLUMN credit_days INTEGER
- ADD COLUMN delivery_days INTEGER
- ADD COLUMN bnpl_available BOOLEAN DEFAULT false
- All nullable, no existing data affected
- ROLLBACK comment included
- **Files**: backend/migrations/190_wholesale_fields.sql

### V3-018: PurchaseCartSummaryV3 — wire real GST calculation
- Connect to real purchaseCartStore
- Calculate GST per item based on actual gst_pct from product data
- Wire trade discount from supplier trade terms
- **Files**: PurchaseCartSummaryV3.tsx, whatsappPurchaseOrder.ts

---

## Phase 4: Real Data Wiring — STORE Flow (V3-019 → V3-022)

### V3-019: StoreHubScreenV3 — wire real recent orders
- Replace RECENT_ORDERS with real purchaseHistoryApi
- Wire navigation to sub-screens via React Navigation
- **Files**: StoreHubScreenV3.tsx

### V3-020: GRNScreenV3 — wire real GRN API
- Replace DEMO_ITEMS with real GRN items from pending POs (grnApi)
- Wire barcode scan → match to PO item
- Wire receive confirmation → existing receiveGoods API
- Wire stock update after GRN
- **Files**: GRNScreenV3.tsx

### V3-021: ReorderScreenV3 — wire real reorder API
- Replace DEMO with real pending reorders from reorderApi
- Wire sales velocity for "days of stock" (STG-580 API)
- Wire approve → create draft PO → navigate to BUY
- Wire WhatsApp send to suppliers
- **Files**: ReorderScreenV3.tsx

### V3-022: StockScreenV3 — wire real inventory
- Replace DEMO with real inventoryApi.getStockStatement()
- Wire search from store products
- Wire opening stock entry
- Wire barcode labels navigation
- **Files**: StockScreenV3.tsx

---

## Phase 5: Real Data Wiring — MORE Flow (V3-023 → V3-028)

### V3-023: MoreScreenV3 — wire real dashboard data
- Replace hardcoded stats with real dailySummaryApi
- Wire morning brief from yesterday's actual data
- Wire low stock alert count from reorderApi
- Wire udhar pending from khataStore
- **Files**: MoreScreenV3.tsx

### V3-024: KhataScreenV3 — wire real khata store
- Replace demo customers with real khataStore.fetchCustomers()
- Wire add credit entry, record payment
- Wire WhatsApp remind per customer
- Wire bulk remind all overdue
- Wire void entry
- **Files**: KhataScreenV3.tsx

### V3-025: FinanceScreenV3 — wire credit API
- Wire creditApi.getCreditOffers() for offers tab
- Wire creditApi.getCreditApplications() for loans tab
- Wire BNPL integration (bnplApi)
- Feature gate (creditEnabled flag)
- **Files**: FinanceScreenV3.tsx

### V3-026: ReportsScreenV3 — wire real report APIs
- Wire dailySummaryApi for today/week/month data
- Wire payment split from real sales data
- Wire print + PDF + WhatsApp share
- **Files**: ReportsScreenV3.tsx

### V3-027: CustomersScreenV3 — wire real customer store
- Replace DEMO with real customerStore or customersApi
- Wire add customer
- Wire WhatsApp contact
- Wire customer detail (purchase history)
- **Files**: CustomersScreenV3.tsx

### V3-028: SettingsScreenV3 — wire real settings
- Already reads settingsStore ✓
- Wire printer test (printerService)
- Wire HID scanner status (hidScannerService)
- Wire sync now (syncService)
- Wire staff switch / store switch / logout
- **Files**: SettingsScreenV3.tsx

---

## Phase 6: Offline + Sync + Edge Cases (V3-029 → V3-033)

### V3-029: Offline product cache in SellScreenV3
- Wire existing offlineDb for product search when offline
- Show OfflineBanner from existing component
- Queue sales in existing outbox when offline
- **Files**: SellScreenV3.tsx

### V3-030: Offline purchase queue
- Queue purchases in offline outbox when offline
- Sync on reconnect
- Show pending count badge
- **Files**: CounterPurchaseScreenV3.tsx, BuyScreenV3.tsx

### V3-031: Error states on all v3 screens
- Add error boundary per screen (already have ScreenErrorBoundary)
- Add API error handling (try/catch → error toast)
- Add retry buttons on failed loads
- **Files**: All v3 screens

### V3-032: Loading states on all v3 screens
- Add ActivityIndicator for initial data loads
- Add skeleton loading for lists
- **Files**: All v3 screens with API calls

### V3-033: Empty states on all v3 screens
- "No products" on sell (already done ✓)
- "No orders" on purchase history
- "No customers" on khata/customers
- "No data" on reports
- **Files**: All v3 screens with lists

---

## Phase 7: Delete Old + Cleanup (V3-034 → V3-038)

### V3-034: Delete old 44 screen files
- Remove all src/screens/*.tsx (except v3/ folder)
- Remove unused old components
- Verify app still builds and runs
- **Files**: 44 old screen files

### V3-035: Delete old unused components
- Remove components only used by deleted screens
- Keep shared components used by v3 (ErrorBoundary, AppText, etc.)
- **Files**: ~20 old component files

### V3-036: Update FIX_LEDGER — SUPERSEDE old entries
- Mark all fixes in deleted files as SUPERSEDED
- Register new fixes for v3 files
- **Files**: RELEASES/FIX_LEDGER.json

### V3-037: Update navigation exports
- Remove old screen imports from App.tsx / navigation
- Ensure only v3 screens are importable
- Clean up dead imports
- **Files**: App.tsx, navigation files

### V3-038: Final build + device test + staging deploy
- Full typecheck
- Full test suite
- APK build + device test on Redmi
- Staging deploy via CD pipeline
- Operator E2E verification
- **Files**: CI/CD, APK

---

## Phase 8: POS Device + Android Compatibility (V3-039 → V3-042)

### V3-039: Sunmi POS device testing
- Test HID scanner integration
- Test thermal printer
- Test screen dimensions (compact display)
- **Device**: Sunmi T2 / V2

### V3-040: Multi-device Android testing
- Test on 5" budget phone (2GB RAM)
- Test on 6.5" mid-range
- Test on 8" tablet
- Verify responsive grid (2-col on small, 3-col on medium, 4-col on tablet)
- **Devices**: Various Android 8+

### V3-041: Performance optimization
- Disable animations on low-end devices (< 3GB RAM)
- Optimize FlatList rendering (windowSize, removeClippedSubviews)
- Lazy load heavy screens (Finance, Reports)
- **Files**: All v3 screens

### V3-042: Accessibility audit
- Verify all accessibilityLabel/accessibilityRole
- Test with TalkBack
- Ensure minimum 48dp touch targets
- **Files**: All v3 components

---

## Summary

| Phase | Tickets | Focus |
|-------|---------|-------|
| 1 | V3-001 → V3-005 | Navigation + routing |
| 2 | V3-006 → V3-012 | Sell flow real data |
| 3 | V3-013 → V3-018 | Buy flow + backend + migration |
| 4 | V3-019 → V3-022 | Store flow real data |
| 5 | V3-023 → V3-028 | More/Dashboard real data |
| 6 | V3-029 → V3-033 | Offline + edge cases |
| 7 | V3-034 → V3-038 | Delete old + cleanup |
| 8 | V3-039 → V3-042 | Device compatibility |

**Total: 42 tickets (V3-001 → V3-042)**
**Start: V3-001 (Navigation wiring)**
**End: V3-042 (Accessibility audit)**
