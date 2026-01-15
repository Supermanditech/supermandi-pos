# UI Orphans Audit

> Generated: 2026-01-15
> Related Ticket: UI-AUDIT-002

---

## Summary

| Category | Count | Action |
|----------|-------|--------|
| Deprecated (quarantined) | 1 | Keep for reference |
| Unused Components | 1 | Mark for future cleanup |
| Orphaned Screens | 0 | N/A |
| Duplicate Screens | 0 | N/A |

---

## 1. Deprecated Screens (Quarantined)

### PurchaseScreen.tsx

| Property | Value |
|----------|-------|
| **File Path** | `src/screens/deprecated/PurchaseScreen.tsx` |
| **Status** | DEPRECATED |
| **Deprecated Date** | 2026-01-14 |
| **Superseded By** | `BuyScreen.tsx` |
| **Reason** | Old purchase draft flow replaced by V3.0.9 supplier catalog-based BUY flow |
| **Decision** | Keep in deprecated folder for reference |
| **References Removed** | Yes - not imported anywhere |

**Notes:**
- This was the original purchase/inward screen before V3.0.9 refactoring
- `BuyScreen.tsx` now handles catalog browsing and order placement
- `InwardScreen.tsx` handles manual stock inward
- File is properly documented with @deprecated JSDoc
- Located in `deprecated/` folder so CI excludes it from orphan checks

---

## 2. Unused Components

### ErrorToast.tsx

| Property | Value |
|----------|-------|
| **File Path** | `src/components/ErrorToast.tsx` |
| **Status** | UNUSED |
| **Created** | V3.0.9 |
| **Decision** | Keep - may be wired up in future |
| **Import Count** | 0 (only referenced in docs) |

**Analysis:**
- The `ErrorToast` component is a fully implemented toast notification component
- It uses `ParsedApiError` from `errorHandler.ts`
- However, the actual error display in the app uses `ToastAndroid`/`Alert` via `showToast()` and `showError()` functions
- The component was likely created for a richer error UI but never wired up
- The error handling utilities (`errorHandler.ts`) work without the visual component

**Decision:**
- **Keep for now** - the component is well-implemented and may be useful for future UI improvements
- Not blocking go-live
- Add to backlog: "Wire up ErrorToast component for better error UX"

---

## 3. Verified Reachable (No Orphans)

All other screens in `src/screens/` are verified reachable:

| Screen | Entry Point |
|--------|-------------|
| SplashScreen | App initial route |
| EnrollDeviceScreen | Splash (unenrolled) or Menu → Switch Store |
| DeviceBlockedScreen | API returns deviceActive=false |
| PosRootLayout | Splash (enrolled) |
| MenuScreen | Tab bar (embedded in PosRootLayout) |
| SellScanScreen | Tab bar (embedded in PosRootLayout) |
| BuyScreen | Tab bar (embedded in PosRootLayout, buyEnabled) |
| ReorderScreen | Tab bar (embedded in PosRootLayout, reorderEnabled) |
| PaymentScreen | SellScanScreen → Checkout |
| SuccessPrintScreenV2 | PaymentScreen → Payment complete |
| SalesHistoryScreen | Menu |
| BillDetailScreen | SalesHistoryScreen → Bill tap |
| BarcodeSheetScreen | Menu |
| OrderHistoryScreen | Menu (buyEnabled) |
| OrderDetailScreen | OrderHistoryScreen → Order tap |
| GRNScreen | OrderDetailScreen → Receive Goods |
| ReorderSettingsScreen | Menu (reorderEnabled) |
| ReorderPoliciesScreen | Menu or ReorderSettings (reorderEnabled) |
| InwardScreen | Menu (always) |
| PurchaseHistoryScreen | Menu |
| SalesStatementScreen | Menu |
| StockStatementScreen | Menu |
| UiShowcaseScreen | Menu (QA mode only) |

---

## 4. All Modal Components Verified In Use

| Modal | Parent | Usage |
|-------|--------|-------|
| ProductDetailModal | BuyScreen | Product card tap |
| PurchaseCartModal | BuyScreen | Cart icon tap |
| SkuPickerModal | SellScanScreen | Duplicate barcode scan |
| EditReorderModal | ReorderScreen | Pending item edit |
| DismissReasonModal | ReorderScreen | Pending item dismiss |
| EditPolicyModal | ReorderPoliciesScreen | Policy row tap |

---

## 5. All Supporting Components Verified In Use

| Component | Used By |
|-----------|---------|
| ScanNoticeBanner | PosRootLayout |
| PosStatusBar | PosRootLayout |
| TabBadge | PosRootLayout |
| CategoryFilter | BuyScreen |
| QuantityPicker | SupplierRow, CartItem, EditReorderModal |
| SupplierRow | ProductDetailModal |
| CatalogProductCard | BuyScreen |
| CartItem | PurchaseCartModal |
| SupplierCartSection | PurchaseCartModal |
| OrderCard | OrderHistoryScreen |
| StatusTimeline | OrderDetailScreen |
| GRNItemRow | GRNScreen |
| ReceiveQuantityInput | GRNScreen |
| PendingReorderCard | ReorderScreen |
| PolicyRow | ReorderPoliciesScreen |
| AppText | SellScanScreen |

---

## 6. CI Enforcement

The `scripts/ui-audit.ts` script enforces:

1. All `.tsx` files in `src/screens/` (excluding `deprecated/`) must be:
   - Registered in `App.tsx` as a `Stack.Screen`, OR
   - Imported and used in `PosRootLayout.tsx`

2. The deprecated folder is explicitly excluded from orphan checks

Run locally:
```bash
npx tsx scripts/ui-audit.ts
```

---

## Action Items

| Item | Priority | Status |
|------|----------|--------|
| Keep PurchaseScreen in deprecated/ | Low | Done |
| Keep ErrorToast for future use | Low | Done |
| Document in UI_VISIBILITY_AUDIT.md | Medium | Done (existing) |
| CI script excludes deprecated/ | High | Done |

---

## Conclusion

**No action required for go-live.** All active screens are reachable. Deprecated screen is properly quarantined. Unused ErrorToast component is low-risk and can be wired up later for improved error UX.
