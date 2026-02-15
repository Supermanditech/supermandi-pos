// SM-005, SM-006, SM-007: Supplier Routes Index
// GL-WF-008, GL-WF-018, GL-WF-044: KYC and Payouts routes
// REG-AUTH-202: Registration-First Authentication
// Combines all supplier-related routes

import { Router } from "express";
import { supplierRegistrationRouter } from "./registration";  // REG-AUTH-202: Registration API
import { supplierAuthRouter } from "./auth";
import { supplierProfileRouter } from "./profile";
import { supplierProductsRouter } from "./products";
import { supplierOrdersRouter } from "./orders";
import { supplierDashboardRouter } from "./dashboard";
import { supplierKycRouter } from "./kyc";
import { supplierPayoutsRouter } from "./payouts";
import { supplierInvoicesRouter } from "./invoices";  // T-073: Supplier invoice views
import { supplierNotificationsRouter } from "./notifications";  // Phase 8: Supplier notifications

export const supplierRouter = Router();

// REG-AUTH-202: Registration routes (public, no auth required)
// Must be FIRST, before any other routes that might require auth
supplierRouter.use("/registration", supplierRegistrationRouter);

// Mount all supplier routes
supplierRouter.use("/", supplierAuthRouter);
supplierRouter.use("/", supplierProfileRouter);
supplierRouter.use("/", supplierProductsRouter);
supplierRouter.use("/", supplierOrdersRouter);
supplierRouter.use("/", supplierDashboardRouter);
supplierRouter.use("/kyc", supplierKycRouter);
supplierRouter.use("/payouts", supplierPayoutsRouter);
supplierRouter.use("/invoices", supplierInvoicesRouter);  // T-073: Supplier invoice views
supplierRouter.use("/", supplierNotificationsRouter);  // Phase 8: Notifications
