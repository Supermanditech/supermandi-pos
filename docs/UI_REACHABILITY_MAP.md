# UI Reachability Map

> Generated: 2026-01-15
> Purpose: Complete screen inventory with navigation paths, feature gates, and backend dependencies.

---

## Navigation Architecture

- **Framework:** React Navigation (Native Stack Navigator)
- **Entry Point:** `App.tsx`
- **Initial Route:** `Splash`
- **Root Container:** `PosRootLayout` (4-tab interface: MENU, SELL, BUY, REORDER)

---

## Screen Inventory

### Legend

| Status | Meaning |
|--------|---------|
| ✅ Reachable | Screen is accessible via documented entry points |
| 🟠 Blocked | Screen exists but gated by flag/state (intentional) |
| ❌ Orphaned | Screen exists in code but has no entry point |

---

## 1. Authentication & Onboarding

| ScreenName | RouteName | Entry Point(s) | Required Flags | Required Data State | Tap Chain | Backend Dependencies | Status |
|------------|-----------|----------------|----------------|---------------------|-----------|---------------------|--------|
| **SplashScreen** | `Splash` | App launch (initial route) | None | None | App Start | `getDeviceSession()` (local), `initOfflineDb()`, `startCloudEventLogger()` | ✅ Reachable |
| **EnrollDeviceScreen** | `EnrollDevice` | Splash (no session), Menu → Switch Store | None | No active device session | App Start → Auto-redirect OR MENU → Switch Store → Confirm | `POST /devices/enroll` | ✅ Reachable |
| **DeviceBlockedScreen** | `DeviceBlocked` | PosRootLayout (deviceActive=false), API error handling | deviceActive=false | Device blocked by admin | App Start → Auto-redirect (if blocked) | `GET /ui-status` returns deviceActive=false | 🟠 Blocked (by design) |

---

## 2. Main POS Interface (Tab Container)

| ScreenName | RouteName | Entry Point(s) | Required Flags | Required Data State | Tap Chain | Backend Dependencies | Status |
|------------|-----------|----------------|----------------|---------------------|-----------|---------------------|--------|
| **PosRootLayout** | `SellScan` | Splash (valid session) | None | Valid device session | App Start → Auto-redirect (if enrolled) | `GET /ui-status` (polls 15s), `GET /devices/{id}` (polls 5min), `GET /reorders/pending` (polls 60s) | ✅ Reachable |

### Tab Screens (rendered within PosRootLayout)

| ScreenName | Tab ID | Entry Point(s) | Required Flags | Required Data State | Tap Chain | Backend Dependencies | Status |
|------------|--------|----------------|----------------|---------------------|-----------|---------------------|--------|
| **MenuScreen** | `MENU` | Tab bar (always visible) | None | storeActive=any (accessible even when inactive) | POS Home → MENU tab | `GET /ui-status`, `getDeviceToken()` | ✅ Reachable |
| **SellScanScreen** | `SELL` | Tab bar (always visible), default on load | storeActive=true | Empty OK (shows scan prompt) | POS Home → SELL tab | `POST /scan/resolve`, `POST /sales`, stock cache | ✅ Reachable |
| **BuyScreen** | `PURCHASE` | Tab bar (conditional) | `buyEnabled=true` | Empty OK (shows empty catalog) | POS Home → BUY tab | `GET /catalogs`, `GET /catalogs/categories` | 🟠 Blocked (if buyEnabled=false) |
| **ReorderScreen** | `REORDER` | Tab bar (conditional) | `reorderEnabled=true` | Empty OK (shows no pending reorders) | POS Home → REORDER tab | `GET /reorders/pending`, `POST /reorders/{id}/approve`, `POST /reorders/{id}/dismiss` | 🟠 Blocked (if reorderEnabled=false) |

---

## 3. Menu Screen Navigation Targets

| ScreenName | RouteName | Entry Point(s) | Required Flags | Required Data State | Tap Chain | Backend Dependencies | Status |
|------------|-----------|----------------|----------------|---------------------|-----------|---------------------|--------|
| **SalesHistoryScreen** | `SalesHistory` | Menu → Sales History | None | Empty OK (shows "No bills yet") | MENU → Sales History | `GET /sales` (bills list) | ✅ Reachable |
| **BarcodeSheetScreen** | `BarcodeSheet` | Menu → Barcode Sheets | None | Empty OK (tier selection shows) | MENU → Barcode Sheets | `GET /barcodes/sheets/{tier}` | ✅ Reachable |
| **OrderHistoryScreen** | `OrderHistory` | Menu → Purchase Orders | `buyEnabled=true` | Empty OK (shows "No orders") | MENU → Purchase Orders | `GET /orders` | 🟠 Blocked (if buyEnabled=false) |
| **ReorderSettingsScreen** | `ReorderSettings` | Menu → Reorder Settings | `reorderEnabled=true` | None | MENU → Reorder Settings | `GET /stores/{id}/reorder-settings`, `PUT /stores/{id}/reorder-settings` | 🟠 Blocked (if reorderEnabled=false) |
| **ReorderPoliciesScreen** | `ReorderPolicies` | Menu → Reorder Policies, ReorderSettings → Policies link | `reorderEnabled=true` | Empty OK (shows "No policies") | MENU → Reorder Policies OR MENU → Reorder Settings → Manage Policies | `GET /stores/{id}/policies`, `PUT /stores/{id}/policies/{id}` | 🟠 Blocked (if reorderEnabled=false) |
| **InwardScreen** | `Inward` | Menu → Stock Inward | None | Empty OK (shows scan prompt) | MENU → Stock Inward | `POST /inventory/inward`, `GET /catalogs` | ✅ Reachable |
| **PurchaseHistoryScreen** | `PurchaseHistory` | Menu → Purchase History | None | Empty OK (shows "No purchases") | MENU → Purchase History | `GET /inventory/ledger?type=purchase` | ✅ Reachable |
| **SalesStatementScreen** | `SalesStatement` | Menu → Sales Statement | None | Empty OK (shows "No sales") | MENU → Sales Statement | `GET /inventory/ledger?type=sales` | ✅ Reachable |
| **StockStatementScreen** | `StockStatement` | Menu → Stock Statement | None | Empty OK (shows "No products") | MENU → Stock Statement | `GET /catalogs` (with stock) | ✅ Reachable |
| **UiShowcaseScreen** | `UiShowcase` | Menu → UI Showcase | `isQaMenuEnabled()=true` | None | MENU → UI Showcase (QA only) | None | 🟠 Blocked (QA flag required) |

---

## 4. Sales Flow Screens

| ScreenName | RouteName | Entry Point(s) | Required Flags | Required Data State | Tap Chain | Backend Dependencies | Status |
|------------|-----------|----------------|----------------|---------------------|-----------|---------------------|--------|
| **PaymentScreen** | `Payment` | SellScanScreen → Checkout button | storeActive=true | Cart has ≥1 item | SELL → Add Items → Checkout | `POST /sales`, `POST /payments/upi/init` | ✅ Reachable |
| **SuccessPrintScreenV2** | `SuccessPrint` | PaymentScreen → Payment complete | None | Valid sale transaction | SELL → Checkout → Payment → Success | `printerService.print()`, `logPosEvent()` | ✅ Reachable |
| **BillDetailScreen** | `BillDetail` | SalesHistoryScreen → Bill row tap | None | Valid saleId | MENU → Sales History → Select Bill | `GET /sales/{id}/bill` | ✅ Reachable |

---

## 5. Purchase Order Flow Screens

| ScreenName | RouteName | Entry Point(s) | Required Flags | Required Data State | Tap Chain | Backend Dependencies | Status |
|------------|-----------|----------------|----------------|---------------------|-----------|---------------------|--------|
| **OrderDetailScreen** | `OrderDetail` | OrderHistoryScreen → Order row tap | `buyEnabled=true` | Valid orderId | MENU → Purchase Orders → Select Order | `GET /orders/{id}`, `GET /orders/{id}/events` | 🟠 Blocked (if buyEnabled=false) |
| **GRNScreen** | `GRN` | OrderDetailScreen → Receive Goods button | `buyEnabled=true` | Order status=shipped/confirmed | MENU → Purchase Orders → Select Order → Receive Goods | `GET /orders/{id}`, `POST /orders/{id}/receive` | 🟠 Blocked (if buyEnabled=false) |

---

## 6. Modals (within screens)

| ModalName | Parent Screen | Entry Point(s) | Required Flags | Required Data State | Tap Chain | Backend Dependencies | Status |
|-----------|---------------|----------------|----------------|---------------------|-----------|---------------------|--------|
| **ProductDetailModal** | BuyScreen | Product card tap in catalog grid | `buyEnabled=true` | Product selected | BUY → Tap Product | None (data from parent) | ✅ Reachable |
| **PurchaseCartModal** | BuyScreen | Cart icon button | `buyEnabled=true` | Cart has ≥0 items | BUY → Tap Cart Icon | `POST /orders`, `POST /orders/{id}/place` | ✅ Reachable |
| **SkuPickerModal** | SellScanScreen | Duplicate barcode scan | None | Multiple SKUs match barcode | SELL → Scan Duplicate Barcode | None (data from scan result) | ✅ Reachable |
| **EditReorderModal** | ReorderScreen | Pending reorder card → Edit | `reorderEnabled=true` | Pending reorder selected | REORDER → Select Item → Edit | `GET /catalogs/products/{id}/suppliers` | ✅ Reachable |
| **DismissReasonModal** | ReorderScreen | Pending reorder card → Dismiss | `reorderEnabled=true` | Pending reorder selected | REORDER → Select Item → Dismiss | None | ✅ Reachable |
| **EditPolicyModal** | ReorderPoliciesScreen | Policy row tap | `reorderEnabled=true` | Policy selected | MENU → Reorder Policies → Select Policy | None (data from parent) | ✅ Reachable |
| **CameraScannerModal** | PosRootLayout | Camera button (SELL/BUY modes) | cameraPermission granted, storeActive=true | None | SELL → Tap Camera Icon | None | ✅ Reachable |
| **SellFirstOnboardingModal** | SellScanScreen | New product scan (no price set) | None | Product has no store_product record | SELL → Scan New Product | Inline in SellScanScreen | ✅ Reachable |

---

## 7. Feature Flag Reference

| Flag Key | Store Location | Source | Controls |
|----------|----------------|--------|----------|
| `buyEnabled` | `settingsStore.buyEnabled` | `GET /ui-status` → `features.buyEnabled` (or `features.ordersEnabled`) | BUY tab visibility, Purchase Orders menu, OrderHistory/OrderDetail/GRN screens |
| `reorderEnabled` | `settingsStore.reorderEnabled` | `GET /ui-status` → `features.reorderEnabled` | REORDER tab visibility, Reorder Settings/Policies menus |
| `storeActive` | PosRootLayout state | `GET /ui-status` → `storeActive` | Disables all tabs except MENU, blocks scanning |
| `deviceActive` | PosRootLayout state | `GET /ui-status` → `deviceActive` | Redirects to DeviceBlocked screen |
| `isQaMenuEnabled()` | `UiShowcaseScreen.tsx` export | `__DEV__` or env flag | UiShowcase screen visibility |
| `scan_lookup_v2` | PosRootLayout state | `GET /ui-status` → `features.scan_lookup_v2` | Scan API version selection |

---

## 8. Navigation Route Map (Stack)

```
Root Stack Navigator (initialRouteName: "Splash")
│
├── Splash                    → EnrollDevice (no session) OR SellScan (valid session)
│
├── EnrollDevice              → SellScan (on success)
│
├── DeviceBlocked             → (terminal, manual reload required)
│
├── SellScan (PosRootLayout)  ─┬─ Tab: MENU ───────── MenuScreen
│                              ├─ Tab: SELL ───────── SellScanScreen
│                              ├─ Tab: PURCHASE ───── BuyScreen (if buyEnabled)
│                              └─ Tab: REORDER ────── ReorderScreen (if reorderEnabled)
│
├── Payment                   ← SellScanScreen (checkout)
│                             → SuccessPrint (on payment success)
│
├── SuccessPrint              → SellScan (stack reset)
│
├── SalesHistory              ← MenuScreen
│                             → BillDetail (on bill tap)
│
├── BillDetail                ← SalesHistory
│
├── BarcodeSheet              ← MenuScreen
│
├── OrderHistory              ← MenuScreen (if buyEnabled)
│                             → OrderDetail (on order tap)
│
├── OrderDetail               ← OrderHistory
│                             → GRN (on receive goods)
│
├── GRN                       ← OrderDetail
│                             → OrderDetail (on success, goBack)
│
├── ReorderSettings           ← MenuScreen (if reorderEnabled)
│                             → ReorderPolicies (on link tap)
│
├── ReorderPolicies           ← MenuScreen OR ReorderSettings
│
├── Inward                    ← MenuScreen
│
├── PurchaseHistory           ← MenuScreen
│
├── SalesStatement            ← MenuScreen
│
├── StockStatement            ← MenuScreen
│
└── UiShowcase                ← MenuScreen (if isQaMenuEnabled)
```

---

## 9. Tap Chain Examples (3+ depth)

### Flow 1: Complete Sale (SELL)
```
1st: POS Home (SELL tab active by default)
2nd: Scan/Add product to cart
3rd: Tap "Checkout" button
4th: PaymentScreen → Select payment method (UPI/CASH/DUE)
5th: Confirm payment
6th: SuccessPrintScreen → Print receipt
7th: Auto-return to SellScanScreen (cart cleared)
```

### Flow 2: Create Purchase Order (BUY)
```
1st: POS Home → BUY tab
2nd: Browse/Search catalog → Tap product card
3rd: ProductDetailModal → Select supplier, set qty → Add to Cart
4th: Tap Cart icon → PurchaseCartModal
5th: Review items → Tap "Place Order"
6th: Order created → Toast confirmation
```

### Flow 3: Receive Goods (GRN)
```
1st: POS Home → MENU tab
2nd: Tap "Purchase Orders"
3rd: OrderHistoryScreen → Tap order row
4th: OrderDetailScreen → Tap "Receive Goods"
5th: GRNScreen → Enter received quantities
6th: Submit → Order marked received
7th: Auto-return to OrderDetailScreen
```

### Flow 4: Approve Reorder
```
1st: POS Home → REORDER tab
2nd: ReorderScreen → View pending suggestions
3rd: Tap checkbox to select item(s)
4th: Tap "Approve" (or tap item → EditReorderModal → modify → Save)
5th: Items added to purchase cart / order created
```

### Flow 5: View & Reprint Bill
```
1st: POS Home → MENU tab
2nd: Tap "Sales History"
3rd: SalesHistoryScreen → Tap bill row
4th: BillDetailScreen → Tap "Reprint"
5th: Receipt printed
```

### Flow 6: Switch Store
```
1st: POS Home → MENU tab
2nd: Scroll to Settings section
3rd: Tap "Switch Store"
4th: Confirm dialog → "Switch"
5th: Session cleared → EnrollDeviceScreen
```

---

## 10. API Endpoints by Screen

| Screen | Endpoints Used |
|--------|----------------|
| **SplashScreen** | `getDeviceSession()` (local) |
| **EnrollDeviceScreen** | `POST /devices/enroll` |
| **PosRootLayout** | `GET /ui-status`, `GET /devices/{id}`, `GET /reorders/pending` |
| **MenuScreen** | `GET /ui-status`, `getDeviceToken()` |
| **SellScanScreen** | `POST /scan/resolve`, stock cache reads |
| **PaymentScreen** | `POST /sales`, `POST /payments/upi/init` |
| **SuccessPrintScreen** | `printerService.print()` |
| **BuyScreen** | `GET /catalogs`, `GET /catalogs/categories` |
| **ProductDetailModal** | (data from parent) |
| **PurchaseCartModal** | `POST /orders`, `POST /orders/{id}/place` |
| **OrderHistoryScreen** | `GET /orders` |
| **OrderDetailScreen** | `GET /orders/{id}`, `GET /orders/{id}/events`, `DELETE /orders/{id}` |
| **GRNScreen** | `GET /orders/{id}`, `POST /orders/{id}/receive` |
| **ReorderScreen** | `GET /reorders/pending`, `POST /reorders/{id}/approve`, `POST /reorders/{id}/dismiss` |
| **ReorderSettingsScreen** | `GET /stores/{id}/reorder-settings`, `PUT /stores/{id}/reorder-settings` |
| **ReorderPoliciesScreen** | `GET /stores/{id}/policies`, `PUT /stores/{id}/policies/{id}` |
| **InwardScreen** | `POST /inventory/inward`, `GET /catalogs` |
| **SalesHistoryScreen** | `GET /sales` |
| **BillDetailScreen** | `GET /sales/{id}/bill` |
| **PurchaseHistoryScreen** | `GET /inventory/ledger?type=purchase` |
| **SalesStatementScreen** | `GET /inventory/ledger?type=sales` |
| **StockStatementScreen** | `GET /catalogs` |
| **BarcodeSheetScreen** | `GET /barcodes/sheets/{tier}` |

---

## 11. Empty State Requirements

| Screen | Empty State Behavior | Safe for Go-Live (Empty DB)? |
|--------|---------------------|------------------------------|
| **SellScanScreen** | Shows scan prompt, empty cart | ✅ Yes |
| **BuyScreen** | Shows "No products" in grid | ✅ Yes |
| **ReorderScreen** | Shows "No pending reorders" | ✅ Yes |
| **SalesHistoryScreen** | Shows "No bills yet" | ✅ Yes |
| **OrderHistoryScreen** | Shows "No orders" | ✅ Yes |
| **ReorderPoliciesScreen** | Shows "No policies" | ✅ Yes |
| **PurchaseHistoryScreen** | Shows "No purchases" | ✅ Yes |
| **SalesStatementScreen** | Shows "No sales" | ✅ Yes |
| **StockStatementScreen** | Shows "No products" | ✅ Yes |
| **BarcodeSheetScreen** | Tier selection works, empty list if no products | ✅ Yes |

---

## 12. Files Reference

### Screens (`src/screens/`)
- `SplashScreen.tsx`
- `EnrollDeviceScreen.tsx`
- `DeviceBlockedScreen.tsx`
- `PosRootLayout.tsx`
- `MenuScreen.tsx`
- `SellScanScreen.tsx`
- `PaymentScreen.tsx`
- `SuccessPrintScreenV2.tsx`
- `BuyScreen.tsx`
- `OrderHistoryScreen.tsx`
- `OrderDetailScreen.tsx`
- `GRNScreen.tsx`
- `ReorderScreen.tsx`
- `ReorderSettingsScreen.tsx`
- `ReorderPoliciesScreen.tsx`
- `InwardScreen.tsx`
- `SalesHistoryScreen.tsx`
- `BillDetailScreen.tsx`
- `PurchaseHistoryScreen.tsx`
- `SalesStatementScreen.tsx`
- `StockStatementScreen.tsx`
- `BarcodeSheetScreen.tsx`
- `UiShowcaseScreen.tsx`

### Modal Components (`src/components/`)
- `buy/ProductDetailModal.tsx`
- `buy/PurchaseCartModal.tsx`
- `sell/SkuPickerModal.tsx`
- `reorder/EditReorderModal.tsx`
- `reorder/DismissReasonModal.tsx`
- `reorder/EditPolicyModal.tsx`

### API Services (`src/services/api/`)
- `apiClient.ts`
- `posApi.ts`
- `billingApi.ts`
- `catalogApi.ts`
- `orderApi.ts`
- `reorderApi.ts`
- `enrollApi.ts`
- `inventoryApi.ts`
- `sellSearchApi.ts`
- `scanApi.ts`
- `uiStatusApi.ts`
- `authApi.ts`
- `storeApi.ts`
- `transactionsApi.ts`
- `productsApi.ts`

### Stores (`src/stores/`)
- `settingsStore.ts` - Feature flags (buyEnabled, reorderEnabled, language)
- `cartStore.ts` - SELL cart items
- `purchaseCartStore.ts` - BUY cart items
- `purchaseDraftStore.ts` - Purchase draft state
- `productsStore.ts` - Products cache

---

## Summary

- **Total Screens:** 23
- **Total Modals:** 7
- **Always Reachable:** 16 screens
- **Feature-Gated:** 6 screens (BUY/REORDER features)
- **QA-Only:** 1 screen (UiShowcase)
- **Orphaned:** 0 (all screens have entry points)
