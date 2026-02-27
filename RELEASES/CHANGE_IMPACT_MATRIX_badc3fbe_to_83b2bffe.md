# Change Impact Matrix

> Range: `badc3fbe..83b2bffe` (246 commits)
> Generated: 2026-02-27

## Summary

| Metric | Value |
|--------|-------|
| Total commits | 246 |
| Total files changed | 1505 |
| Lines added | 392,664 |
| Lines removed | 5,573 |
| Services affected | ALL 6 + POS app |
| Migrations pending | 27 (141–167) |
| New schemas | 5 (notifications, chat, ai, whatsapp, invoicing) |
| New tables | 18+ |
| RLS-enforced tables | 60+ |

---

## 1. Backend Services (71 files, +2215/−1628 lines)

### api-gateway (13 files, +270/−122)
| File | Change | Ticket Category |
|------|--------|-----------------|
| `src/config.ts` | Config hardening | LIVE/R5/R6 |
| `src/index.ts` | Service hardening | LIVE/R5 |
| `src/middleware/adminAuth.ts` | Admin auth improvements | LIVE |
| `src/middleware/authorize.ts` | RBAC enforcement | R5/R6 |
| `src/middleware/csrfProtection.ts` | CSRF middleware (NEW) | W5 |
| `src/middleware/jwtAuth.ts` | JWT algorithm pinning | LIVE |
| `src/middleware/rateLimiter.ts` | Redis-backed rate limiting | LIVE/W5 |
| `src/middleware/requestLogger.ts` | Structured logging | LIVE |
| `src/redis.ts` | Redis fail-fast | LIVE |
| `src/routes/adminAuth.ts` | Admin OTP allowlist | W5 |
| `src/routes/proxy.ts` | Explicit health allowlist | LIVE |
| `src/routes/testAuth.ts` | Test auth prod guard | LIVE |
| `src/services/adminSessionService.ts` | Session management | LIVE/R6 |

### auth-service (6 files)
| File | Change | Ticket |
|------|--------|--------|
| `src/config.ts` | Remove JWT fallbacks | W5/LIVE |
| `src/index.ts` | Structured logger | LIVE |
| `src/middleware/authenticate.ts` | Auth hardening | R5/R6 |
| `src/routes/admin.ts` | Admin OTP 8-digit + allowlist | W5 |
| `src/routes/internal.ts` | Internal route hardening | R5 |
| `src/routes/retailerAuth.ts` | OTP success/error conflict fix | LIVE |
| `src/services/jwtService.ts` | HS256 pinning, issuer enforcement | LIVE |

### catalog-service (7 files)
| File | Change | Ticket |
|------|--------|--------|
| `src/cache/redis.ts` | Redis hardening | R5 |
| `src/config.ts` | Config hardening | LIVE |
| `src/consumers/inventoryConsumer.ts` | Consumer hardening | R5 |
| `src/index.ts` | Structured logger | LIVE |
| `src/routes/internal.ts` | Internal route security | R5 |
| `src/routes/mapping.ts` | Sort allowlist | W5 |
| `src/services/catalogService.ts` | Search hardening | R5 |
| `src/services/catalogServiceSupport.ts` | Support hardening | R5 |
| `src/services/searchService.ts` | Trigram search | R5 |

### inventory-service (7 files)
| File | Change | Ticket |
|------|--------|--------|
| `src/config.ts` | Config hardening | LIVE |
| `src/db/queries.ts` | Stock balance queries | R5/R6 |
| `src/index.ts` | Structured logger | LIVE |
| `src/routes/internal.ts` | Internal security | R5 |
| `src/routes/inventory.ts` | Store status gate | W5 |
| `src/routes/transactions.ts` | Transaction hardening | R5 |
| `src/services/ledgerService.ts` | Ledger audit compliance | R5/R6 |
| `src/services/transactionService.ts` | Transaction rollback | W5 |

### order-service (6 files)
| File | Change | Ticket |
|------|--------|--------|
| `src/config.ts` | Config hardening | LIVE |
| `src/db/queries.ts` | Query hardening | R5 |
| `src/index.ts` | Structured logger | LIVE |
| `src/routes/receive.ts` | GRN service | R5 |
| `src/routes/statusTransitions.ts` | Status workflow | R5 |
| `src/services/grnService.ts` | GRN hardening | R5 |

### payment-service (4 files)
| File | Change | Ticket |
|------|--------|--------|
| `src/config.ts` | Config hardening | LIVE |
| `src/db/queries.ts` | Payment queries | R5 |
| `src/index.ts` | Structured logger | LIVE |
| `src/services/razorpayClient.ts` | Razorpay hardening | R5 |

### platform-service (6 files)
| File | Change | Ticket |
|------|--------|--------|
| `src/config.ts` | Config hardening | LIVE |
| `src/index.ts` | Structured logger + health | LIVE |
| `src/routes/retailerAdmin.ts` | Admin routes | R5 |
| `src/routes/retailerPortal.ts` | Portal routes | R5 |
| `src/routes/stores.ts` | Store queries + soft-delete filter | W5 |
| `src/services/retailerCatalogService.ts` | Catalog service | R5 |

### supplier-service (8 files)
| File | Change | Ticket |
|------|--------|--------|
| `src/config.ts` | Config hardening | LIVE |
| `src/index.ts` | Structured logger | LIVE |
| `src/middleware/supplierAuth.ts` | Supplier auth | R5 |
| `src/routes/auth.ts` | Supplier auth | R5 |
| `src/routes/authSupport.ts` | Auth support | R5 |
| `src/routes/suppliers.ts` | Supplier routes | R5 |
| `src/services/supplierDiscoveryService.ts` | Discovery | R5 |
| `src/services/supplierLinkLifecycleService.ts` | Link lifecycle | R5 |
| `src/services/supplierService.ts` | Supplier service | R5 |

### reorder-service (5 files)
| File | Change | Ticket |
|------|--------|--------|
| `src/config.ts` | Config hardening | LIVE |
| `src/consumers/inventoryConsumer.ts` | Consumer hardening | R5 |
| `src/index.ts` | Structured logger | LIVE |
| `src/jobs/stockMonitor.ts` | Stock monitor | R5 |
| `src/routes/policies.ts` | Policy routes | R5 |

### voice-service (4 files)
| File | Change | Ticket |
|------|--------|--------|
| `src/config.ts` | Config hardening | LIVE |
| `src/index.ts` | Structured logger | LIVE |
| `src/routes/voice.ts` | Prompt injection guard | LIVE |
| `src/services/sttService.ts` | STT hardening | R5 |

---

## 2. API Gateway Routing (13 files, +270/−122)

| Route Category | Changes |
|----------------|---------|
| Health endpoint | Explicit allowlist (LIVE) |
| Admin auth | OTP allowlist, 8-digit, session management (W5/LIVE) |
| CSRF | New middleware for mutation routes (W5) |
| Rate limiting | Redis-backed, env-tunable (LIVE/W5) |
| JWT | Algorithm pinning HS256, issuer enforcement (LIVE) |
| CORS | Access-Control-Max-Age, header stripping (LIVE) |

---

## 3. Retailer Admin Portal (40 files, +535/−239)

| Page/Component | Changes |
|----------------|---------|
| `App.tsx` | Error boundary integration |
| `ErrorBoundary.tsx` | Redirect to `/retailer/login` (W5) |
| `ProtectedLayout.tsx` | Auth guard hardening |
| `AuthContext.tsx` | Auth context improvements |
| `FeatureFlagContext.tsx` | Feature flag system |
| `api.ts` | API client hardening |
| `fileLimits.ts` | 5MB env-configurable file limits (W4) |
| `logger.ts` | Structured logger (W5) |
| 18 page components | Console error guards, structured logging, error UI, validation (W5/R5/R6) |
| `VariantManager.tsx` | Variant management hardening |
| `ProductQueuePage.tsx` | Admin product queue |
| `SupplierQueuePage.tsx` | Admin supplier queue |

---

## 4. Supplier Portal (30 files, +807/−314)

| Page/Component | Changes |
|----------------|---------|
| Auth pages (4) | Forgot password refactor, login hardening, onboard, reset (R7/W5) |
| Dashboard pages (8) | Orders SSE, chat, BNPL, earnings, KYC, notifications, products, upload (W5) |
| `error.tsx` / `global-error.tsx` | Error page redirect to `/supplier/dashboard` |
| `layout.tsx` | Layout hardening |
| `middleware.ts` | NEW: Next.js middleware |
| `reconnectingEventSource.ts` | NEW: SSE reconnection (W4) |
| `ThemeToggle.tsx` | Theme toggle |
| `api.ts` | API client hardening |
| `auth.tsx` | Auth context |
| `fileLimits.ts` | 5MB env-configurable file limits (W4) |
| `register/page.tsx` | Registration hardening |

---

## 5. SuperAdmin Portal (37 files, +1934/−684)

| Tab/Component | Changes |
|---------------|---------|
| `App.tsx` | Tab routing, error boundary |
| `ErrorBoundary.tsx` | Error boundary hardening |
| `AiPanel.tsx` | AI panel component |
| `useNavigationSafety.ts` | Navigation safety hook |
| 17 tab components | AIInsights, Applications, Audit, CreditProviders, Devices, Documents, Events, GstCompliance, Monitoring, Payments, QualityDashboard, Refunds, Settings, Staff, SupportQueue, Users, WhatsApp (W5/R5/R6) |
| 5 API modules | applications, gstCompliance, invoices, monitoring, refunds, whatsapp (W5) |

---

## 6. Landing Page (2 files, +616/−335)

| File | Changes |
|------|---------|
| `index.html` | Full redesign with WhatsApp CTA integration |
| `pos.html` | POS download page updates |

---

## 7. POS App (33 files, +589/−425)

| Screen/Component | Changes |
|------------------|---------|
| `EnrollDeviceScreen.tsx` | Retry with exponential backoff (W5) |
| `ForceUpdateScreen.tsx` | iOS App Store URL handling |
| `InwardScreen.tsx` | Inward flow hardening |
| `MenuScreen.tsx` | Menu hardening |
| `OrderDetailScreen.tsx` | Order detail improvements |
| `PaymentScreen.tsx` | Amount precision, cap at 100cr (LIVE) |
| `PaymentSetupScreen.tsx` | Payment setup hardening |
| `PosRootLayout.tsx` | Root layout hardening |
| `ReorderSettingsScreen.tsx` | Reorder settings |
| `SellScanScreen.tsx` | Scanner hardening |
| `SplashScreen.tsx` | Splash flow |
| `StaffLoginScreen.tsx` | Staff login |
| `StockStatementScreen.tsx` | Stock statement |
| `SuccessPrintScreenV2.tsx` | Print receipt |
| 6 buy components | CartItem, CatalogProductCard, PaymentOptionsSheet, PurchaseCartModal, SupplierCartSection |
| 2 reorder components | EditReorderModal, PendingReorderCard |
| 3 API modules | enrollApi, inventoryApi, orderApi |
| `offlineQueue.ts` | Offline queue hardening |
| `money.ts` | Money utility hardening |

---

## 8. Database Migrations (27 new: 141–167)

| Migration | Type | Risk | Tables Affected |
|-----------|------|------|-----------------|
| 141 | ADD COLUMN | LOW | orders.purchase_order_items |
| 142 | CREATE TABLE | LOW | orders.purchase_cart_drafts |
| 143 | CREATE TABLE | LOW | orders.refunds |
| 144 | ADD COLUMN | LOW | inventory.stock_balances |
| 145 | CREATE TABLE | LOW | orders.daily_closings |
| 146 | CREATE TABLE + ADD COLUMN | LOW | platform.staff_shifts, payments.sell_payments, catalog.supplier_products, platform.stores |
| 147 | CREATE INDEX | LOW | catalog.store_products, catalog.products |
| 148 | ADD COLUMN | LOW | platform.stores |
| **149** | **ENABLE RLS** | **CRITICAL** | **27 tables across 7 schemas** |
| 150 | SCHEMA UNIFICATION | MEDIUM | reorder.*, orders.purchase_orders |
| 151 | ALTER CONSTRAINT | MEDIUM | reorder.pending_reorders |
| 152 | CREATE SCHEMA+TABLES | LOW | notifications.*, orders.payment_reminders, orders.refund_requests, invoicing.* |
| 153 | CREATE TABLE + ADD COLUMN | MEDIUM | payments.payout_retries, payments.supplier_payouts |
| 154 | CREATE TABLES | MEDIUM | payments.credit_provider_configs, payments.repayment_schedules, payments.kyc_*, payments.credit_settlements |
| 155 | CREATE SCHEMA+TABLES | LOW | chat.conversations, chat.conversation_participants, chat.messages, chat.message_templates |
| 156 | CREATE SCHEMA+TABLES | LOW | ai.alerts, ai.demand_forecasts, ai.auto_closing_config, ai.customer_insights, ai.anomaly_events, ai.product_recommendations |
| 157 | CREATE INDEX | LOW | auth.refresh_tokens |
| 159 | CREATE SCHEMA+TABLE | LOW | whatsapp.message_logs |
| 160 | ADD CONSTRAINT + INDEX | MEDIUM | store_inventory, inventory.inventory_ledger |
| **161** | **ENABLE RLS** | **CRITICAL** | **8 tables (gap coverage for M149)** |
| 162 | ADD COLUMN + RLS | MEDIUM | public.sale_items, pos_device_enrollments |
| **163** | **TYPE CONVERSION** | **HIGH** | **15+ tables (TEXT→UUID)** |
| **164** | **ENABLE RLS** | **CRITICAL** | **27+ tables (full coverage)** |
| 165 | ADD FK + RLS + INDEX | MEDIUM | auth.applications, auth.application_status_log, pos_device_enrollments |
| 166 | ADD COLUMN + TRIGGER | MEDIUM | pos_device_enrollments |
| 167 | CREATE TABLE | LOW | platform.whatsapp_cta_config |

---

## 9. Ticket Coverage by Wave

| Wave | Commits | Scope |
|------|---------|-------|
| LIVE (Go-Live) | ~120 | Store isolation, JWT hardening, auth, rate limiting, health endpoints |
| R5 (Audit Round 5) | ~40 | Service hardening, query safety, RBAC |
| R6 (Audit Round 6) | ~30 | Auth, session, ledger hardening |
| R7 (Security) | ~15 | Console guards, forgot-password, error pages, orders SSE |
| W4 (Week 4 Audit) | ~10 | File size limits, console logging, App Store URL |
| W5 (Week 5 Audit) | ~25 | JWT fallback removal, SQL injection, soft-delete, CSRF, idempotency, admin OTP |
| STAGE/AUTH/OTHER | ~6 | Staging infrastructure, auth parity |
