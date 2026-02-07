import { Router } from "express";
import rateLimit from "express-rate-limit";
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
import { posBnplRouter } from "./pos/bnpl";  // SM-019: BNPL drawdowns
import { posCreditRouter } from "./pos/credit";  // SM-021: Credit offers
import { tokenManagementRouter } from "./pos/tokenManagement";  // GL-WF-045-A: Token security
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
import { requireStoreOwnership } from "../../middleware/storeOwnership";  // GO-LIVE-047: Store ownership verification
import { retailerAdminInventoryRouter } from "./retailer-admin/inventory";
import { retailerAdminSuppliersRouter } from "./retailer-admin/suppliers";
import { retailerAdminProductsRouter } from "./retailer-admin/products";
import { retailerAdminCsvImportRouter } from "./retailer-admin/csvImport";
import { retailerAdminSearchRouter } from "./retailer-admin/search";
import { retailerComplianceRouter } from "./retailer-admin/compliance";
import { retailerAdminAuthRouter } from "./retailer-admin/auth";
import { retailerAdminSettingsRouter } from "./retailer-admin/settings";  // GL-AUD-004: Store settings
import { retailerAdminDevicesRouter } from "./retailer-admin/devices";  // RET-WEB-002: Device activation
import { retailerRegistrationRouter } from "./retailer-admin/registration";  // REG-AUTH-201: Registration API
import { demoRouter } from "./demo";
import { microserviceHealthRouter } from "./microserviceHealth";
import { webhooksRouter } from "./webhooks";  // SM-018: Razorpay payout webhooks
import { supplierRouter } from "./supplier";  // SM-005, SM-006, SM-007: Supplier portal APIs
import { voiceRouter } from "./pos/voice";  // GO-LIVE: Voice order with OpenAI
import { documentsRouter } from "./documents";  // DOCS-001: Unified document storage
import { adminDocumentsRouter } from "./admin/documents";  // DOCS-001: Admin document management
import { authRouter } from "./auth";  // PORTAL-AUTH-001: Unified auth routes
import { retailerRegisterRouter } from "./retailer/register";  // RO-001: Canonical registration
import { configStatusRouter } from "./configStatus";  // RO-009: Config status endpoint

export const v1Router = Router();

// AUD-076-A: Microservice health endpoints (must be before service-specific routers)
v1Router.use("/", microserviceHealthRouter);

// RO-009: Config status (public, no auth, returns booleans only)
v1Router.use("/", configStatusRouter);

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
v1Router.use("/pos", posBnplRouter);  // SM-019: BNPL drawdowns
v1Router.use("/pos", posCreditRouter);  // SM-021: Credit offers
v1Router.use("/pos", tokenManagementRouter);  // GL-WF-045-A: Token security endpoints
v1Router.use("/pos/translations", posTranslationsRouter);
v1Router.use("/reorder", reorderRouter);
v1Router.use("/orders", ordersRouter);
v1Router.use("/catalog", catalogRouter);  // AUD-GOLIVE-003: Store catalog endpoints
v1Router.use("/admin", adminHealthRouter);  // MED-011: Public health check (no auth)
v1Router.use("/admin", adminAuthRouter);  // GO-LIVE-LOGIN-004: Admin email OTP auth (no auth required)
// ISSUE-MICRO-082: General rate limiter for admin API endpoints
// 200 requests per 15 minutes per IP — high enough for normal use, catches abuse
v1Router.use("/admin", rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: "ADMIN_RATE_LIMITED", message: "Too many admin requests. Please slow down." } },
}));
// GL-CRIT-0049: Apply audit middleware to all admin mutation routes
v1Router.use("/admin", adminAuditMiddleware());
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

// DOCS-001: Document storage routes (public upload, auth required for download)
v1Router.use("/documents", documentsRouter);

// PORTAL-AUTH-001: Unified auth routes (public, no auth required)
v1Router.use("/auth", authRouter);

// RO-001: Canonical retailer registration (public, no auth required)
// Must be BEFORE validateGatewayHeaders middleware
v1Router.use("/retailer", retailerRegisterRouter);

// REG-AUTH-201: Retailer registration routes (legacy, public, no auth required)
// Must be BEFORE validateGatewayHeaders middleware
v1Router.use("/retailer-admin/registration", retailerRegistrationRouter);

// RET-AUD-019: Alias registration route at /registration for backward compatibility
// Maps /api/v1/registration/* -> same retailerRegistrationRouter
v1Router.use("/registration", retailerRegistrationRouter);

// GO-LIVE-046: Apply gateway header validation to retailer-admin routes
// GO-LIVE-047: Apply store ownership verification to retailer-admin routes
v1Router.use("/retailer-admin", validateGatewayHeaders);
v1Router.use("/retailer-admin", requireStoreOwnership);
v1Router.use("/retailer-admin", retailerAdminInventoryRouter);
v1Router.use("/retailer-admin", retailerAdminSuppliersRouter);
v1Router.use("/retailer-admin", retailerAdminProductsRouter);
v1Router.use("/retailer-admin", retailerAdminCsvImportRouter);
v1Router.use("/retailer-admin", retailerAdminSearchRouter);
v1Router.use("/retailer-admin", retailerComplianceRouter);
v1Router.use("/retailer-admin", retailerAdminAuthRouter);
v1Router.use("/retailer-admin", retailerAdminSettingsRouter);  // GL-AUD-004: Store settings
v1Router.use("/retailer-admin", retailerAdminDevicesRouter);  // RET-WEB-002: Device activation
v1Router.use("/demo", demoRouter);
v1Router.use("/webhooks", webhooksRouter);  // SM-018: Razorpay payout webhooks
v1Router.use("/supplier", supplierRouter);  // SM-005, SM-006, SM-007: Supplier portal APIs
v1Router.use("/voice", voiceRouter);  // GO-LIVE: Voice order with OpenAI
