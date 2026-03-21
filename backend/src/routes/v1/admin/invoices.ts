// T-071, T-072: Invoice Routes
// Admin endpoints for managing invoices (buy-resell + platform-fee)

import { Router } from "express";
import { getPool } from "../../../db/client";
import { requireAdminToken, requirePermission } from "../../../middleware/adminToken";
import {
  createInvoice,
  issueInvoice,
  recordInvoicePayment,
  getInvoice,
  listInvoices,
  getCurrentFiscalYear,
  type CreateInvoiceInput,
  type InvoiceItemInput,
} from "../../../services/invoiceService";
import { generateInvoicePdf } from "../../../services/invoicePdfService";
import { generateIrn, cancelIrn, generateQrCodeBuffer, getEInvoiceConfig } from "../../../services/eInvoiceService";
import { log } from "../../../lib/logger";

export const adminInvoicesRouter = Router();

// GAP-5: SuperMandi entity details for invoices — populated from env vars
const SUPERMANDI_ENTITY = {
  name: process.env.SUPERMANDI_ENTITY_NAME || "SUPERMANDI TECH PRIVATE LIMITED",
  gstin: process.env.SUPERMANDI_GSTIN || "08ABRCS8282R1ZY",
  address: process.env.SUPERMANDI_ADDRESS || "166/1, Bhandu Khurd, Jodhpur, Rajasthan - 342014",
  state: process.env.SUPERMANDI_STATE || "Rajasthan",
};

// =============================================================================
// T-071: Buy-Resell Invoice Generation
// =============================================================================

/**
 * POST /api/v1/admin/invoices/purchase
 * T-071: Generate a purchase invoice (Supplier → SuperMandi)
 * Used when SuperMandi buys products from a supplier
 */
adminInvoicesRouter.post("/invoices/purchase", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const {
    supplierId,
    items,
    purchaseOrderNumber,
    referenceNote,
    dueDate,
  } = req.body || {};
  const adminId = (req as any).adminId;

  if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required and must not be empty" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Get supplier details
    const supplierResult = await pool.query(
      `SELECT id, business_name, gstin, city, state,
              COALESCE(address_line1, '') || ' ' || COALESCE(city, '') || ' ' || COALESCE(state, '') as full_address
       FROM supplier.suppliers WHERE id = $1::uuid`,
      [supplierId]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    const supplier = supplierResult.rows[0];

    // Resolve product details for each item
    const invoiceItems: InvoiceItemInput[] = [];
    for (const item of items) {
      const productResult = await pool.query(
        `SELECT id, name, supplier_sku, hsn_code, gst_rate, purchase_price, unit
         FROM catalog.supplier_products
         WHERE id = $1::uuid AND supplier_id = $2::uuid`,
        [item.productId, supplierId]
      );

      if (productResult.rows.length === 0) {
        return res.status(400).json({ error: `Product ${item.productId} not found for this supplier` });
      }
      const product = productResult.rows[0];

      invoiceItems.push({
        productId: product.id,
        supplierProductId: product.id,
        productName: product.name,
        productSku: product.supplier_sku,
        hsnCode: product.hsn_code || item.hsnCode,
        quantity: item.quantity,
        unit: product.unit || "PCS",
        unitPriceMinor: item.unitPriceMinor || product.purchase_price,
        discountMinor: item.discountMinor || 0,
        gstRate: item.gstRate ?? product.gst_rate ?? 0,
      });
    }

    const invoiceInput: CreateInvoiceInput = {
      invoiceModel: "buy_resell",
      invoiceType: "purchase",
      seller: {
        type: "supplier",
        id: supplier.id,
        name: supplier.business_name,
        gstin: supplier.gstin,
        address: supplier.full_address,
      },
      buyer: {
        type: "supermandi",
        name: SUPERMANDI_ENTITY.name,
        gstin: SUPERMANDI_ENTITY.gstin || undefined,
        address: SUPERMANDI_ENTITY.address || undefined,
        state: SUPERMANDI_ENTITY.state || undefined,
      },
      items: invoiceItems,
      dueDate,
      purchaseOrderNumber,
      referenceNote,
      createdBy: adminId,
    };

    const invoice = await createInvoice(pool, invoiceInput);

    return res.status(201).json({
      success: true,
      data: invoice,
    });
  } catch (err: any) {
    log.error("[admin/invoices/purchase] Error:", err);
    return res.status(500).json({ error: "Failed to create purchase invoice" });
  }
});

/**
 * POST /api/v1/admin/invoices/sale
 * T-071: Generate a sale invoice (SuperMandi → Retailer Store)
 * Used when SuperMandi resells products to a retailer
 */
adminInvoicesRouter.post("/invoices/sale", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const {
    storeId,
    items,
    referenceNote,
    dueDate,
  } = req.body || {};
  const adminId = (req as any).adminId;

  if (!storeId) return res.status(400).json({ error: "storeId is required" });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required and must not be empty" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Get store details
    const storeResult = await pool.query(
      `SELECT id, name, gstin,
              COALESCE(address, '') || ' ' || COALESCE(city, '') || ' ' || COALESCE(state, '') as full_address
       FROM platform.stores WHERE id = $1::uuid`,
      [storeId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: "Store not found" });
    }
    const store = storeResult.rows[0];

    // Resolve product details
    const invoiceItems: InvoiceItemInput[] = [];
    for (const item of items) {
      // Look up from store_products to get the sell price
      const spResult = await pool.query(
        `SELECT sp.id, sp.product_id, sp.display_name, sp.sell_price, sp.purchase_price,
                p.primary_barcode, spr.hsn_code, spr.gst_rate, spr.unit
         FROM catalog.store_products sp
         JOIN catalog.products p ON p.id = sp.product_id
         LEFT JOIN catalog.supplier_product_map spm ON spm.product_id = sp.product_id
         LEFT JOIN catalog.supplier_products spr ON spr.id = spm.supplier_product_id
         WHERE sp.store_id = $1 AND sp.product_id = $2::uuid
         LIMIT 1`,
        [storeId, item.productId]
      );

      if (spResult.rows.length === 0) {
        return res.status(400).json({ error: `Product ${item.productId} not in store catalog` });
      }
      const product = spResult.rows[0];

      invoiceItems.push({
        productId: product.product_id,
        productName: product.display_name,
        hsnCode: product.hsn_code || item.hsnCode,
        quantity: item.quantity,
        unit: product.unit || "PCS",
        unitPriceMinor: item.unitPriceMinor || product.sell_price,
        discountMinor: item.discountMinor || 0,
        gstRate: item.gstRate ?? product.gst_rate ?? 0,
      });
    }

    const invoiceInput: CreateInvoiceInput = {
      invoiceModel: "buy_resell",
      invoiceType: "sale",
      seller: {
        type: "supermandi",
        name: SUPERMANDI_ENTITY.name,
        gstin: SUPERMANDI_ENTITY.gstin || undefined,
        address: SUPERMANDI_ENTITY.address || undefined,
        state: SUPERMANDI_ENTITY.state || undefined,
      },
      buyer: {
        type: "store",
        id: store.id,
        name: store.name,
        gstin: store.gstin,
        address: store.full_address,
      },
      items: invoiceItems,
      dueDate,
      referenceNote,
      createdBy: adminId,
    };

    const invoice = await createInvoice(pool, invoiceInput);

    return res.status(201).json({
      success: true,
      data: invoice,
    });
  } catch (err: any) {
    log.error("[admin/invoices/sale] Error:", err);
    return res.status(500).json({ error: "Failed to create sale invoice" });
  }
});

// =============================================================================
// T-072: Platform Fee Invoice Generation
// =============================================================================

/**
 * POST /api/v1/admin/invoices/commission
 * T-072: Generate a commission/platform-fee invoice (SuperMandi → Supplier)
 * Used when supplier sells directly to retailer and SuperMandi charges a fee
 * The commission invoice is issued BY SuperMandi TO the supplier
 */
adminInvoicesRouter.post("/invoices/commission", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const {
    supplierId,
    storeId,
    items,
    platformFeePercent,
    referenceNote,
    dueDate,
    orderId,
  } = req.body || {};
  const adminId = (req as any).adminId;

  if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required and must not be empty" });
  }
  if (!platformFeePercent || platformFeePercent <= 0 || platformFeePercent > 100) {
    return res.status(400).json({ error: "platformFeePercent must be between 0 and 100" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Get supplier details
    const supplierResult = await pool.query(
      `SELECT id, business_name, gstin, city, state,
              COALESCE(address_line1, '') || ' ' || COALESCE(city, '') || ' ' || COALESCE(state, '') as full_address
       FROM supplier.suppliers WHERE id = $1::uuid`,
      [supplierId]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    const supplier = supplierResult.rows[0];

    // Get store details if provided (for reference)
    let storeName: string | undefined;
    if (storeId) {
      const storeResult = await pool.query(
        `SELECT name FROM platform.stores WHERE id = $1::uuid`,
        [storeId]
      );
      if (storeResult.rows.length > 0) {
        storeName = storeResult.rows[0].name;
      }
    }

    // Resolve product details — these are the items the supplier sold
    const invoiceItems: InvoiceItemInput[] = [];
    for (const item of items) {
      const productResult = await pool.query(
        `SELECT id, name, supplier_sku, hsn_code, gst_rate, purchase_price, unit
         FROM catalog.supplier_products
         WHERE id = $1::uuid AND supplier_id = $2::uuid`,
        [item.productId, supplierId]
      );

      if (productResult.rows.length === 0) {
        return res.status(400).json({ error: `Product ${item.productId} not found for this supplier` });
      }
      const product = productResult.rows[0];

      invoiceItems.push({
        productId: product.id,
        supplierProductId: product.id,
        productName: product.name,
        productSku: product.supplier_sku,
        hsnCode: product.hsn_code || item.hsnCode,
        quantity: item.quantity,
        unit: product.unit || "PCS",
        unitPriceMinor: item.unitPriceMinor || product.purchase_price,
        discountMinor: item.discountMinor || 0,
        gstRate: item.gstRate ?? product.gst_rate ?? 0,
      });
    }

    // Commission invoice: SuperMandi (seller of service) charges the supplier (buyer of service)
    const invoiceInput: CreateInvoiceInput = {
      invoiceModel: "platform_fee",
      invoiceType: "commission",
      seller: {
        type: "supermandi",
        name: SUPERMANDI_ENTITY.name,
        gstin: SUPERMANDI_ENTITY.gstin || undefined,
        address: SUPERMANDI_ENTITY.address || undefined,
        state: SUPERMANDI_ENTITY.state || undefined,
      },
      buyer: {
        type: "supplier",
        id: supplier.id,
        name: supplier.business_name,
        gstin: supplier.gstin,
        address: supplier.full_address,
      },
      items: invoiceItems,
      platformFeePercent,
      dueDate,
      orderId,
      referenceNote: referenceNote || (storeName ? `Commission on sales to ${storeName}` : undefined),
      createdBy: adminId,
    };

    const invoice = await createInvoice(pool, invoiceInput);

    return res.status(201).json({
      success: true,
      data: invoice,
    });
  } catch (err: any) {
    log.error("[admin/invoices/commission] Error:", err);
    return res.status(500).json({ error: "Failed to create commission invoice" });
  }
});

/**
 * POST /api/v1/admin/invoices/supplier-sale
 * T-072: Generate a supplier direct-sale invoice (Supplier → Retailer Store)
 * Used in platform-fee model: supplier sells directly to retailer
 * Invoice issued by the supplier, SuperMandi records it for tracking
 */
adminInvoicesRouter.post("/invoices/supplier-sale", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const {
    supplierId,
    storeId,
    items,
    referenceNote,
    dueDate,
    orderId,
  } = req.body || {};
  const adminId = (req as any).adminId;

  if (!supplierId) return res.status(400).json({ error: "supplierId is required" });
  if (!storeId) return res.status(400).json({ error: "storeId is required" });
  if (!items || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "items array is required and must not be empty" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    // Get supplier details
    const supplierResult = await pool.query(
      `SELECT id, business_name, gstin, city, state,
              COALESCE(address_line1, '') || ' ' || COALESCE(city, '') || ' ' || COALESCE(state, '') as full_address
       FROM supplier.suppliers WHERE id = $1::uuid`,
      [supplierId]
    );

    if (supplierResult.rows.length === 0) {
      return res.status(404).json({ error: "Supplier not found" });
    }
    const supplier = supplierResult.rows[0];

    // Get store details
    const storeResult = await pool.query(
      `SELECT id, name, gstin,
              COALESCE(address, '') || ' ' || COALESCE(city, '') || ' ' || COALESCE(state, '') as full_address
       FROM platform.stores WHERE id = $1::uuid`,
      [storeId]
    );

    if (storeResult.rows.length === 0) {
      return res.status(404).json({ error: "Store not found" });
    }
    const store = storeResult.rows[0];

    // Resolve product details
    const invoiceItems: InvoiceItemInput[] = [];
    for (const item of items) {
      const productResult = await pool.query(
        `SELECT id, name, supplier_sku, hsn_code, gst_rate, purchase_price, unit
         FROM catalog.supplier_products
         WHERE id = $1::uuid AND supplier_id = $2::uuid`,
        [item.productId, supplierId]
      );

      if (productResult.rows.length === 0) {
        return res.status(400).json({ error: `Product ${item.productId} not found for this supplier` });
      }
      const product = productResult.rows[0];

      invoiceItems.push({
        productId: product.id,
        supplierProductId: product.id,
        productName: product.name,
        productSku: product.supplier_sku,
        hsnCode: product.hsn_code || item.hsnCode,
        quantity: item.quantity,
        unit: product.unit || "PCS",
        unitPriceMinor: item.unitPriceMinor || product.purchase_price,
        discountMinor: item.discountMinor || 0,
        gstRate: item.gstRate ?? product.gst_rate ?? 0,
      });
    }

    // Supplier direct-sale: Supplier (seller) → Retailer Store (buyer)
    const invoiceInput: CreateInvoiceInput = {
      invoiceModel: "platform_fee",
      invoiceType: "sale",
      seller: {
        type: "supplier",
        id: supplier.id,
        name: supplier.business_name,
        gstin: supplier.gstin,
        address: supplier.full_address,
      },
      buyer: {
        type: "store",
        id: store.id,
        name: store.name,
        gstin: store.gstin,
        address: store.full_address,
      },
      items: invoiceItems,
      dueDate,
      orderId,
      referenceNote,
      createdBy: adminId,
    };

    const invoice = await createInvoice(pool, invoiceInput);

    return res.status(201).json({
      success: true,
      data: invoice,
    });
  } catch (err: any) {
    log.error("[admin/invoices/supplier-sale] Error:", err);
    return res.status(500).json({ error: "Failed to create supplier sale invoice" });
  }
});

// =============================================================================
// Invoice Management (shared across models)
// =============================================================================

/**
 * GET /api/v1/admin/invoices
 * List invoices with filters
 */
adminInvoicesRouter.get("/invoices", requireAdminToken, requirePermission("products", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await listInvoices(pool, {
      sellerType: req.query.sellerType as string,
      sellerId: req.query.sellerId as string,
      buyerType: req.query.buyerType as string,
      buyerId: req.query.buyerId as string,
      invoiceModel: req.query.invoiceModel as string,
      invoiceType: req.query.invoiceType as string,
      status: req.query.status as string,
      fiscalYear: req.query.fiscalYear as string || getCurrentFiscalYear(),
      limit: parseInt(req.query.limit as string) || 50,
      offset: parseInt(req.query.offset as string) || 0,
    });

    return res.json({ success: true, ...result });
  } catch (err: any) {
    log.error("[admin/invoices] Error:", err);
    if (err.code === "42P01") {
      return res.json({ success: true, data: [], total: 0 });
    }
    return res.status(500).json({ error: "Failed to list invoices" });
  }
});

/**
 * GET /api/v1/admin/invoices/:invoiceId
 * Get invoice details with items and payments
 */
adminInvoicesRouter.get("/invoices/:invoiceId", requireAdminToken, requirePermission("products", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const invoice = await getInvoice(pool, req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }
    return res.json({ success: true, data: invoice });
  } catch (err: any) {
    log.error("[admin/invoices/:id] Error:", err);
    return res.status(500).json({ error: "Failed to get invoice" });
  }
});

/**
 * POST /api/v1/admin/invoices/:invoiceId/issue
 * Issue a draft invoice (draft → issued)
 */
adminInvoicesRouter.post("/invoices/:invoiceId/issue", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    await issueInvoice(pool, req.params.invoiceId);
    return res.json({ success: true, message: "Invoice issued" });
  } catch (err: any) {
    log.error("[admin/invoices/issue] Error:", err);
    return res.status(400).json({ error: err.message || "Failed to issue invoice" });
  }
});

/**
 * POST /api/v1/admin/invoices/:invoiceId/payment
 * Record a payment against an invoice
 */
adminInvoicesRouter.post("/invoices/:invoiceId/payment", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const { amountMinor, paymentMode, paymentReference } = req.body || {};
  const adminId = (req as any).adminId;

  if (!amountMinor || amountMinor <= 0) {
    return res.status(400).json({ error: "amountMinor must be a positive number" });
  }
  if (!paymentMode) {
    return res.status(400).json({ error: "paymentMode is required" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    await recordInvoicePayment(pool, req.params.invoiceId, amountMinor, paymentMode, paymentReference, adminId);
    return res.json({ success: true, message: "Payment recorded" });
  } catch (err: any) {
    log.error("[admin/invoices/payment] Error:", err);
    return res.status(400).json({ error: err.message || "Failed to record payment" });
  }
});

/**
 * POST /api/v1/admin/invoices/:invoiceId/cancel
 * Cancel an invoice
 */
adminInvoicesRouter.post("/invoices/:invoiceId/cancel", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const { reason } = req.body || {};

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const result = await pool.query(
      `UPDATE invoicing.invoices
       SET status = 'cancelled', cancelled_at = NOW(),
           cancellation_reason = $2, updated_at = NOW()
       WHERE id = $1::uuid AND status IN ('draft', 'issued')
       RETURNING id`,
      [req.params.invoiceId, reason || null]
    );

    if (result.rowCount === 0) {
      return res.status(400).json({ error: "Invoice not found or cannot be cancelled" });
    }

    return res.json({ success: true, message: "Invoice cancelled" });
  } catch (err: any) {
    log.error("[admin/invoices/cancel] Error:", err);
    return res.status(500).json({ error: "Failed to cancel invoice" });
  }
});

// =============================================================================
// T-073: Invoice PDF Download
// =============================================================================

/**
 * GET /api/v1/admin/invoices/:invoiceId/pdf
 * T-073: Download invoice as PDF
 */
adminInvoicesRouter.get("/invoices/:invoiceId/pdf", requireAdminToken, requirePermission("products", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    const invoice = await getInvoice(pool, req.params.invoiceId);
    if (!invoice) {
      return res.status(404).json({ error: "Invoice not found" });
    }

    // GCP-STG-0078: Generate QR code buffer if signed QR string exists
    let qrCodeBuffer: Buffer | undefined;
    if (invoice.signedQrString) {
      const buf = await generateQrCodeBuffer(invoice.signedQrString);
      if (buf) qrCodeBuffer = buf;
    }

    const pdfDoc = generateInvoicePdf({
      ...invoice,
      irn: invoice.irn,
      ackNumber: invoice.ackNumber,
      ackDate: invoice.ackDate,
      qrCodeBuffer,
    });

    // LIVE.BE.DOCUMENTS.CONTENT_DISPOSITION_SANITIZATION.001: Strip path traversal + special chars
    const filename = `${invoice.invoiceNumber.replace(/[/\\<>"'\r\n\t]/g, "-")}.pdf`;
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    pdfDoc.pipe(res);
  } catch (err: any) {
    log.error("[admin/invoices/pdf] Error:", err);
    return res.status(500).json({ error: "Failed to generate invoice PDF" });
  }
});

// =============================================================================
// GCP-STG-0078: E-Invoice Management
// =============================================================================

/**
 * POST /api/v1/admin/invoices/:invoiceId/generate-irn
 * Manually trigger IRN generation for an issued invoice
 */
adminInvoicesRouter.post("/invoices/:invoiceId/generate-irn", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const config = getEInvoiceConfig();
  if (!config.enabled) {
    return res.status(400).json({ error: "E-invoicing is not enabled. Set EINVOICE_ENABLED=true" });
  }

  try {
    const result = await generateIrn(pool, req.params.invoiceId);
    if (!result) {
      return res.status(400).json({ error: "E-invoice not applicable or already generated" });
    }
    return res.json({ success: true, data: result });
  } catch (err: any) {
    log.error("[admin/invoices/generate-irn] Error:", err);
    return res.status(500).json({ error: err.message || "Failed to generate IRN" });
  }
});

/**
 * POST /api/v1/admin/invoices/:invoiceId/cancel-irn
 * Cancel an IRN within 24-hour window
 */
adminInvoicesRouter.post("/invoices/:invoiceId/cancel-irn", requireAdminToken, requirePermission("products", "approve"), async (req, res) => {
  const { reason } = req.body || {};

  if (!reason || typeof reason !== "string" || reason.trim().length < 5) {
    return res.status(400).json({ error: "Cancellation reason is required (min 5 characters)" });
  }

  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  try {
    await cancelIrn(pool, req.params.invoiceId, reason.trim());
    return res.json({ success: true, message: "IRN cancelled" });
  } catch (err: any) {
    log.error("[admin/invoices/cancel-irn] Error:", err);
    return res.status(400).json({ error: err.message || "Failed to cancel IRN" });
  }
});

/**
 * GET /api/v1/admin/invoices/einvoice-status
 * Get e-invoice configuration status and pending invoices
 */
adminInvoicesRouter.get("/invoices/einvoice-status", requireAdminToken, requirePermission("products", "read"), async (req, res) => {
  const pool = getPool();
  if (!pool) return res.status(503).json({ error: "database unavailable" });

  const config = getEInvoiceConfig();

  try {
    const pendingResult = await pool.query(
      `SELECT COUNT(*)::int as count FROM invoicing.invoices WHERE irn_status IN ('pending', 'failed')`
    );
    const generatedResult = await pool.query(
      `SELECT COUNT(*)::int as count FROM invoicing.invoices WHERE irn_status = 'generated'`
    );

    return res.json({
      success: true,
      data: {
        enabled: config.enabled,
        sandbox: config.sandbox,
        gstin: config.gstin,
        pendingCount: pendingResult.rows[0]?.count || 0,
        generatedCount: generatedResult.rows[0]?.count || 0,
      },
    });
  } catch (err: any) {
    log.error("[admin/invoices/einvoice-status] Error:", err);
    // Graceful fallback if irn_status column doesn't exist yet
    if (err.code === "42703") {
      return res.json({
        success: true,
        data: { enabled: config.enabled, sandbox: config.sandbox, gstin: config.gstin, pendingCount: 0, generatedCount: 0 },
      });
    }
    return res.status(500).json({ error: "Failed to get e-invoice status" });
  }
});
