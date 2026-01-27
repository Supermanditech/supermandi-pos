// SM-005, SM-006, SM-007: Supplier Routes Index
// Combines all supplier-related routes

import { Router } from "express";
import { supplierAuthRouter } from "./auth";
import { supplierProfileRouter } from "./profile";
import { supplierProductsRouter } from "./products";
import { supplierOrdersRouter } from "./orders";
import { supplierDashboardRouter } from "./dashboard";

export const supplierRouter = Router();

// Mount all supplier routes
supplierRouter.use("/", supplierAuthRouter);
supplierRouter.use("/", supplierProfileRouter);
supplierRouter.use("/", supplierProductsRouter);
supplierRouter.use("/", supplierOrdersRouter);
supplierRouter.use("/", supplierDashboardRouter);
