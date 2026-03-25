// T-069: Invoice Service
// Core functions for creating, managing, and querying invoices

import type { Pool, PoolClient } from "pg";
import { log } from "../lib/logger";

// =============================================================================
// Types
// =============================================================================

export type InvoiceModel = "buy_resell" | "platform_fee";
export type InvoiceType = "purchase" | "sale" | "commission" | "credit_note" | "debit_note";
export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "cancelled" | "void";

export interface InvoiceParty {
  type: "supermandi" | "supplier" | "store";
  id?: string;
  name: string;
  gstin?: string;
  address?: string;
  state?: string; // GAP-5: State for GST inter/intra-state determination
}

export interface InvoiceItemInput {
  productId?: string;
  supplierProductId?: string;
  productName: string;
  productSku?: string;
  hsnCode?: string;
  quantity: number;
  unit?: string;
  unitPriceMinor: number;
  discountMinor?: number;
  gstRate?: number;
}

export interface CreateInvoiceInput {
  invoiceModel: InvoiceModel;
  invoiceType: InvoiceType;
  seller: InvoiceParty;
  buyer: InvoiceParty;
  items: InvoiceItemInput[];
  dueDate?: string;
  orderId?: string;
  purchaseOrderNumber?: string;
  referenceNote?: string;
  platformFeePercent?: number;
  createdBy?: string;
  fiscalYear?: string;
  isInterState?: boolean; // GCP-STG-0353: explicit inter-state flag for IGST vs CGST+SGST
}

export interface Invoice {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  invoiceModel: InvoiceModel;
  invoiceType: InvoiceType;
  status: InvoiceStatus;
  sellerName: string;
  buyerName: string;
  subtotalMinor: number;
  totalTaxMinor: number;
  totalAmountMinor: number;
  amountPaidMinor: number;
  balanceDueMinor: number;
  platformFeeMinor?: number;
  createdAt: string;
}

// =============================================================================
// Invoice Number Generation
// =============================================================================

/**
 * GCP-STG-0633: Invoice Sequential Numbering Compliance Verification
 *
 * Indian GST/tax compliance requires sequential invoice numbers per entity per FY.
 * This implementation satisfies the following requirements:
 *
 * 1. SEQUENTIAL PER STORE PER FY: The `invoice_series` table maintains a counter
 *    per (entity_type, entity_id, fiscal_year). The UPSERT with ON CONFLICT atomically
 *    increments the counter — no gaps from concurrent requests.
 *
 * 2. NO GAPS ON FAILURE: The number is reserved inside the same BEGIN/COMMIT
 *    transaction as the invoice INSERT (see createInvoice). If the transaction
 *    rolls back, the counter increment also rolls back — no orphan numbers.
 *
 * 3. FY PREFIX FORMAT: Numbers follow {PREFIX}-{FISCAL_YEAR}-{SEQUENCE}
 *    e.g. SM-INV-2025-26-00001 for FY April 2025 to March 2026.
 *    Prefixes: SM-INV (sale), SM-PUR (purchase), SM-COM (commission), SM-CN (credit note).
 *
 * 4. FISCAL YEAR: Indian April-March fiscal year via getCurrentFiscalYear().
 *    Feb 2026 → "2025-26", May 2026 → "2026-27".
 *
 * Verified: 2026-03-25 by GCP-STG-0633 audit.
 */

/**
 * Generate the next invoice number for a given entity
 * Format: {PREFIX}-{FISCAL_YEAR}-{SEQUENCE}
 * Example: SM-INV-2025-26-00001
 */
export async function generateInvoiceNumber(
  client: PoolClient,
  entityType: string,
  entityId: string | null,
  prefix: string,
  fiscalYear: string
): Promise<string> {
  // Upsert the series and atomically increment
  // CL-024: Use sentinel UUID for NULL entity_id to avoid PostgreSQL NULL != NULL uniqueness issue
  const safeEntityId = entityId || '00000000-0000-0000-0000-000000000000';
  const result = await client.query(
    `INSERT INTO invoicing.invoice_series (entity_type, entity_id, prefix, current_number, fiscal_year)
     VALUES ($1, $2, $3, 1, $4)
     ON CONFLICT (entity_type, entity_id, fiscal_year)
     DO UPDATE SET current_number = invoicing.invoice_series.current_number + 1
     RETURNING current_number`,
    [entityType, safeEntityId, prefix, fiscalYear]
  );

  const seqNum = result.rows[0].current_number;
  const paddedNum = String(seqNum).padStart(5, "0");
  return `${prefix}-${fiscalYear}-${paddedNum}`;
}

/**
 * Get current fiscal year (April-March in India)
 * e.g., Feb 2026 → "2025-26"
 */
export function getCurrentFiscalYear(): string {
  const now = new Date();
  const month = now.getMonth(); // 0-indexed
  const year = now.getFullYear();

  if (month >= 3) {
    // April onwards = current year start
    return `${year}-${String(year + 1).slice(2)}`;
  } else {
    // Jan-Mar = previous year start
    return `${year - 1}-${String(year).slice(2)}`;
  }
}

// =============================================================================
// GST Calculation
// =============================================================================

export interface TaxBreakdown {
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalTaxMinor: number;
  totalMinor: number;
}

/**
 * Calculate GST for a line item
 * Intra-state: split into CGST + SGST
 * Inter-state: IGST only
 * For simplicity, we default to intra-state (same-state)
 */
export function calculateItemTax(
  taxableAmountMinor: number,
  gstRate: number,
  isInterState: boolean = false
): TaxBreakdown {
  const totalTax = Math.round(taxableAmountMinor * gstRate / 100);

  if (isInterState) {
    return {
      taxableAmountMinor,
      cgstMinor: 0,
      sgstMinor: 0,
      igstMinor: totalTax,
      totalTaxMinor: totalTax,
      totalMinor: taxableAmountMinor + totalTax,
    };
  }

  const cgst = Math.round(totalTax / 2);
  const sgst = totalTax - cgst; // Avoid rounding issues

  return {
    taxableAmountMinor,
    cgstMinor: cgst,
    sgstMinor: sgst,
    igstMinor: 0,
    totalTaxMinor: totalTax,
    totalMinor: taxableAmountMinor + totalTax,
  };
}

/**
 * GCP-STG-0353: Derive inter-state status from seller/buyer GSTIN.
 * First 2 digits of GSTIN = state code. Different codes → inter-state → IGST.
 * Same codes or either GSTIN missing → intra-state → CGST+SGST (safe default).
 */
export function deriveInterState(sellerGstin?: string, buyerGstin?: string): boolean {
  if (!sellerGstin || !buyerGstin) return false; // Missing GSTIN → default intra-state
  if (sellerGstin.length < 2 || buyerGstin.length < 2) return false;
  return sellerGstin.substring(0, 2) !== buyerGstin.substring(0, 2);
}

// =============================================================================
// Create Invoice
// =============================================================================

export async function createInvoice(
  pool: Pool,
  input: CreateInvoiceInput
): Promise<Invoice> {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    const fiscalYear = input.fiscalYear || getCurrentFiscalYear();

    // Determine prefix based on model and type
    let prefix = "SM-INV";
    if (input.invoiceType === "purchase") prefix = "SM-PUR";
    else if (input.invoiceType === "commission") prefix = "SM-COM";
    else if (input.invoiceType === "credit_note") prefix = "SM-CN";

    const invoiceNumber = await generateInvoiceNumber(
      client,
      input.seller.type,
      input.seller.id || null,
      prefix,
      fiscalYear
    );

    // Calculate line items
    let subtotal = 0;
    let totalDiscount = 0;
    let totalCgst = 0;
    let totalSgst = 0;
    let totalIgst = 0;
    let totalTax = 0;

    const processedItems: Array<InvoiceItemInput & TaxBreakdown & { sortOrder: number }> = [];

    // GCP-STG-0353: Use explicit isInterState flag, or derive from seller/buyer GSTIN
    const isInterState = input.isInterState ?? deriveInterState(input.seller.gstin, input.buyer.gstin);

    for (let i = 0; i < input.items.length; i++) {
      const item = input.items[i];
      const lineTotal = Math.round(item.quantity * item.unitPriceMinor);
      const discount = item.discountMinor || 0;
      const taxable = lineTotal - discount;
      const tax = calculateItemTax(taxable, item.gstRate || 0, isInterState);

      subtotal += lineTotal;
      totalDiscount += discount;
      totalCgst += tax.cgstMinor;
      totalSgst += tax.sgstMinor;
      totalIgst += tax.igstMinor;
      totalTax += tax.totalTaxMinor;

      processedItems.push({ ...item, ...tax, sortOrder: i });
    }

    const totalAmount = subtotal - totalDiscount + totalTax;
    const taxableAmount = subtotal - totalDiscount;

    // Calculate platform fee for Model 2
    let platformFeeMinor = 0;
    if (input.invoiceModel === "platform_fee" && input.platformFeePercent) {
      platformFeeMinor = Math.round(taxableAmount * input.platformFeePercent / 100);
    }

    // Insert invoice header
    const invoiceResult = await client.query(
      `INSERT INTO invoicing.invoices (
        invoice_number, invoice_date, due_date,
        invoice_model, invoice_type, status,
        seller_type, seller_id, seller_name, seller_gstin, seller_address,
        buyer_type, buyer_id, buyer_name, buyer_gstin, buyer_address,
        subtotal_minor, discount_minor, taxable_amount_minor,
        cgst_minor, sgst_minor, igst_minor, total_tax_minor,
        total_amount_minor, balance_due_minor,
        platform_fee_percent, platform_fee_minor,
        order_id, purchase_order_number, reference_note,
        fiscal_year, created_by
      ) VALUES (
        $1, CURRENT_DATE, $2,
        $3, $4, 'draft',
        $5, $6, $7, $8, $9,
        $10, $11, $12, $13, $14,
        $15, $16, $17,
        $18, $19, $20, $21,
        $22, $22,
        $23, $24,
        $25, $26, $27,
        $28, $29
      ) RETURNING id, invoice_number, invoice_date, status, created_at`,
      [
        invoiceNumber,
        input.dueDate || null,
        input.invoiceModel,
        input.invoiceType,
        input.seller.type,
        input.seller.id || null,
        input.seller.name,
        input.seller.gstin || null,
        input.seller.address || null,
        input.buyer.type,
        input.buyer.id || null,
        input.buyer.name,
        input.buyer.gstin || null,
        input.buyer.address || null,
        subtotal,
        totalDiscount,
        taxableAmount,
        totalCgst,
        totalSgst,
        totalIgst,
        totalTax,
        totalAmount,
        input.platformFeePercent || null,
        platformFeeMinor,
        input.orderId || null,
        input.purchaseOrderNumber || null,
        input.referenceNote || null,
        fiscalYear,
        input.createdBy || null,
      ]
    );

    const invoiceId = invoiceResult.rows[0].id;

    // Insert line items
    for (const item of processedItems) {
      await client.query(
        `INSERT INTO invoicing.invoice_items (
          invoice_id, product_id, supplier_product_id,
          product_name, product_sku, hsn_code,
          quantity, unit, unit_price_minor, discount_minor,
          taxable_amount_minor, gst_rate,
          cgst_minor, sgst_minor, igst_minor, total_minor,
          sort_order
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
        [
          invoiceId,
          item.productId || null,
          item.supplierProductId || null,
          item.productName,
          item.productSku || null,
          item.hsnCode || null,
          item.quantity,
          item.unit || "PCS",
          item.unitPriceMinor,
          item.discountMinor || 0,
          item.taxableAmountMinor,
          item.gstRate || 0,
          item.cgstMinor,
          item.sgstMinor,
          item.igstMinor,
          item.totalMinor,
          item.sortOrder,
        ]
      );
    }

    await client.query("COMMIT");

    return {
      id: invoiceId,
      invoiceNumber: invoiceResult.rows[0].invoice_number,
      invoiceDate: invoiceResult.rows[0].invoice_date,
      dueDate: input.dueDate,
      invoiceModel: input.invoiceModel,
      invoiceType: input.invoiceType,
      status: "draft",
      sellerName: input.seller.name,
      buyerName: input.buyer.name,
      subtotalMinor: subtotal,
      totalTaxMinor: totalTax,
      totalAmountMinor: totalAmount,
      amountPaidMinor: 0,
      balanceDueMinor: totalAmount,
      platformFeeMinor,
      createdAt: invoiceResult.rows[0].created_at,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// Issue Invoice (draft → issued)
// =============================================================================

export async function issueInvoice(pool: Pool, invoiceId: string): Promise<void> {
  const result = await pool.query(
    `UPDATE invoicing.invoices
     SET status = 'issued', issued_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid AND status = 'draft'
     RETURNING id, invoice_number`,
    [invoiceId]
  );

  if (result.rowCount === 0) {
    throw new Error("Invoice not found or not in draft status");
  }

  // GCP-STG-0074: Store PDF in GCS on issuance (non-blocking)
  storeInvoicePdfInGcs(pool, invoiceId, result.rows[0].invoice_number).catch((err) => {
    // Non-blocking — log but don't fail issuance
    log.error(`[GCP-STG-0074] PDF storage failed for invoice ${invoiceId}:`, err?.message);
  });

  // GCP-STG-0078: Trigger e-invoice IRN generation (non-blocking)
  triggerEInvoice(pool, invoiceId).catch((err) => {
    log.error(`[GCP-STG-0078] E-invoice generation failed for invoice ${invoiceId}:`, err?.message);
  });
}

// GCP-STG-0074: Generate PDF and store in GCS
async function storeInvoicePdfInGcs(pool: Pool, invoiceId: string, invoiceNumber: string): Promise<void> {
  try {
    const { uploadBuffer } = await import("@supermandi/common");
    const { generateInvoicePdf } = await import("./invoicePdfService");

    // Get full invoice data
    const invoice = await getInvoice(pool, invoiceId);
    if (!invoice) return;

    // Generate PDF buffer — pass flat fields from getInvoice to InvoicePdfData
    const doc = generateInvoicePdf({
      invoiceNumber: invoice.invoiceNumber,
      invoiceDate: invoice.invoiceDate,
      dueDate: invoice.dueDate,
      invoiceModel: invoice.invoiceModel,
      invoiceType: invoice.invoiceType,
      status: invoice.status || "issued",
      fiscalYear: invoice.fiscalYear,
      sellerName: invoice.sellerName,
      sellerGstin: invoice.sellerGstin,
      sellerAddress: invoice.sellerAddress,
      buyerName: invoice.buyerName,
      buyerGstin: invoice.buyerGstin,
      buyerAddress: invoice.buyerAddress,
      items: invoice.items,
      subtotalMinor: invoice.subtotalMinor,
      discountMinor: invoice.discountMinor,
      taxableAmountMinor: invoice.taxableAmountMinor,
      cgstMinor: invoice.cgstMinor,
      sgstMinor: invoice.sgstMinor,
      igstMinor: invoice.igstMinor,
      totalTaxMinor: invoice.totalTaxMinor,
      totalAmountMinor: invoice.totalAmountMinor,
      amountPaidMinor: invoice.amountPaidMinor || 0,
      balanceDueMinor: invoice.balanceDueMinor,
      platformFeeMinor: invoice.platformFeeMinor,
      payments: invoice.payments || [],
    });

    // Collect PDF into buffer
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    await new Promise<void>((resolve, reject) => {
      doc.on("end", resolve);
      doc.on("error", reject);
      doc.end();
    });
    const pdfBuffer = Buffer.concat(chunks);

    // GCP-STG-0112: Sign PDF buffer + store structured JSON alongside
    const crypto = await import("crypto");
    const signatureKey = process.env.INVOICE_SIGNING_KEY || "supermandi-invoice-signing-key-v1";
    const pdfSignature = crypto.createHmac("sha256", signatureKey).update(pdfBuffer).digest("hex");

    // GCP-STG-0112: Structured JSON for machine-readable invoice data
    const invoiceJson = JSON.stringify({
      invoiceId,
      invoiceNumber,
      pdfSignature,
      signedAt: new Date().toISOString(),
      totalAmount: invoice.totalAmount,
      invoiceModel: invoice.invoiceModel,
      invoiceType: invoice.invoiceType,
      status: invoice.status,
    });

    // Upload to GCS
    const bucket = process.env.GCS_DOCUMENTS_BUCKET || "supermandi-pos-documents";
    const sanitizedNumber = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    const gcsPath = `invoices/${sanitizedNumber}.pdf`;
    const jsonPath = `invoices/${sanitizedNumber}.json`;
    await uploadBuffer(bucket, gcsPath, pdfBuffer, "application/pdf");
    // GCP-STG-0112: Store structured JSON alongside PDF
    await uploadBuffer(bucket, jsonPath, Buffer.from(invoiceJson, "utf8"), "application/json");

    // Update invoice record with GCS path + signature
    await pool.query(
      `UPDATE invoicing.invoices SET pdf_gcs_path = $1, pdf_stored_at = NOW(), pdf_signature = $3 WHERE id = $2::uuid`,
      [gcsPath, invoiceId, pdfSignature]
    );
  } catch (err: any) {
    // Log but don't rethrow — PDF storage is best-effort
    log.error(`[GCP-STG-0074] storeInvoicePdfInGcs error:`, err?.message);
  }
}

// GCP-STG-0078: Trigger e-invoice IRN generation if applicable
async function triggerEInvoice(pool: Pool, invoiceId: string): Promise<void> {
  try {
    const { isEInvoiceApplicable, generateIrn } = await import("./eInvoiceService");

    // Check if e-invoice is applicable for this invoice
    const result = await pool.query(
      `SELECT invoice_type, seller_gstin as "sellerGstin", buyer_gstin as "buyerGstin"
       FROM invoicing.invoices WHERE id = $1::uuid`,
      [invoiceId]
    );
    if (result.rows.length === 0) return;

    const inv = result.rows[0];
    if (!isEInvoiceApplicable({ sellerGstin: inv.sellerGstin, buyerGstin: inv.buyerGstin, invoiceType: inv.invoice_type })) {
      return;
    }

    await generateIrn(pool, invoiceId);
  } catch (err: any) {
    // Non-blocking — log but don't fail issuance
    log.error(`[GCP-STG-0078] triggerEInvoice error:`, err?.message);
  }
}

// =============================================================================
// Record Payment
// =============================================================================

export async function recordInvoicePayment(
  pool: Pool,
  invoiceId: string,
  amountMinor: number,
  paymentMode: string,
  paymentReference?: string,
  createdBy?: string
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Record payment
    await client.query(
      `INSERT INTO invoicing.invoice_payments (invoice_id, amount_minor, payment_mode, payment_reference, created_by)
       VALUES ($1::uuid, $2, $3, $4, $5)`,
      [invoiceId, amountMinor, paymentMode, paymentReference || null, createdBy || null]
    );

    // Update invoice totals
    const updateResult = await client.query(
      `UPDATE invoicing.invoices
       SET amount_paid_minor = amount_paid_minor + $2,
           balance_due_minor = GREATEST(balance_due_minor - $2, 0),
           status = CASE
             WHEN balance_due_minor - $2 <= 0 THEN 'paid'
             ELSE status
           END,
           paid_at = CASE
             WHEN balance_due_minor - $2 <= 0 THEN NOW()
             ELSE paid_at
           END,
           updated_at = NOW()
       WHERE id = $1::uuid
       RETURNING id, status`,
      [invoiceId, amountMinor]
    );

    if (updateResult.rowCount === 0) {
      throw new Error("Invoice not found");
    }

    await client.query("COMMIT");
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

// =============================================================================
// Query Invoices
// =============================================================================

export async function getInvoice(pool: Pool, invoiceId: string): Promise<any> {
  const invoiceResult = await pool.query(
    `SELECT
      i.id, i.invoice_number as "invoiceNumber",
      i.invoice_date as "invoiceDate", i.due_date as "dueDate",
      i.invoice_model as "invoiceModel", i.invoice_type as "invoiceType",
      i.status,
      i.seller_type as "sellerType", i.seller_name as "sellerName",
      i.seller_gstin as "sellerGstin", i.seller_address as "sellerAddress",
      i.buyer_type as "buyerType", i.buyer_name as "buyerName",
      i.buyer_gstin as "buyerGstin", i.buyer_address as "buyerAddress",
      i.subtotal_minor as "subtotalMinor",
      i.discount_minor as "discountMinor",
      i.taxable_amount_minor as "taxableAmountMinor",
      i.cgst_minor as "cgstMinor", i.sgst_minor as "sgstMinor",
      i.igst_minor as "igstMinor", i.total_tax_minor as "totalTaxMinor",
      i.total_amount_minor as "totalAmountMinor",
      i.amount_paid_minor as "amountPaidMinor",
      i.balance_due_minor as "balanceDueMinor",
      i.platform_fee_percent as "platformFeePercent",
      i.platform_fee_minor as "platformFeeMinor",
      i.fiscal_year as "fiscalYear",
      i.seller_id as "sellerId",
      i.buyer_id as "buyerId",
      i.order_id as "orderId",
      i.created_at as "createdAt",
      i.issued_at as "issuedAt",
      i.paid_at as "paidAt",
      i.irn as "irn",
      i.irn_status as "irnStatus",
      i.irn_generated_at as "irnGeneratedAt",
      i.signed_qr_string as "signedQrString",
      i.ack_number as "ackNumber",
      i.ack_date as "ackDate",
      i.pdf_gcs_path as "pdfGcsPath",
      i.pdf_signature as "pdfSignature"
    FROM invoicing.invoices i
    WHERE i.id = $1::uuid`,
    [invoiceId]
  );

  if (invoiceResult.rows.length === 0) return null;

  const itemsResult = await pool.query(
    `SELECT
      ii.id, ii.product_name as "productName",
      ii.product_sku as "productSku", ii.hsn_code as "hsnCode",
      ii.quantity, ii.unit,
      ii.unit_price_minor as "unitPriceMinor",
      ii.discount_minor as "discountMinor",
      ii.taxable_amount_minor as "taxableAmountMinor",
      ii.gst_rate as "gstRate",
      ii.cgst_minor as "cgstMinor", ii.sgst_minor as "sgstMinor",
      ii.igst_minor as "igstMinor", ii.total_minor as "totalMinor"
    FROM invoicing.invoice_items ii
    WHERE ii.invoice_id = $1::uuid
    ORDER BY ii.sort_order ASC`,
    [invoiceId]
  );

  const paymentsResult = await pool.query(
    `SELECT
      ip.id, ip.payment_date as "paymentDate",
      ip.amount_minor as "amountMinor",
      ip.payment_mode as "paymentMode",
      ip.payment_reference as "paymentReference",
      ip.created_at as "createdAt"
    FROM invoicing.invoice_payments ip
    WHERE ip.invoice_id = $1::uuid
    ORDER BY ip.created_at ASC`,
    [invoiceId]
  );

  const invoice = invoiceResult.rows[0];

  // WA-002: Resolve seller/buyer phone numbers for WhatsApp linking
  let sellerPhone: string | null = null;
  let buyerPhone: string | null = null;

  if (invoice.sellerType === "supplier" && invoice.sellerId) {
    const sp = await pool.query(
      `SELECT primary_phone FROM supplier.suppliers WHERE id = $1::uuid`,
      [invoice.sellerId]
    );
    sellerPhone = sp.rows[0]?.primary_phone || null;
  }

  if (invoice.buyerType === "store" && invoice.buyerId) {
    const bp = await pool.query(
      `SELECT phone FROM platform.stores WHERE id = $1::uuid`,
      [invoice.buyerId]
    );
    buyerPhone = bp.rows[0]?.phone || null;
  }

  return {
    ...invoice,
    sellerPhone,
    buyerPhone,
    items: itemsResult.rows,
    payments: paymentsResult.rows,
  };
}

export async function listInvoices(
  pool: Pool,
  filters: {
    sellerType?: string;
    sellerId?: string;
    buyerType?: string;
    buyerId?: string;
    invoiceModel?: string;
    invoiceType?: string;
    status?: string;
    fiscalYear?: string;
    limit?: number;
    offset?: number;
  }
): Promise<{ data: Invoice[]; total: number }> {
  let where = "WHERE 1=1";
  const params: any[] = [];
  let idx = 1;

  if (filters.sellerType) { where += ` AND i.seller_type = $${idx++}`; params.push(filters.sellerType); }
  if (filters.sellerId) { where += ` AND i.seller_id = $${idx++}::uuid`; params.push(filters.sellerId); }
  if (filters.buyerType) { where += ` AND i.buyer_type = $${idx++}`; params.push(filters.buyerType); }
  if (filters.buyerId) { where += ` AND i.buyer_id = $${idx++}::uuid`; params.push(filters.buyerId); }
  if (filters.invoiceModel) { where += ` AND i.invoice_model = $${idx++}`; params.push(filters.invoiceModel); }
  if (filters.invoiceType) { where += ` AND i.invoice_type = $${idx++}`; params.push(filters.invoiceType); }
  if (filters.status) { where += ` AND i.status = $${idx++}`; params.push(filters.status); }
  if (filters.fiscalYear) { where += ` AND i.fiscal_year = $${idx++}`; params.push(filters.fiscalYear); }

  const limit = Math.min(filters.limit || 50, 100);
  const offset = Math.max(filters.offset || 0, 0);

  const countResult = await pool.query(
    `SELECT COUNT(*)::int as total FROM invoicing.invoices i ${where}`,
    params
  );

  const result = await pool.query(
    `SELECT
      i.id, i.invoice_number as "invoiceNumber",
      i.invoice_date as "invoiceDate", i.due_date as "dueDate",
      i.invoice_model as "invoiceModel", i.invoice_type as "invoiceType",
      i.status,
      i.seller_name as "sellerName", i.buyer_name as "buyerName",
      i.subtotal_minor as "subtotalMinor",
      i.total_tax_minor as "totalTaxMinor",
      i.total_amount_minor as "totalAmountMinor",
      i.amount_paid_minor as "amountPaidMinor",
      i.balance_due_minor as "balanceDueMinor",
      i.platform_fee_minor as "platformFeeMinor",
      i.created_at as "createdAt"
    FROM invoicing.invoices i
    ${where}
    ORDER BY i.invoice_date DESC, i.created_at DESC
    LIMIT $${idx} OFFSET $${idx + 1}`,
    [...params, limit, offset]
  );

  return {
    data: result.rows,
    total: countResult.rows[0]?.total || 0,
  };
}
