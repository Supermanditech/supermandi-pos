// SM-005, SM-006, SM-007: Supplier Routes Index
// GL-WF-008, GL-WF-018, GL-WF-044: KYC and Payouts routes
// Combines all supplier-related routes

import { Router } from "express";
import { supplierAuthRouter } from "./auth";
import { supplierProfileRouter } from "./profile";
import { supplierProductsRouter } from "./products";
import { supplierOrdersRouter } from "./orders";
import { supplierDashboardRouter } from "./dashboard";
import { supplierKycRouter } from "./kyc";
import { supplierPayoutsRouter } from "./payouts";

export const supplierRouter = Router();

// Mount all supplier routes
supplierRouter.use("/", supplierAuthRouter);
supplierRouter.use("/", supplierProfileRouter);
supplierRouter.use("/", supplierProductsRouter);
supplierRouter.use("/", supplierOrdersRouter);
supplierRouter.use("/", supplierDashboardRouter);
supplierRouter.use("/kyc", supplierKycRouter);
supplierRouter.use("/payouts", supplierPayoutsRouter);
