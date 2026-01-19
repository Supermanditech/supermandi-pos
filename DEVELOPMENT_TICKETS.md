# SuperMandi Retailer Platform - Development Tickets

**Generated:** 2026-01-19
**Spec Version:** 1.0 (RETAILER_PLATFORM_SPEC.pdf)
**Target:** Go-Live Ready

---

## Legend

| Status | Meaning |
|--------|---------|
| ⬜ | Not Started |
| 🟡 | In Progress |
| ✅ | Completed |
| 🔴 | Blocked |
| 🧪 | Needs Testing |

---

## Phase 0: Pre-Go-Live (Already Done)

### P0-DONE: Completed in Previous Sessions

| Ticket | Description | Status | Commit |
|--------|-------------|--------|--------|
| P0-001 | Device enrollment flow | ✅ | various |
| P0-002 | ui-status API v5 parsing | ✅ | d28f8d0 |
| P0-003 | Categories API fix | ✅ | various |
| P0-004 | SELL tab scan & cart | ✅ | existing |
| P0-005 | Reorder tab & policies | ✅ | existing |

---

## Phase 1: Go-Live Day 1 (P0) - CRITICAL

### POS-001: PURCHASE Tab Redesign
**Priority:** P0 | **Platform:** POS | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| POS-001a | 50/50 segmented control UI | ✅ | 8f659d0 |
| POS-001b | Camera icon → scanner | ✅ | 8f659d0 |
| POS-001c | Rotating hints (8 strings, 1s) | ✅ | 8f659d0 |
| POS-001d | Auto-restore 50/50 after 6s | ✅ | 8f659d0 |
| POS-001e | Quick Purchase item rows | ✅ | 8f659d0 |
| POS-001f | Live Suppliers SKU grid (3 col) | ✅ | 8f659d0 |
| POS-001g | Connect to real suppliers API | ⬜ | Currently DEMO_MODE |
| POS-001h | Test on Redmi device | ⬜ | |

---

### POS-002: Daily Summary Widget on MenuScreen
**Priority:** P0 | **Platform:** POS | **Est:** 2h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| POS-002a | Create DailySummaryWidget component | ⬜ | |
| POS-002b | Add widget to MenuScreen.tsx | ⬜ | |
| POS-002c | Connect to GET /api/v1/pos/daily-summary | ⬜ | |
| POS-002d | Handle loading/error states | ⬜ | |
| POS-002e | "View Full Report" navigation | ⬜ | |

**UI Spec:**
```
┌─────────────────────────────────────────┐
│ 📊 Today's Summary                      │
│ ─────────────────────────────────────── │
│ 💰 Sales           ₹12,450              │
│ 📦 Bills           23                   │
│ 💵 Cash            ₹8,200               │
│ 📱 UPI             ₹4,250               │
│                                         │
│ [View Full Report →]                    │
└─────────────────────────────────────────┘
```

---

### POS-003: Strong Search in BUY Tab
**Priority:** P0 | **Platform:** POS | **Est:** 2h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| POS-003a | Search by product name (partial, fuzzy) | 🟡 | Basic done |
| POS-003b | Search by barcode (exact match) | ⬜ | |
| POS-003c | Category filter dropdown | ⬜ | |
| POS-003d | Stock status filter (In/Low/Out) | ⬜ | |
| POS-003e | Recent searches history | ⬜ | |

---

### API-001: Suppliers API (Backend)
**Priority:** P0 | **Platform:** Backend | **Est:** 3h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| API-001a | GET /api/v1/pos/suppliers | ⬜ | Returns supplier list |
| API-001b | Database schema for suppliers | ⬜ | |
| API-001c | Seed SuperMandi suppliers | ⬜ | Read-only |
| API-001d | Retailer's own suppliers CRUD | ⬜ | Dashboard only |

**Response Format:**
```json
{
  "suppliers": [
    {
      "id": "sup_123",
      "name": "Sharma Traders",
      "phone": "9876543210",
      "gst": "27AABCS1234A1Z5",
      "source": "own",
      "isEditable": true
    },
    {
      "id": "sm_metro",
      "name": "Metro Cash & Carry",
      "phone": "1800123456",
      "gst": "29AABCM5678B1Z3",
      "source": "supermandi",
      "isEditable": false
    }
  ]
}
```

---

### API-002: Daily Summary API (Backend)
**Priority:** P0 | **Platform:** Backend | **Est:** 2h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| API-002a | GET /api/v1/pos/daily-summary | ⬜ | |
| API-002b | Aggregate sales from transactions | ⬜ | |
| API-002c | Payment breakdown (cash/UPI) | ⬜ | |
| API-002d | Cache for performance | ⬜ | |

**Response Format:**
```json
{
  "date": "2026-01-19",
  "totalSales": 1245000,
  "totalBills": 23,
  "cashAmount": 820000,
  "upiAmount": 425000,
  "averageBill": 54130,
  "topItems": [
    { "name": "Toor Dal 1kg", "qty": 15, "amount": 210000 }
  ]
}
```

---

### WEB-001: Retailer Dashboard - Auth & Shell
**Priority:** P0 | **Platform:** Web | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-001a | Login page (phone + OTP) | ⬜ | |
| WEB-001b | Dashboard shell/layout | ⬜ | |
| WEB-001c | Sidebar navigation | ⬜ | |
| WEB-001d | Auth context & JWT handling | ⬜ | |
| WEB-001e | Logout functionality | ⬜ | |

---

### WEB-002: Dashboard Home Page
**Priority:** P0 | **Platform:** Web | **Est:** 3h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-002a | Today's sales card | ⬜ | |
| WEB-002b | This month card | ⬜ | |
| WEB-002c | Low stock alert card | ⬜ | |
| WEB-002d | Pending orders card | ⬜ | |
| WEB-002e | Sales trend chart (7 days) | ⬜ | |
| WEB-002f | Top selling today list | ⬜ | |
| WEB-002g | Recent activity feed | ⬜ | |

---

### WEB-003: Suppliers CRUD Page
**Priority:** P0 | **Platform:** Web | **Est:** 3h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-003a | Suppliers list table | ⬜ | |
| WEB-003b | Add supplier modal | ⬜ | |
| WEB-003c | Edit supplier modal | ⬜ | |
| WEB-003d | Delete supplier (confirm) | ⬜ | |
| WEB-003e | SuperMandi suppliers (view-only badge) | ⬜ | |
| WEB-003f | Search/filter suppliers | ⬜ | |

---

## Phase 2: Day 2-3 (P1)

### POS-004: Sales Report Screen
**Priority:** P1 | **Platform:** POS | **Est:** 2h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| POS-004a | Create SalesReportScreen.tsx | ⬜ | |
| POS-004b | Period filter (Today/Week/Month/Custom) | ⬜ | |
| POS-004c | Total sales, bills, avg bill stats | ⬜ | |
| POS-004d | Payment breakdown chart | ⬜ | |
| POS-004e | Top 5 items list | ⬜ | |
| POS-004f | Share report button | ⬜ | |

---

### POS-005: Purchase Report Screen
**Priority:** P1 | **Platform:** POS | **Est:** 2h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| POS-005a | Create PurchaseReportScreen.tsx | ⬜ | |
| POS-005b | Period filter | ⬜ | |
| POS-005c | Total purchases, orders, items stats | ⬜ | |
| POS-005d | By supplier breakdown | ⬜ | |
| POS-005e | Share report button | ⬜ | |

---

### POS-006: Profit Report Screen
**Priority:** P1 | **Platform:** POS | **Est:** 2h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| POS-006a | Create ProfitReportScreen.tsx | ⬜ | |
| POS-006b | Sales vs COGS calculation | ⬜ | |
| POS-006c | Gross profit & margin | ⬜ | |
| POS-006d | Top margin items | ⬜ | |
| POS-006e | Low margin alerts | ⬜ | |

---

### WEB-004: Products List Page
**Priority:** P1 | **Platform:** Web | **Est:** 3h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-004a | Products table with pagination | ⬜ | |
| WEB-004b | Search by name/barcode | ⬜ | |
| WEB-004c | Filter by category/stock | ⬜ | |
| WEB-004d | Edit product modal | ⬜ | |
| WEB-004e | Delete product (confirm) | ⬜ | |
| WEB-004f | Multi-select for bulk actions | ⬜ | |

---

### WEB-005: SELL Page (Web POS)
**Priority:** P1 | **Platform:** Web | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-005a | Product search | ⬜ | |
| WEB-005b | Cart sidebar | ⬜ | |
| WEB-005c | Add/remove/qty in cart | ⬜ | |
| WEB-005d | Payment method selection | ⬜ | |
| WEB-005e | Checkout flow | ⬜ | |
| WEB-005f | Bill print/share | ⬜ | |

---

### WEB-006: Reports Pages (Full + Export)
**Priority:** P1 | **Platform:** Web | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-006a | Daily sales report page | ⬜ | |
| WEB-006b | Sales report with charts | ⬜ | |
| WEB-006c | Purchase report | ⬜ | |
| WEB-006d | Profit report | ⬜ | |
| WEB-006e | Export to PDF | ⬜ | |
| WEB-006f | Export to Excel | ⬜ | |

---

### API-003: Reports APIs (Backend)
**Priority:** P1 | **Platform:** Backend | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| API-003a | GET /api/v1/retailers/reports/daily | ⬜ | |
| API-003b | GET /api/v1/retailers/reports/sales | ⬜ | |
| API-003c | GET /api/v1/retailers/reports/purchases | ⬜ | |
| API-003d | GET /api/v1/retailers/reports/profit | ⬜ | |
| API-003e | Date range filtering | ⬜ | |
| API-003f | Aggregation queries | ⬜ | |

---

## Phase 3: Week 1 (P2)

### WEB-007: Bulk CSV Product Import
**Priority:** P2 | **Platform:** Web | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-007a | Download CSV template | ⬜ | |
| WEB-007b | File upload component | ⬜ | |
| WEB-007c | CSV parsing & validation | ⬜ | |
| WEB-007d | Preview with errors/warnings | ⬜ | |
| WEB-007e | Import execution | ⬜ | |
| WEB-007f | POST /api/v1/retailers/products/import | ⬜ | |

---

### WEB-008: Inline Bulk Product Edit
**Priority:** P2 | **Platform:** Web | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-008a | Editable table cells | ⬜ | |
| WEB-008b | Batch update state | ⬜ | |
| WEB-008c | Save all changes | ⬜ | |
| WEB-008d | Quick actions (% increase, set min stock) | ⬜ | |
| WEB-008e | PUT /api/v1/retailers/products/bulk | ⬜ | |

---

### WEB-009: Return/Refund Page
**Priority:** P2 | **Platform:** Web | **Est:** 6h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-009a | Returns list with filters | ⬜ | |
| WEB-009b | New return - find bill | ⬜ | |
| WEB-009c | Select items to return | ⬜ | |
| WEB-009d | Return reason dropdown | ⬜ | |
| WEB-009e | Refund method (cash/credit) | ⬜ | |
| WEB-009f | Return to inventory checkbox | ⬜ | |
| WEB-009g | POST /api/v1/retailers/returns | ⬜ | |

---

### API-004: Purchase Cart Sync
**Priority:** P2 | **Platform:** Both | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| API-004a | GET /api/v1/purchase-cart | ⬜ | |
| API-004b | PUT /api/v1/purchase-cart | ⬜ | |
| API-004c | POST /api/v1/purchase-cart/sync | ⬜ | |
| API-004d | POS polling (30s on BUY tab) | ⬜ | |
| API-004e | Dashboard WebSocket updates | ⬜ | |
| API-004f | Conflict resolution (last-write-wins) | ⬜ | |

---

### WEB-010: Category Management
**Priority:** P2 | **Platform:** Web | **Est:** 3h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-010a | Category list | ⬜ | |
| WEB-010b | Add/edit category | ⬜ | |
| WEB-010c | Delete category (check products) | ⬜ | |
| WEB-010d | Assign products to category | ⬜ | |

---

## Phase 4: Week 2 (P3)

### POS-007: Hold/Resume Bill
**Priority:** P3 | **Platform:** POS | **Est:** 3h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| POS-007a | Hold current cart | ⬜ | |
| POS-007b | HeldBillsScreen.tsx | ⬜ | |
| POS-007c | Resume held bill | ⬜ | |
| POS-007d | Delete held bill | ⬜ | |
| POS-007e | Held bills badge on SELL tab | ⬜ | |

---

### POS-008: Price Override
**Priority:** P3 | **Platform:** Both | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| POS-008a | Price override modal | ⬜ | |
| POS-008b | Reason dropdown | ⬜ | |
| POS-008c | Track overrides in transaction | ⬜ | |
| POS-008d | Override limits (% below MRP) | ⬜ | |

---

### POS-009: Stock Adjustment
**Priority:** P3 | **Platform:** Both | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| POS-009a | StockAdjustmentScreen.tsx | ⬜ | |
| POS-009b | Search/scan product | ⬜ | |
| POS-009c | Add/remove stock | ⬜ | |
| POS-009d | Reason dropdown | ⬜ | |
| POS-009e | POST /api/v1/stock/adjust | ⬜ | |
| POS-009f | Stock adjustment history | ⬜ | |

---

### WEB-011: GST Report
**Priority:** P3 | **Platform:** Web | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-011a | GST summary by rate | ⬜ | |
| WEB-011b | HSN code breakdown | ⬜ | |
| WEB-011c | GSTR-1 export format | ⬜ | |
| WEB-011d | GET /api/v1/retailers/reports/gst | ⬜ | |

---

### WEB-012: Settings Page
**Priority:** P3 | **Platform:** Web | **Est:** 4h

| Sub-ticket | Description | Status | Notes |
|------------|-------------|--------|-------|
| WEB-012a | Store profile view/edit | ⬜ | |
| WEB-012b | Tax/GST settings | ⬜ | |
| WEB-012c | Receipt template settings | ⬜ | |
| WEB-012d | Connected devices list | ⬜ | |

---

## Summary by Phase

| Phase | Tickets | Est Hours | Status |
|-------|---------|-----------|--------|
| Phase 0 (Done) | 5 | - | ✅ Complete |
| Phase 1 (P0) | 9 major | ~23h | 🟡 In Progress |
| Phase 2 (P1) | 6 major | ~17h | ⬜ Not Started |
| Phase 3 (P2) | 4 major | ~21h | ⬜ Not Started |
| Phase 4 (P3) | 5 major | ~19h | ⬜ Not Started |

---

## Current Sprint Focus

### Sprint 1: Go-Live Critical (Phase 1)

**Must Complete:**
1. ⬜ POS-001g: Connect PURCHASE to real suppliers API
2. ⬜ POS-002: Daily Summary Widget
3. ⬜ API-001: Suppliers API backend
4. ⬜ API-002: Daily Summary API backend
5. ⬜ WEB-001: Dashboard auth shell
6. ⬜ WEB-002: Dashboard home page
7. ⬜ WEB-003: Suppliers CRUD

**Testing:**
- ⬜ POS-001h: Test PURCHASE tab on Redmi
- ⬜ End-to-end POS → Dashboard sync

---

## File Reference

| Feature | Primary Files |
|---------|---------------|
| PURCHASE Tab | `src/screens/PurchaseScreen.tsx` |
| Daily Summary | `src/components/DailySummaryWidget.tsx` (new) |
| Suppliers API | `src/services/api/suppliersApi.ts` |
| Stock In API | `src/services/api/stockInApi.ts` |
| Daily Summary API | `src/services/api/dailySummaryApi.ts` |
| handleScan | `src/services/scan/handleScan.ts` |

---

## Notes

1. **DEMO_MODE**: Currently `stockInApi.ts`, `suppliersApi.ts`, `dailySummaryApi.ts` use DEMO_MODE with mock data. Must switch to real API before go-live.

2. **Web Dashboard**: New React app in `retailer-admin/` folder. Uses Vite + React + TailwindCSS.

3. **Backend**: Node.js/Express running on `http://34.14.220.171:3000` (API Gateway) and `http://34.14.220.171:3009` (POS Service).

4. **Cart Sync**: Purchase cart sync between POS and Dashboard requires WebSocket for real-time updates.

---

*Last Updated: 2026-01-19 04:15 IST*
