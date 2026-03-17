# Deep Audit Tickets — 86 Atomic Production Tickets

> HEAD: 73601e9b | 106 fixes | Zero drift
> Source: 3 deep audit agents (screens, backend, App+stores)
> 7 CRITICAL already fixed in DEEP-001 commit

---

## CRITICAL (7 items — ALL FIXED in DEEP-001)

| # | Title | Status |
|---|-------|--------|
| DA-001 | errorHandler.ts:30 TS2698 spread type — CI blocker | FIXED |
| DA-002 | wholesaleFields.ts wrong storeId attribute (deviceStoreId) | FIXED |
| DA-003 | lastPurchase.ts wrong storeId attribute | FIXED |
| DA-004 | salesVelocity.ts wrong storeId attribute | FIXED |
| DA-005 | syncEvents.sse.ts wrong storeId attribute | FIXED |
| DA-006 | otpAuth.ts uses `devices` table instead of `pos_devices` | FIXED |
| DA-007 | otpAuth.ts wrong column names (token→device_token, status→active) | FIXED |

---

## HIGH (8 items)

### DA-008: PurchaseItemCardV3 — TextInputs in "new" product state NOT WIRED
- **Problem**: Lines 90-97 TextInputs for name, brand, category, pack size have no value/onChangeText props
- **Root Cause**: Component renders inputs but parent doesn't pass state setters
- **Files**: src/components/v3/PurchaseItemCardV3.tsx
- **Fix**: Add onNameChange, onBrandChange, onCategoryChange, onPackSizeChange callback props; wire to parent state in CounterPurchaseScreenV3
- **Acceptance**: User can type in all new product fields; values persist and submit with purchase
- **Regression Risk**: CounterPurchaseScreenV3 must handle new props

### DA-009: PaymentScreenV3 — Udhar TextInputs uncontrolled
- **Problem**: Customer name/phone inputs (lines 268-269) not wired to state
- **Root Cause**: TextInputs rendered without value/onChangeText
- **Files**: src/screens/v3/PaymentScreenV3.tsx
- **Fix**: Add customerName/customerPhone state; wire TextInputs; pass to recordDuePayment
- **Acceptance**: Udhar payment records customer name and phone
- **Regression Risk**: None (additive)

### DA-010: PaymentScreenV3 — No error recovery after failed sale creation
- **Problem**: If createSale fails, cart stays locked; user stuck
- **Root Cause**: catch block shows toast but doesn't unlockCart
- **Files**: src/screens/v3/PaymentScreenV3.tsx
- **Fix**: Add `useCartStore.getState().unlockCart()` in catch block
- **Acceptance**: After sale failure, user can modify cart and retry

### DA-011: SettingsScreenV3 — Language toggle doesn't call i18n.changeLanguage()
- **Problem**: Toggle shows toast but translation doesn't change
- **Root Cause**: Missing i18n.changeLanguage() call
- **Files**: src/screens/v3/SettingsScreenV3.tsx
- **Fix**: Import i18n, call i18n.changeLanguage("hi"/"en") on toggle
- **Acceptance**: Toggling language changes all t() strings immediately

### DA-012: SettingsScreenV3 — Switch Staff and Logout buttons have no onPress
- **Problem**: Buttons render but do nothing
- **Root Cause**: No handlers assigned
- **Files**: src/screens/v3/SettingsScreenV3.tsx
- **Fix**: Switch Staff → clearStaffSession + navigate to login; Logout → clearDeviceSession + navigate to Splash
- **Acceptance**: Both buttons navigate correctly; session cleared

### DA-013: ReorderScreenV3 — useEffect has no dependency array, runs every render
- **Problem**: Infinite re-fetch loop
- **Root Cause**: useEffect(() => { ... }) without []
- **Files**: src/screens/v3/ReorderScreenV3.tsx
- **Fix**: Add empty dependency array []
- **Acceptance**: Data fetches once on mount, not on every render

### DA-014: StockScreenV3 — useEffect has no dependency array, runs every render
- **Problem**: Same as DA-013
- **Files**: src/screens/v3/StockScreenV3.tsx
- **Fix**: Add empty dependency array []

### DA-015: PosRootLayoutV3 — Offline check interval has no cleanup
- **Problem**: setInterval(check, 15000) never cleared on unmount
- **Root Cause**: useEffect missing return cleanup
- **Files**: src/screens/v3/PosRootLayoutV3.tsx
- **Fix**: Add `return () => clearInterval(interval);`
- **Acceptance**: No memory leak when navigating away from POS

---

## MEDIUM (28 items)

### DA-016: BuyScreenV3 — ORDER button has no onPress handler
- **Files**: src/screens/v3/BuyScreenV3.tsx
- **Fix**: Wire to purchaseCartStore.submitOrders() or navigation

### DA-017: CompareScreenV3 — onOrder callback shows toast but doesn't navigate
- **Files**: src/screens/v3/CompareScreenV3.tsx
- **Fix**: Add to purchase cart + navigate back or show confirmation

### DA-018: CounterPurchaseScreenV3 — Supplier ADD (+) button has no handler
- **Files**: src/screens/v3/CounterPurchaseScreenV3.tsx
- **Fix**: Show supplier picker modal or navigate to supplier list

### DA-019: CounterPurchaseScreenV3 — "Add Manually" button only shows toast
- **Files**: src/screens/v3/CounterPurchaseScreenV3.tsx
- **Fix**: Add manual product entry row to items list

### DA-020: GRNScreenV3 — Camera scan button has no onPress handler
- **Files**: src/screens/v3/GRNScreenV3.tsx
- **Fix**: Navigate to V3Scan with GRN context

### DA-021: GRNScreenV3 — Match All button has no offline check
- **Files**: src/screens/v3/GRNScreenV3.tsx
- **Fix**: Add isOnline() before confirming receive

### DA-022: GRNScreenV3 — useEffect has no abort/cleanup
- **Files**: src/screens/v3/GRNScreenV3.tsx
- **Fix**: Add AbortController or mounted flag

### DA-023: KhataScreenV3 — COLLECT button has no onPress handler
- **Files**: src/screens/v3/KhataScreenV3.tsx
- **Fix**: Show payment collection modal (CASH/UPI)

### DA-024: ReorderScreenV3 — Approve button has no persistent state
- **Files**: src/screens/v3/ReorderScreenV3.tsx
- **Fix**: Wire to approvePendingReorders API

### DA-025: ReorderScreenV3 — Edit button has no onPress handler
- **Files**: src/screens/v3/ReorderScreenV3.tsx
- **Fix**: Show edit qty modal or inline edit

### DA-026: StockScreenV3 — Opening Stock and Barcode Labels buttons have no onPress
- **Files**: src/screens/v3/StockScreenV3.tsx
- **Fix**: Navigate to respective screens

### DA-027: ScanScreenV3 — Create button navigates without barcode param
- **Files**: src/screens/v3/ScanScreenV3.tsx
- **Fix**: Pass scanned barcode to V3NewProduct navigation params

### DA-028: ScanScreenV3 — HID scanner TextInput doesn't listen to hardware events
- **Files**: src/screens/v3/ScanScreenV3.tsx
- **Fix**: Wire hidScannerService listener to barcode input

### DA-029: SellScreenV3 — Search results not deduplicated by barcode
- **Files**: src/screens/v3/SellScreenV3.tsx
- **Fix**: Add dedup filter on flatMap results

### DA-030: SuccessScreenV3 — Void button has no implementation
- **Files**: src/screens/v3/SuccessScreenV3.tsx
- **Fix**: Wire to voidSale API with confirmation alert

### DA-031: FinanceScreenV3 — Apply Now button has no onPress handler
- **Files**: src/screens/v3/FinanceScreenV3.tsx
- **Fix**: Wire to applyForCredit API flow

### DA-032: PaymentScreenV3 — createSaleInFlight doesn't show "processing" state
- **Files**: src/screens/v3/PaymentScreenV3.tsx
- **Fix**: Show processing indicator when inFlight=true

### DA-033: PaymentScreenV3 — Split payment doesn't validate cash+remainder=total
- **Files**: src/screens/v3/PaymentScreenV3.tsx
- **Fix**: Add validation before confirm

### DA-034: OTPScreenV3 — Auto-submit can trigger twice
- **Files**: src/screens/v3/OTPScreenV3.tsx
- **Fix**: Add submitting ref guard

### DA-035: OTPScreenV3 — No timeout protection on verify
- **Files**: src/screens/v3/OTPScreenV3.tsx
- **Fix**: Add 15s timeout with AbortController

### DA-036: PhoneScreenV3 — Phone input accepts 15 chars but validates 10
- **Files**: src/screens/v3/PhoneScreenV3.tsx
- **Fix**: Set maxLength={10} on TextInput

### DA-037: SplashScreenV3 — onReady can be called twice
- **Files**: src/screens/v3/SplashScreenV3.tsx
- **Fix**: Add navigatedRef guard

### DA-038: SplashScreenV3 — fetchUiStatusStrict failure silent
- **Files**: src/screens/v3/SplashScreenV3.tsx
- **Fix**: Show "Continuing offline..." text when status check fails

### DA-039: cartStore — parkCart doesn't call recalculate() after clearing
- **Files**: src/stores/cartStore.ts
- **Fix**: Not needed (totals set to 0 explicitly); verify on resume

### DA-040: cartStore — Inconsistent capRequestedQuantity param ordering
- **Files**: src/stores/cartStore.ts lines 274, 345
- **Fix**: Document or standardize parameter order

### DA-041: BrandedHeader — isOnline hardcoded to true
- **Files**: src/components/v3/BrandedHeader.tsx
- **Fix**: Wire to network status check

### DA-042: V3ScreenWrappers — V3SuccessWrapper accesses cartStore without null check
- **Files**: src/screens/v3/V3ScreenWrappers.tsx
- **Fix**: Add optional chaining on cartStore.items

### DA-043: V3ScreenWrappers — V3CompareWrapper hardcodes static props
- **Files**: src/screens/v3/V3ScreenWrappers.tsx
- **Fix**: Read productName from route.params

---

## LOW (43 items)

### DA-044: CustomersScreenV3 — WhatsApp URL from customer.name not phone
- **Files**: src/screens/v3/CustomersScreenV3.tsx
- **Fix**: Use actual phone field from customer data

### DA-045: CustomersScreenV3 — No error indication when API fails
- **Files**: src/screens/v3/CustomersScreenV3.tsx
- **Fix**: Show error toast on fetch failure

### DA-046: BuyScreenV3 — useEffect missing getCatalog dependency
- **Files**: src/screens/v3/BuyScreenV3.tsx

### DA-047: CompareScreenV3 — useEffect could refetch on productName change
- **Files**: src/screens/v3/CompareScreenV3.tsx

### DA-048: CounterPurchaseScreenV3 — handleBarcodeScan missing try-catch
- **Files**: src/screens/v3/CounterPurchaseScreenV3.tsx

### DA-049: CounterPurchaseScreenV3 — supplierSelect is TextInput styled as dropdown
- **Files**: src/screens/v3/CounterPurchaseScreenV3.tsx

### DA-050: NewProductScreenV3 — Photo button tappable but non-functional
- **Files**: src/screens/v3/NewProductScreenV3.tsx
- **Fix**: Disable button or show "coming soon" badge

### DA-051: NewProductScreenV3 — No validation priceMinor > 0 before add
- **Files**: src/screens/v3/NewProductScreenV3.tsx

### DA-052: BillDetailScreenV3 — Print button not disabled during print
- **Files**: src/screens/v3/BillDetailScreenV3.tsx

### DA-053: SellScreenV3 — No search feedback for short queries
- **Files**: src/screens/v3/SellScreenV3.tsx

### DA-054: SellScreenV3 — cartSheetVisible no cleanup on unmount
- **Files**: src/screens/v3/SellScreenV3.tsx

### DA-055: SellScreenV3 — getCartQty useCallback deps
- **Files**: src/screens/v3/SellScreenV3.tsx

### DA-056: SuccessScreenV3 — Auto-print doesn't check printer connected
- **Files**: src/screens/v3/SuccessScreenV3.tsx

### DA-057: SuccessScreenV3 — WhatsApp share message not URL-encoded
- **Files**: src/screens/v3/SuccessScreenV3.tsx

### DA-058: MoreScreenV3 — getDailySummary called without offline notification
- **Files**: src/screens/v3/MoreScreenV3.tsx

### DA-059: ReportsScreenV3 — No cache, every tab switch refetches
- **Files**: src/screens/v3/ReportsScreenV3.tsx

### DA-060: ReportsScreenV3 — Payment split shows hardcoded data
- **Files**: src/screens/v3/ReportsScreenV3.tsx

### DA-061: ScanScreenV3 — handleScanSubmit validation unclear
- **Files**: src/screens/v3/ScanScreenV3.tsx

### DA-062: ScanScreenV3 — Context toggle doesn't filter products
- **Files**: src/screens/v3/ScanScreenV3.tsx

### DA-063: StoreHubScreenV3 — No storeId passed to getPurchaseHistory
- **Files**: src/screens/v3/StoreHubScreenV3.tsx

### DA-064: StoreHubScreenV3 — No distinction between empty and error
- **Files**: src/screens/v3/StoreHubScreenV3.tsx

### DA-065: StoreSelectScreenV3 — No empty stores validation
- **Files**: src/screens/v3/StoreSelectScreenV3.tsx

### DA-066: otpAuth.ts — Console.log outputs plaintext OTP
- **Files**: backend/src/routes/v1/pos/otpAuth.ts
- **Fix**: Remove or mask OTP in production logs

### DA-067: migration 191 — pos_otp in public schema (inconsistent)
- **Files**: backend/migrations/191_pos_otp_table.sql

### DA-068: admin/catalog.ts — Parameter injection risk without schema check
- **Files**: backend/src/routes/v1/admin/catalog.ts

### DA-069: CustomerTypeToggle — SellMode type duplicated from cartStore
- **Files**: src/components/v3/CustomerTypeToggle.tsx
- **Fix**: Import from cartStore only

### DA-070: UniversalSearchV3 — All results show hardcoded cookie emoji
- **Files**: src/components/v3/UniversalSearchV3.tsx
- **Fix**: Use product category for emoji

### DA-071: VoiceOverlayV3 — Matched product price hardcoded
- **Files**: src/components/v3/VoiceOverlayV3.tsx

### DA-072: PurchaseCartSummaryV3 — Assumes same creditDays for all items
- **Files**: src/components/v3/PurchaseCartSummaryV3.tsx

### DA-073: PurchaseItemCardV3 — Expandable batch/expiry inputs unwired
- **Files**: src/components/v3/PurchaseItemCardV3.tsx

### DA-074: CartSheetV3 — Discount/Customer use inline styles
- **Files**: src/components/v3/CartSheetV3.tsx

### DA-075: CartSheetV3 — GST assumes flat 18%
- **Files**: src/components/v3/CartSheetV3.tsx

### DA-076: App.tsx — Route name "SellScan" unclear
- **Files**: App.tsx

### DA-077: KhataScreenV3 — fetchCustomers race condition
- **Files**: src/screens/v3/KhataScreenV3.tsx

### DA-078: GRNScreenV3 — HID scanner not wired to TextInput
- **Files**: src/screens/v3/GRNScreenV3.tsx

### DA-079: CounterPurchaseScreenV3 — No invoiceNo format validation
- **Files**: src/screens/v3/CounterPurchaseScreenV3.tsx

### DA-080: FinanceScreenV3 — Promise.allSettled doesn't distinguish error vs disabled
- **Files**: src/screens/v3/FinanceScreenV3.tsx

### DA-081: BuyScreenV3 — handleQtyChange no integer validation
- **Files**: src/screens/v3/BuyScreenV3.tsx

### DA-082: BuyScreenV3 — No try-catch on navigation.navigate
- **Files**: src/screens/v3/BuyScreenV3.tsx

### DA-083: CompareScreenV3 — No loading state while rendering empty offers
- **Files**: src/screens/v3/CompareScreenV3.tsx

### DA-084: PaymentScreenV3 — UPI manual confirmation UX unclear
- **Files**: src/screens/v3/PaymentScreenV3.tsx

### DA-085: MoreScreenV3 — Navigation map inconsistency
- **Files**: src/screens/v3/MoreScreenV3.tsx

### DA-086: cartStore — parkCart totals verify on resume
- **Files**: src/stores/cartStore.ts

---

## Summary

| Severity | Count | Fixed | Remaining |
|----------|-------|-------|-----------|
| CRITICAL | 7 | 7 (DEEP-001) | 0 |
| HIGH | 8 | 0 | 8 |
| MEDIUM | 28 | 0 | 28 |
| LOW | 43 | 0 | 43 |
| **TOTAL** | **86** | **7** | **79** |

### Implementation Order
1. DA-008..015 (HIGH) — fix runtime/UX failures
2. DA-016..043 (MEDIUM) — complete wiring + handlers
3. DA-044..086 (LOW) — polish + edge cases
