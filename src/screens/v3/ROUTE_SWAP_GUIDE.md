# STG-581: Route Swap Guide — v3 Activation

## How to activate v3 layout

### Option 1: Feature flag (recommended for testing)
```typescript
// In any React component or dev tools:
useSettingsStore.getState().setPosV3Enabled(true);
```

### Option 2: Default on (for production)
Edit `src/stores/settingsStore.ts` line:
```typescript
posV3Enabled: true, // STG-552: Changed from false to true
```

### Option 3: Per-device activation (V3-DELETE-117: deprecated)
V3 is now the default layout. Device enrollment is NOT the normal
owner login path — use phone+OTP instead.
```typescript
// Enrollment-based activation is deprecated for the normal flow.
// V3 activates automatically after phone+OTP login.
```

## What changes when v3 is enabled
- PosRootLayout detects `posV3Enabled === true`
- Returns `<PosRootLayoutV3 />` instead of the current 5-tab layout
- All 21 v3 screens render through PosRootLayoutV3
- Old screens are NOT deleted — they still exist as fallback

## Rollback
```typescript
useSettingsStore.getState().setPosV3Enabled(false);
```
Instant — no app restart needed. Old 44-screen layout returns.

## Screens replaced
| v3 Screen | Replaces | Status |
|-----------|----------|--------|
| SellScreenV3 | SellScanScreen (8005 lines) | Ready |
| BuyScreenV3 | BuyScreen + PurchaseScreen | Ready |
| StoreHubScreenV3 | 10 store screens | Ready |
| MoreScreenV3 | MenuScreen (25+ items) | Ready |
| PaymentScreenV3 | PaymentScreen | Ready |
| SuccessScreenV3 | SuccessPrintScreenV2 | Ready |
| KhataScreenV3 | KhataScreen + Credit + BNPL + Overdue | Ready |
| FinanceScreenV3 | CreditScreen + BnplDuesScreen | Ready |
| ReportsScreenV3 | DailyClosing + DailyReport + SalesStatement | Ready |
| CustomersScreenV3 | CustomerList + CustomerManagement | Ready |
| SettingsScreenV3 | PrinterSettings + PaymentSetup + MenuScreen toggles | Ready |
| ScanScreenV3 | Embedded in SellScanScreen | Ready |
| VoiceOverlayV3 | VoiceSheet | Ready |
| CounterPurchaseScreenV3 | NEW (no equivalent) | Ready |
| CompareScreenV3 | NEW (no equivalent) | Ready |
| NewProductScreenV3 | NEW (enhanced from ScanScreen) | Ready |
| GRNScreenV3 | GRNScreen + InwardScreen | Ready |
| ReorderScreenV3 | ReorderScreen + ReorderPolicies + ReorderSettings | Ready |
| StockScreenV3 | StockStatement + OpeningStock + BarcodeSheet | Ready |

## Files to delete in STG-582 (AFTER E2E verification)
See POS_V3_IMPLEMENTATION_PLAN.md for full list.
