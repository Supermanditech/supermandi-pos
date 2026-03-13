# i18n Key Naming Convention (STG-482)

## Key Prefixes

| Prefix | Scope | Examples |
|--------|-------|---------|
| `common.*` | Truly generic strings shared across 3+ screens | `common.loading`, `common.error`, `common.retry`, `common.cancel`, `common.save` |
| `{screen}.*` | Screen-specific strings | `dailyReport.title`, `khata.addEntry`, `payment.upiId` |
| `components.*` | Shared component strings used in 2+ screens | `components.searchBar.placeholder`, `components.emptyState.title` |
| `status.*` | System status messages (offline, sync, printer) | `status.offline`, `status.syncPending` |
| `errors.*` | Error messages | `errors.networkError`, `errors.sessionExpired` |
| `enroll.*` | Device enrollment flow | `enroll.title`, `enroll.enrollDevice` |
| `sell.*` | Sell tab specific | `sell.checkout`, `sell.cartEmpty` |
| `buy.*` | Buy tab specific | `buy.addSupplier`, `buy.orderPlaced` |
| `nav.*` | Navigation labels | `nav.sell`, `nav.buy`, `nav.credit` |
| `settings.*` | Settings screen | `settings.theme`, `settings.language` |

## Rules

1. **Use dot notation** for nested keys: `dailyReport.salesSummary.title`
2. **camelCase** for key segments: `sell.addToCart` (not `sell.add-to-cart`)
3. **No abbreviations** in keys: `dailyReport` (not `dr` or `dailyRpt`)
4. **Descriptive values**: keys should hint at context, values should be the actual string
5. **Plurals**: use i18next `_plural` suffix: `sell.itemCount` / `sell.itemCount_plural`
6. **Interpolation**: use `{{variable}}` syntax: `"{{count}} items"`
7. **Every new key** must exist in BOTH `en.json` and `hi.json` — run `npm run i18n:validate`

## Screen Name Mapping

| Screen File | Key Prefix |
|-------------|-----------|
| `PaymentSetupScreen.tsx` | `paymentSetup.*` |
| `BillDetailScreen.tsx` | `billDetail.*` |
| `SalesStatementScreen.tsx` | `salesStatement.*` |
| `DailyReportScreen.tsx` | `dailyReport.*` |
| `GRNScreen.tsx` | `grn.*` |
| `OpeningStockScreen.tsx` | `openingStock.*` |
| `KhataScreen.tsx` | `khata.*` |
| `OverdueDuesScreen.tsx` | `overdueDues.*` |
| `ShiftScreen.tsx` | `shift.*` |
| `ReturnScreen.tsx` | `returnScreen.*` |
| `BulkPurchaseCreditScreen.tsx` | `bulkCredit.*` |
| `ErrorBoundary.tsx` | `errorBoundary.*` |
