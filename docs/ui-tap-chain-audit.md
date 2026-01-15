# UI Tap-Chain Audit - SuperMandi POS

**Version:** 3.0.10
**Audit Date:** 2026-01-15
**Status:** Production Ready

---

## 1. Screen Inventory

### Entry Point & Authentication
| Screen | File | Purpose |
|--------|------|---------|
| Splash | `SplashScreen.tsx` | 1s splash, checks device session |
| EnrollDevice | `EnrollDeviceScreen.tsx` | QR code + manual enrollment |
| DeviceBlocked | `DeviceBlockedScreen.tsx` | Device disabled state |

### Main POS Interface (Tabs)
| Tab | Screen | File | Purpose |
|-----|--------|------|---------|
| MENU | MenuScreen | `MenuScreen.tsx` | Navigation hub |
| SELL | SellScanScreen | `SellScanScreen.tsx` | Cart + barcode scan |
| BUY | BuyScreen | `BuyScreen.tsx` | Product catalog |
| REORDER | ReorderScreen | `ReorderScreen.tsx` | Pending reorders |

### Transaction Screens
| Screen | File | Purpose |
|--------|------|---------|
| PaymentScreen | `PaymentScreen.tsx` | UPI/CASH/DUE checkout |
| SuccessPrintScreenV2 | `SuccessPrintScreenV2.tsx` | Receipt printing |
| BillDetailScreen | `BillDetailScreen.tsx` | Bill detail + print/share |

### History & Reports
| Screen | File | Purpose |
|--------|------|---------|
| SalesHistoryScreen | `SalesHistoryScreen.tsx` | Bills list |
| OrderHistoryScreen | `OrderHistoryScreen.tsx` | PO list |
| OrderDetailScreen | `OrderDetailScreen.tsx` | PO detail + GRN |
| GRNScreen | `GRNScreen.tsx` | Goods receiving |
| PurchaseHistoryScreen | `PurchaseHistoryScreen.tsx` | GRN history |
| SalesStatementScreen | `SalesStatementScreen.tsx` | Sales report |
| StockStatementScreen | `StockStatementScreen.tsx` | Stock report |

### Settings & Configuration
| Screen | File | Purpose |
|--------|------|---------|
| ReorderSettingsScreen | `ReorderSettingsScreen.tsx` | Reorder toggles |
| ReorderPoliciesScreen | `ReorderPoliciesScreen.tsx` | Min/max policies |
| InwardScreen | `InwardScreen.tsx` | Manual stock entry |
| BarcodeSheetScreen | `BarcodeSheetScreen.tsx` | Print labels |

---

## 2. Navigation Flow Diagram

```
Splash
  |
  +-- [Not enrolled] --> EnrollDevice --> SellScan
  |
  +-- [Blocked] --> DeviceBlocked --> retry --> SellScan
  |
  +-- [Enrolled] --> SellScan (PosRootLayout)
                        |
        +---------------+---------------+---------------+
        |               |               |               |
      MENU            SELL            BUY           REORDER
        |               |               |               |
        v               v               v               v
   MenuScreen     SellScanScreen    BuyScreen     ReorderScreen
        |               |               |               |
        |           Checkout        Draft PO       Approve
        |               |               |               |
        |               v               |               |
        |         PaymentScreen <-------+               |
        |               |                               |
        |               v                               |
        |        SuccessPrint                           |
        |               |                               |
        +---> SalesHistory                              |
        |         |                                     |
        |         v                                     |
        |    BillDetail                                 |
        |      - Print                                  |
        |      - Share                                  |
        |      - WhatsApp                               |
        |                                               |
        +---> OrderHistory (buyEnabled)                 |
        |         |                                     |
        |         v                                     |
        |    OrderDetail                                |
        |         |                                     |
        |         v                                     |
        |       GRN --> PurchaseHistory                 |
        |                                               |
        +---> ReorderSettings (reorderEnabled)          |
        |         |                                     |
        |         v                                     |
        |    ReorderPolicies                            |
        |                                               |
        +---> InwardScreen                              |
        |                                               |
        +---> Reports (Sales/Stock Statement)           |
        |                                               |
        +---> Switch Store --> EnrollDevice             |
```

---

## 3. Critical Tap Chains

### A. SELL Flow (Most Critical)
```
SELL Tab
  -> Scan barcode OR Search product
  -> Add to cart (qty dialog)
  -> Adjust qty if needed
  -> Apply discount if needed
  -> Checkout button
  -> PaymentScreen
  -> Select mode (CASH/UPI/DUE)
  -> Pay button
  -> SuccessPrint
  -> Print/Done
  -> Back to SELL (cart cleared)
```

**Verified:** Yes
**Stock Deduction:** Yes (on sale creation)
**Offline Support:** Yes (CASH/DUE modes)

### B. Bills History Flow
```
MENU -> Sales History
  -> Tap bill row
  -> BillDetail
  -> Print button -> Printer
  -> Share button -> PDF share dialog
  -> WhatsApp button -> WhatsApp with text
```

**Verified:** Yes
**Empty State:** Yes (CTA to SELL)

### C. BUY Flow
```
BUY Tab
  -> Search/Browse products
  -> Add to cart
  -> View cart (modal)
  -> Draft PO auto-created
```

**Verified:** Yes
**Feature Gate:** `buyEnabled`

### D. REORDER Flow
```
REORDER Tab
  -> View pending reorders
  -> Select items
  -> Approve -> Creates PO
  -> Navigate to BUY tab
  OR
  -> Dismiss + reason
```

**Verified:** Yes
**Feature Gate:** `reorderEnabled`

### E. GRN Flow
```
MENU -> Purchase Orders
  -> Tap order
  -> OrderDetail
  -> Receive button
  -> GRN screen
  -> Enter quantities
  -> Submit
  -> Stock updated
```

**Verified:** Yes
**Feature Gate:** `buyEnabled`

### F. Switch Store Flow
```
MENU -> Switch Store
  -> [If pending offline data] Warning alert
  -> Confirm
  -> Clear session
  -> Navigate to EnrollDevice
```

**Verified:** Yes
**Safety Check:** Pending data warning added

---

## 4. Feature Gates

| Feature | Gate | Tabs Affected | Screens Affected |
|---------|------|---------------|------------------|
| Buy/Orders | `buyEnabled` | BUY tab hidden | OrderHistory hidden |
| Reorder | `reorderEnabled` | REORDER tab hidden | ReorderSettings hidden |
| Store Active | `storeActive=false` | All tabs blocked except MENU | Warning banner |
| Device Active | `deviceActive=false` | Full block | DeviceBlocked screen |

---

## 5. Empty State CTAs

| Screen | Empty Message | CTA Action |
|--------|---------------|------------|
| SalesHistoryScreen | "No bills yet" | Navigate to SELL |
| OrderHistoryScreen | "No Orders Found" | Navigate to BUY |
| ReorderScreen | "All caught up!" | None (success state) |
| StockStatementScreen | "No products" | None |
| ReorderPoliciesScreen | "No Policies Yet" | None |

---

## 6. Error Handling

| Error | Handling | Navigation |
|-------|----------|------------|
| Device not enrolled | Auto-redirect | EnrollDevice |
| Device unauthorized | Clear session | EnrollDevice |
| Device inactive | Show blocked screen | DeviceBlocked |
| Store inactive | Warning banner | Stay in MENU |
| Network error | Alert + retry | Same screen |
| Stock validation fail | Alert | PaymentScreen retry |
| UPI offline | Block with message | Stay in PaymentScreen |

---

## 7. Offline Capability Matrix

| Action | Online | Offline |
|--------|--------|---------|
| Create Sale | Yes | Yes (local storage) |
| Cash Payment | Yes | Yes |
| UPI Payment | Yes | Blocked |
| DUE Payment | Yes | Yes |
| View Bills | Yes | Yes (local cache) |
| View Catalog | Yes | Partial (cached) |
| Sync Pending | Yes | Queued |

---

## 8. Audit Checklist

- [x] All screens have back navigation
- [x] Empty states have guidance
- [x] Error states have retry options
- [x] Offline mode shows appropriate warnings
- [x] Payment flow validates stock
- [x] Switch store warns about pending data
- [x] Bills can be printed/shared
- [x] WhatsApp sharing works
- [x] All feature gates work correctly
- [x] Translations complete (EN/HI)

---

## 9. Known Limitations

1. **Thermal Printer**: Requires device-specific SDK (Sunmi, ESC/POS)
2. **UPI Offline**: Intentionally blocked (requires network)
3. **Catalog Offline**: Only shows cached products

---

**Audit Complete**
