# SuperMandi Retailer Platform - Development Tickets

**Generated:** 2026-01-19
**Spec Version:** 1.0 (RETAILER_PLATFORM_SPEC.pdf)
**Target:** Go-Live Ready
**Branch:** `wip/trace-2026-01-15`

---

## Verification Standard

> **No Phase-1 ticket is ✅ until demo store passes:**
> 1. VM curl (API responds correctly)
> 2. POS UI (Feature works on app)
> 3. Dashboard UI (Feature works on web)
> 4. SuperAdmin probe (Visible in admin panel)
> 5. Regression checklist (No existing features broken)

---

## API Endpoint Readiness Matrix (2026-01-19)

**Backend URL:** `http://34.14.220.171:3000`

> **Addendum Point 1:** 401 ≠ "Ready". A ticket is NOT ✅ unless ALL 4 columns are green.

| Endpoint | Exists? | Auth OK? | Contract OK? | Isolation OK? | Status |
|----------|---------|----------|--------------|---------------|--------|
| `/api/v1/pos/suppliers` | ✅ (401) | ❌ | ❌ | ❌ | **NOT READY** |
| `/api/v1/pos/daily-summary` | ✅ (401) | ❌ | ❌ | ❌ | **NOT READY** |
| `/api/v1/pos/stock-in` | ❌ (404) | ❌ | ❌ | ❌ | **NOT READY** |
| `/api/v1/pos/suppliers/:id/products` | ❌ (404) | ❌ | ❌ | ❌ | **NOT READY** |
| `/api/v1/pos/products/search?supplierId=` | ❌ (404) | ❌ | ❌ | ❌ | **NOT READY** |

### Readiness Definitions
| Column | Definition |
|--------|------------|
| **Exists?** | Route returns non-404 (401/200/etc) |
| **Auth OK?** | Returns 200 with real `X-Device-Token` |
| **Contract OK?** | JSON matches expected shape in ticket |
| **Isolation OK?** | Token for Store A cannot access Store B data |

### Current State
- **Route exists but NOT ready:** suppliers, daily-summary (need auth + contract + isolation verification)
- **Route missing:** stock-in, supplier products
- **Feature flags set (POS client gating):**
  - `LIVE_SUPPLIERS_ENABLED = false` (PurchaseScreen.tsx:91)
  - `STOCK_IN_API_AVAILABLE = false` (PurchaseScreen.tsx:96)
  - `DEMO_MODE = true` (stockInApi.ts:66)

---

## Auth Header Contract (Go-Live Rule)

> **Addendum Point 2:** All POS APIs MUST use the same auth header as the POS app.

### POS App Auth Header (CANONICAL)
```
X-Device-Token: tok_...
```

### Rule
- All Phase-1 POS API tickets MUST specify `X-Device-Token` (not `Authorization: Bearer`)
- POS app already uses `X-Device-Token` in `apiClient.ts` line 37
- `Authorization: Bearer` is for Dashboard JWT auth only
- No split truth: one auth method per platform

### Header Mapping
| Platform | Auth Header | Token Type |
|----------|-------------|------------|
| POS App | `X-Device-Token: tok_...` | Device token from enrollment |
| Dashboard | `Authorization: Bearer <jwt>` | JWT from Firebase OTP login |
| SuperAdmin | `Authorization: Bearer <jwt>` | JWT from admin login |

---

## Platform Responsibilities (Go-Live Architecture)

### Golden Rule
> **UI is the source of truth for user intent (what the user sees and does)**
> **Backend + DB are the source of truth for data (what is persisted and shared)**

---

### POS App = Execution (scan-first, fast, resilient)

**POS Owns:**
- Scan & Sell → bill generation → payment capture
- Inward/Stock-In (Quick Purchase) scanning + submit
- Offline-tolerant UX (queue & retry when backend unavailable)
- Print/share bill
- Quick purchase scanning + GRN receiving

**POS Shows (read-only):**
- Suppliers list (pick + browse)
- Store inventory (stock/price)
- Reorder info (alerts/status) when enabled
- Stock statement view

**POS Must NOT Own:**
- Bulk product import/edit
- Supplier CRUD (create/edit/delete)
- Deep analytics exports
- Category management

---

### Retailer Dashboard = Control + Bulk Ops + Reporting

**Dashboard Owns:**
- Supplier CRUD (only `source=own` suppliers)
- Product management (add/edit/delete, bulk import/edit)
- Categories management
- Reports pages + export (PDF/Excel)
- Settings (store profile, GST/tax, receipt template)

**Dashboard Shows (read-only):**
- Sales history, bill list
- Inward/GRN history
- Inventory statement
- Reorder status

**Dashboard Navigation (per spec page 10):**
1. Home (Dashboard)
2. Sell (Web POS)
3. Buy
4. Inventory
5. Products
6. Suppliers
7. Reorder
8. Reports
9. Settings

> Even if Phase-1 doesn't build all pages fully, shell + routing + empty/error states must exist.

---

### SuperAdmin = Platform Operations (Control Plane)

**SuperAdmin Owns:**
- Store provisioning & lifecycle
- User ↔ store mapping
- Device enrollments/revokes
- Device block/unblock
- Store Probe Panel (verify health + Phase-1 APIs)
- Feature flags/gating (optional)

**SuperAdmin Must NOT:**
- Act like retailer dashboard
- Edit store inventory directly
- Create suppliers/products in retailer flow

---

## Sync Contract (Phase-1)

### What Must Sync Across ALL THREE (POS + Dashboard + SuperAdmin)

| Object | Fields | POS | Dashboard | SuperAdmin |
|--------|--------|-----|-----------|------------|
| **Store Identity** | storeId, storeCode, storeName, timezone, currency | Read-only | Editable (profile) | Override |
| **Devices** | deviceId, status, lastSeen, blocked, enrolledAt | React (blocked→screen) | Read-only list | Source of truth |
| **Feature Flags** | gating keys | Consume | Consume | Decides |

---

### What Must Sync Between POS ↔ Dashboard (Only)

| Object | Synced Fields | Rules |
|--------|---------------|-------|
| **Product Master** | productId, name, barcode(s), categoryId | Store-scoped results only |
| **Store Product** | sellPrice, mrp, buyPrice, currentStock, thresholds | No cross-store prefill |
| **Suppliers** | supplierId, name, phone, gstin, source, isActive | SuperMandi=read-only, own=Dashboard editable |
| **Inventory Events** | sale, inward, adjustment | Events only, never "set stock=X" |
| **Daily Summary** | totals, breakdown | POS widget must match Dashboard for same date |
| **Purchase Cart** | cart items, quantities | Polling (POS 30s) + WS (Dashboard), item merge |

---

### What Must NOT Sync (Critical)

| Item | Reason | Rule |
|------|--------|------|
| **SELL Cart** | Transient cashier state, high churn, ghost bills | Never sync to Dashboard |
| **POS UI State** | Rotating hints, expanded states, recent searches | Local only |
| **Held Bills** | Until explicit backend support | Local-to-device (Phase-1) |
| **Mock/Demo Data** | Corruption risk | Never write to backend |
| **SuperAdmin edits** | Not retailer UX | Never sync into retailer flow |

---

### Field-Level Sync Contract

**Product:**
```
Synced: productId, name, barcode(s), categoryId
NOT synced: recent searches, UI formatting
```

**StoreProduct:**
```
Synced: sellPrice, mrp, buyPrice (optional), currentStock, minThreshold, reorderQty
NOT synced: device-local scan buffer
```

**Supplier:**
```
Synced: supplierId, name, phone, gstin, source, isActive
Editable: Dashboard only (source=own)
NOT editable: POS (view-only)
```

**Inventory:**
```
Synced as EVENTS: sale, inward, adjustment
NEVER sync: "set stock = X" from client
Stock must be derived from ledger, not overwritten.
```

---

## Phase-1 Regression Checklist

### Must NOT Break
- [ ] Enrollment flow
- [ ] ui-status + flags sync
- [ ] SELL scan & cart
- [ ] Reorder tab gating
- [ ] Categories fetch

### Must Remain Store-Isolated
- [ ] Products search
- [ ] Categories
- [ ] Suppliers
- [ ] Inventory
- [ ] Reports

---

## Implementation Guardrails

1. **No DEMO_MODE for write paths** in Phase-1 production
2. **Server derives storeId** from token/JWT, never trust client storeId
3. **Prefer additive** endpoints/migrations; avoid breaking existing contracts
4. **Stable API shape**: every response includes `success`, `data`, consistent structure
5. **Structured logs** with prefix: `[pos]`, `[dash]`, `[admin]`, `[api]`

---

## Global Precision Rules (ALL Phase-1 Tickets)

> **These rules apply to EVERY Phase-1 ticket. No ticket is ✅ unless all global rules are followed.**

---

### A) Standardized Response Envelope (MANDATORY)

Every new Phase-1 endpoint MUST return this envelope:

**Success:**
```json
{
  "success": true,
  "data": { ... },
  "error": null,
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**Failure:**
```json
{
  "success": false,
  "data": null,
  "error": { "code": "VALIDATION_ERROR", "message": "Human-readable message" },
  "meta": { "requestId": "...", "timestamp": "..." }
}
```

**Reason:** Prevents contract drift between POS + Web + Admin. All clients can use same parsing logic.

**Error Codes (canonical):**
| Code | HTTP | Meaning |
|------|------|---------|
| `VALIDATION_ERROR` | 400 | Request body/params invalid |
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Valid token but no permission |
| `NOT_FOUND` | 404 | Resource doesn't exist |
| `CONFLICT` | 409 | Duplicate or state conflict |
| `INTERNAL_ERROR` | 500 | Server error |

---

### B) Idempotency for ALL Write APIs (MANDATORY for POS)

Every `POST` that writes data MUST accept:
```
Idempotency-Key: <uuid>
```
(header) OR `idempotencyKey` field in request body.

**Behavior:**
- If same key repeats within 24h window, return the same success response (no duplicate write)
- Store: `idempotency:{key}` → `{response, createdAt}` with 24h TTL

**Applies to:**
- `POST /api/v1/pos/stock-in`
- `POST /api/v1/pos/transactions` (future)
- `POST /api/v1/stock/adjust` (future)
- Any other write endpoint

**Reason:** POS operates on flaky networks. Retries without idempotency will double stock or create duplicate transactions.

---

### C) Timezone Day Boundary (MANDATORY)

For any "today" or date-based query:
- **"Today" = store timezone day, NOT UTC**
- Store timezone stored in `stores.timezone` (e.g., `Asia/Kolkata`)
- All date aggregations use `CONVERT_TZ()` or equivalent

**Mandatory Test:**
- Run daily summary query at 23:59 IST and 00:01 IST
- Verify correct date boundary (no off-by-one day errors)

**Example:**
```sql
-- Correct: uses store timezone
WHERE DATE(CONVERT_TZ(created_at, 'UTC', 'Asia/Kolkata')) = '2026-01-19'

-- WRONG: UTC date
WHERE DATE(created_at) = '2026-01-19'
```

---

### D) Logging Keys (MANDATORY)

Every API log line MUST include these fields:
```json
{
  "storeId": "store_123",
  "deviceId": "dev_456",      // if present (POS calls)
  "requestId": "req_789",
  "route": "POST /api/v1/pos/stock-in",
  "durationMs": 45,
  "statusCode": 200,
  "userId": "user_abc"        // if present (Dashboard/Admin)
}
```

**Reason:** Debugging without SSH. Logs must be queryable by storeId + requestId.

**Log prefix convention:**
- `[pos]` - POS app API calls
- `[dash]` - Dashboard API calls
- `[admin]` - SuperAdmin API calls
- `[api]` - Internal/shared

---

## Legend

| Status | Meaning |
|--------|---------|
| ⬜ | Not Started |
| 🟡 | In Progress |
| ✅ | Completed & Verified |
| 🔴 | Blocked |
| 🧪 | Needs Testing |

---

## Phase 0: Pre-Go-Live (Already Done)

| Ticket | Description | Status | Commit |
|--------|-------------|--------|--------|
| P0-001 | Device enrollment flow | ✅ | various |
| P0-002 | ui-status API v5 parsing | ✅ | d28f8d0 |
| P0-003 | Categories API fix | ✅ | various |
| P0-004 | SELL tab scan & cart | ✅ | existing |
| P0-005 | Reorder tab & policies | ✅ | existing |

---

## Phase 1: Go-Live Day 1 (P0) - CRITICAL

---

### POS-001: PURCHASE Tab Redesign

**Priority:** P0 | **Platform:** POS

#### Intent
Redesign the PURCHASE tab with a 50/50 segmented control showing Quick Purchase (scan items) and Live Suppliers (browse SKU grid from suppliers). Auto-restore to 50/50 after 6s inactivity. Rotating hints guide the user.

#### Contract
```
Uses existing APIs with X-Device-Token auth:
- GET /api/v1/pos/suppliers
  X-Device-Token: tok_...
  → { success: true, data: { suppliers: Supplier[] } }

- GET /api/v1/pos/suppliers/:id/products (required for SKU grid)
  X-Device-Token: tok_...
  → { success: true, data: { products: Product[] } }

- POST /api/v1/pos/stock-in (Quick Purchase submit)
  X-Device-Token: tok_...
  → { success: true, data: { ledgerEntryId, itemsProcessed, ... } }
```

#### DB (Backend Truth Dependencies)
> **Addendum Point 4:** POS-001 depends on backend DB truth, not "no changes"

| Table | Purpose | Required For |
|-------|---------|--------------|
| `suppliers` | Store + global supplier list | Suppliers dropdown |
| `supplier_products` | Supplier → product mapping (store-scoped) | Live Suppliers SKU grid |
| `stock_in_ledger` | Ledger entries for inward stock | Stock-In history |
| `stock_in_items` | Line items per ledger entry | Stock-In details |
| `store_products.stock_qty` | Inventory increment via ledger event | Stock update (NOT client "set stock") |

**Rule:** Stock updates ONLY via ledger events, never direct client overwrites.

#### 50/50 Toggle State Machine (REQUIRED)
```
┌─────────────────────────────────────────────────────────────┐
│ Default State: 50/50 (both segments visible, equal height)  │
├─────────────────────────────────────────────────────────────┤
│ User taps Quick Purchase → Quick Purchase expands fully     │
│ User taps Live Suppliers → Live Suppliers expands fully     │
│ No activity for 6s → restore 50/50                          │
│ User starts scanning/searching → KEEP active state          │
│   (do NOT auto-collapse mid-flow)                           │
└─────────────────────────────────────────────────────────────┘
```

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| POS-001a | 50/50 segmented control UI | ✅ | 8f659d0 |
| POS-001b | Camera icon → scanner | ✅ | 8f659d0 |
| POS-001c | Rotating hints (8 strings, 1s) | ✅ | 8f659d0 |
| POS-001d | Auto-restore 50/50 after 6s | ✅ | 8f659d0 |
| POS-001e | Quick Purchase item rows | ✅ | 8f659d0 |
| POS-001f | Live Suppliers SKU grid (3 col) | ✅ | 8f659d0 |
| POS-001g | Connect to real suppliers API | 🧪 | suppliersApi.ts ready, needs VM test |
| POS-001h | Test on Redmi device | ⬜ | |
| POS-001i | State machine: keep active during scan/search | ⬜ | Don't auto-collapse mid-flow |
| POS-001j | Live Suppliers: real data only (no mock) | ⬜ | Blocked by UI-005 |

#### Steps (for POS-001g)
1. [ ] Verify `GET /api/v1/pos/suppliers` works on VM: `curl -H "X-Device-Token: tok_..." http://34.14.220.171:3000/api/v1/pos/suppliers`
2. [ ] Test PurchaseScreen.tsx loads suppliers list
3. [ ] Test SKU grid renders supplier products (requires supplier_products mapping)
4. [ ] Test Quick Purchase scanner adds items

#### Verification
- [ ] VM curl: `curl -X GET .../suppliers` returns `{ success: true, data: { suppliers: [...] } }`
- [ ] POS UI: PURCHASE tab shows supplier list
- [ ] POS UI: Tapping supplier shows SKU grid
- [ ] POS UI: Scanner adds items to quick purchase
- [ ] Regression: SELL tab still works

#### Rollback
```bash
git revert <commit-hash>  # Revert UI changes
# Or set DEMO_MODE = true in suppliersApi.ts
```

#### Precision Rules (POS-001)

**State Machine Correctness:**
- Auto-restore 50/50 ONLY if: no scan input, no typing, no item add/remove, no scroll for 6s
- If scanning started → NEVER auto-collapse for 15s after last scan (grace period)
- User interaction resets the 6s timer

**Supplier Selection Persistence:**
- Persist last selected supplier in local device storage **per storeId**
- Key: `lastSupplier:{storeId}` → `supplierId`
- If store changes (device re-enrolled), do NOT reuse previous supplier selection

**Fallback Path When Suppliers API Down:**
- Live Suppliers tab shows: "Backend unavailable" + Retry button
- Quick Purchase stays usable (draft-only if stock-in API missing)
- Do NOT crash or show blank screen

**Strict "No Mock SKUs" Enforcement:**
- If API missing OR returns empty array: show "Coming soon / No catalog for this supplier"
- NEVER render fake rows or placeholder products
- `LIVE_SUPPLIERS_ENABLED = false` gates the entire SKU grid

---

### POS-002: Daily Summary Widget on MenuScreen

**Priority:** P0 | **Platform:** POS

#### Intent
Show today's sales summary (total sales, bills, cash, UPI) on the MenuScreen as a quick glance widget. Tapping "View Full Report" navigates to SalesReportScreen.

#### Contract
```
GET /api/v1/pos/daily-summary
X-Device-Token: tok_...

Response:
{
  "success": true,
  "data": {
    "date": "2026-01-19",
    "totalSales": 1245000,      // paise
    "totalBills": 23,
    "averageBillValue": 54130,
    "paymentBreakdown": {
      "cash": 820000,
      "upi": 425000,
      "card": 0,
      "credit": 0
    },
    "itemsSold": 87,
    "topSellingItems": [
      { "productId": "...", "productName": "Toor Dal 1kg", "quantitySold": 15, "totalAmount": 210000 }
    ]
  }
}
```

#### DB
Backend needs to aggregate from `transactions` table:
```sql
SELECT
  DATE(created_at) as date,
  SUM(total_amount) as totalSales,
  COUNT(*) as totalBills,
  AVG(total_amount) as averageBillValue
FROM transactions
WHERE store_id = ? AND DATE(created_at) = CURDATE()
GROUP BY DATE(created_at);
```

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| POS-002a | Create DailySummaryWidget component | ⬜ | |
| POS-002b | Add widget to MenuScreen.tsx | ⬜ | |
| POS-002c | Connect to GET /api/v1/pos/daily-summary | ⬜ | dailySummaryApi.ts ready |
| POS-002d | Handle loading/error states | ⬜ | |
| POS-002e | "View Full Report" navigation | ⬜ | |
| POS-002f | Empty state: render correctly when summary is zero | ⬜ | Show ₹0, 0 bills |
| POS-002g | Match backend aggregation exactly (cash/upi totals) | ⬜ | Verify against curl |

#### Steps
1. [ ] Create `src/components/DailySummaryWidget.tsx`
2. [ ] Design UI per spec (see below)
3. [ ] Call `getDailySummary()` from `dailySummaryApi.ts`
4. [ ] Add to MenuScreen.tsx above menu items
5. [ ] Add navigation to SalesReportScreen on tap

#### UI Spec
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

#### Verification
- [ ] VM curl: `curl -X GET .../daily-summary` returns valid JSON
- [ ] POS UI: Widget shows on MenuScreen
- [ ] POS UI: Shows correct values (match curl)
- [ ] POS UI: "View Full Report" navigates
- [ ] Regression: Menu items still work

#### Rollback
```bash
# Remove widget from MenuScreen.tsx
# Delete DailySummaryWidget.tsx
```

#### Precision Rules (POS-002)

**Exact Money Unit Rule:**
- `totalSales`, `cash`, `upi`, `card`, `credit` are ALWAYS **paise** from backend
- Formatting to ₹ happens in UI only (divide by 100, add commas)
- NEVER mix ₹ values in API responses

**Cache Strategy:**
- Backend caches per store + date: `daily_summary:{storeId}:{YYYY-MM-DD}` with 60s TTL
- POS widget refresh: no more than once every 30-60s (rate limit on client)
- Pull-to-refresh triggers immediate fetch (bypass local throttle)

**Zero-Store Behavior:**
- MUST render full widget with ₹0 and counts 0
- No "empty widget" or "no data" state for zero sales
- Show: "₹0 | 0 bills | ₹0 cash | ₹0 UPI"

**Timezone Rule:**
- "Today" = store timezone day (see Global Rule C)
- Widget title should show: "Today's Summary" (not date, unless store timezone differs from device)

---

### POS-003: Strong Search in BUY Tab

**Priority:** P0 | **Platform:** POS

#### Intent
Enhanced search in BUY tab: search by product name (partial, fuzzy), barcode (exact), with category, stock, supplier, and price filters per spec.

#### Contract
```
GET /api/v1/pos/products/search
  ?q=<search-term>
  &barcode=<exact-barcode>
  &category=<category-id>
  &stockStatus=in|low|out
  &supplierId=<supplier-id>
  &priceMin=<min-paise>
  &priceMax=<max-paise>

Response: { products: Product[] }
```

#### DB
No changes - uses existing products table with indexes on `name`, `barcode`, `category_id`, `stock_qty`.

#### Go-Live Correctness Rules
```
- Store isolation ALWAYS: search results must only show store products
- Results must be scoped by storeId from token (server-side)
- No cross-store prefill or leakage
```

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| POS-003a | Search by product name (partial, fuzzy) | 🟡 | Basic search done |
| POS-003b | Search by barcode (exact match) | ⬜ | |
| POS-003c | Category filter dropdown | ⬜ | |
| POS-003d | Stock status filter (In/Low/Out) | ⬜ | |
| POS-003e | Recent searches history | ⬜ | AsyncStorage |
| POS-003f | Supplier filter (per spec) | ⬜ | |
| POS-003g | Price range filter (per spec) | ⬜ | |
| POS-003h | Store isolation verification | ⬜ | Results scoped to store only |

#### Steps
1. [ ] Add barcode exact-match to search API call
2. [ ] Add CategoryPicker component
3. [ ] Add StockFilter component (In Stock / Low / Out)
4. [ ] Add SupplierPicker component
5. [ ] Add PriceRangeFilter component
6. [ ] Store recent searches in AsyncStorage
7. [ ] Show recent searches on empty search
8. [ ] Verify store isolation (server must scope by storeId from token)

#### Verification
- [ ] POS UI: Search by name returns matches
- [ ] POS UI: Search by barcode returns exact match
- [ ] POS UI: Category filter works
- [ ] POS UI: Stock filter works
- [ ] Regression: Add to cart still works

#### Rollback
Revert changes to BuyTab search components.

#### Precision Rules (POS-003)

**Search Priority and Dedupe:**
- If barcode matches, return that exact product **first** in results
- If multiple barcodes map to one product, dedupe by `productId`
- Sort: exact barcode match → name starts with → name contains

**Server-Side Filtering Only:**
- Category/stock/supplier/price filters MUST be executed server-side
- UI MUST NOT fetch huge data and filter locally
- Query params sent to server; server returns filtered results

**Recent Search Storage:**
- Store recent searches **per storeId** (no cross-store leakage)
- Key: `recentSearches:{storeId}` → `string[]` (max 10)
- Clear on store change (device re-enrollment)

**Latency Acceptance:**
- Search API MUST respond < 300ms p95 on demo store dataset
- If > 500ms, show loading spinner
- Debounce search input: 300ms after last keystroke

**Store Isolation Verification:**
- All search results scoped to store from token (server-side)
- Test: Store A token cannot see Store B products

---

### API-000: POS Contract Probe Endpoint (Readiness Checker)

**Priority:** P0 | **Platform:** Admin | **Type:** Infrastructure

#### Intent
A simple admin-accessible route to check Phase-1 API readiness without needing device tokens or SSH. Makes UI-004 (SuperAdmin Probe Panel) much easier to implement.

#### Contract
```
GET /admin/probe/store/:storeId/pos-contracts
Authorization: Bearer <admin-jwt>

Response:
{
  "success": true,
  "data": {
    "storeId": "store_123",
    "storeCode": "DEMO001",
    "timestamp": "2026-01-19T10:30:00Z",
    "endpoints": [
      {
        "endpoint": "/api/v1/pos/suppliers",
        "exists": true,
        "authOk": true,
        "contractOk": true,
        "isolationOk": true,
        "status": "READY",
        "latencyMs": 45
      },
      {
        "endpoint": "/api/v1/pos/daily-summary",
        "exists": true,
        "authOk": true,
        "contractOk": false,
        "isolationOk": false,
        "status": "NOT_READY",
        "error": "paymentBreakdown missing 'card' key"
      },
      {
        "endpoint": "/api/v1/pos/stock-in",
        "exists": false,
        "authOk": false,
        "contractOk": false,
        "isolationOk": false,
        "status": "NOT_READY",
        "error": "404 Not Found"
      }
    ],
    "summary": {
      "total": 5,
      "ready": 1,
      "notReady": 4
    }
  }
}
```

#### How It Works
1. Admin calls probe endpoint with admin JWT
2. Server uses stored device token OR impersonates store to call POS endpoints
3. Server checks each endpoint for 4-column readiness
4. Returns aggregated status

#### DB
None (uses existing tokens/stores tables).

#### Sub-tickets

| ID | Description | Status | Layer |
|----|-------------|--------|-------|
| API-000a | Create probe endpoint route | ⬜ | API |
| API-000b | Implement per-endpoint health check | ⬜ | API |
| API-000c | Contract validation (check response shape) | ⬜ | API |
| API-000d | Isolation check (cross-store query test) | ⬜ | API |
| API-000e | Integrate with UI-004 Admin Probe Panel | ⬜ | Admin |

#### Verification
- [ ] Admin JWT can call probe endpoint
- [ ] Response shows accurate readiness for each endpoint
- [ ] UI-004 can consume this to render pass/fail badges

#### Rollback
Remove probe endpoint route.

#### Precision Rules (API-000)

**Endpoint List (Phase-1):**
```typescript
const PHASE1_ENDPOINTS = [
  { path: '/api/v1/pos/suppliers', method: 'GET' },
  { path: '/api/v1/pos/daily-summary', method: 'GET' },
  { path: '/api/v1/pos/stock-in', method: 'POST' },
  { path: '/api/v1/pos/stock-in', method: 'GET' },
  { path: '/api/v1/pos/suppliers/:id/products', method: 'GET' },
];
```

**Status Values:**
| Status | Meaning |
|--------|---------|
| `READY` | All 4 columns green |
| `NOT_READY` | At least one column red |
| `UNKNOWN` | Probe failed (timeout, network error) |

---

### API-001: Suppliers API (Vertical Slice)

**Priority:** P0 | **Platform:** ALL | **Type:** Vertical Slice

> **Addendum Point 3:** API tickets are vertical slices, not "blocked by backend team"

#### Intent
Complete end-to-end suppliers feature: DB → API → VM deploy → POS consumes → Dashboard consumes → SuperAdmin verifies

#### Contract
```
GET /api/v1/pos/suppliers
X-Device-Token: tok_...

Response:
{
  "success": true,
  "data": {
    "suppliers": [
      {
        "id": "sup_123",
        "name": "Sharma Traders",
        "phone": "9876543210",
        "gstin": "27AABCS1234A1Z5",
        "source": "own",
        "isEditable": true,
        "isActive": true
      },
      {
        "id": "sm_metro",
        "name": "Metro Cash & Carry",
        "phone": "1800123456",
        "gstin": "29AABCM5678B1Z3",
        "source": "supermandi",
        "isEditable": false,
        "isActive": true
      }
    ]
  }
}
```

#### DB
```sql
-- suppliers table (production-safe, idempotent migration)
CREATE TABLE IF NOT EXISTS suppliers (
  id VARCHAR(36) PRIMARY KEY,
  store_id VARCHAR(36),           -- NULL for SuperMandi global suppliers
  name VARCHAR(255) NOT NULL,
  phone VARCHAR(20),
  email VARCHAR(255),
  address TEXT,
  gstin VARCHAR(20),
  source ENUM('own', 'supermandi') DEFAULT 'own',
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  INDEX idx_store_id (store_id),
  INDEX idx_source (source)
);
```

#### Vertical Slice Sub-tickets

| ID | Description | Status | Layer |
|----|-------------|--------|-------|
| API-001a | DB migration (idempotent) | ⬜ | DB |
| API-001b | GET /api/v1/pos/suppliers route | ⬜ | API |
| API-001c | Seed SuperMandi suppliers | ⬜ | DB |
| API-001d | Deploy to VM | ⬜ | Deploy |
| API-001e | POS consumes (PurchaseScreen) | ⬜ | POS |
| API-001f | Dashboard consumes (WEB-003) | ⬜ | Web |
| API-001g | SuperAdmin probe verifies | ⬜ | Admin |
| API-001h | Store isolation test | ⬜ | Security |

#### Steps (Vertical Slice)
1. [ ] **DB:** Run idempotent migration on VM
2. [ ] **API:** Implement GET endpoint in gateway/pos-service
3. [ ] **Deploy:** Deploy to VM, verify with curl using real X-Device-Token
4. [ ] **POS:** PurchaseScreen.tsx calls suppliersApi.ts, displays suppliers
5. [ ] **Web:** Dashboard SuppliersPage calls same API (via retailer auth proxy if needed)
6. [ ] **Admin:** SuperAdmin probe panel can fetch suppliers for DEMO001
7. [ ] **Isolation:** Verify Store A token cannot see Store B suppliers

#### Verification (4-Column Readiness)
| Check | Status |
|-------|--------|
| Exists? | ⬜ |
| Auth OK? (X-Device-Token) | ⬜ |
| Contract OK? | ⬜ |
| Isolation OK? | ⬜ |

#### Rollback
```sql
DROP TABLE IF EXISTS suppliers;
```

#### Precision Rules (API-001)

**Split Endpoints (POS vs Dashboard):**
- POS read endpoint: `GET /api/v1/pos/suppliers` (X-Device-Token)
- Dashboard CRUD endpoints: `GET/POST/PUT/DELETE /api/v1/retailers/suppliers` (JWT)
- Both MUST return the same `Supplier` DTO shape

**Global + Store Supplier Merge Rule:**
- Response returns: `supermandi` suppliers + store `own` suppliers
- Order: own suppliers first, then supermandi (explicit grouping)
- Both sets in same array with `source` field distinguishing them

**Editability Computed Server-Side:**
- NEVER let client decide `isEditable`
- Server sets `isEditable: true` if `source === 'own'` AND request is from Dashboard JWT
- POS always sees `isEditable: false` (view-only)

**DB Uniqueness:**
- Prevent duplicate supplier names per store:
  ```sql
  UNIQUE INDEX idx_store_name (store_id, LOWER(name)) WHERE source = 'own'
  ```
- Allow same name across different stores

**Response DTO:**
```typescript
interface Supplier {
  id: string;
  name: string;
  phone: string | null;
  gstin: string | null;
  source: 'own' | 'supermandi';
  isEditable: boolean;  // computed server-side
  isActive: boolean;
}
```

---

### API-002: Daily Summary API (Vertical Slice)

**Priority:** P0 | **Platform:** ALL | **Type:** Vertical Slice

> **Addendum Point 3:** API tickets are vertical slices, not "blocked by backend team"

#### Intent
Complete end-to-end daily summary feature: DB aggregation → API → VM deploy → POS widget → Dashboard Home → SuperAdmin probe

#### Contract
```
GET /api/v1/pos/daily-summary?date=2026-01-19
X-Device-Token: tok_...

Response:
{
  "success": true,
  "data": {
    "date": "2026-01-19",
    "totalSales": 1245000,
    "totalBills": 23,
    "averageBillValue": 54130,
    "paymentBreakdown": {
      "cash": 820000,
      "upi": 425000,
      "card": 0,
      "credit": 0
    },
    "itemsSold": 87,
    "topSellingItems": [
      { "productId": "prod_1", "productName": "Toor Dal 1kg", "quantitySold": 15, "totalAmount": 210000 }
    ]
  }
}
```

#### DB
Uses existing `transactions` and `transaction_items` tables:
```sql
-- Aggregation query (store-scoped, timezone-aware)
SELECT
  DATE(CONVERT_TZ(t.created_at, 'UTC', store.timezone)) as date,
  SUM(t.total_amount) as totalSales,
  COUNT(DISTINCT t.id) as totalBills,
  AVG(t.total_amount) as averageBillValue,
  SUM(CASE WHEN t.payment_method = 'cash' THEN t.total_amount ELSE 0 END) as cash,
  SUM(CASE WHEN t.payment_method = 'upi' THEN t.total_amount ELSE 0 END) as upi,
  SUM(ti.quantity) as itemsSold
FROM transactions t
LEFT JOIN transaction_items ti ON ti.transaction_id = t.id
WHERE t.store_id = ? AND DATE(CONVERT_TZ(t.created_at, 'UTC', ?)) = ?
GROUP BY DATE(CONVERT_TZ(t.created_at, 'UTC', store.timezone));
```

#### Vertical Slice Sub-tickets

| ID | Description | Status | Layer |
|----|-------------|--------|-------|
| API-002a | GET /api/v1/pos/daily-summary route | ⬜ | API |
| API-002b | Aggregation query (store-scoped) | ⬜ | DB |
| API-002c | Timezone handling (store.timezone) | ⬜ | API |
| API-002d | Empty store returns zeros | ⬜ | API |
| API-002e | Deploy to VM | ⬜ | Deploy |
| API-002f | POS widget consumes (MenuScreen) | ⬜ | POS |
| API-002g | Dashboard Home consumes (WEB-002) | ⬜ | Web |
| API-002h | SuperAdmin probe verifies | ⬜ | Admin |
| API-002i | POS widget matches Dashboard (SYNC-004) | ⬜ | Sync |

#### Steps (Vertical Slice)
1. [ ] **API:** Implement GET endpoint with aggregation query
2. [ ] **Timezone:** Use store timezone (Asia/Kolkata for DEMO001)
3. [ ] **Empty:** Return zeros for empty store, not error
4. [ ] **Deploy:** Deploy to VM, verify with curl using real X-Device-Token
5. [ ] **POS:** MenuScreen widget displays summary via dailySummaryApi.ts
6. [ ] **Web:** Dashboard Home shows same numbers (WEB-002)
7. [ ] **Admin:** SuperAdmin probe can fetch for DEMO001
8. [ ] **Sync:** Verify POS widget = Dashboard report for same date

#### Verification (4-Column Readiness)
| Check | Status |
|-------|--------|
| Exists? | ⬜ |
| Auth OK? (X-Device-Token) | ⬜ |
| Contract OK? | ⬜ |
| Isolation OK? | ⬜ |

#### Rollback
Remove endpoint from routes.

#### Precision Rules (API-002)

**Payment Method Canonical Keys:**
- Response `paymentBreakdown` MUST include ALL keys always present:
  ```json
  "paymentBreakdown": {
    "cash": 820000,
    "upi": 425000,
    "card": 0,
    "credit": 0
  }
  ```
- Even if no transactions, all keys present with value `0`

**Top Items Join Definition:**
- MUST return `productId` + `productName` (name resolved server-side)
- Never require client to look up product name separately
- Limit: 5 items by default, configurable via `?topItemsLimit=N`

**Date Parameter:**
- Contract MUST support `?date=YYYY-MM-DD` for historical queries
- Default (no param): today in store timezone
- Admin probe can verify any historical day

**Zero-Store Response:**
- Empty store returns full response with zeros (not error, not 404):
  ```json
  {
    "success": true,
    "data": {
      "date": "2026-01-19",
      "totalSales": 0,
      "totalBills": 0,
      "averageBillValue": 0,
      "paymentBreakdown": { "cash": 0, "upi": 0, "card": 0, "credit": 0 },
      "itemsSold": 0,
      "topSellingItems": []
    }
  }
  ```

---

### API-003: Stock-In API (Vertical Slice)

**Priority:** P0 | **Platform:** ALL | **Type:** Vertical Slice

> **Addendum Point 3:** API tickets are vertical slices, not "blocked by backend team"

#### Intent
Complete end-to-end stock-in feature: DB → API → VM deploy → POS Quick Purchase submits → Dashboard sees history → SuperAdmin verifies ledger

#### Contract
```
POST /api/v1/pos/stock-in
X-Device-Token: tok_...
Content-Type: application/json

Request:
{
  "supplierId": "sup_123",          // optional
  "supplierName": "Sharma Traders", // for display
  "items": [
    {
      "barcode": "8901234567890",
      "productName": "Toor Dal 1kg",
      "quantity": 10,
      "buyPrice": 8500,   // paise
      "sellPrice": 10000, // paise
      "isNewProduct": false
    }
  ],
  "notes": "Weekly restock",
  "totalAmount": 85000
}

Response:
{
  "success": true,
  "data": {
    "ledgerEntryId": "LE-2026-001",
    "itemsProcessed": 1,
    "totalAmount": 85000,
    "createdAt": "2026-01-19T10:30:00Z"
  }
}

GET /api/v1/pos/stock-in (history)
X-Device-Token: tok_...

Response:
{
  "success": true,
  "data": {
    "entries": [...]
  },
  "pagination": { "total": 10, "limit": 20, "offset": 0 }
}
```

#### DB
```sql
-- stock_in_ledger table (production-safe, idempotent)
CREATE TABLE IF NOT EXISTS stock_in_ledger (
  id VARCHAR(36) PRIMARY KEY,
  store_id VARCHAR(36) NOT NULL,
  supplier_id VARCHAR(36),
  supplier_name VARCHAR(255),
  item_count INT NOT NULL,
  total_amount BIGINT NOT NULL,
  notes TEXT,
  status ENUM('pending', 'completed', 'cancelled') DEFAULT 'completed',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

  INDEX idx_store_id (store_id),
  INDEX idx_created_at (created_at)
);

-- stock_in_items table
CREATE TABLE IF NOT EXISTS stock_in_items (
  id VARCHAR(36) PRIMARY KEY,
  ledger_id VARCHAR(36) NOT NULL,
  barcode VARCHAR(50),
  product_name VARCHAR(255),
  quantity INT NOT NULL,
  buy_price BIGINT NOT NULL,
  sell_price BIGINT NOT NULL,
  is_new_product BOOLEAN DEFAULT FALSE,

  FOREIGN KEY (ledger_id) REFERENCES stock_in_ledger(id)
);
```

#### Vertical Slice Sub-tickets

| ID | Description | Status | Layer |
|----|-------------|--------|-------|
| API-003a | DB migration (idempotent) | ⬜ | DB |
| API-003b | POST /api/v1/pos/stock-in route | ⬜ | API |
| API-003c | Increment store_products.stock_qty via ledger event | ⬜ | API |
| API-003d | GET /api/v1/pos/stock-in (history) route | ⬜ | API |
| API-003e | Deploy to VM | ⬜ | Deploy |
| API-003f | POS Quick Purchase submits (remove DEMO_MODE) | ⬜ | POS |
| API-003g | Dashboard sees stock-in history (future) | ⬜ | Web |
| API-003h | SuperAdmin probe verifies ledger entries | ⬜ | Admin |
| API-003i | Store isolation test | ⬜ | Security |

#### Steps (Vertical Slice)
1. [ ] **DB:** Run idempotent migration on VM
2. [ ] **API:** Implement POST endpoint that creates ledger + items + increments stock
3. [ ] **API:** Implement GET history endpoint (store-scoped)
4. [ ] **Deploy:** Deploy to VM, verify with curl using real X-Device-Token
5. [ ] **POS:** Remove `DEMO_MODE = true` from stockInApi.ts:66, test Quick Purchase submit
6. [ ] **POS:** Set `STOCK_IN_API_AVAILABLE = true` in PurchaseScreen.tsx:96
7. [ ] **Web:** Dashboard stock-in history (future, not Phase-1)
8. [ ] **Admin:** SuperAdmin probe can verify ledger entries
9. [ ] **Isolation:** Verify Store A token cannot create stock-in for Store B

#### Verification (4-Column Readiness)
| Check | Status |
|-------|--------|
| Exists? | ⬜ |
| Auth OK? (X-Device-Token) | ⬜ |
| Contract OK? | ⬜ |
| Isolation OK? | ⬜ |

#### Rollback
```sql
DROP TABLE IF EXISTS stock_in_items;
DROP TABLE IF EXISTS stock_in_ledger;
```

**POS Gating:**
- `stockInApi.ts` has `DEMO_MODE = true` (line 66) — remove when API deployed
- `PurchaseScreen.tsx` has `STOCK_IN_API_AVAILABLE = false` (line 96) — set true when API deployed

#### Precision Rules (API-003)

**Mandatory 2-Step Model (Future-Safe):**
- Phase-1 MVP: single submit OK, but schema supports states: `pending`, `completed`, `cancelled`
- Future: support draft → submit → complete flow
- `status` field always present in response

**Inventory Mutation Rule:**
- Stock update computed **server-side** only:
  ```sql
  UPDATE store_products
  SET current_stock = current_stock + :quantity,
      last_buy_price = :buyPrice,
      updated_at = NOW()
  WHERE store_id = :storeId AND barcode = :barcode;
  ```
- NEVER accept `stock = X` from client (only deltas via events)

**Idempotency (CRITICAL):**
- MUST be idempotent (see Global Rule B)
- Without idempotency, POS retries will **double stock**
- Same `Idempotency-Key` returns same response, no duplicate ledger entry

**Validation Rules:**
| Field | Rule | Error Code |
|-------|------|------------|
| `quantity` | Must be > 0 | `INVALID_QUANTITY` |
| `barcode` | Must be non-empty | `MISSING_BARCODE` |
| `buyPrice` | Must be >= 0 | `INVALID_PRICE` |
| `sellPrice` | Must be >= 0 | `INVALID_PRICE` |
| `isNewProduct` | If true, server creates/attaches product OR rejects with `PRODUCT_NOT_FOUND` | |

**History Endpoint:**
- `GET /api/v1/pos/stock-in` MUST be store-scoped and paginated
- Response: `{ entries: [...], pagination: { total, limit, offset } }`
- Sort: `created_at DESC` (newest first)

**New Product Handling:**
- If `isNewProduct: true` and product doesn't exist in store catalog:
  - Option A: Auto-create store product from barcode (if global product exists)
  - Option B: Reject with `PRODUCT_NOT_FOUND` error (safer for Phase-1)
- Document which option is implemented

---

### WEB-001: Retailer Dashboard - Auth & Shell

**Priority:** P0 | **Platform:** Web

#### Intent
Login page with phone + OTP via Firebase Auth, dashboard shell with sidebar navigation, custom JWT handling, and logout.

> **Addendum Point 7:** This ticket reflects Firebase phone-OTP auth already deployed (not custom OTP endpoints).

#### Contract (Firebase Auth Flow)
```
1. Client-side: Firebase Auth signInWithPhoneNumber
   - Firebase handles OTP send/verify directly
   - Returns Firebase ID token on success

2. Backend: Exchange Firebase token for custom JWT
POST /api/v1/retailers/auth/firebase-login
Authorization: Bearer <firebase-id-token>
{ "phone": "9876543210" }

Response:
{
  "success": true,
  "data": {
    "token": "custom-jwt...",
    "retailer": {
      "id": "ret_123",
      "name": "Sharma Store",
      "phone": "9876543210",
      "stores": [{ "id": "store_1", "storeCode": "DEMO001", "name": "Sharma Mart" }]
    }
  }
}

3. Authenticated requests use custom JWT
GET /api/v1/retailers/me
Authorization: Bearer <custom-jwt>
→ { "success": true, "data": { "id": "...", "name": "...", "stores": [...] } }
```

#### Auth Flow Diagram
```
┌─────────────────────────────────────────────────────────────────────┐
│ User enters phone → Firebase sends OTP → User enters OTP            │
│ → Firebase verifies → Firebase ID token returned                    │
│ → POST /firebase-login with Firebase token                          │
│ → Backend verifies Firebase token, finds/creates retailer           │
│ → Returns custom JWT + retailer data                                │
│ → Dashboard stores JWT, navigates to Home                           │
└─────────────────────────────────────────────────────────────────────┘
```

#### DB
Uses existing `retailers` table. Firebase handles OTP, no `otp_codes` table needed.

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| WEB-001a | Login page (phone + Firebase OTP) | ⬜ | Firebase Auth SDK |
| WEB-001b | Firebase → custom JWT exchange | ⬜ | Backend POST /firebase-login |
| WEB-001c | Dashboard shell/layout | ⬜ | |
| WEB-001d | Sidebar navigation | ⬜ | |
| WEB-001e | Auth context & JWT handling | ⬜ | Custom JWT, not Firebase token |
| WEB-001f | Logout functionality | ⬜ | Clear JWT + Firebase signOut |

#### Steps
1. [ ] Create `retailer-admin/` Vite + React + Tailwind project
2. [ ] Initialize Firebase Auth with phone provider
3. [ ] Create LoginPage with phone input + Firebase OTP flow
4. [ ] Implement RecaptchaVerifier for phone auth
5. [ ] On Firebase success, call POST /firebase-login with ID token
6. [ ] Store custom JWT in localStorage + AuthContext
7. [ ] Create DashboardLayout with sidebar
8. [ ] Add logout that clears JWT + calls Firebase signOut

#### Verification
- [ ] Dashboard UI: Can login with phone + OTP
- [ ] Dashboard UI: Shows sidebar after login
- [ ] Dashboard UI: Logout clears session
- [ ] VM curl: Auth APIs respond correctly

#### Rollback
Delete `retailer-admin/` folder.

#### Precision Rules (WEB-001)

**Store Scope Lock:**
- After login, if retailer has multiple stores: show store selector
- Once selected, ALL API calls include store context server-side
- Client does NOT pass `storeId` to fetch data — derived from JWT + selected store

**JWT Storage Rule:**
- Store custom JWT in: memory (primary) + localStorage (persistence)
- On page reload: restore from localStorage → verify with `/api/v1/retailers/me`
- If expired/invalid: clear and redirect to login
- Logout: clear localStorage + call Firebase signOut

**Header Identity (MANDATORY):**
- Top bar MUST always show: `[StoreCode] StoreName`
- Example: `[DEMO001] Sharma Mart`
- Helps ops verify which store context is active

**Session Timeout:**
- JWT expiry: 24h (configurable)
- Show warning 5 min before expiry: "Session expiring, click to refresh"
- On expiry: redirect to login with message

---

### WEB-002: Dashboard Home Page

**Priority:** P0 | **Platform:** Web

#### Intent
Dashboard home page showing today's sales, monthly summary, low stock alerts, and sales trend chart.

#### Contract
Uses API-002 daily-summary plus:
```
GET /api/v1/retailers/dashboard/overview
→ {
    "today": { totalSales, totalBills, ... },
    "thisMonth": { totalSales, totalBills, ... },
    "lowStockCount": 12,
    "pendingOrders": 3,
    "salesTrend": [ { date, sales }, ... ]  // last 7 days
  }
```

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| WEB-002a | Today's sales card | ⬜ | |
| WEB-002b | This month card | ⬜ | |
| WEB-002c | Low stock alert card | ⬜ | |
| WEB-002d | Pending orders card | ⬜ | |
| WEB-002e | Sales trend chart (7 days) | ⬜ | Chart.js or Recharts |
| WEB-002f | Top selling today list | ⬜ | |
| WEB-002g | Recent activity feed | ⬜ | |

#### Verification
- [ ] Dashboard UI: Cards show correct data
- [ ] Dashboard UI: Chart renders
- [ ] VM curl: Overview API responds

#### Rollback
Remove HomePage component.

#### Precision Rules (WEB-002)

**Must Consume Same API-002:**
- Do NOT build separate "overview" endpoint in Phase-1
- Use `/api/v1/pos/daily-summary` via JWT route (or retailer equivalent)
- Same aggregation logic for POS widget and Dashboard Home

**Error Handling:**
- If API down: show "Backend not ready" banner + Retry button
- Still render shell/sidebar (don't crash entire page)
- Skeleton cards while loading

**Data Consistency:**
- Values on Dashboard Home MUST match POS widget for same store/date
- Test: curl daily-summary, check POS widget, check Dashboard Home — all match

**Refresh Policy:**
- Auto-refresh: every 5 minutes when tab is focused
- Manual refresh: pull-to-refresh or refresh button

---

### WEB-003: Suppliers CRUD Page

**Priority:** P0 | **Platform:** Web

#### Intent
Page to view, add, edit, and delete retailer's own suppliers. SuperMandi suppliers shown as read-only.

#### Contract
```
GET /api/v1/retailers/suppliers
POST /api/v1/retailers/suppliers
PUT /api/v1/retailers/suppliers/:id
DELETE /api/v1/retailers/suppliers/:id
```

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| WEB-003a | Suppliers list table | ⬜ | |
| WEB-003b | Add supplier modal | ⬜ | |
| WEB-003c | Edit supplier modal | ⬜ | |
| WEB-003d | Delete supplier (confirm) | ⬜ | |
| WEB-003e | SuperMandi suppliers (view-only badge) | ⬜ | |
| WEB-003f | Search/filter suppliers | ⬜ | |

#### Verification
- [ ] Dashboard UI: List shows suppliers
- [ ] Dashboard UI: Can add new supplier
- [ ] Dashboard UI: Can edit own supplier
- [ ] Dashboard UI: Cannot edit SuperMandi supplier
- [ ] Dashboard UI: Can delete own supplier

#### Rollback
Remove SuppliersPage component.

#### Precision Rules (WEB-003)

**Hard Enforcement (Backend):**
- Backend MUST reject edits to `source=supermandi` suppliers
- Even if malicious UI tries `PUT /suppliers/:id` on supermandi supplier → 403 Forbidden
- Error: `{ "code": "FORBIDDEN", "message": "Cannot edit SuperMandi supplier" }`

**Immediate Reflection to POS:**
- After creating/editing/deleting supplier on Dashboard:
  - POS suppliers list shows change on next refresh
  - Define refresh policy: on Purchase tab open OR pull-to-refresh
  - No real-time sync required (polling is OK)

**UI Cues:**
- SuperMandi suppliers: show "SuperMandi" badge + disable Edit/Delete buttons
- Own suppliers: show "Own" badge or no badge + enable Edit/Delete
- Sort: own suppliers first, then supermandi

**Validation:**
- Supplier name: required, max 255 chars
- Phone: optional, validate format if provided
- GSTIN: optional, validate format if provided (15-char alphanumeric)

---

## Phase 1 Add-On: UI Reveal / Reachability (Must for Real Testing)

> **No ticket can be ✅ unless the feature is reachable in POS + Dashboard + SuperAdmin without manual deep links. If backend endpoints don't exist, UI must show a safe "Coming soon" state, not demo/mock data.**

---

### UI-001: POS Menu Reveals All Go-Live Pages

**Priority:** P0 | **Platform:** POS

#### Intent
Ensure every Phase-1 POS feature has a visible navigation entry (Menu / Tabs) so you can test on Redmi without deep links or hidden routes.

#### Contract
No new API. Uses existing navigation stack + feature flags (if any).

#### DB
None.

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| UI-001a | Audit routes/screens in POS app | ⬜ | |
| UI-001b | Add Menu entry: Reports → Sales Report | ⬜ | "Coming Soon" if not ready |
| UI-001c | Add Menu entry: Purchase → Stock In History | ⬜ | Disabled until API-003 |
| UI-001d | Add Diagnostics section (DEV/QA only) | ⬜ | API URL, storeId, deviceId, token, commit |
| UI-001e | Gate reveal logic by feature flag / __DEV__ / demo store | ⬜ | |

#### Steps
1. [ ] Audit all routes in POS navigation
2. [ ] Add Menu entries for Phase-1 features:
   - "Reports → Sales Report (Coming Soon)" OR real SalesReportScreen if implemented
   - "Purchase → Stock In History (Coming Soon)" OR disabled until API-003 exists
3. [ ] Add DEV/QA-only "Diagnostics" section (only for demo store or internal build):
   - Shows: API base URL, storeId, deviceId, token short, build commit ID
4. [ ] Gate all reveal logic by:
   - feature flag OR `__DEV__` OR "demo store only"

#### Verification
- [ ] POS Menu shows all items needed to reach Phase-1 tests
- [ ] No screen requires manual navigation hacks
- [ ] No crash on missing backend; missing features show "Coming soon" with reason

#### Rollback
Revert Menu changes; remove Diagnostics section.

---

### UI-002: Dashboard Reachable from Public URL (Store-Scoped Route)

**Priority:** P0 | **Platform:** Web

#### Intent
Make sure retailer-admin can be accessed via a stable URL, and it routes correctly for the demo store (DEMO001) so Phase-1 web tickets can be tested by anyone.

#### Contract
Must support one stable entry pattern:
```
/s/:storeCode/login and /s/:storeCode/*
OR
/retailer/* with storeCode resolved after login
```

#### DB
None directly, but relies on store lookup (already exists) OR storeCode embedded in URL.

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| UI-002a | Define canonical entry URL | ⬜ | `/s/DEMO001/login` recommended |
| UI-002b | Add router guard for auth | ⬜ | Redirect to login if no auth |
| UI-002c | Handle missing storeCode | ⬜ | Show "Store link required" |
| UI-002d | Display StoreCode + StoreName in header | ⬜ | After login |

#### Steps
1. [ ] Define canonical entry URL: `https://<domain>/s/DEMO001/login` (recommended)
2. [ ] Add router guard:
   - if no auth → redirect to login
   - if storeCode missing → show "Store link required"
3. [ ] Display StoreCode + StoreName in header after login

#### Verification
- [ ] Opening the URL loads login page
- [ ] After login, the shell loads and shows store identity
- [ ] Refresh keeps session and stays on same store route

#### Rollback
Revert route scheme; keep internal dev route only.

---

### UI-003: Dashboard Sidebar Reveals Suppliers + Home

**Priority:** P0 | **Platform:** Web

#### Intent
Make WEB-001/002/003 testable by ensuring the pages exist and are reachable, even if APIs are stubbed (page must fail gracefully, not blank).

#### Contract
Uses:
- WEB-001 auth endpoints (or existing login flow)
- API endpoints when available, else show "Backend not ready" with retry

#### DB
None.

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| UI-003a | Add Sidebar: Home | ⬜ | |
| UI-003b | Add Sidebar: Suppliers | ⬜ | |
| UI-003c | Add Sidebar: Products (disabled) | ⬜ | |
| UI-003d | Add Sidebar: Reports (disabled) | ⬜ | |
| UI-003e | Add Sidebar: Settings (disabled) | ⬜ | |
| UI-003f | HomePage skeleton cards | ⬜ | |
| UI-003g | SuppliersPage empty state | ⬜ | |

#### Steps
1. [ ] Add Sidebar items:
   - Home
   - Suppliers
   - Products (disabled)
   - Reports (disabled)
   - Settings (disabled)
2. [ ] Implement page shells:
   - HomePage skeleton cards
   - SuppliersPage empty state
3. [ ] Each page must show:
   - Loading state
   - Error + Retry button
   - Empty state

#### Verification
- [ ] Sidebar routes work
- [ ] Pages render without console explosion
- [ ] When API returns 404/500, UI shows proper error panel, not crash

#### Rollback
Revert sidebar/page shells.

---

### UI-004: SuperAdmin "Probe Panel" to Verify Demo Store Health

**Priority:** P0 | **Platform:** Admin

#### Intent
Add a minimal SuperAdmin UI surface that lets you verify store status + key Phase-1 APIs for DEMO001 without SSH every time.

#### Contract
Probe endpoints:
```
GET /admin/stores/:storeId (or existing admin store endpoints)

PLUS "proxy probe" calls from admin UI to:
- /api/v1/pos/suppliers
- /api/v1/pos/daily-summary
- /api/v1/pos/stock-in (later)

(If admin can't call device-token endpoints directly, needs server-side "probe" endpoint)
```

#### DB
None (UI only) unless you add a new admin probe endpoint.

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| UI-004a | Add Admin page: "Store Probe" | ⬜ | |
| UI-004b | Inputs: storeCode/storeId | ⬜ | |
| UI-004c | Button: "Fetch ui-status" | ⬜ | |
| UI-004d | Button: "Fetch suppliers" | ⬜ | |
| UI-004e | Button: "Fetch daily summary" | ⬜ | |
| UI-004f | Button: "Fetch categories" | ⬜ | |
| UI-004g | Render results JSON with pass/fail badges | ⬜ | |

#### Steps
1. [ ] Add Admin page: "Store Probe"
2. [ ] Add inputs:
   - storeCode/storeId
   - optional device token selector (if stored) OR admin uses server probe
3. [ ] Add probe buttons:
   - "Fetch ui-status"
   - "Fetch suppliers"
   - "Fetch daily summary"
   - "Fetch categories"
4. [ ] Render results JSON with clear pass/fail badges

#### Verification
- [ ] Can verify Phase-1 contracts without POS app
- [ ] Shows errors clearly (auth vs missing route vs DB)

#### Rollback
Remove probe panel route.

---

### UI-005: POS Purchase "Live Suppliers SKU Grid" Real Reveal Rule

**Priority:** P0 | **Platform:** POS

#### Intent
Prevent a fake sense of completion where "Live Suppliers" shows a grid but is not backed by real supplier products.

#### Contract
Requires one of:
```
GET /api/v1/pos/suppliers/:id/products
OR
GET /api/v1/pos/products/search?supplierId=...
```
If not available, Live Suppliers must show "Coming Soon" instead of fake SKUs.

#### DB
None in POS.

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| UI-005a | Check if supplier products endpoint exists | ✅ | curl returns 404 for both endpoints |
| UI-005b | Replace fake SKU grid with empty state | ✅ | LIVE_SUPPLIERS_ENABLED flag added |
| UI-005c | Show "Supplier catalog not enabled yet" message | ✅ | Empty state with blocker info |
| UI-005d | Add telemetry logs | ⬜ | supplierId, API called, count returned |

#### Implementation
**Commit:** b104702
**File:** `src/screens/PurchaseScreen.tsx`
**Changes:**
- Removed `MOCK_SKUS` array
- Added `LIVE_SUPPLIERS_ENABLED = false` flag (line 91)
- Added empty state container with "Supplier Catalog Coming Soon" message
- Shows blocker: "Requires: API-001 (supplier-product mapping)"
- Provides hint: "Use Quick Purchase to scan and add stock manually"

#### Steps
1. [x] If supplier products endpoint doesn't exist:
   - Replace Live Suppliers grid with empty state:
     - "Supplier catalog is not enabled yet"
     - "Backend: API-001 + supplier product mapping required"
2. [x] Only render SKU grid when real data present
3. [ ] Add telemetry logs:
   - supplierId selected
   - API called
   - count returned

#### Verification
- [x] No fake SKUs in production mode
- [x] If backend missing, UI clearly indicates blocker

#### Rollback
Revert gating; but do NOT revert to mock SKUs for go-live builds.

#### Precision Rules (UI-005)

**When `LIVE_SUPPLIERS_ENABLED = false`:**
- Show clear blocker message: "Supplier Catalog Coming Soon"
- Show required endpoints: "Requires: /suppliers/:id/products OR /products/search?supplierId="
- Add **"Retry API Check"** button that triggers lightweight probe call
  - On success: auto-enable and show SKU grid
  - On failure: keep disabled, show error

**When Enabled but API Returns Empty:**
- Show: "No products found for this supplier"
- NOT the same as "Coming Soon" — this means API works but catalog is empty

**Telemetry (for debugging):**
- Log on supplier select: `{ supplierId, timestamp }`
- Log on API call: `{ supplierId, endpoint, status, count, latencyMs }`

---

### UI-006: POS "Stock In" Flow Reveal + Gating

**Priority:** P0 | **Platform:** POS

#### Intent
Make Stock-In testable end-to-end once API-003 exists, while preventing broken UI flows today.

#### Contract
```
POST /api/v1/pos/stock-in
GET /api/v1/pos/stock-in (history)
```
If absent: UI shows disabled state.

#### DB
None in POS; backend in API-003.

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| UI-006a | Add visible entry: Purchase tab → "Stock In History" | ✅ | Menu → Stock Management → Stock Inward (existing) |
| UI-006b | Show disabled button + tooltip if API-003 not deployed | ✅ | "Stock In (Draft)" button + warning alert |
| UI-006c | Enable flow when API exists | ✅ | STOCK_IN_API_AVAILABLE flag gates behavior |
| UI-006d | Remove DEMO_MODE from stockInApi.ts when ready | ⬜ | Line 66 - blocked by API-003 |

#### Implementation
**Commit:** b104702
**File:** `src/screens/PurchaseScreen.tsx`
**Changes:**
- Added `STOCK_IN_API_AVAILABLE = false` flag (line 96)
- Stock In button shows "(Draft)" suffix when API unavailable
- Button styled with warning color when in draft mode
- Alert warns user: "Backend Pending - Stock In API is not deployed yet"
- Items remain **draft-only** until submitted; no local persistence
- "Draft" badge shown below item count (not "Demo Mode")

> **Addendum Point 6:** No "demo local save" — draft-only behavior means scans are draft until submitted. Button disabled + clear blocker reason. No promise of local persistence.

#### Steps
1. [x] Add a visible entry:
   - Purchase tab → "Stock In History" button
   - OR Menu → "Purchase → Stock In"
2. [x] If API-003 not deployed:
   - show disabled button + tooltip "Backend pending"
3. [ ] When API exists:
   - enable flow and remove `DEMO_MODE` from `stockInApi.ts`

#### Verification
- [x] Today: user sees feature but it's safely gated (no crash)
- [ ] After backend: feature works and updates stock

#### Rollback
Revert UI reveal; keep backend.

#### Precision Rules (UI-006)

**Draft Behavior (When API Missing):**
- "Draft only" SHOULD NOT persist across app restart
- Draft items are session-only (cleared on app close)
- Reason: avoid false trust that data is "saved somewhere"
- If explicit "Draft saved locally" feature added later, must be clearly communicated

**Auto-Switch When API Becomes Available:**
- UI automatically switches from Draft → Submit mode
- No manual toggle needed
- Detection: on app start or Purchase tab focus, probe API-003
- If probe succeeds: set `STOCK_IN_API_AVAILABLE = true` and remove "(Draft)" suffix

**User Messaging:**
| State | Button Text | Behavior |
|-------|-------------|----------|
| API missing | "Stock In (Draft)" | Warning alert on tap, draft-only |
| API available | "Stock In" | Normal submit flow |

**Clear Blocker Reason:**
- When disabled, show: "Stock In API not deployed yet"
- Show "Retry" button to re-probe
- Link to ticket: "See API-003 for status"

---

## Phase 1 Add-On: SYNC Tickets (Go-Live Correctness)

> These tickets enforce sync correctness and store isolation for production safety.

---

### SYNC-001: Store Isolation Enforcement

**Priority:** P0 | **Platform:** Backend

#### Intent
Every endpoint must be scoped by storeId from token. Dashboard storeCode route must not leak cross-store data.

#### Contract
```
All endpoints:
- Derive storeId from JWT/device-token (server-side)
- NEVER trust client-provided storeId
- Query WHERE store_id = <token.storeId>
```

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| SYNC-001a | Audit all POS endpoints for store scoping | ⬜ | |
| SYNC-001b | Audit all Dashboard endpoints for store scoping | ⬜ | |
| SYNC-001c | Add middleware to enforce storeId from token | ⬜ | |
| SYNC-001d | Test: verify no cross-store data leakage | ⬜ | |

#### Verification
- [ ] Curl with Store A token cannot see Store B products
- [ ] Dashboard route with Store A context cannot query Store B

#### Rollback
Revert endpoint changes.

---

### SYNC-002: Inventory Truth via Events

**Priority:** P0 | **Platform:** Backend

#### Intent
Stock changes only via sale, inward, or adjustment events. No "set stock = X" from client.

#### Contract
```
Allowed stock mutations:
- POST /api/v1/pos/transactions → sale → stock decreases
- POST /api/v1/pos/stock-in → inward → stock increases
- POST /api/v1/stock/adjust → adjustment → stock changes

NOT allowed:
- PUT /products/:id { stock: X } (direct overwrite)
```

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| SYNC-002a | Sale transaction decrements stock | ⬜ | Existing flow |
| SYNC-002b | Inward/Stock-In increments stock | ⬜ | API-003 |
| SYNC-002c | Stock adjustment changes stock | ⬜ | Future POS-009 |
| SYNC-002d | Block direct stock overwrites from client | ⬜ | |

#### Verification
- [ ] Stock only changes via event routes
- [ ] No direct "set stock" endpoint exposed

#### Rollback
N/A - this is a constraint, not a feature.

---

### SYNC-003: Supplier Source Rules

**Priority:** P0 | **Platform:** Both

#### Intent
SuperMandi suppliers are read-only everywhere. Retailer's own suppliers are editable on Dashboard only.

#### Contract
```
Supplier source rules:
- source = "supermandi" → read-only everywhere
- source = "own" → CRUD allowed on Dashboard only
- POS = view-only for all suppliers
```

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| SYNC-003a | POS: suppliers list is read-only | ⬜ | No edit buttons |
| SYNC-003b | Dashboard: edit/delete only if source=own | ⬜ | |
| SYNC-003c | Dashboard: SuperMandi suppliers show badge + disable edit | ⬜ | |
| SYNC-003d | Backend: reject CRUD on supermandi suppliers | ⬜ | |

#### Verification
- [ ] POS cannot create/edit/delete suppliers
- [ ] Dashboard can CRUD only own suppliers
- [ ] SuperMandi supplier rows show "SuperMandi" badge

#### Rollback
Revert UI constraints.

---

### SYNC-004: Reports Consistency

**Priority:** P0 | **Platform:** Both

#### Intent
POS daily summary widget must match Dashboard report totals for the same date/timezone.

#### Contract
```
For date D, timezone TZ:
- POS widget totalSales == Dashboard daily report totalSales
- POS widget cashAmount == Dashboard cashAmount
- POS widget upiAmount == Dashboard upiAmount
```

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| SYNC-004a | Use same aggregation query for POS and Dashboard | ⬜ | |
| SYNC-004b | Use consistent timezone handling | ⬜ | Store timezone |
| SYNC-004c | Test: POS widget matches Dashboard report | ⬜ | |

#### Verification
- [ ] Curl daily-summary for date X
- [ ] POS widget shows same values
- [ ] Dashboard report shows same values

#### Rollback
N/A - fix aggregation logic.

---

### SYNC-005: Purchase Cart Sync MVP

**Priority:** P1 | **Platform:** Both

#### Intent
Implement spec sync behavior for purchase cart (polling + websocket + conflict merge).

#### Contract
```
POS: polls GET /api/v1/purchase-cart every 30s when BUY tab focused
Dashboard: WebSocket subscription for real-time updates
Conflict: last-write-wins with item merge (not full overwrite)
```

#### Sub-tickets

| ID | Description | Status | Notes |
|----|-------------|--------|-------|
| SYNC-005a | GET /api/v1/purchase-cart | ⬜ | |
| SYNC-005b | PUT /api/v1/purchase-cart | ⬜ | |
| SYNC-005c | POS polling (30s on BUY tab focus) | ⬜ | |
| SYNC-005d | Dashboard WebSocket subscription | ⬜ | |
| SYNC-005e | Item merge conflict resolution | ⬜ | Last-write-wins per item |

#### Verification
- [ ] Add item on Dashboard → POS sees it within 30s
- [ ] Add item on POS → Dashboard sees it immediately (WS)
- [ ] Concurrent edits merge correctly

#### Rollback
Disable sync; purchase cart local only.

---

## Phase 1: Go-Live Correctness Rules

### Stock Correctness (ALWAYS)
```
- Sell reduces stock
- Inward increases stock
- Adjustment changes stock
- Stock is derived from ledger, NEVER overwritten by client
```

### No Fake Completion
```
- If API not deployed → show "Coming soon / backend pending"
- NEVER show dummy data in production
- NEVER write mock data to backend
```

### Store Isolation (ALWAYS)
```
- Product search results → store products only
- Categories → store categories only
- Suppliers → store suppliers + supermandi global
- Reports → store transactions only
```

---

## Phase-1 Ticket Attachments (Sync + Acceptance Addendum)

> Append to each Phase-1 ticket under Verification. Block ✅ until all items pass.
> Format: Sync Obligations → Acceptance Checks → No-Sync Guardrails

---

### POS-001 — PURCHASE Tab Redesign

**Sync Obligations (Data)**
- Suppliers list shown in POS must match Dashboard "Suppliers" (WEB-003) and SuperAdmin store view for same store
- Supplier selection is UI-only (no sync). Any supplier CRUD is store-scoped and must reflect across POS+Dashboard
- Stock-In created from Quick Purchase must (when API-003 exists) update:
  - Store product stock/price in backend (source of truth)
  - Dashboard inventory/stock views (future Phase-2) via same backend state
  - SuperAdmin should see ledger entries at store level

**Acceptance Checks (must pass on demo store)**
- [ ] POS uses only store-scoped suppliers; no cross-store leakage
- [ ] "Live Suppliers SKU grid" shows real data only; otherwise "Coming Soon" (UI-005)
- [ ] Quick Purchase does not create any local-only stock state; purely draft until submit

**No-Sync Guardrails**
- Rotating hints, auto-expand/restore, selected tab state, scroll position: never synced
- No mock SKU data in production path

---

### POS-002 — Daily Summary Widget

**Sync Obligations (Data)**
- Widget must display the same numbers as:
  - Dashboard Home "Today" (WEB-002)
  - SuperAdmin store analytics/probe (UI-004)
- Source of truth: backend aggregation (API-002). POS must not compute totals from local state

**Acceptance Checks**
- [ ] POS widget values match curl output for same store/date
- [ ] Timezone: uses store timezone (Asia/Kolkata for DEMO001) for "today"

**No-Sync Guardrails**
- Widget collapse/expand, last refreshed timestamp display formatting: UI-only

---

### POS-003 — Strong Search in BUY

**Sync Obligations (Data)**
- Search results must be from store catalog/inventory source of truth (backend)
- Must match Dashboard product search results (WEB-004, Phase-2)
- Barcode exact match must respect canonical barcode rules shared across POS and backend

**Acceptance Checks**
- [ ] Searching barcode returns exact same product record as scan resolve
- [ ] Filters (category/stock) match server interpretation

**No-Sync Guardrails**
- Recent searches history can be local-only (device UX), must not affect backend

---

### API-001 — Suppliers API

**Sync Obligations (Data)**
- Store-scoped suppliers: visible in POS (POS-001) + Dashboard (WEB-003) + SuperAdmin (store probe/list)
- Global SuperMandi suppliers: readable by all stores but never editable by retailer

**Acceptance Checks**
- [ ] Authorization is device-token scoped to store
- [ ] Response includes `source` and editability so UI can enforce rules

**No-Sync Guardrails**
- No cross-store supplier access

---

### API-002 — Daily Summary API

**Sync Obligations (Data)**
- Single aggregation contract used by POS widget (POS-002), Dashboard Home (WEB-002), SuperAdmin probe (UI-004)

**Acceptance Checks**
- [ ] Empty store returns zeros (not error)
- [ ] Date boundary uses store timezone

**No-Sync Guardrails**
- No client-side recomputation

---

### API-003 — Stock-In API

**Sync Obligations (Data)**
- On submit: update inventory + ledger so POS stock, Dashboard stock, and SuperAdmin store view are consistent
- Must be idempotent (client retries) and store-isolated

**Acceptance Checks**
- [ ] Creating stock-in increases stock for the store product
- [ ] Stock-in history visible in POS (UI-006) and later Dashboard report

**No-Sync Guardrails**
- Draft cart (quick purchase) not synced until submit

---

### WEB-001 — Retailer Dashboard Auth & Shell

**Sync Obligations (Identity)**
- Retailer identity must resolve to store(s). POS is device-token based; Dashboard is JWT based; both map to same storeId
- After login, UI must show storeCode/storeName and keep route store-scoped

**Acceptance Checks**
- [ ] Store context persists on refresh
- [ ] Cannot access another store by URL manipulation

**No-Sync Guardrails**
- Dashboard UI preferences (collapsed sidebar, filters) are local-only

---

### WEB-002 — Dashboard Home

**Sync Obligations (Data)**
- Uses same aggregates as POS widget (API-002). Must match POS for same store/date

**Acceptance Checks**
- [ ] Values match VM curl

**No-Sync Guardrails**
- Card ordering, chart zoom state not synced

---

### WEB-003 — Suppliers CRUD

**Sync Obligations (Data)**
- CRUD must immediately reflect in POS suppliers list (POS-001) once API-001 + CRUD endpoints deployed
- Must respect `source=supermandi` read-only rule

**Acceptance Checks**
- [ ] Create/edit/delete own supplier updates list
- [ ] SuperMandi suppliers cannot be edited

**No-Sync Guardrails**
- Search/filter UI state not synced

---

### UI-001 — POS Menu Reveals

**Sync Obligations (Navigation)**
- No data sync; ensures Phase-1 features are reachable so real store data can be tested

**Acceptance Checks**
- [ ] Every Phase-1 POS feature reachable without deep links

**No-Sync Guardrails**
- Diagnostics panel must be DEV/QA gated

---

### UI-002 / UI-003 — Dashboard Reachability + Sidebar Reveals

**Sync Obligations (Navigation)**
- No data sync; ensures pages exist and fail safely when backend missing

**Acceptance Checks**
- [ ] 404/500 shows error + retry, never blank/crash

---

### UI-004 — SuperAdmin Probe Panel

**Sync Obligations (Verification Surface)**
- Provides a third independent read of the same backend truth used by POS+Dashboard

**Acceptance Checks**
- [ ] Probe can validate ui-status, suppliers, daily-summary for DEMO001

---

### UI-005 — Live Suppliers Real Reveal Rule

**Sync Obligations (Truthfulness)**
- Prevents POS from showing fake supplier catalog; must only render data that exists for that store

**Acceptance Checks**
- [ ] If supplier-products API missing/empty: shows "Coming Soon" with explicit blocker

---

### UI-006 — Stock-In Reveal + Gating

**Sync Obligations (Feature gating)**
- Ensures users never enter a broken stock-in flow; enables end-to-end testing once API-003 exists

**Acceptance Checks**
- [ ] When API-003 absent: disabled with reason
- [ ] When present: stock-in works and updates backend truth

---

### SYNC-001 through SYNC-005 — Sync Tickets

**Sync Obligations**
- SYNC-001: Store isolation (server derives storeId from token)
- SYNC-002: Inventory mutations only via sale/inward/adjust events
- SYNC-003: Supplier source rules (SuperMandi read-only)
- SYNC-004: Reports consistency (POS widget = Dashboard totals)
- SYNC-005: Purchase cart sync (polling + WS + item merge)

**Acceptance Checks**
- [ ] All sync rules verified on DEMO store with real data
- [ ] No cross-store leakage
- [ ] No fake/mock data in production path

---

### Acceptance Gate (for ALL Phase-1 Tickets)

A ticket becomes ✅ only when **ALL** are true:

| Check | Description |
|-------|-------------|
| VM curl | API contract verified via curl on VM |
| POS UI | Function works on real device (Redmi) |
| Dashboard UI | Same feature/state visible on web |
| SuperAdmin probe | Same truth visible in admin panel |
| Regression | Checklist passes (enrollment, SELL, categories, etc.) |
| Sync | POS + Dashboard + SuperAdmin agree on same backend truth for same store/date |
| No-Sync | UI state and draft carts remain local-only |

---

## Phase 2: Day 2-3 (P1)

### POS-004: Sales Report Screen
**Priority:** P1 | **Platform:** POS

Full sales report with period filter, stats, payment breakdown chart, top items list, and share button.

| ID | Description | Status |
|----|-------------|--------|
| POS-004a | Create SalesReportScreen.tsx | ⬜ |
| POS-004b | Period filter (Today/Week/Month/Custom) | ⬜ |
| POS-004c | Total sales, bills, avg bill stats | ⬜ |
| POS-004d | Payment breakdown chart | ⬜ |
| POS-004e | Top 5 items list | ⬜ |
| POS-004f | Share report button | ⬜ |

---

### POS-005: Purchase Report Screen
**Priority:** P1 | **Platform:** POS

| ID | Description | Status |
|----|-------------|--------|
| POS-005a | Create PurchaseReportScreen.tsx | ⬜ |
| POS-005b | Period filter | ⬜ |
| POS-005c | Total purchases, orders, items stats | ⬜ |
| POS-005d | By supplier breakdown | ⬜ |
| POS-005e | Share report button | ⬜ |

---

### POS-006: Profit Report Screen
**Priority:** P1 | **Platform:** POS

| ID | Description | Status |
|----|-------------|--------|
| POS-006a | Create ProfitReportScreen.tsx | ⬜ |
| POS-006b | Sales vs COGS calculation | ⬜ |
| POS-006c | Gross profit & margin | ⬜ |
| POS-006d | Top margin items | ⬜ |
| POS-006e | Low margin alerts | ⬜ |

---

### WEB-004: Products List Page
**Priority:** P1 | **Platform:** Web

| ID | Description | Status |
|----|-------------|--------|
| WEB-004a | Products table with pagination | ⬜ |
| WEB-004b | Search by name/barcode | ⬜ |
| WEB-004c | Filter by category/stock | ⬜ |
| WEB-004d | Edit product modal | ⬜ |
| WEB-004e | Delete product (confirm) | ⬜ |
| WEB-004f | Multi-select for bulk actions | ⬜ |

---

### WEB-005: SELL Page (Web POS)
**Priority:** P1 | **Platform:** Web

| ID | Description | Status |
|----|-------------|--------|
| WEB-005a | Product search | ⬜ |
| WEB-005b | Cart sidebar | ⬜ |
| WEB-005c | Add/remove/qty in cart | ⬜ |
| WEB-005d | Payment method selection | ⬜ |
| WEB-005e | Checkout flow | ⬜ |
| WEB-005f | Bill print/share | ⬜ |

---

### WEB-006: Reports Pages (Full + Export)
**Priority:** P1 | **Platform:** Web

| ID | Description | Status |
|----|-------------|--------|
| WEB-006a | Daily sales report page | ⬜ |
| WEB-006b | Sales report with charts | ⬜ |
| WEB-006c | Purchase report | ⬜ |
| WEB-006d | Profit report | ⬜ |
| WEB-006e | Export to PDF | ⬜ |
| WEB-006f | Export to Excel | ⬜ |

---

### API-004: Reports APIs (Backend)
**Priority:** P1 | **Platform:** Backend

| ID | Description | Status |
|----|-------------|--------|
| API-004a | GET /api/v1/retailers/reports/daily | ⬜ |
| API-004b | GET /api/v1/retailers/reports/sales | ⬜ |
| API-004c | GET /api/v1/retailers/reports/purchases | ⬜ |
| API-004d | GET /api/v1/retailers/reports/profit | ⬜ |
| API-004e | Date range filtering | ⬜ |
| API-004f | Aggregation queries | ⬜ |

---

## Phase 3: Week 1 (P2)

### WEB-007: Bulk CSV Product Import
**Priority:** P2 | **Platform:** Web

| ID | Description | Status |
|----|-------------|--------|
| WEB-007a | Download CSV template | ⬜ |
| WEB-007b | File upload component | ⬜ |
| WEB-007c | CSV parsing & validation | ⬜ |
| WEB-007d | Preview with errors/warnings | ⬜ |
| WEB-007e | Import execution | ⬜ |
| WEB-007f | POST /api/v1/retailers/products/import | ⬜ |

---

### WEB-008: Inline Bulk Product Edit
**Priority:** P2 | **Platform:** Web

| ID | Description | Status |
|----|-------------|--------|
| WEB-008a | Editable table cells | ⬜ |
| WEB-008b | Batch update state | ⬜ |
| WEB-008c | Save all changes | ⬜ |
| WEB-008d | Quick actions (% increase, set min stock) | ⬜ |
| WEB-008e | PUT /api/v1/retailers/products/bulk | ⬜ |

---

### WEB-009: Return/Refund Page
**Priority:** P2 | **Platform:** Web

| ID | Description | Status |
|----|-------------|--------|
| WEB-009a | Returns list with filters | ⬜ |
| WEB-009b | New return - find bill | ⬜ |
| WEB-009c | Select items to return | ⬜ |
| WEB-009d | Return reason dropdown | ⬜ |
| WEB-009e | Refund method (cash/credit) | ⬜ |
| WEB-009f | Return to inventory checkbox | ⬜ |
| WEB-009g | POST /api/v1/retailers/returns | ⬜ |

---

### API-005: Purchase Cart Sync
**Priority:** P2 | **Platform:** Both

| ID | Description | Status |
|----|-------------|--------|
| API-005a | GET /api/v1/purchase-cart | ⬜ |
| API-005b | PUT /api/v1/purchase-cart | ⬜ |
| API-005c | POST /api/v1/purchase-cart/sync | ⬜ |
| API-005d | POS polling (30s on BUY tab) | ⬜ |
| API-005e | Dashboard WebSocket updates | ⬜ |
| API-005f | Conflict resolution (last-write-wins) | ⬜ |

---

### WEB-010: Category Management
**Priority:** P2 | **Platform:** Web

| ID | Description | Status |
|----|-------------|--------|
| WEB-010a | Category list | ⬜ |
| WEB-010b | Add/edit category | ⬜ |
| WEB-010c | Delete category (check products) | ⬜ |
| WEB-010d | Assign products to category | ⬜ |

---

## Phase 4: Week 2 (P3)

### POS-007: Hold/Resume Bill
**Priority:** P3 | **Platform:** POS

| ID | Description | Status |
|----|-------------|--------|
| POS-007a | Hold current cart | ⬜ |
| POS-007b | HeldBillsScreen.tsx | ⬜ |
| POS-007c | Resume held bill | ⬜ |
| POS-007d | Delete held bill | ⬜ |
| POS-007e | Held bills badge on SELL tab | ⬜ |

---

### POS-008: Price Override
**Priority:** P3 | **Platform:** Both

| ID | Description | Status |
|----|-------------|--------|
| POS-008a | Price override modal | ⬜ |
| POS-008b | Reason dropdown | ⬜ |
| POS-008c | Track overrides in transaction | ⬜ |
| POS-008d | Override limits (% below MRP) | ⬜ |

---

### POS-009: Stock Adjustment
**Priority:** P3 | **Platform:** Both

| ID | Description | Status |
|----|-------------|--------|
| POS-009a | StockAdjustmentScreen.tsx | ⬜ |
| POS-009b | Search/scan product | ⬜ |
| POS-009c | Add/remove stock | ⬜ |
| POS-009d | Reason dropdown | ⬜ |
| POS-009e | POST /api/v1/stock/adjust | ⬜ |
| POS-009f | Stock adjustment history | ⬜ |

---

### WEB-011: GST Report
**Priority:** P3 | **Platform:** Web

| ID | Description | Status |
|----|-------------|--------|
| WEB-011a | GST summary by rate | ⬜ |
| WEB-011b | HSN code breakdown | ⬜ |
| WEB-011c | GSTR-1 export format | ⬜ |
| WEB-011d | GET /api/v1/retailers/reports/gst | ⬜ |

---

### WEB-012: Settings Page
**Priority:** P3 | **Platform:** Web

| ID | Description | Status |
|----|-------------|--------|
| WEB-012a | Store profile view/edit | ⬜ |
| WEB-012b | Tax/GST settings | ⬜ |
| WEB-012c | Receipt template settings | ⬜ |
| WEB-012d | Connected devices list | ⬜ |

---

## Phase 1 Summary

### Feature Tickets (10)
| Ticket | Platform | Status | Blocker |
|--------|----------|--------|---------|
| POS-001 | POS | 🧪 a-f done, g-j pending | VM test + state machine |
| POS-002 | POS | ⬜ | API-002 |
| POS-003 | POS | 🟡 | None (filters pending) |
| API-000 | Admin | ⬜ | None (infrastructure) |
| API-001 | Backend | 🔴 | Vertical slice (not "blocked") |
| API-002 | Backend | 🔴 | Vertical slice (not "blocked") |
| API-003 | Backend | 🔴 | Vertical slice (not "blocked") |
| WEB-001 | Web | ⬜ | None |
| WEB-002 | Web | ⬜ | API-002 |
| WEB-003 | Web | ⬜ | API-001 |

### UI Reveal Tickets (6) - Must for Real Testing
| Ticket | Platform | Status | Purpose |
|--------|----------|--------|---------|
| UI-001 | POS | ⬜ | Menu reveals all Go-Live pages |
| UI-002 | Web | ⬜ | Dashboard reachable from public URL |
| UI-003 | Web | ⬜ | Sidebar reveals Suppliers + Home |
| UI-004 | Admin | ⬜ | SuperAdmin probe panel |
| UI-005 | POS | 🧪 | Live Suppliers real reveal rule (implemented, needs demo store verification) |
| UI-006 | POS | 🧪 | Stock In flow gating (implemented, needs demo store verification) |

### SYNC Tickets (5) - Go-Live Correctness
| Ticket | Platform | Status | Purpose |
|--------|----------|--------|---------|
| SYNC-001 | Backend | ⬜ | Store isolation enforcement |
| SYNC-002 | Backend | ⬜ | Inventory truth via events |
| SYNC-003 | Both | ⬜ | Supplier source rules |
| SYNC-004 | Both | ⬜ | Reports consistency (POS↔Dashboard) |
| SYNC-005 | Both | ⬜ | Purchase cart sync MVP (P1) |

---

## Current Code State

### API Files Ready (POS Client)
| File | DEMO_MODE | Notes |
|------|-----------|-------|
| `suppliersApi.ts` | ❌ No | Ready for real API |
| `dailySummaryApi.ts` | ❌ No | Ready for real API |
| `stockInApi.ts` | ✅ Yes (line 66) | **BLOCKED** - needs backend |

### Key Files
| Feature | File Path |
|---------|-----------|
| PURCHASE Tab | `src/screens/PurchaseScreen.tsx` |
| Suppliers API | `src/services/api/suppliersApi.ts` |
| Daily Summary API | `src/services/api/dailySummaryApi.ts` |
| Stock In API | `src/services/api/stockInApi.ts` |
| handleScan | `src/services/scan/handleScan.ts` |
| StockInView | `src/components/purchase/StockInView.tsx` |
| Menu Screen | `src/screens/MenuScreen.tsx` |

### Mock Data to Remove Before Go-Live
| File | Line | Issue |
|------|------|-------|
| `stockInApi.ts` | 66 | `DEMO_MODE = true` |
| `PurchaseScreen.tsx` | ~221 | `MOCK_SKUS` array (UI-005 will gate this) |

---

## Backend Endpoints Status

| Endpoint | Status | Notes |
|----------|--------|-------|
| GET /api/v1/pos/suppliers | ❓ Unknown | Need to test with curl |
| GET /api/v1/pos/suppliers/:id/products | ❓ Unknown | Required for UI-005 |
| GET /api/v1/pos/daily-summary | ❓ Unknown | Need to test with curl |
| POST /api/v1/pos/stock-in | ❓ Unknown | POS has DEMO_MODE |
| GET /api/v1/pos/stock-in | ❓ Unknown | History endpoint |

---

## Critical Rule

> **No Phase-1 ticket is ✅ unless:**
> 1. Feature is reachable in POS + Dashboard + SuperAdmin without manual deep links
> 2. If backend endpoints don't exist, UI shows safe "Coming soon" state, NOT demo/mock data
> 3. Demo store passes: VM curl + POS UI + Dashboard UI + SuperAdmin probe + regression checklist

---

## Phase-1 Go/No-Go Gate

> **Phase-1 is currently API-blocked, not UI-blocked.**
> UI-005/UI-006 are 🧪 (implemented, awaiting demo store verification).
> Backend work (API-001, API-002, API-003) is the critical path.

---

### ✅ Current Readiness Verdict (Phase-1)

| Component | Status | Notes |
|-----------|--------|-------|
| **POS UI (UI-005/006)** | 🧪 Ready for testing | Implemented, needs demo store verification |
| **API-001 (Suppliers)** | 🔴 NOT READY | Backend may not exist or contract unknown |
| **API-002 (Daily Summary)** | 🔴 NOT READY | Backend may not exist or contract unknown |
| **API-003 (Stock In)** | 🔴 NOT READY | DEMO_MODE=true, backend untested |
| **SYNC-001 (Product refresh)** | ⬜ NOT STARTED | Pre-requisite for supplier products |
| **WEB-001 (Firebase Auth)** | ✅ READY | Firebase deployed, exchange flow documented |
| **API-000 (Probe Endpoint)** | ⬜ NOT STARTED | Infrastructure ticket for readiness checking |

**Summary:**
- ✅ **READY:** UI-005, UI-006, WEB-001 (Firebase deployed)
- 🔴 **NOT READY:** API-001, API-002, API-003 (backend unknown/untested)
- ⬜ **NOT STARTED:** SYNC-001, API-000, WEB-002, WEB-003

---

### Step 0 — API Reality Check (MANDATORY before coding)

**Time budget: 20 minutes max**

Run these curl commands against the backend VM (`34.14.220.171:3000`) to determine actual API state:

```bash
# 1. Get a valid device token (requires store enrollment)
DEVICE_TOKEN="<from-secure-store-after-enrollment>"

# 2. Test Suppliers endpoint (API-001)
curl -v -X GET "http://34.14.220.171:3000/api/v1/pos/suppliers" \
  -H "x-device-token: $DEVICE_TOKEN" \
  -H "Accept: application/json"

# 3. Test Supplier Products (API-001 sub-route)
curl -v -X GET "http://34.14.220.171:3000/api/v1/pos/suppliers/1/products" \
  -H "x-device-token: $DEVICE_TOKEN" \
  -H "Accept: application/json"

# 4. Test Daily Summary (API-002)
curl -v -X GET "http://34.14.220.171:3000/api/v1/pos/daily-summary" \
  -H "x-device-token: $DEVICE_TOKEN" \
  -H "Accept: application/json"

# 5. Test Stock In POST (API-003)
curl -v -X POST "http://34.14.220.171:3000/api/v1/pos/stock-in" \
  -H "x-device-token: $DEVICE_TOKEN" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: test-$(date +%s)" \
  -d '{"supplierId":1,"items":[{"sku":"TEST001","qty":1,"costPrice":100}]}'

# 6. Test Stock In GET (API-003 history)
curl -v -X GET "http://34.14.220.171:3000/api/v1/pos/stock-in?date=2026-01-19" \
  -H "x-device-token: $DEVICE_TOKEN" \
  -H "Accept: application/json"
```

**For each endpoint, record:**
| Endpoint | Exists (2xx/404) | Auth OK (no 401) | Contract OK | Isolation OK |
|----------|------------------|------------------|-------------|--------------|
| GET /pos/suppliers | ❓ | ❓ | ❓ | ❓ |
| GET /pos/suppliers/:id/products | ❓ | ❓ | ❓ | ❓ |
| GET /pos/daily-summary | ❓ | ❓ | ❓ | ❓ |
| POST /pos/stock-in | ❓ | ❓ | ❓ | ❓ |
| GET /pos/stock-in | ❓ | ❓ | ❓ | ❓ |

---

### 🎯 Execution Order (Phase-1)

**Correct order prioritizes backend work (critical path):**

```
SYNC-001 (Product refresh)     ← Foundation for supplier products
    ↓
API-001 (Suppliers + Products) ← Unblocks UI-005 real data
    ↓
API-002 (Daily Summary)        ← Unblocks MenuScreen metrics
    ↓
API-003 (Stock In)             ← Unblocks UI-006 real submission
    ↓
Supplier Products Integration  ← Connect UI-005 to real API
    ↓
WEB-002/003 (Dashboard)        ← Parallel after APIs exist
```

**Do NOT start:**
- WEB-002/003 until API-001/002/003 are ✅
- POS integration until curl tests pass all 4 columns

---

### Gate + Execute

**Gate Criteria (must pass before executing Phase-1 tickets):**

1. ✅ API Reality Check completed (curl tests above)
2. ✅ Backend Endpoints Status table updated with actual results
3. ✅ Device token available for demo store
4. ✅ Clear understanding of which endpoints exist vs need building

**Execute Plan:**

| Priority | Ticket | Condition | Action |
|----------|--------|-----------|--------|
| P0 | API Reality Check | Always | Run curl tests, update status table |
| P1 | SYNC-001 | If products stale | Implement product refresh before supplier work |
| P2 | API-001 | If endpoints exist | Wire POS to real suppliers API |
| P2 | API-001 | If endpoints missing | Document required backend routes |
| P3 | API-002 | If endpoint exists | Wire MenuScreen to real daily summary |
| P4 | API-003 | If POST endpoint exists | Remove DEMO_MODE, wire to real API |
| P5 | UI-005/006 | APIs ready | Verify on demo store, mark ✅ |
| P6 | WEB-002/003 | APIs ✅ | Implement Dashboard features |

**Next Action:** Run API Reality Check → Update this document → Proceed based on results

---

## One-Line Rule (Claude Law)

> **POS = execution + offline + scan**
> **Dashboard = control + bulk + reports**
> **SuperAdmin = platform ops**
> **Sync only backend truth objects (inventory, suppliers, catalog, purchase cart) — never sync transient UI state (sell cart, mock data, local hints).**

---

*Last Updated: 2026-01-19 (Go/No-Go Gate + API Reality Check + Execution Order added)*
