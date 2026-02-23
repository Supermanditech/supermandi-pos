# R5 COMPREHENSIVE CODE-FIRST AUDIT

**HEAD SHA**: `f05165b8`
**Staging Baseline SHA**: `badc3fbe` (stale-runtime-baseline — staging not deployed to HEAD)
**Frozen Historical Scope**: 204 tickets (immutable)
**Audit Date**: 2026-02-24
**Auditor**: Claude (machine audit, code-first)

---

## 1. Executive Summary

| Metric | Value |
|--------|-------|
| Total screens audited | 119 (44 POS + 29 Retailer + 19 Supplier + 23 SuperAdmin + 4 Landing) |
| Backend API routes audited | ~139 across 10 services |
| Total micro-checks performed | 952 (119 screens × 8 dimensions) |
| Total raw findings | 180 |
| Overlap with frozen 204 (revalidation) | 8 |
| **Net new findings** | **172** |
| P0 (Critical) | 18 |
| P1 (High) | 49 |
| P2 (Medium) | 105 |
| Findings tagged `stale-runtime-baseline` | 6 |
| Existing tickets updated count | 8 |
| New tickets to create | 172 |

---

## 2. Preflight Gate Outputs

### Gate 1: HEAD SHA
```
f05165b8
```

### Gate 2: workflow:validate
```
[WORKFLOW_GUARD] OK: state validated: mode=LIVE_FIX, tickets=306, screens=0
```
7 legacy WARN (LEG-001→LEG-007) — pre-existing, non-blocking.

### Gate 3: workflow:monitor
```
Workflow state: PASS
Tickets: 306, Failures: 0
Total failures: 0
```

### Gate 4: workflow:manifest:live
```
Counts -> retailer:32, supplier:19, superadmin:24, landing:4, crossFlows:4
```

---

## 3. Screen Inventory

Produced: `workflow/state/R5_SCREEN_INVENTORY_F05165B8.json`

| Surface | Screens | Micro-Checks |
|---------|---------|-------------|
| POS (React Native) | 44 | 352 |
| Retailer Web (Vite+React) | 29 | 232 |
| Supplier Web (Next.js) | 19 | 152 |
| SuperAdmin Web (Vite+React) | 23 | 184 |
| Landing (Static HTML) | 4 | 32 |
| **Total** | **119** | **952** |

Backend: ~139 API routes across 10 services (api-gateway, auth, platform, supplier, catalog, inventory, order, reorder, voice, payment).

---

## 4. P0 Findings (18 Critical)

### 4.1 POS App (3 P0)

| ID | Screen | Dimension | Issue |
|----|--------|-----------|-------|
| R5-POS-001 | PaymentScreen | Business Logic | `Math.round(item.quantity)` truncates fractional quantities for loose/weighed items — corrupts line totals |
| R5-POS-021 | PaymentScreen | Wiring/State | Cleanup effect may cancel finalized sale due to async gap between API success and `finalized.current = true` |
| R5-POS-054 | PurchaseScreen | Business Logic | Sequential order creation in for-loop: one supplier failure aborts remaining — partial orders with no rollback |

### 4.2 Supplier Web (5 P0)

| ID | Screen | Dimension | Issue |
|----|--------|-----------|-------|
| R5-SUP-001 | InvoicesPage | API | Invoice PDF download uses relative URL without API_BASE_URL — will 404 in production |
| R5-SUP-002 | API Client | API-DB | Double-unwrapping of API response data causes runtime crash on invoice detail |
| R5-SUP-003 | RegisterPage | API | Registration document upload sends no Authorization header — 401 on authenticated endpoint |
| R5-SUP-004 | DashboardLayout | Navigation | Orders read-marking compares bare pathname without basePath — fragile Next.js behavior |
| R5-SUP-005 | Auth/API | Navigation | Logout redirect race: auth.tsx uses `/login` (router.push) vs api.ts uses `/supplier/login` (window.location.replace) |

### 4.3 SuperAdmin Web (5 P0)

| ID | Screen | Dimension | Issue |
|----|--------|-----------|-------|
| R5-SA-001 | RefundsTab | Business Logic | Refund approval fires on single click — no confirmation dialog for irreversible financial action |
| R5-SA-002 | InvoicesTab | Business Logic | Invoice issuance fires on single click — no confirmation for irreversible legal document creation |
| R5-SA-003 | SettingsTab | UX | Feature kill switch uses bare `confirm()` instead of styled ConfirmDialog — highest-impact action has weakest UX |
| R5-SA-004 | StaffTab | UX | Staff deactivation uses bare `confirm()` instead of styled ConfirmDialog |
| R5-SA-005 | MonitoringTab | GCP Parity | Hardcoded infrastructure: 6 services, 10 alert policies, LB name, domain — all static, never fetched from API |

### 4.4 Backend Services (5 P0)

| ID | Service | Dimension | Issue |
|----|---------|-----------|-------|
| R5-BE-001 | inventory-service | Auth/RBAC | Inventory transaction routes have NO service-level authentication — storeId from URL params trusted |
| R5-BE-002 | order-service | Auth/RBAC | GRN receive routes have NO service-level authentication |
| R5-BE-003 | platform-service | Auth/RBAC | Platform stores CRUD has NO service-level authentication |
| R5-BE-004 | inventory-service | Store Isolation | `getLedgerEntriesByReference()` queries without store_id filter — cross-store data leak |
| R5-BE-005 | order-service | Business Logic | GRN `receiveGoods` calls inventory HTTP BEFORE DB commit — stock updated but order fails = permanent inconsistency |

**Note on R5-BE-001/002/003**: Gateway JWT enforcement provides primary defense. These are defense-in-depth gaps — if backend is ever directly accessible (misconfigured Cloud Run, network bypass), all services are unprotected.

---

## 5. P1 Findings (49 High)

### POS App (16 P1)

| ID | Screen | Dimension | Issue |
|----|--------|-----------|-------|
| R5-POS-002 | PaymentScreen | Wiring/State | `allowedMethods` stale in network status effect closure |
| R5-POS-003 | 5 screens (9 occurrences) | Business Logic | `parseFloat * 100` floating-point money conversion can produce rounding errors |
| R5-POS-005 | ForceUpdateScreen | UI/BizLogic | Empty `APP_STORE_URL` sends iOS users to Play Store |
| R5-POS-006 | ReturnScreen | Wiring/State | No ref-based double-submit guard on refund processing |
| R5-POS-007 | GRNScreen | Wiring/State | No ref-based double-submit guard on goods receiving |
| R5-POS-008 | InwardScreen | Wiring/State | No ref-based double-submit guard on stock inward |
| R5-POS-016 | SellScanScreen | Wiring/State | `handleSaveDefaultPrice` empty deps array captures stale closures |
| R5-POS-050 | MenuScreen | UI | HTML entity `&amp;` renders literally in React Native `<Text>` |
| R5-POS-052 | SuccessPrintScreenV2 | Business Logic | Falsy-or fallback on `subtotal` shows wrong receipt value when subtotal is zero |
| R5-POS-055 | ReorderScreen | Wiring/State | `addToQuickItems` missing from useEffect dependency array — stale closure |
| R5-POS-057 | SalesHistoryScreen | Business Logic | Hardcoded low-stock threshold of 10 ignores per-product reorder levels |
| R5-POS-058 | ReorderScreen | Business Logic | Quick Reorder uses hardcoded `supplierId: "reorder"` instead of actual supplier |
| R5-POS-059 | ReorderPoliciesScreen | Wiring/State | `handleSaveEdit` only updates local state — edits lost on refresh |
| R5-POS-060 | OrderDetailScreen | UX | Auto-polling every 30s with no max attempts — battery drain |
| R5-POS-063 | CustomerList/Management | UX | Two Customer screens with overlapping functionality — unclear canonical |
| R5-POS-077 | BnplDuesScreen | Business Logic | Partial payment remaining balance uses `principalMinor` without considering `totalWithInterestMinor` |

### Retailer Web (12 P1)

| ID | Screen | Dimension | Issue |
|----|--------|-----------|-------|
| R5-RET-003 | App.tsx | Wiring/State | Feature flag fetch uses accessToken which may be null on page refresh |
| R5-RET-004 | RegisterPage | API | handleChangePhone sends request without `credentials: 'include'` |
| R5-RET-006 | CompliancePage | Wiring/State | Document upload preview URLs created but never revoked (memory leak) |
| R5-RET-008 | DashboardPage | Wiring/State | No AbortController for initial data fetches — state updates on unmounted component |
| R5-RET-010 | DashboardPage | Wiring/State | Duplicate 401 check — dead code after first return |
| R5-RET-014 | InventoryPage | Business Logic | INWARD filter only maps to 'purchase_received' — misses 'opening_stock' and 'sale_return' |
| R5-RET-016 | SupplierCatalogPage | Wiring/State | Double fetch on mount — initial and search useEffects both fire |
| R5-RET-018 | DeviceActivationPage | Wiring/State | `loadDevices` missing from useEffect dependency array |
| R5-RET-022 | ChatPage | API | 15-second polling with no exponential backoff or tab visibility check |
| R5-RET-024 | NotificationsPage | API | `fetchNotifications` silently ignores non-ok responses |
| R5-RET-032 | Admin pages | API | Admin API endpoints use wrong prefix `/api/v1/admin/` instead of `/api/v1/retailer-admin/admin/` |
| R5-RET-038 | Multiple | Business Logic | formatCurrency inconsistency — some pages divide by 100 (paise), some don't |

### Supplier Web (10 P1)

| ID | Screen | Dimension | Issue |
|----|--------|-----------|-------|
| R5-SUP-006 | ProductsPage | Wiring | Client-side search only searches current page data |
| R5-SUP-007 | ProductsPage | Wiring | Price input paise conversion feedback loop on keystroke |
| R5-SUP-008 | OrdersPage | Navigation | Pagination state not URL-synced — back/forward loses position |
| R5-SUP-009 | DashboardLayout | UI | Email verification modal not using shared Modal component |
| R5-SUP-010 | Profile+KYC | Business Logic | Two conflicting bank detail update paths |
| R5-SUP-011 | ChatPage | UI | Inline styles, no mobile responsive design |
| R5-SUP-012 | ForgotPasswordPage | Wiring | `emailReset` step defined but never navigated to — dead code |
| R5-SUP-013 | RegisterPage | API-DB | `supplierType` and `supplierTypeOther` collected in UI but never sent to backend |
| R5-SUP-014 | DashboardPage | Business Logic | Dashboard stats calculate from first page only — inaccurate totals |
| R5-SUP-015 | DashboardLayout | UX | `!isAuthenticated` returns null — flash of empty content before redirect |

### SuperAdmin Web (7 P1)

| ID | Screen | Dimension | Issue |
|----|--------|-----------|-------|
| R5-SA-006 | App.tsx | Navigation/RBAC | No RBAC: any authenticated admin sees all 22 tabs |
| R5-SA-007 | App.tsx | Wiring/State | Tab-switch error clearing manually enumerated — misses self-contained tabs |
| R5-SA-008 | AIInsightsTab | UX/API | StoreId is free-text input instead of dropdown picker |
| R5-SA-009 | UsersTab | Wiring/State | User status change fires immediately with no confirmation |
| R5-SA-010 | UsersTab | API | Client-side-only search, no server-side pagination |
| R5-SA-011 | EventsTab | UI/UX | Prev/Next buttons never disabled at pagination boundaries |
| R5-SA-012 | GrnAlertsTab | Business Logic | Acknowledge/Dismiss GRN alerts have no confirmation |

### Backend Services (8 P1)

| ID | Service | Dimension | Issue |
|----|---------|-----------|-------|
| R5-BE-006 | reorder-service | Store Isolation | Policy CRUD by ID has no store ownership verification |
| R5-BE-007 | voice-service | Auth/RBAC | No auth middleware; `/status/:requestId` leaks voice transcripts |
| R5-BE-008 | api-gateway | Auth/RBAC | Admin in-memory rate limiting not distributed for Cloud Run multi-instance |
| R5-BE-009 | auth-service | Auth/RBAC | Password verified before user status check — info leak for suspended users |
| R5-BE-010 | supplier-service | Auth/RBAC | Supplier login has no rate limiting or account lockout |
| R5-BE-011 | catalog-service | Auth/RBAC | Unauthenticated product search exposes pricing data |
| R5-BE-012 | platform-service | Store Isolation | `getDeviceById` has no store_id filter |
| R5-BE-013 | api-gateway | Auth/RBAC | Admin session JWT issuer `supermandi-admin` vs backend expects `supermandi-auth` |

---

## 6. Per-Surface Impact Analysis

### 6.1 POS App (53 findings: 3 P0, 16 P1, 34 P2)

**Critical areas**: PaymentScreen (2 P0 — money corruption + sale cancellation race), PurchaseScreen (1 P0 — partial order failure), SellScanScreen (5 findings — search, state, render side-effects).

**Pattern**: Double-submit protection is state-based (`useState`) instead of ref-based (`useRef`) in 3 money-handling screens (Return, GRN, Inward). PaymentScreen correctly uses ref-based guard — other screens should match.

**Money precision**: 9 occurrences of `parseFloat(str) * 100` across 5 screens for rupee→paise conversion. Edge case rounding errors possible.

### 6.2 Retailer Web (40 findings: 0 P0, 12 P1, 28 P2)

**Critical areas**: Admin API prefix mismatch (R5-RET-032), inventory filter gap (R5-RET-014), currency format inconsistency (R5-RET-038), memory leaks from blob URLs (R5-RET-006).

**Pattern**: Large monolithic components (DashboardPage 62KB, ProductsPage 77KB) with inline state management. Missing AbortController cleanup across data-fetching pages.

### 6.3 Supplier Web (36 findings: 5 P0, 10 P1, 21 P2)

**Critical areas**: Invoice PDF auth bypass (R5-SUP-001), double-unwrap API response (R5-SUP-002), registration doc upload auth missing (R5-SUP-003), logout redirect race (R5-SUP-005).

**Pattern**: basePath inconsistency between auth flows and API client. Client-side search/filter operates on single page of paginated data.

### 6.4 SuperAdmin Web (26 findings: 5 P0, 7 P1, 14 P2)

**Critical areas**: Missing confirmation dialogs on financial actions — refund approve, invoice issue, feature kill switch (R5-SA-001/002/003). No tab-level RBAC (R5-SA-006). Hardcoded infrastructure in MonitoringTab (R5-SA-005).

**Pattern**: Mixed architecture — 13 prop-drilled tabs through monolithic App.tsx (80+ state vars) + 9 self-contained tabs. Error cleanup on tab switch doesn't cover self-contained tabs.

### 6.5 Backend Services (25 findings: 5 P0, 8 P1, 12 P2)

**Critical areas**: Defense-in-depth gaps — 3 services have NO service-level auth (inventory, order, platform). Store isolation missing on ledger reference query and device lookup. GRN HTTP-before-commit creates data inconsistency risk.

**Pattern**: Gateway provides primary defense but individual services are unprotected. In-memory state (rate limits, voice requests) incompatible with Cloud Run multi-instance.

---

## 7. Cross-Function Analysis

### 7.1 Retailer ↔ Supplier
- **R5-SUP-010**: Bank detail update path differs between Profile and KYC pages
- **R5-RET-032**: Retailer admin API prefix mismatch may affect supplier verification flow

### 7.2 Retailer ↔ POS
- **R5-RET-018**: Device activation page has stale state — newly enrolled POS devices may not show
- **R5-POS-054**: POS purchase orders created sequentially — retailer order view may show partial state

### 7.3 Supplier ↔ POS
- **R5-POS-058**: Quick reorder uses hardcoded `supplierId: "reorder"` — orders won't match real suppliers
- **R5-SUP-008**: Supplier orders pagination not URL-synced — POS-originated orders hard to navigate

### 7.4 SuperAdmin ↔ All
- **R5-SA-001/002**: Financial actions (refund approve, invoice issue) fire without confirmation
- **R5-SA-006**: Any admin can access all tabs including finance, monitoring, settings
- **R5-BE-005**: GRN stock reconciliation gap between order and inventory services
- **R5-BE-001/002/003**: Backend service-level auth gaps affect all consumers

---

## 8. Dimension Coverage Matrix

| Dimension | POS | Retailer | Supplier | SuperAdmin | Backend | Total |
|-----------|-----|----------|----------|------------|---------|-------|
| UI | 3 | 2 | 2 | 3 | 0 | 10 |
| UX | 5 | 2 | 2 | 5 | 0 | 14 |
| Wiring/State | 19 | 12 | 7 | 5 | 0 | 43 |
| Navigation | 4 | 1 | 3 | 2 | 0 | 10 |
| API Integration | 2 | 7 | 5 | 4 | 2 | 20 |
| Business Logic | 12 | 3 | 3 | 4 | 2 | 24 |
| API-DB | 1 | 1 | 2 | 0 | 3 | 7 |
| GCP Parity | 1 | 1 | 1 | 3 | 6 | 12 |
| Auth/RBAC | 0 | 0 | 0 | 0 | 10 | 10 |
| Store Isolation | 0 | 0 | 0 | 0 | 3 | 3 |
| Input Validation | 1 | 3 | 2 | 1 | 1 | 8 |
| Error Handling | 2 | 4 | 4 | 2 | 2 | 14 |
| **Subtotal** | **50** | **36** | **31** | **29** | **29** | **175** |

*Note: Some findings span multiple dimensions; count reflects primary dimension assignment. 5 findings span multiple screens/dimensions.*

---

## 9. Regression Risk Assessment

| Surface | Regression Risk | Evidence |
|---------|----------------|----------|
| POS | **YES** — 3 P0 in money-handling screens | PaymentScreen quantity rounding, sale cancellation race, purchase order partial failure |
| Retailer | **LOW** — no P0, P1s are state/API issues | No money-corruption risks, primarily UX/wiring gaps |
| Supplier | **YES** — 5 P0 in auth/API layer | Invoice PDF auth bypass, registration doc upload fail, logout race |
| SuperAdmin | **YES** — 5 P0 in financial actions | Refund/invoice no-confirmation, kill switch weak UX, hardcoded infra |
| Backend | **YES** — 5 P0 in auth/isolation | Defense-in-depth gaps, GRN data inconsistency, cross-store leak |

---

## 10. GCP Parity (stale-runtime-baseline)

Runtime baseline SHA `badc3fbe` does not match HEAD `f05165b8`. All GCP parity findings are tagged `stale-runtime-baseline`.

| Count | Disposition |
|-------|-------------|
| 6 | Require staging deploy + runtime verification |
| 1 | Clean baseline (no hardcoded URLs in POS screen layer) |

---

## 11. Final Checkpoint

| Field | Value |
|-------|-------|
| HEAD SHA | `f05165b8` |
| Staging baseline SHA | `badc3fbe` (stale-runtime-baseline) |
| Total screens audited | 119 |
| Total micro-checks | 952 |
| Existing tickets updated (revalidation) | 8 |
| New findings (net after dedupe) | 172 |
| P0 | 18 |
| P1 | 49 |
| P2 | 105 |
| Findings tagged `stale-runtime-baseline` | 6 |
| workflow:validate | PASS (mode=LIVE_FIX, tickets=306) |
| workflow:monitor | PASS (306 tickets, 0 failures) |

---

## 12. Verdict

**R5 TICKETIZATION: NOT COMPLETE**

180 raw findings identified. After deduplication against frozen 204 scope: 172 net new findings + 8 frozen ticket revalidation updates.

**Remaining work before R5 can be marked complete:**
1. Ticketize all 172 new findings into workflow/tickets/
2. Apply revalidation notes to 8 frozen tickets
3. Prioritize P0 findings for implementation
4. Deploy hold remains active — no staging deploy triggered

**Deploy hold remains active.**
