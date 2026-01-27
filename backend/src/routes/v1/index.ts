import { Router } from "express";
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
import { retailerAdminInventoryRouter } from "./retailer-admin/inventory";
import { retailerAdminSuppliersRouter } from "./retailer-admin/suppliers";
import { retailerAdminProductsRouter } from "./retailer-admin/products";
import { retailerAdminCsvImportRouter } from "./retailer-admin/csvImport";
import { retailerAdminSearchRouter } from "./retailer-admin/search";
import { retailerComplianceRouter } from "./retailer-admin/compliance";
import { retailerAdminAuthRouter } from "./retailer-admin/auth";
import { demoRouter } from "./demo";
import { microserviceHealthRouter } from "./microserviceHealth";
import { webhooksRouter } from "./webhooks";  // SM-018: Razorpay payout webhooks

export const v1Router = Router();

// AUD-076-A: Microservice health endpoints (must be before service-specific routers)
v1Router.use("/", microserviceHealthRouter);

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
v1Router.use("/pos/translations", posTranslationsRouter);
v1Router.use("/reorder", reorderRouter);
v1Router.use("/orders", ordersRouter);
v1Router.use("/catalog", catalogRouter);  // AUD-GOLIVE-003: Store catalog endpoints
v1Router.use("/admin", adminHealthRouter);  // MED-011: Public health check (no auth)
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
v1Router.use("/retailer-admin", retailerAdminInventoryRouter);
v1Router.use("/retailer-admin", retailerAdminSuppliersRouter);
v1Router.use("/retailer-admin", retailerAdminProductsRouter);
v1Router.use("/retailer-admin", retailerAdminCsvImportRouter);
v1Router.use("/retailer-admin", retailerAdminSearchRouter);
v1Router.use("/retailer-admin", retailerComplianceRouter);
v1Router.use("/retailer-admin", retailerAdminAuthRouter);
v1Router.use("/demo", demoRouter);
v1Router.use("/webhooks", webhooksRouter);  // SM-018: Razorpay payout webhooks
