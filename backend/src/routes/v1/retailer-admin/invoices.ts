// T-073: Retailer Invoice Routes (read-only)
// Allows retailers to view invoices where their store is the buyer

import { Router, Request, Response, NextFunction } from "express";
import { getPool } from "../../../db/client";
import { getStoreId, requireStoreContext } from "../../../middleware/retailerStoreContext";
import { listInvoices, getInvoice } from "../../../services/invoiceService";
import { generateInvoicePdf } from "../../../services/invoicePdfService";

export const retailerInvoicesRouter = Router();

retailerInvoicesRouter.use(requireStoreContext);

/**
 * GET /api/v1/retailer-admin/invoices
 * List invoices where the retailer's store is the buyer
 */
retailerInvoicesRouter.get("/invoices", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } }); return; }

    const storeId = getStoreId(req);
    if (!storeId) { res.status(400).json({ error: { code: "NO_STORE", message: "Store context required" } }); return; }

    const limit = Math.min(parseInt(String(req.query.limit)) || 50, 100);
    const offset = Math.max(parseInt(String(req.query.offset)) || 0, 0);

    const result = await listInvoices(pool, {
      buyerType: "store",
      buyerId: storeId,
      invoiceModel: req.query.invoiceModel as string | undefined,
      invoiceType: req.query.invoiceType as string | undefined,
      status: req.query.status as string | undefined,
      fiscalYear: req.query.fiscalYear as string | undefined,
      limit,
      offset,
    });

    res.json({ data: result.data, total: result.total });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/retailer-admin/invoices/:invoiceId
 * Get invoice detail (only if store is the buyer)
 */
retailerInvoicesRouter.get("/invoices/:invoiceId", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } }); return; }

    const storeId = getStoreId(req);
    if (!storeId) { res.status(400).json({ error: { code: "NO_STORE", message: "Store context required" } }); return; }

    const invoice = await getInvoice(pool, req.params.invoiceId);
    if (!invoice) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Invoice not found" } }); return; }

    // Store isolation: only allow access if the store is the buyer
    if (invoice.buyerType !== "store" || invoice.buyerId !== storeId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Not authorized to view this invoice" } });
      return;
    }

    res.json({ data: invoice });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/v1/retailer-admin/invoices/:invoiceId/pdf
 * Download invoice PDF (only if store is the buyer)
 */
retailerInvoicesRouter.get("/invoices/:invoiceId/pdf", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const pool = getPool();
    if (!pool) { res.status(503).json({ error: { code: "DB_UNAVAILABLE", message: "Database unavailable" } }); return; }

    const storeId = getStoreId(req);
    if (!storeId) { res.status(400).json({ error: { code: "NO_STORE", message: "Store context required" } }); return; }

    const invoice = await getInvoice(pool, req.params.invoiceId);
    if (!invoice) { res.status(404).json({ error: { code: "NOT_FOUND", message: "Invoice not found" } }); return; }

    if (invoice.buyerType !== "store" || invoice.buyerId !== storeId) {
      res.status(403).json({ error: { code: "FORBIDDEN", message: "Not authorized" } });
      return;
    }

    const doc = generateInvoicePdf(invoice);
    const filename = `${(invoice.invoiceNumber || "invoice").replace(/\//g, "-")}.pdf`;

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
    doc.pipe(res);
  } catch (err) {
    next(err);
  }
});
