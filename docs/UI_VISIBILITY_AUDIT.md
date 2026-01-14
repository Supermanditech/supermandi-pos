# UI Visibility Audit - V3.0.10

**Last Updated:** 2026-01-14
**Audited By:** UIVIS-001 through UIVIS-006

## Overview

This document tracks all screens in the application and their registration/reachability status.
The CI script `scripts/ui-audit.ts` enforces this audit automatically.

---

## Screen Registry

### Navigation Stack Screens (App.tsx)

| Screen Name | Component | Reachable From | Feature Gating |
|-------------|-----------|----------------|----------------|
| Splash | SplashScreen | App start | None |
| EnrollDevice | EnrollDeviceScreen | Splash (unenrolled) | None |
| DeviceBlocked | DeviceBlockedScreen | Splash (blocked device) | None |
| SellScan | PosRootLayout | Splash (enrolled) | None |
| Payment | PaymentScreen | SellScanScreen | None |
| SuccessPrint | SuccessPrintScreenV2 | Payment flow | None |
| SalesHistory | SalesHistoryScreen | Menu | None |
| BillDetail | BillDetailScreen | SalesHistory | None |
| BarcodeSheet | BarcodeSheetScreen | Menu | None |
| OrderHistory | OrderHistoryScreen | Menu | buyEnabled |
| OrderDetail | OrderDetailScreen | OrderHistory | buyEnabled |
| ReorderSettings | ReorderSettingsScreen | Menu | reorderEnabled |
| ReorderPolicies | ReorderPoliciesScreen | Menu | reorderEnabled |
| GRN | GRNScreen | OrderDetail | buyEnabled |
| Inward | InwardScreen | Menu | **ALWAYS** |
| UiShowcase | UiShowcaseScreen | Menu (QA only) | isQaMenuEnabled |
| PurchaseHistory | PurchaseHistoryScreen | Menu | None |
| SalesStatement | SalesStatementScreen | Menu | None |
| StockStatement | StockStatementScreen | Menu | None |

### Embedded Screens (PosRootLayout Tabs)

| Tab ID | Component | Reachable From | Feature Gating |
|--------|-----------|----------------|----------------|
| MENU | MenuScreen | Tab bar | None |
| SELL | SellScanScreen | Tab bar | None |
| PURCHASE | BuyScreen | Tab bar | buyEnabled |
| REORDER | ReorderScreen | Tab bar | reorderEnabled |

---

## Feature Flag Rules

### Essential Operations (ALWAYS visible)
These screens must NEVER be gated behind feature flags:

1. **Stock Inward (Inward)** - Recording incoming stock is essential regardless of BUY workflow
2. **Reports** - All report screens (PurchaseHistory, SalesStatement, StockStatement)
3. **Bills/Sales History** - Core POS functionality
4. **Barcode Sheets** - Utility function

### Gated Operations (Require feature flags)

1. **BUY tab / Purchase Orders / GRN** - Requires `buyEnabled`
2. **REORDER tab / Reorder Settings / Policies** - Requires `reorderEnabled`
3. **UiShowcase** - Requires `isQaMenuEnabled()` (dev/QA only)

---

## Quarantined/Deprecated Screens

| File | Status | Reason | Quarantined Date |
|------|--------|--------|------------------|
| src/screens/deprecated/PurchaseScreen.tsx | DEPRECATED | Superseded by BuyScreen.tsx (V3.0.9) | 2026-01-14 |

---

## Audit Checklist

- [x] All 24 screen files accounted for
- [x] All screens registered in navigation or embedded in parent
- [x] All screens reachable from UI (Menu, tabs, or flow)
- [x] Stock Inward NOT gated behind buyEnabled
- [x] Reports section always visible
- [x] Dead UI quarantined to deprecated folder
- [x] CI script enforces no new orphaned screens

---

## How to Add New Screens

1. Create screen file in `src/screens/`
2. Register in `App.tsx` Navigator or embed in parent component
3. Add menu item in `MenuScreen.tsx` OR ensure reachable via navigation flow
4. Update this audit document
5. Run `npm run ui-audit` to verify

---

## CI Enforcement

The `scripts/ui-audit.ts` script runs in CI and checks:

1. All `.tsx` files in `src/screens/` (excluding deprecated/) are either:
   - Registered in App.tsx as a Stack.Screen
   - Imported and used in PosRootLayout.tsx
2. No screens are unreachable from the UI
3. Essential operations are not incorrectly gated

Run locally: `npx tsx scripts/ui-audit.ts`
