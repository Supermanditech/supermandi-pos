# UI Visibility Map

> Generated: 2026-01-15
> Audit of all screens, modals, and navigation paths

---

## Stack Screens (Navigation Stack)

| Screen | Route | Entry Path | Feature Gate | Data Source | Status |
|--------|-------|------------|--------------|-------------|--------|
| SplashScreen | `Splash` | App launch | None | None | ✅ Reachable |
| EnrollDeviceScreen | `EnrollDevice` | Splash → Enroll OR Menu → Switch Store | None | enrollApi | ✅ Reachable |
| DeviceBlockedScreen | `DeviceBlocked` | Auto-redirect if device blocked | None | ui-status | ✅ Reachable |
| PosRootLayout | `SellScan` | After enrollment | None | ui-status, cartStore | ✅ Reachable |
| PaymentScreen | `Payment` | SELL → Cart → Checkout | None | posApi, billingApi | ✅ Reachable |
| SuccessPrintScreen | `SuccessPrint` | Payment → Success | None | Print data from Payment | ✅ Reachable |
| SalesHistoryScreen | `SalesHistory` | Menu → Bills/Sales History | None | billingApi `/bills` | ✅ Reachable |
| BillDetailScreen | `BillDetail` | SalesHistory → Tap bill | None | billingApi `/bills/:id` | ✅ Reachable (needs saleId) |
| BarcodeSheetScreen | `BarcodeSheet` | Menu → Barcode Sheets | None | productsApi | ✅ Reachable |
| OrderHistoryScreen | `OrderHistory` | Menu → Purchase Orders | `buy` | orderApi `/orders` | ✅ Reachable |
| OrderDetailScreen | `OrderDetail` | OrderHistory → Tap order | `buy` | orderApi `/orders/:id` | ✅ Reachable (needs orderId) |
| ReorderSettingsScreen | `ReorderSettings` | Menu → Reorder Settings | `reorder` | reorderApi | ✅ Reachable |
| ReorderPoliciesScreen | `ReorderPolicies` | ReorderSettings → Policies | `reorder` | reorderApi `/policies` | ✅ Reachable |
| GRNScreen | `GRN` | OrderDetail → Receive Stock | `buy` | orderApi, inventoryApi | ✅ Reachable (needs orderId) |
| InwardScreen | `Inward` | Menu → Inward | None | inventoryApi (manual entry) | ✅ Reachable |
| UiShowcaseScreen | `UiShowcase` | Menu → UI Showcase (QA only) | `__DEV__` or QA | None | ✅ Reachable (gated) |
| PurchaseHistoryScreen | `PurchaseHistory` | Menu → Purchase History | None | inventoryApi `/purchase-history` | ✅ Reachable |
| SalesStatementScreen | `SalesStatement` | Menu → Sales Statement | None | billingApi `/sales-statement` | ✅ Reachable |
| StockStatementScreen | `StockStatement` | Menu → Stock Statement | None | inventoryApi `/stock-statement` | ✅ Reachable |

---

## Tab Screens (Inside PosRootLayout)

| Tab | Screen | Entry Path | Feature Gate | Data Source |
|-----|--------|------------|--------------|-------------|
| MENU | MenuScreen | Tap MENU tab | None | ui-status, settingsStore |
| SELL | SellScanScreen | Tap SELL tab | None | scanApi, productsApi, cartStore |
| BUY | BuyScreen | Tap BUY tab | `buy` (hideable) | catalogApi, suppliersApi |
| REORDER | ReorderScreen | Tap REORDER tab | `reorder` (hideable) | reorderApi `/suggestions` |

---

## Modals (In-Screen Components)

| Modal | Parent Screen | Trigger | Data Source | Status |
|-------|---------------|---------|-------------|--------|
| ProductDetailModal | SellScanScreen | Tap product in list | Product from scan/search | ✅ Reachable |
| CartSheet (Bottom Sheet) | SellScanScreen | Tap cart icon | cartStore | ✅ Reachable |
| Camera Scanner Modal | SellScanScreen | Tap scan button | Camera permissions | ✅ Reachable |
| SkuPickerModal | SellScanScreen | Multi-SKU product tap | productsApi | ✅ Reachable |
| PurchaseCartModal | BuyScreen | Tap supplier cart | purchaseDraftStore | ✅ Reachable |
| CatalogProductCard | BuyScreen | Browse supplier products | catalogApi | ✅ Reachable |
| EditPolicyModal | ReorderPoliciesScreen | Tap policy row | reorderApi | ✅ Reachable |
| EditReorderModal | ReorderScreen | Tap suggestion card | reorderApi | ✅ Reachable |
| DismissReasonModal | ReorderScreen | Dismiss suggestion | Local state | ✅ Reachable |
| Item Editor Modal | InwardScreen | Tap line item | Local state | ✅ Reachable |

---

## Menu Navigation Links (MenuScreen)

| Section | Link | Target Screen | Feature Gate | Available |
|---------|------|---------------|--------------|-----------|
| SALES | Bills / Sales History | SalesHistory | None | ✅ Always |
| SALES | Reprint / Download / Share | - | None | ✅ Always |
| SALES | Barcode Sheets | BarcodeSheet | None | ✅ Always |
| PURCHASING | Purchase Orders | OrderHistory | `buy` | ✅ When buy enabled |
| PURCHASING | Inward / Stock Receipt | Inward | None | ✅ Always |
| PURCHASING | Purchase History | PurchaseHistory | None | ✅ Always |
| REPORTS | Sales Statement | SalesStatement | None | ✅ Always |
| REPORTS | Stock Statement | StockStatement | None | ✅ Always |
| REORDER | Auto-Reorder Settings | ReorderSettings | `reorder` | ✅ When reorder enabled |
| REORDER | Reorder Policies | ReorderPolicies | `reorder` | ✅ When reorder enabled |
| SETTINGS | Switch Store | EnrollDevice | None | ✅ Always |
| SETTINGS | Language Toggle | - | None | ✅ Always |
| DEV/QA | UI Showcase | UiShowcase | `__DEV__` / QA | ✅ When enabled |

---

## Data Dependencies Per Screen

### SELL Flow
- **SellScanScreen**: `productsApi.searchProducts()`, `scanApi.lookup()`, `cartStore`
- **PaymentScreen**: `posApi.createPayment()`, `billingApi`
- **SuccessPrintScreen**: Data passed from PaymentScreen

### BUY Flow
- **BuyScreen**: `catalogApi.getSuppliers()`, `catalogApi.getProducts()`
- **OrderHistoryScreen**: `orderApi.getOrders()`
- **OrderDetailScreen**: `orderApi.getOrder(orderId)`
- **GRNScreen**: `orderApi.receiveItems()`

### REORDER Flow
- **ReorderScreen**: `reorderApi.getSuggestions()`
- **ReorderSettingsScreen**: `reorderApi.getSettings()`
- **ReorderPoliciesScreen**: `reorderApi.getPolicies()`

### INVENTORY Flow
- **InwardScreen**: Manual entry → `inventoryApi.receiveStock()`
- **StockStatementScreen**: `inventoryApi.getStockStatement()`
- **PurchaseHistoryScreen**: `inventoryApi.getPurchaseHistory()`

### REPORTS Flow
- **SalesHistoryScreen**: `billingApi.getBills()`
- **BillDetailScreen**: `billingApi.getBill(saleId)`
- **SalesStatementScreen**: `billingApi.getSalesStatement()`

---

## Visibility Gaps Identified

### Gap 1: BarcodeSheet needs products
- **Issue**: BarcodeSheetScreen requires products with barcodes
- **Fix**: Demo seed must include products with EAN/barcode mappings

### Gap 2: OrderHistory needs orders
- **Issue**: OrderHistoryScreen shows empty if no purchase orders
- **Fix**: Demo seed must include sample purchase orders

### Gap 3: ReorderPolicies needs policies
- **Issue**: ReorderPoliciesScreen shows empty without policies
- **Fix**: Demo seed must include sample reorder policies

### Gap 4: SalesHistory needs sales
- **Issue**: SalesHistoryScreen shows empty without completed sales
- **Fix**: User must complete at least one sale, OR seed sample sales

### Gap 5: StockStatement needs inventory
- **Issue**: StockStatementScreen shows empty without stock records
- **Fix**: Demo seed must include store_products with stock levels

### Gap 6: PurchaseHistory needs GRNs
- **Issue**: PurchaseHistoryScreen shows empty without stock receipts
- **Fix**: Demo seed must include completed GRN/inward entries

---

## QA Entry Points

### UiShowcaseScreen (Dev/QA Only)
Location: Menu → UI Showcase (when enabled)
Gating: `__DEV__` OR `uiShowcaseEnabled` feature flag

Lists all screens with deep-link buttons for direct navigation testing.

### Test Store Shortcut
Environment variable: `EXPO_PUBLIC_TEST_STORE_ID`
Allows quick enrollment bypass for testing.
