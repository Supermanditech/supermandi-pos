# SuperMandi POS - APK Release Checklist V3.0.9

## Release Information
| Field | Value |
|-------|-------|
| Version | 3.0.9 |
| Date | 2026-01-13 |
| Tickets Completed | DEV-001 to DEV-052 (52 tickets) |
| Bug Fixes | FIX-001 to FIX-020 (20 fixes) |
| Type | Full System Release |

---

## SECTION A: PRE-BUILD VERIFICATION

### A.1 WIP Gate Check
```bash
npm run wip:list
```
- [ ] **MANDATORY**: No WIP tasks blocking build
- [ ] All WIP tasks either completed or moved to next release

### A.2 TypeScript Compilation
```bash
# Frontend
npm run typecheck

# Backend (all services)
cd backend && pnpm -r run typecheck
```
- [ ] Frontend: 0 errors
- [ ] Backend common package: 0 errors
- [ ] All 8 backend services compile

### A.3 Launch Verification Script
```bash
npm run verify:launch
```
- [ ] 65/65 checks pass (100%)

---

## SECTION B: BACKEND SERVICES (DEV-001 to DEV-027)

### B.1 Infrastructure (DEV-001 to DEV-008)
| Ticket | Component | Status | Verification |
|--------|-----------|--------|--------------|
| DEV-001 | Monorepo Setup | [ ] | pnpm install works |
| DEV-002 | Types & DTOs | [ ] | shared/ package exports |
| DEV-003 | Database Utilities | [ ] | Pool connects to PG |
| DEV-004 | Platform Schema | [ ] | 001_platform_schema.sql exists |
| DEV-005 | Auth Schema | [ ] | 002_auth_schema.sql exists |
| DEV-006 | Supplier Schema | [ ] | 003_supplier_schema.sql exists |
| DEV-007 | Catalog Schema | [ ] | 004_catalog_schema.sql exists |
| DEV-008 | Inventory/Order Schema | [ ] | 005-008 migrations exist |

### B.2 Services Implementation (DEV-009 to DEV-027)
| Service | Port | Ticket | Files Exist |
|---------|------|--------|-------------|
| api-gateway | 3000 | DEV-009 | [ ] services/api-gateway/ |
| auth-service | 3001 | DEV-010-012 | [ ] services/auth-service/ |
| platform-service | 3002 | DEV-013 | [ ] services/platform-service/ |
| supplier-service | 3003 | DEV-014 | [ ] services/supplier-service/ |
| catalog-service | 3004 | DEV-015-016 | [ ] services/catalog-service/ |
| inventory-service | 3005 | DEV-017-018 | [ ] services/inventory-service/ |
| order-service | 3006 | DEV-019-020 | [ ] services/order-service/ |
| reorder-service | 3007 | DEV-021-027 | [ ] services/reorder-service/ |

### B.3 Event System
- [ ] DEV-027: Outbox pattern implemented
- [ ] Bull queues configured with fanout (separate queues per consumer)
- [ ] Redis AOF persistence enabled

---

## SECTION C: FRONTEND SCREENS (DEV-028 to DEV-045)

### C.1 Navigation & Layout (DEV-028-031)
| Ticket | Screen | Status | Key Feature |
|--------|--------|--------|-------------|
| DEV-028 | BuySupplierListScreen | [ ] | Supplier grid with search |
| DEV-029 | BuyCatalogScreen | [ ] | Product catalog with MOQ |
| DEV-030 | BuyCartScreen | [ ] | Multi-supplier cart |
| DEV-031 | BuyOrdersScreen | [ ] | Order history |

### C.2 REORDER Flow (DEV-032-037)
| Ticket | Screen | Status | Key Feature |
|--------|--------|--------|-------------|
| DEV-032 | ReorderDashboard | [ ] | Settings overview |
| DEV-033 | ReorderSettingsScreen | [ ] | Enable/disable toggle |
| DEV-034 | ReorderPoliciesScreen | [ ] | Per-product policies |
| DEV-035 | ReorderPendingScreen | [ ] | Low stock detection |
| DEV-036 | ReorderApprovalFlow | [ ] | Approve/dismiss workflow |
| DEV-037 | ReorderToCartBridge | [ ] | Convert to draft PO |

### C.3 GRN Flow (DEV-038-042)
| Ticket | Screen | Status | Key Feature |
|--------|--------|--------|-------------|
| DEV-038 | GrnOrderSelectScreen | [ ] | Confirmed orders list |
| DEV-039 | GrnReceiveScreen | [ ] | Quantity entry |
| DEV-040 | GrnBarcodeSearch | [ ] | Scan to find item |
| DEV-041 | GrnSubmitFlow | [ ] | Complete GRN |
| DEV-042 | GrnHistoryScreen | [ ] | Past GRNs |

### C.4 Integration (DEV-043-045)
| Ticket | Component | Status | Key Feature |
|--------|-----------|--------|-------------|
| DEV-043 | API Client Layer | [ ] | Typed HTTP client |
| DEV-044 | Auth Integration | [ ] | JWT token handling |
| DEV-045 | Error Handling | [ ] | Toast notifications |

---

## SECTION D: TESTING & QUALITY (DEV-046 to DEV-052)

### D.1 Integration Tests (DEV-048)
```bash
cd backend && pnpm test
```
| Suite | Tests | Status |
|-------|-------|--------|
| Golden Path | 10 | [ ] Pass |
| Auth | 8 | [ ] Pass |
| Inventory | 12 | [ ] Pass |
| Orders | 15 | [ ] Pass |
| Catalog | 10 | [ ] Pass |
| Reorder | 14 | [ ] Pass |
| Events | 10 | [ ] Pass |

### D.2 E2E Tests (DEV-049)
```bash
npm run e2e
```
| Flow | Status |
|------|--------|
| SELL | [ ] Pass |
| BUY | [ ] Pass |
| REORDER | [ ] Pass |
| GRN | [ ] Pass |

### D.3 Infrastructure (DEV-050-052)
- [ ] Docker production build works
- [ ] Observability (logging + Sentry) configured
- [ ] Launch checklist completed

---

## SECTION E: BUG FIXES (FIX-001 to FIX-020)

### E.1 UI/UX Fixes
| Fix ID | Description | File | Status |
|--------|-------------|------|--------|
| FIX-001 | Font loading for APK | App.tsx | [ ] |
| FIX-002 | Cart bar hidden when empty | SellScanScreen.tsx | [ ] |
| FIX-003 | Status bar no big modal | PosStatusBar.tsx | [ ] |
| FIX-004 | Edit modal stock validation | SellScanScreen.tsx | [ ] |
| FIX-005 | Discount max 100% | SellScanScreen.tsx | [ ] |
| FIX-006 | Cart auto-collapse empty | SellScanScreen.tsx | [ ] |
| FIX-007 | Expo updates disabled | app.json | [ ] |
| FIX-008 | Free item toggle | SellScanScreen.tsx | [ ] |
| FIX-009 | Cart clear button | SellScanScreen.tsx | [ ] |
| FIX-010 | Pencil icon placement | SellScanScreen.tsx | [ ] |

### E.2 Scanner Fixes
| Fix ID | Description | File | Status |
|--------|-------------|------|--------|
| FIX-011 | Single scan mode | handleScan.ts | [ ] |
| FIX-012 | Auto-close camera | PosRootLayout.tsx | [ ] |
| FIX-013 | Onboarding for no-price only | handleScan.ts | [ ] |
| FIX-014 | Search adds qty not duplicate | SellScanScreen.tsx | [ ] |
| FIX-015 | HID always editable | PosRootLayout.tsx | [ ] |
| FIX-016 | HID status on input | PosRootLayout.tsx | [ ] |
| FIX-017 | HID blocking feedback | PosRootLayout.tsx | [ ] |
| FIX-018 | HID try-catch handlers | PosRootLayout.tsx | [ ] |
| FIX-019 | addToSellCart error handling | handleScan.ts | [ ] |
| FIX-020 | HID debug logging | hidScannerService.ts | [ ] |

---

## SECTION F: CRITICAL PATTERNS VERIFICATION

### F.1 Must Contain Patterns
```bash
node scripts/pre-commit-check.js
```
| Pattern | File | Purpose |
|---------|------|---------|
| Font.loadAsync | App.tsx | Icon loading |
| itemCount > 0 ? | SellScanScreen.tsx | Hide empty cart bar |
| Cannot exceed stock | SellScanScreen.tsx | Stock validation |
| already in cart | handleScan.ts | Duplicate prevention |
| editable | PosRootLayout.tsx | HID always active |

### F.2 Must NOT Contain Patterns
| Pattern | File | Purpose |
|---------|------|---------|
| setDetailsOpen | PosStatusBar.tsx | No big modal |
| detailsOpen | PosStatusBar.tsx | No big modal |
| editable={!scanDisabled} | PosRootLayout.tsx | HID blocking in handler |

---

## SECTION G: PREVIOUS IMPLEMENTATIONS INCLUDED

### G.1 SELL Flow (Existing)
- [x] Product search (fuzzy + barcode)
- [x] Cart operations (add/update/remove)
- [x] Discount application (amount/percentage)
- [x] Payment recording (cash/UPI/card)
- [x] Receipt generation (PDF)
- [x] Inventory deduction on sale

### G.2 Authentication (Existing)
- [x] Device enrollment
- [x] Staff PIN login
- [x] JWT token management
- [x] Role-based access control

### G.3 Inventory Management (Existing)
- [x] Stock tracking with ledger
- [x] Low stock detection
- [x] Oversell prevention
- [x] Inventory sync

---

## SECTION H: DOCKER PRODUCTION BUILD

### H.1 Build All Images
```bash
cd backend && docker-compose -f docker-compose.prod.yml build
```
- [ ] api-gateway builds
- [ ] auth-service builds
- [ ] platform-service builds
- [ ] supplier-service builds
- [ ] catalog-service builds
- [ ] inventory-service builds
- [ ] order-service builds
- [ ] reorder-service builds
- [ ] PostgreSQL configured
- [ ] Redis with AOF configured

### H.2 Container Health Checks
```bash
./backend/scripts/healthcheck.sh -v
```
- [ ] All containers start
- [ ] Health endpoints respond
- [ ] Database connections work
- [ ] Redis connections work

---

## SECTION I: APK BUILD

### I.1 Pre-Build Checks
```bash
npm run apk:check
```
- [ ] All mandatory fixes present
- [ ] No WIP tasks blocking
- [ ] TypeScript clean
- [ ] Fonts configured

### I.2 Build APK
```bash
cd android && ./gradlew assembleRelease
```
- [ ] Build completes without errors
- [ ] APK size reasonable (<50MB)
- [ ] APK signed correctly

### I.3 Post-Build Verification
- [ ] Install on test device
- [ ] SELL flow works
- [ ] BUY flow works
- [ ] REORDER flow works
- [ ] GRN flow works
- [ ] Scanner (camera) works
- [ ] Scanner (HID) works

---

## SECTION J: DEPLOYMENT

### J.1 VM Deployment
```bash
npm run deploy:vm
```
- [ ] Backend services deployed
- [ ] Database migrations run
- [ ] Health checks pass

### J.2 Device Installation
```bash
npm run install:devices
```
- [ ] APK installed on all target devices
- [ ] App launches correctly
- [ ] Login works

---

## SECTION K: SIGN-OFF

### K.1 Verification Summary
| Category | Checks | Passed |
|----------|--------|--------|
| TypeScript | 2 | [ ] |
| Backend Services | 8 | [ ] |
| Frontend Screens | 18 | [ ] |
| Bug Fixes | 20 | [ ] |
| Integration Tests | 7 | [ ] |
| E2E Tests | 4 | [ ] |
| Docker Build | 10 | [ ] |
| APK Build | 3 | [ ] |
| **TOTAL** | **72** | [ ] |

### K.2 Release Approval
| Role | Name | Date | Signature |
|------|------|------|-----------|
| Developer | | | |
| QA | | | |
| Product Owner | | | |

---

## SECTION L: CHANGELOG V3.0.9

### New Features (DEV-001 to DEV-052)
- Complete backend microservices architecture
- BUY flow with supplier catalog
- REORDER system with auto-detection
- GRN flow for goods receiving
- Event-driven architecture with outbox pattern
- Structured logging with correlation IDs
- Sentry error tracking integration
- Docker production configuration
- Comprehensive test suite

### Bug Fixes (FIX-001 to FIX-020)
- Font loading for APK builds
- Cart bar visibility when empty
- Status bar simplified (no big modal)
- Edit modal validations (stock + discount)
- HID scanner reliability improvements
- Scan deduplication logic
- Error handling enhancements

### Technical Improvements
- TypeScript strict mode across all code
- Zod validation for all DTOs
- Redis AOF for queue durability
- Health check endpoints on all services
- Automated launch verification script

---

**Document Version**: 3.0.9
**Last Updated**: 2026-01-13
**Generated By**: Claude Code
