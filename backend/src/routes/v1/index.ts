import { Router } from "express";
import { redisRateLimit } from "../../middleware/rateLimit";
import { posEventsRouter } from "./pos/events";
import { posScanRouter } from "./pos/scan";
import { posSalesRouter } from "./pos/sales";
import { posPurchasesRouter } from "./pos/purchases";
import { posStoreRouter } from "./pos/store";
import { posSyncRouter } from "./pos/sync";
import { posEnrollRouter } from "./pos/enroll";
import { posDevicesRouter } from "./pos/devices";
import { posUiStatusRouter } from "./pos/uiStatus";
import { posInventoryRouter } from "./pos/inventory";
import { posStoreProductsRouter } from "./pos/storeProducts";
import { posSuppliersRouter } from "./pos/suppliers";
import { posStockInRouter } from "./pos/stockIn";
import { posPaymentsRouter } from "./pos/payments";
import { posRefundsRouter } from "./pos/refunds";  // T-150: Payment refund flow
import { posBnplRouter } from "./pos/bnpl";  // SM-019: BNPL drawdowns
import { posComplianceRouter } from "./pos/compliance";  // T-190: KYC document upload
import { posCreditRouter } from "./pos/credit";  // SM-021: Credit offers
import { posDuesRouter } from "./pos/dues";  // POS-DUE-001: Customer dues management
import { posOpeningStockRouter } from "./pos/openingStock";  // T-198: Opening stock entry
import { posReportsRouter } from "./pos/reports";  // T-199: Daily sales report
import { posOverduePaymentsRouter } from "./pos/overduePayments";  // T-193: Overdue DUE payments
import { tokenManagementRouter } from "./pos/tokenManagement";  // GL-WF-045-A: Token security
import { posStaffRouter } from "./pos/staff";  // SA-P1-001: POS staff login
import { posStaffManageRouter } from "./pos/staffManage";  // V3-POS-024: Owner staff management
import { posShiftsRouter } from "./pos/shifts";  // POS-SHIFT-001: Staff shift management
import { posDailyClosingRouter } from "./pos/dailyClosing";  // POS-DAILY-001: Daily closing reconciliation
import { posChatRouter } from "./pos/chat";  // STG-152: POS chat proxy with device token auth
import { posKhataRouter } from "./pos/khata";  // POS-KHATA-001: Khata credit ledger
import { posCustomersRouter } from "./pos/customers";  // POS-CUST-001: Customer profiles
import { adminStaffRouter } from "./admin/staff";  // SA-P1-001: Admin staff CRUD
import { adminGrnAlertsRouter } from "./admin/grnAlerts";  // SA-P1-004: GRN excess alerts
import { adminFeatureFlagsRouter } from "./admin/featureFlags";  // SA-P0-005: Feature flags
import posTranslationsRouter from "./pos/translations";
import { reorderRouter } from "./reorder";
import { ordersRouter } from "./orders";
import { catalogRouter } from "./catalog";
import { adminHealthRouter } from "./admin/health";
import { adminPosEventsRouter } from "./admin/posEvents";
import { adminAiRouter } from "./admin/ai";
import { adminStoresRouter } from "./admin/stores";
import { adminDevicesRouter } from "./admin/devices";
import { adminDeviceEnrollmentRouter } from "./admin/deviceEnrollments";
import { adminAnalyticsRouter } from "./admin/analytics";
import { adminBarcodeSheetsRouter } from "./admin/barcodeSheets";
import { adminGlobalProductsRouter } from "./admin/globalProducts";
import { adminSuppliersRouter } from "./admin/suppliers";
import { adminUsersRouter } from "./admin/users";
import { adminSettingsRouter } from "./admin/settings";
import { adminAuditRouter } from "./admin/audit";  // GL-CRIT-0049: Audit log endpoint
import { adminGstCreditsRouter } from "./admin/gstCredits";  // GO-LIVE-097: GST input credits
import { adminAuthRouter } from "./admin/adminAuth";  // GO-LIVE-LOGIN-004: Admin email OTP auth
import { adminAuditMiddleware } from "../../middleware/adminAudit";  // GL-CRIT-0049: Audit logging
import { validateGatewayHeaders } from "../../middleware/validateGatewayHeaders";  // GO-LIVE-046: Validate gateway headers
import { requireStoreOwnership, verifyStoreExists, requireActiveStore, requireActiveUser } from "../../middleware/storeOwnership";  // GO-LIVE-047: Store ownership verification
import { retailerAdminInventoryRouter } from "./retailer-admin/inventory";
import { retailerAdminSuppliersRouter } from "./retailer-admin/suppliers";
import { retailerAdminProductsRouter } from "./retailer-admin/products";
import { retailerAdminCsvImportRouter } from "./retailer-admin/csvImport";
import { retailerAdminSearchRouter } from "./retailer-admin/search";
import { retailerComplianceRouter } from "./retailer-admin/compliance";
import { retailerAdminAuthRouter } from "./retailer-admin/auth";
import { retailerAdminSettingsRouter } from "./retailer-admin/settings";  // GL-AUD-004: Store settings
import { retailerAdminDevicesRouter } from "./retailer-admin/devices";  // RET-WEB-002: Device activation
import { retailerAdminStaffRouter } from "./retailer-admin/staff";  // V3-API-019: Owner staff CRUD
import { retailerAdminVariantsRouter } from "./retailer-admin/variants";  // T-057: Retail variant CRUD
import { retailerInvoicesRouter } from "./retailer-admin/invoices";  // T-073: Retailer invoice views
import { retailerReorderRouter } from "./retailer-admin/reorder";  // CL-017: Retailer reorder
import { retailerBnplRouter } from "./retailer-admin/bnpl";  // CL-019: Retailer BNPL view
import { retailerAdminCustomersRouter } from "./retailer-admin/customers";  // T-218: Customer CRM
import { retailerRegistrationRouter } from "./retailer-admin/registration";  // REG-AUTH-201: Registration API
import { retailerReconciliationRouter } from "./retailer-admin/reconciliation";  // T-260: Payment reconciliation
import { retailerCreditDashboardRouter } from "./retailer-admin/creditDashboard";  // T-277: Credit dashboard
import { retailerPurchaseOrdersRouter } from "./retailer-admin/purchaseOrders";  // T-180: Purchase order visibility
import { creditProvidersRouter } from "./credit/providers";  // T-263: Credit provider abstraction
import { adminCreditProvidersRouter } from "./admin/creditProviders";  // T-281/T-290: Provider management
import { supplierBnplRouter } from "./supplier/bnplVisibility";  // T-280: Supplier BNPL visibility
import { chatRouter } from "./chat";  // T-291→T-302: In-app chat
import { aiIntelligenceRouter } from "./ai/intelligence";  // T-303→T-316: AI Intelligence
import { adminMaintenanceRouter } from "./admin/maintenance";  // SA-P0-007: System maintenance mode
import { maintenanceGate } from "../../middleware/maintenanceMode";  // SA-P0-007: Maintenance gate
import { demoRouter } from "./demo";
import { microserviceHealthRouter } from "./microserviceHealth";
import { webhooksRouter } from "./webhooks";  // SM-018: Razorpay payout webhooks
import { supplierRouter } from "./supplier";  // SM-005, SM-006, SM-007: Supplier portal APIs
import { posSyncEventsRouter } from "./pos/syncEvents";  // T-173: SSE real-time sync
import { voiceRouter } from "./pos/voice";  // GO-LIVE: Voice order with OpenAI
import { uploadsRouter } from "./uploads/images";  // T-160: Image upload endpoint
import { documentsRouter } from "./documents";  // DOCS-001: Unified document storage
import { adminDocumentsRouter } from "./admin/documents";  // DOCS-001: Admin document management
import { adminRegistrationEventsRouter } from "./admin/registrationEvents";  // RO-007: Registration events
import { adminApplicationsRouter } from "./admin/applications";  // STAGING-FIX-014: Application approval
import { adminInvoicesRouter } from "./admin/invoices";  // T-071: Buy-resell invoicing
import { adminCreditRouter } from "./admin/credit";  // CL-020: Credit approval
import { authRouter } from "./auth";  // PORTAL-AUTH-001: Unified auth routes
import { retailerRegisterRouter } from "./retailer/register";  // RO-001: Canonical registration
import { retailerMeRouter } from "./retailer/me";  // RO-005: Cross-surface login linking
import { configStatusRouter } from "./configStatus";  // RO-009: Config status endpoint
import { publicConfigRouter } from "./publicConfig";  // REQ.FEATURE.SUPERADMIN.WHATSAPP_CTA_LIVE_CONFIG.001: Public CTA config
import { posNotificationsRouter } from "./pos/notifications";  // Phase 8: FCM push notifications
import { posRefundRequestsRouter } from "./pos/refundRequests";  // T-219: UPI refund requests
import { retailerNotificationsRouter } from "./retailer-admin/notifications";  // Phase 8: Retailer notifications
import { adminGstComplianceRouter } from "./admin/gstCompliance";  // T-235: GST compliance
import { adminComplianceRouter } from "./admin/compliance";  // SA-P2-004: Compliance status aggregation
import { adminScheduledJobsRouter } from "./admin/scheduledJobs";  // T-231/T-223: Scheduled jobs + monitoring
import { refundWebhookRouter } from "./webhooks/refundWebhook";  // T-219: Razorpay refund webhooks
import { adminRefundsRouter } from "./admin/refunds";  // T-219: Admin refund management
import { qualityDashboardRouter } from "./admin/qualityDashboard";  // T-223: Quality dashboard API
import { posWhatsAppRouter } from "./pos/whatsapp";  // WA-001: POS WhatsApp Cloud API
import { adminWhatsAppRouter } from "./admin/whatsapp";  // WA-001: Admin WhatsApp Cloud API
import { adminCatalogRouter } from "./admin/catalog";  // SA-P2-006: Product category override
import { whatsappWebhookRouter } from "./webhooks/whatsappWebhook";  // WA-001: WhatsApp delivery webhooks
import { adminReorderPoliciesRouter } from "./admin/reorderPolicies";  // SA-P1-015: Reorder policy supervision
import { adminImportsRouter } from "./admin/imports";  // SA-P2-008: Bulk import notification
import { adminPriceBoundsRouter } from "./admin/priceBounds";  // SA-P0-003: Price bounds
import { adminAnomalyAlertsRouter } from "./admin/anomalyAlerts";  // SA-P1-010: Anomaly detection alerts
import { posExpiryAlertsRouter } from "./pos/expiryAlerts";  // SCALE-C2: POS expiry alerts
import { consentRouter } from "./consent";  // STG-485: DPDP consent records
// V3: OTP auth route
import { posOtpAuthRouter } from "./pos/otpAuth";
// V3-016: Wholesale B2B routes
import { posWholesaleRouter } from "./pos/wholesaleFields";
// AUDIT-013: SSE real-time sync
import { posLastPurchaseRouter } from "./pos/lastPurchase";
import { posMasterCatalogRouter } from "./pos/masterCatalog";
import { posSalesVelocityRouter } from "./pos/salesVelocity";
import { posDemandSignalsRouter } from "./pos/demandSignals";  // V3-HARDEN-185: Demand signals
import { posBuyAgainRouter } from "./pos/buyAgain";  // V3-FIX-186: Buy-again / repeat-last-order
import { posLifecycleEventsRouter } from "./pos/lifecycleEvents";  // V3-HARDEN-188: Lifecycle events
import { retailerDemandSignalsRouter } from "./retailer-admin/demandSignals";  // V3-HARDEN-185: Retailer demand
import { adminDemandSignalsRouter } from "./admin/demandSignals";  // V3-HARDEN-185: Admin demand
import { adminAllocationsRouter } from "./admin/allocations";  // V3-FIX-187: Admin allocation dashboard
import { supplierAllocationsRouter } from "./supplier/allocations";  // V3-FIX-187: Supplier allocation mgmt

export const v1Router = Router();

// AUD-076-A: Microservice health endpoints (must be before service-specific routers)
v1Router.use("/", microserviceHealthRouter);

// RO-009: Config status (public, no auth, returns booleans only)
v1Router.use("/", configStatusRouter);

// REQ.FEATURE.SUPERADMIN.WHATSAPP_CTA_LIVE_CONFIG.001: Public CTA config (no auth, safe display data only)
v1Router.use("/public", publicConfigRouter);

// GCP-STG-0084 FIX: Set RLS store context on all POS routes (from posDevice.storeId)
import { setRlsStoreContext, setRlsAdminContext } from "../../middleware/rlsContext";
v1Router.use("/pos", setRlsStoreContext);
v1Router.use("/pos", posEventsRouter);
v1Router.use("/pos", posScanRouter);
v1Router.use("/pos", posSalesRouter);
v1Router.use("/pos", posPurchasesRouter);
v1Router.use("/pos", posStoreRouter);
v1Router.use("/pos", posSyncRouter);
v1Router.use("/pos", posEnrollRouter);
v1Router.use("/pos", posDevicesRouter);
v1Router.use("/pos", posUiStatusRouter);
v1Router.use("/pos", posInventoryRouter);
v1Router.use("/pos", posStoreProductsRouter);
v1Router.use("/pos", posSuppliersRouter);
v1Router.use("/pos", posStockInRouter);
v1Router.use("/pos", posPaymentsRouter);  // SM-010: SELL UPI + Cash + DUE payments
v1Router.use("/pos", posRefundsRouter);  // T-150: Payment refund flow
v1Router.use("/pos", posBnplRouter);  // SM-019: BNPL drawdowns
v1Router.use("/pos", posComplianceRouter);  // T-190: KYC document upload
v1Router.use("/pos", posCreditRouter);  // SM-021: Credit offers
v1Router.use("/pos", posDuesRouter);  // POS-DUE-001: Customer dues management
v1Router.use("/pos", posOpeningStockRouter);  // T-198: Opening stock entry
v1Router.use("/pos", posReportsRouter);  // T-199: Daily sales report
v1Router.use("/pos", posOverduePaymentsRouter);  // T-193: Overdue DUE payments
v1Router.use("/pos", tokenManagementRouter);  // GL-WF-045-A: Token security endpoints
v1Router.use("/pos", posStaffRouter);  // SA-P1-001: POS staff login
v1Router.use("/pos", posStaffManageRouter);  // V3-POS-024: Owner staff management
v1Router.use("/pos", posShiftsRouter);  // POS-SHIFT-001: Staff shift management
v1Router.use("/pos", posDailyClosingRouter);  // POS-DAILY-001: Daily closing reconciliation
v1Router.use("/pos", posKhataRouter);  // POS-KHATA-001: Khata credit ledger
v1Router.use("/pos", posCustomersRouter);  // POS-CUST-001: Customer profiles
v1Router.use("/pos", posChatRouter);  // STG-152: POS chat proxy with device token auth
v1Router.use("/pos", posSyncEventsRouter);  // T-173: SSE real-time sync
v1Router.use("/pos", posNotificationsRouter);  // Phase 8: FCM push notifications + device token CRUD
v1Router.use("/pos", posRefundRequestsRouter);  // T-219: UPI refund request management
v1Router.use("/pos", posWhatsAppRouter);  // WA-001: WhatsApp Cloud API bill sharing
v1Router.use("/pos", posExpiryAlertsRouter);  // SCALE-C2: Expiry alerts
// V3: OTP auth (no device token required — this IS the auth)
v1Router.use("/pos", posOtpAuthRouter);
// V3-016: Wholesale B2B routes
v1Router.use("/pos", posWholesaleRouter);
v1Router.use("/pos", posLastPurchaseRouter);
v1Router.use("/pos", posMasterCatalogRouter);
v1Router.use("/pos", posSalesVelocityRouter);
v1Router.use("/pos", posDemandSignalsRouter);  // V3-HARDEN-185: POS demand signals
v1Router.use("/pos", posBuyAgainRouter);  // V3-FIX-186: Buy-again / repeat-last-order
v1Router.use("/pos", posLifecycleEventsRouter);  // V3-HARDEN-188: Lifecycle events
v1Router.use("/pos/translations", posTranslationsRouter);
v1Router.use("/", consentRouter);  // STG-485: DPDP consent API (available to POS + portals)
v1Router.use("/reorder", reorderRouter);
v1Router.use("/orders", ordersRouter);
v1Router.use("/catalog", catalogRouter);  // AUD-GOLIVE-003: Store catalog endpoints
v1Router.use("/admin", adminHealthRouter);  // MED-011: Public health check (no auth)
v1Router.use("/admin", adminAuthRouter);  // GO-LIVE-LOGIN-004: Admin email OTP auth (no auth required)
// ISSUE-MICRO-082: General rate limiter for admin API endpoints
// 200 requests per 15 minutes per IP — high enough for normal use, catches abuse
// DEPLOY-OPS: Respect RATE_LIMIT_MULTIPLIER for local-prod/staging (production default=1)
const adminRateLimitMultiplier = Math.max(1, parseInt(process.env.RATE_LIMIT_MULTIPLIER || "1", 10));
// SA-P2-011: Redis-backed rate limiting
v1Router.use("/admin", redisRateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200 * adminRateLimitMultiplier,
}));
// GL-CRIT-0049: Apply audit middleware to all admin mutation routes
v1Router.use("/admin", adminAuditMiddleware());
// GCP-STG-0084 FIX: Set ADMIN_BYPASS RLS context so admin queries see all rows
v1Router.use("/admin", setRlsAdminContext);
v1Router.use("/admin", adminPosEventsRouter);
v1Router.use("/admin", adminAiRouter);
v1Router.use("/admin", adminStoresRouter);
v1Router.use("/admin", adminDevicesRouter);
v1Router.use("/admin", adminDeviceEnrollmentRouter);
v1Router.use("/admin", adminAnalyticsRouter);
v1Router.use("/admin", adminBarcodeSheetsRouter);
v1Router.use("/admin", adminGlobalProductsRouter);
v1Router.use("/admin", adminSuppliersRouter);
v1Router.use("/admin", adminUsersRouter);
v1Router.use("/admin", adminSettingsRouter);
v1Router.use("/admin", adminAuditRouter);  // GL-CRIT-0049: Audit log fetch endpoint
v1Router.use("/admin", adminGstCreditsRouter);  // GO-LIVE-097: GST input credits
v1Router.use("/admin/documents", adminDocumentsRouter);  // DOCS-001: Admin document management
v1Router.use("/admin", adminRegistrationEventsRouter);  // RO-007: Registration events visibility
v1Router.use("/admin", adminStaffRouter);  // SA-P1-001: Store staff CRUD
v1Router.use("/admin", adminGrnAlertsRouter);  // SA-P1-004: GRN excess alerts
v1Router.use("/admin", adminFeatureFlagsRouter);  // SA-P0-005: Feature flag CRUD
v1Router.use("/admin", adminApplicationsRouter);  // STAGING-FIX-014: Application approval
v1Router.use("/admin", adminInvoicesRouter);  // T-071: Buy-resell invoicing
v1Router.use("/admin", adminCreditRouter);  // CL-020: SuperAdmin credit approval
v1Router.use("/admin", adminGstComplianceRouter);  // T-235: GST compliance + GSTR-1 export
v1Router.use("/admin", adminComplianceRouter);  // SA-P2-004: Compliance status aggregation
v1Router.use("/admin", adminCatalogRouter);  // SA-P2-006: Product category override
v1Router.use("/admin", adminScheduledJobsRouter);  // T-231/T-223: Payment reminders + monitoring
v1Router.use("/admin", adminRefundsRouter);  // T-219: Admin refund management
v1Router.use("/admin", adminWhatsAppRouter);  // WA-001: SuperAdmin WhatsApp Cloud API
v1Router.use("/admin", adminReorderPoliciesRouter);  // SA-P1-015: Reorder policy supervision
v1Router.use("/admin", adminImportsRouter);  // SA-P2-008: Bulk import notification
v1Router.use("/admin", adminPriceBoundsRouter);  // SA-P0-003: Price bounds
v1Router.use("/admin", adminAnomalyAlertsRouter);  // SA-P1-010: Anomaly detection alerts
v1Router.use("/admin", adminDemandSignalsRouter);  // V3-HARDEN-185: Cross-store demand pressure
v1Router.use("/admin", adminAllocationsRouter);  // V3-FIX-187: Allocation dashboard
v1Router.use("/admin/quality", qualityDashboardRouter);  // T-223: Quality dashboard API
v1Router.use("/admin/credit-providers", adminCreditProvidersRouter);  // T-281/T-289/T-290: Provider health + management
v1Router.use("/admin", adminMaintenanceRouter);  // SA-P0-007: System maintenance mode

// DOCS-001: Document storage routes (public upload, auth required for download)
v1Router.use("/documents", documentsRouter);

// PORTAL-AUTH-001: Unified auth routes (public, no auth required)
v1Router.use("/auth", authRouter);

// RO-001: Canonical retailer registration (public, no auth required)
// RO-005: Cross-surface login linking (/retailer/me)
// Must be BEFORE validateGatewayHeaders middleware
v1Router.use("/retailer", retailerRegisterRouter);
v1Router.use("/retailer", retailerMeRouter);

// REG-AUTH-201: Retailer registration routes (legacy, public, no auth required)
// Must be BEFORE validateGatewayHeaders middleware
v1Router.use("/retailer-admin/registration", retailerRegistrationRouter);

// RET-AUD-019: Alias registration route at /registration for backward compatibility
// Maps /api/v1/registration/* -> same retailerRegistrationRouter
v1Router.use("/registration", retailerRegistrationRouter);

// GO-LIVE-046: Apply gateway header validation to retailer-admin routes
// GO-LIVE-047: Apply store ownership verification to retailer-admin routes
// RCAT-FIX-001: Add verifyStoreExists + requireActiveStore to block suspended stores
// RCAT-FIX-002: Add requireActiveUser to block deactivated/suspended users
v1Router.use("/retailer-admin", validateGatewayHeaders);
v1Router.use("/retailer-admin", requireStoreOwnership);
v1Router.use("/retailer-admin", verifyStoreExists);
v1Router.use("/retailer-admin", requireActiveStore);
v1Router.use("/retailer-admin", requireActiveUser);
v1Router.use("/retailer-admin", retailerAdminInventoryRouter);
v1Router.use("/retailer-admin", retailerAdminSuppliersRouter);
v1Router.use("/retailer-admin", retailerAdminProductsRouter);
v1Router.use("/retailer-admin", retailerAdminCsvImportRouter);
v1Router.use("/retailer-admin", retailerAdminSearchRouter);
v1Router.use("/retailer-admin", retailerComplianceRouter);
v1Router.use("/retailer-admin", retailerAdminAuthRouter);
v1Router.use("/retailer-admin", retailerAdminSettingsRouter);  // GL-AUD-004: Store settings
v1Router.use("/retailer-admin", retailerAdminDevicesRouter);  // RET-WEB-002: Device activation
v1Router.use("/retailer-admin", retailerAdminStaffRouter);  // V3-API-019: Owner staff CRUD
v1Router.use("/retailer-admin", retailerAdminVariantsRouter);  // T-057: Retail variant CRUD
v1Router.use("/retailer-admin", retailerInvoicesRouter);  // T-073: Retailer invoice views
v1Router.use("/retailer-admin", retailerReorderRouter);  // CL-017: Retailer reorder
v1Router.use("/retailer-admin", retailerBnplRouter);  // CL-019: Retailer BNPL view
v1Router.use("/retailer-admin", retailerAdminCustomersRouter);  // T-218: Customer CRM
v1Router.use("/retailer-admin", retailerNotificationsRouter);  // Phase 8: In-app notification center
v1Router.use("/retailer-admin", retailerReconciliationRouter);  // T-260: Payment reconciliation
v1Router.use("/retailer-admin", retailerCreditDashboardRouter);  // T-277: Credit dashboard
v1Router.use("/retailer-admin", retailerPurchaseOrdersRouter);  // T-180: Purchase order visibility
v1Router.use("/retailer-admin", retailerDemandSignalsRouter);  // V3-HARDEN-185: Retailer demand signals
v1Router.use("/credit", creditProvidersRouter);  // T-263/T-274/T-275/T-276/T-278: Credit provider APIs
v1Router.use("/demo", demoRouter);
v1Router.use("/webhooks", webhooksRouter);  // SM-018: Razorpay payout webhooks
v1Router.use("/webhooks", refundWebhookRouter);  // T-219: Razorpay refund status webhooks
v1Router.use("/webhooks", whatsappWebhookRouter);  // WA-001: WhatsApp delivery status webhooks
v1Router.use("/supplier", supplierRouter);  // SM-005, SM-006, SM-007: Supplier portal APIs
v1Router.use("/supplier", supplierAllocationsRouter);  // V3-FIX-187: Supplier allocation management
v1Router.use("/supplier/bnpl", supplierBnplRouter);  // T-280: Supplier BNPL visibility
v1Router.use("/chat", chatRouter);  // T-291→T-302: In-app messaging, support, templates
v1Router.use("/", aiIntelligenceRouter);  // T-303→T-316: AI Intelligence (POS + admin endpoints)
v1Router.use("/uploads", uploadsRouter);  // T-160: Image upload endpoint
v1Router.use("/voice", voiceRouter);  // GO-LIVE: Voice order with OpenAI
