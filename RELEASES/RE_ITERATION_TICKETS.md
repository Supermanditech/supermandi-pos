# Re-Iteration Audit Tickets — Post DA-001..086

> HEAD: c3814443 | 106 fixes | Zero drift
> Source: 3-layer parallel audit (UI/UX/Wiring, API/Backend/DB, Business Logic/v1-v3)
> Date: 2026-03-17

---

## CRITICAL (1 item)

### RI-001: SellMode type exported from two locations — single-source violation
- **Problem**: `SellMode` exported from both `cartStore.ts:88` and `CustomerTypeToggle.tsx:8`
- **Impact**: SellScreenV3 and ProductTileV3 import from CustomerTypeToggle; PaymentScreenV3 imports from cartStore. Future drift risk.
- **Files**: src/components/v3/CustomerTypeToggle.tsx, src/screens/v3/SellScreenV3.tsx, src/components/v3/ProductTileV3.tsx
- **Fix**: Remove export from CustomerTypeToggle, import from cartStore everywhere
- **Risk**: LOW (types are structurally identical now)

---

## HIGH (10 items)

### RI-002: CustomersScreenV3 "Add" button has NO onPress handler
- **Files**: src/screens/v3/CustomersScreenV3.tsx:41
- **Fix**: Wire to customer creation flow or modal

### RI-003: FinanceScreenV3 "Details" button (LendingKart) has NO onPress
- **Files**: src/screens/v3/FinanceScreenV3.tsx:64
- **Fix**: Navigate to credit detail view or show info modal

### RI-004: FinanceScreenV3 "Upload Invoice" button has NO onPress
- **Files**: src/screens/v3/FinanceScreenV3.tsx:77
- **Fix**: Wire to document picker or show coming-soon state

### RI-005: PaymentScreenV3 "Add Discount" button has NO onPress
- **Files**: src/screens/v3/PaymentScreenV3.tsx:214
- **Fix**: Show discount modal (fixed amount or percentage)

### RI-006: ReportsScreenV3 "PDF" button has NO onPress
- **Files**: src/screens/v3/ReportsScreenV3.tsx:97
- **Fix**: Wire to PDF generation or disable with coming-soon

### RI-007: BillDetailScreenV3 "WhatsApp" button is showToast placeholder
- **Files**: src/screens/v3/BillDetailScreenV3.tsx:70
- **Fix**: Wire to Linking.openURL with proper bill message encoding

### RI-008: CounterPurchaseScreenV3 "Save Draft" is showToast placeholder
- **Files**: src/screens/v3/CounterPurchaseScreenV3.tsx:234
- **Fix**: Save draft to AsyncStorage with timestamp, restore on re-open

### RI-009: CounterPurchaseScreenV3 WhatsApp send is showToast placeholder
- **Files**: src/screens/v3/CounterPurchaseScreenV3.tsx:235
- **Fix**: Wire to Linking.openURL with order summary message

### RI-010: SettingsScreenV3 toggle buttons (Auto-Print, Express, Sounds) have no onToggle
- **Files**: src/screens/v3/SettingsScreenV3.tsx:36,40,44
- **Fix**: Wire to settingsStore persist methods

### RI-011: createSale can be called with empty items array — no client guard
- **Files**: src/screens/v3/PaymentScreenV3.tsx:81-95
- **Fix**: Add `if (!items.length) return` before createSaleStep

---

## MEDIUM (8 items)

### RI-012: CustomersScreenV3 search TextInput is uncontrolled
- **Files**: src/screens/v3/CustomersScreenV3.tsx:42
- **Fix**: Add search state, wire value+onChangeText, filter displayCustomers

### RI-013: StockScreenV3 search TextInput is uncontrolled
- **Files**: src/screens/v3/StockScreenV3.tsx:72
- **Fix**: Add search state, wire value+onChangeText, filter items

### RI-014: GRNScreenV3 missing error state on load failure
- **Files**: src/screens/v3/GRNScreenV3.tsx:54
- **Fix**: Set error state in catch block, show error UI

### RI-015: ReorderScreenV3 missing error state on load failure
- **Files**: src/screens/v3/ReorderScreenV3.tsx:54
- **Fix**: Set error state in catch block, show error UI

### RI-016: ReportsScreenV3 missing error state on load failure
- **Files**: src/screens/v3/ReportsScreenV3.tsx:45
- **Fix**: Set error state in catch, show "Could not load" UI

### RI-017: BuyScreenV3 → V3Compare navigation missing required params
- **Files**: src/screens/v3/BuyScreenV3.tsx:165
- **Fix**: Pass packSize, mrpMinor, currentStock, sellPriceMinor, weeklyNeed from product data

### RI-018: recordDuePayment type marks customerName optional — should be required
- **Files**: src/services/api/posApi.ts:124
- **Fix**: Change `customerName?: string` to `customerName: string`

### RI-019: V3SuccessWrapper reads cart state after potential clear — race condition
- **Files**: src/screens/v3/V3ScreenWrappers.tsx:32-37
- **Fix**: Read total/count BEFORE navigation in PaymentScreenV3, pass as params

---

## LOW (4 items)

### RI-020: OTPScreenV3 no guard if phone param missing
- **Files**: src/screens/v3/OTPScreenV3.tsx:20
- **Fix**: Navigate back if phone is empty string

### RI-021: StoreSelectScreenV3 no guard if stores array empty
- **Files**: src/screens/v3/StoreSelectScreenV3.tsx:20-21
- **Fix**: Show "No stores" message or navigate back (already has ListEmptyComponent — verify)

### RI-022: ReportsScreenV3 Print button is showToast placeholder
- **Files**: src/screens/v3/ReportsScreenV3.tsx:95
- **Fix**: Wire to printerService.printReceipt

### RI-023: ReportsScreenV3 Share button is showToast placeholder
- **Files**: src/screens/v3/ReportsScreenV3.tsx:96
- **Fix**: Wire to WhatsApp Linking.openURL with report summary

---

---

## Layer 2 Findings (API/Backend/DB/GCP)

### RI-024: Migrations 186 + 189 missing ROLLBACK comments
- **Files**: backend/migrations/186_sup_pos_grn_tables.sql, backend/migrations/189_khata_void_column.sql
- **Fix**: Add ROLLBACK comment headers per Zero-Regression-Rules
- **Severity**: MEDIUM

### RI-025: OTP storeId validation silently falls back instead of rejecting
- **Files**: backend/src/routes/v1/pos/otpAuth.ts:126-128
- **Problem**: Invalid storeId in request body silently falls back to first store instead of 400 error
- **Fix**: Return 400 if storeId provided but not in user's store list
- **Severity**: LOW (security hardening)

### RI-026: Socket.io CORS fallback includes hardcoded localhost URLs
- **Files**: backend/src/services/chat/socketManager.ts:84-87
- **Problem**: If CORS_ALLOWED_ORIGINS env not set, accepts connections from localhost:5173/5174/4001
- **Fix**: Remove localhost from fallback, require env var in production
- **Severity**: MEDIUM (GCP parity)

### Layer 2 PASS items (no action needed):
- SQL injection: All parameterized queries ✓
- Offline handling: posApi.ts checks isOnline() on all critical paths ✓
- Error typing: ApiError properly structured ✓
- Store isolation: storeId always from JWT/posDevice middleware ✓
- Sensitive logging: OTP masked, tokens not logged ✓

---

## Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 1 |
| HIGH | 10 |
| MEDIUM | 11 |
| LOW | 5 |
| **TOTAL** | **26** |

### Implementation Order
1. RI-001 (CRITICAL type fix) — DONE
2. RI-002..011 (HIGH — missing handlers + API guards)
3. RI-012..019, RI-024, RI-026 (MEDIUM — search, errors, migrations, CORS)
4. RI-020..023, RI-025 (LOW — guards, print/share, OTP hardening)
