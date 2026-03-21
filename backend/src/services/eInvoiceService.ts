// GCP-STG-0078: GST E-Invoice Service
// Integrates with NIC IRP (Invoice Registration Portal) for IRN generation,
// signed QR code retrieval, and signed JSON payload storage in GCS.
//
// Toggle: EINVOICE_ENABLED env var (default: false)
// IRP docs: https://einvoice1.gst.gov.in/Others/GSTEInvoiceAPIs

import type { Pool } from "pg";
import { log } from "../lib/logger";

// =============================================================================
// Types
// =============================================================================

/** GST e-invoice transaction types per IRP schema */
type SupplyType = "B2B" | "SEZWP" | "SEZWOP" | "EXPWP" | "EXPWOP" | "DEXP";
type DocumentType = "INV" | "CRN" | "DBN";

export interface EInvoiceConfig {
  enabled: boolean;
  irpBaseUrl: string;
  gspClientId: string;
  gspClientSecret: string;
  gstin: string;
  /** Sandbox mode — uses test IRP endpoint */
  sandbox: boolean;
}

export interface IrpAuthToken {
  token: string;
  expiresAt: Date;
}

export interface IrpGenerateResponse {
  irn: string;
  ackNumber: string;
  ackDate: string;
  signedInvoice: string; // Base64-encoded signed JSON
  signedQrCode: string;  // Signed QR string for QR code rendering
  status: "ACT"; // Active
}

export interface IrpCancelResponse {
  irn: string;
  cancelDate: string;
}

export interface EInvoicePayload {
  Version: string;
  TranDtls: { TaxSch: string; SupTyp: SupplyType; RegRev: string; IgstOnIntra: string };
  DocDtls: { Typ: DocumentType; No: string; Dt: string };
  SellerDtls: { Gstin: string; LglNm: string; Addr1: string; Loc: string; Pin: number; Stcd: string };
  BuyerDtls: { Gstin: string; LglNm: string; Addr1: string; Loc: string; Pin: number; Stcd: string; Pos: string };
  ItemList: Array<{
    SlNo: string;
    PrdDesc: string;
    IsServc: string;
    HsnCd: string;
    Qty: number;
    Unit: string;
    UnitPrice: number;
    TotAmt: number;
    Discount: number;
    AssAmt: number;
    GstRt: number;
    CgstAmt: number;
    SgstAmt: number;
    IgstAmt: number;
    TotItemVal: number;
  }>;
  ValDtls: {
    AssVal: number;
    CgstVal: number;
    SgstVal: number;
    IgstVal: number;
    Discount: number;
    OthChrg: number;
    TotInvVal: number;
  };
}

// =============================================================================
// Configuration
// =============================================================================

const IRP_SANDBOX_URL = "https://einv-apisandbox.nic.in";
const IRP_PRODUCTION_URL = "https://einv-api.nic.in";

export function getEInvoiceConfig(): EInvoiceConfig {
  const enabled = process.env.EINVOICE_ENABLED === "true";
  const sandbox = process.env.EINVOICE_SANDBOX !== "false"; // Default to sandbox

  return {
    enabled,
    irpBaseUrl: sandbox ? IRP_SANDBOX_URL : (process.env.EINVOICE_IRP_URL || IRP_PRODUCTION_URL),
    gspClientId: process.env.EINVOICE_GSP_CLIENT_ID || "",
    gspClientSecret: process.env.EINVOICE_GSP_CLIENT_SECRET || "",
    gstin: process.env.SUPERMANDI_GSTIN || "08ABRCS8282R1ZY",
    sandbox,
  };
}

// =============================================================================
// State code mapping (GST state codes per GSTN)
// =============================================================================

const STATE_CODE_MAP: Record<string, string> = {
  "jammu and kashmir": "01", "himachal pradesh": "02", "punjab": "03",
  "chandigarh": "04", "uttarakhand": "05", "haryana": "06", "delhi": "07",
  "rajasthan": "08", "uttar pradesh": "09", "bihar": "10", "sikkim": "11",
  "arunachal pradesh": "12", "nagaland": "13", "manipur": "14", "mizoram": "15",
  "tripura": "16", "meghalaya": "17", "assam": "18", "west bengal": "19",
  "jharkhand": "20", "odisha": "21", "chhattisgarh": "22", "madhya pradesh": "23",
  "gujarat": "24", "dadra and nagar haveli and daman and diu": "26",
  "maharashtra": "27", "andhra pradesh": "28", "karnataka": "29",
  "goa": "30", "lakshadweep": "31", "kerala": "32", "tamil nadu": "33",
  "puducherry": "34", "andaman and nicobar islands": "35", "telangana": "36",
  "ladakh": "37", "other territory": "97",
};

export function getStateCode(stateOrGstin: string): string {
  if (!stateOrGstin) return "08"; // Default: Rajasthan

  // If it looks like a GSTIN (15 alphanumeric chars starting with 2 digits), extract state code
  if (/^\d{2}[A-Z0-9]{13}$/.test(stateOrGstin)) {
    return stateOrGstin.substring(0, 2);
  }

  const normalized = stateOrGstin.toLowerCase().trim();
  return STATE_CODE_MAP[normalized] || "08";
}

// =============================================================================
// IRP Authentication
// =============================================================================

let cachedToken: IrpAuthToken | null = null;

export async function getIrpAuthToken(config: EInvoiceConfig): Promise<string> {
  // Return cached token if still valid (with 5min buffer)
  if (cachedToken && cachedToken.expiresAt.getTime() > Date.now() + 300_000) {
    return cachedToken.token;
  }

  const response = await fetch(`${config.irpBaseUrl}/eivital/v1.04/auth`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "client_id": config.gspClientId,
      "client_secret": config.gspClientSecret,
      "gstin": config.gstin,
    },
    body: JSON.stringify({
      UserName: config.gspClientId,
      Password: config.gspClientSecret,
      Gstin: config.gstin,
      ForceRefreshAccessToken: false,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IRP auth failed (${response.status}): ${text}`);
  }

  const data: any = await response.json();
  if (!data.AuthToken) {
    throw new Error(`IRP auth response missing AuthToken: ${JSON.stringify(data)}`);
  }

  cachedToken = {
    token: data.AuthToken,
    expiresAt: new Date(Date.now() + (data.TokenExpiry || 3600) * 1000),
  };

  return cachedToken.token;
}

// =============================================================================
// Payload Builder (GST e-invoice schema v1.1)
// =============================================================================

interface InvoiceDataForEInvoice {
  invoiceNumber: string;
  invoiceDate: string;
  invoiceType: string;
  sellerGstin: string;
  sellerName: string;
  sellerAddress: string;
  sellerState: string;
  buyerGstin: string;
  buyerName: string;
  buyerAddress: string;
  buyerState: string;
  items: Array<{
    productName: string;
    hsnCode: string;
    quantity: number;
    unit: string;
    unitPriceMinor: number;
    discountMinor: number;
    taxableAmountMinor: number;
    gstRate: number;
    cgstMinor: number;
    sgstMinor: number;
    igstMinor: number;
    totalMinor: number;
  }>;
  subtotalMinor: number;
  discountMinor: number;
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalAmountMinor: number;
}

/** Convert minor (paise) to major (rupees) with 2 decimal places */
function toRupees(minor: number): number {
  return Math.round(minor) / 100;
}

/** Format date as DD/MM/YYYY per IRP spec */
function formatIrpDate(dateStr: string): string {
  const d = new Date(dateStr);
  const dd = String(d.getDate()).padStart(2, "0");
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const yyyy = d.getFullYear();
  return `${dd}/${mm}/${yyyy}`;
}

function getDocumentType(invoiceType: string): DocumentType {
  if (invoiceType === "credit_note") return "CRN";
  if (invoiceType === "debit_note") return "DBN";
  return "INV";
}

/** Map product unit to IRP UQC (Unit Quantity Code) */
function mapUnitToUqc(unit: string): string {
  const uqcMap: Record<string, string> = {
    PCS: "PCS", KG: "KGS", GM: "GMS", LTR: "LTR", ML: "MLT",
    MTR: "MTR", BOX: "BOX", CTN: "CTN", BAG: "BAG", NOS: "NOS",
    PAC: "PAC", SET: "SET", DOZ: "DOZ", UNT: "UNT",
  };
  return uqcMap[unit?.toUpperCase()] || "OTH";
}

/** Extract PIN from address string (6-digit Indian PIN code) */
function extractPin(address: string): number {
  const match = address?.match(/\b(\d{6})\b/);
  return match ? parseInt(match[1], 10) : 342014; // Default: Jodhpur PIN
}

export function buildEInvoicePayload(data: InvoiceDataForEInvoice): EInvoicePayload {
  const sellerStateCode = getStateCode(data.sellerGstin || data.sellerState);
  const buyerStateCode = getStateCode(data.buyerGstin || data.buyerState);
  const isInterState = sellerStateCode !== buyerStateCode;

  return {
    Version: "1.1",
    TranDtls: {
      TaxSch: "GST",
      SupTyp: "B2B",
      RegRev: "N",
      IgstOnIntra: isInterState ? "N" : "N",
    },
    DocDtls: {
      Typ: getDocumentType(data.invoiceType),
      No: data.invoiceNumber,
      Dt: formatIrpDate(data.invoiceDate),
    },
    SellerDtls: {
      Gstin: data.sellerGstin,
      LglNm: data.sellerName.substring(0, 100),
      Addr1: (data.sellerAddress || "").substring(0, 100) || data.sellerName,
      Loc: (data.sellerAddress || "").substring(0, 50) || "Jodhpur",
      Pin: extractPin(data.sellerAddress),
      Stcd: sellerStateCode,
    },
    BuyerDtls: {
      Gstin: data.buyerGstin || "URP", // URP = Unregistered Person
      LglNm: data.buyerName.substring(0, 100),
      Addr1: (data.buyerAddress || "").substring(0, 100) || data.buyerName,
      Loc: (data.buyerAddress || "").substring(0, 50) || "India",
      Pin: extractPin(data.buyerAddress),
      Stcd: buyerStateCode,
      Pos: buyerStateCode, // Place of Supply
    },
    ItemList: data.items.map((item, i) => ({
      SlNo: String(i + 1),
      PrdDesc: item.productName.substring(0, 300),
      IsServc: "N",
      HsnCd: item.hsnCode || "0000",
      Qty: item.quantity,
      Unit: mapUnitToUqc(item.unit),
      UnitPrice: toRupees(item.unitPriceMinor),
      TotAmt: toRupees(item.quantity * item.unitPriceMinor),
      Discount: toRupees(item.discountMinor),
      AssAmt: toRupees(item.taxableAmountMinor),
      GstRt: item.gstRate,
      CgstAmt: toRupees(item.cgstMinor),
      SgstAmt: toRupees(item.sgstMinor),
      IgstAmt: toRupees(item.igstMinor),
      TotItemVal: toRupees(item.totalMinor),
    })),
    ValDtls: {
      AssVal: toRupees(data.taxableAmountMinor),
      CgstVal: toRupees(data.cgstMinor),
      SgstVal: toRupees(data.sgstMinor),
      IgstVal: toRupees(data.igstMinor),
      Discount: toRupees(data.discountMinor),
      OthChrg: 0,
      TotInvVal: toRupees(data.totalAmountMinor),
    },
  };
}

// =============================================================================
// IRP API: Generate IRN
// =============================================================================

export async function generateIrn(
  pool: Pool,
  invoiceId: string
): Promise<{ irn: string; signedQrCode: string; ackNumber: string } | null> {
  const config = getEInvoiceConfig();

  if (!config.enabled) {
    log.info(`[e-invoice] Disabled — skipping IRN generation for invoice ${invoiceId}`);
    return null;
  }

  if (!config.gspClientId || !config.gspClientSecret) {
    log.warn(`[e-invoice] GSP credentials not configured — skipping IRN for invoice ${invoiceId}`);
    return null;
  }

  // Fetch full invoice data
  const invoiceResult = await pool.query(
    `SELECT
      i.id, i.invoice_number, i.invoice_date, i.invoice_type, i.irn_status,
      i.seller_gstin, i.seller_name, i.seller_address,
      i.buyer_gstin, i.buyer_name, i.buyer_address,
      i.subtotal_minor, i.discount_minor, i.taxable_amount_minor,
      i.cgst_minor, i.sgst_minor, i.igst_minor, i.total_amount_minor
    FROM invoicing.invoices i WHERE i.id = $1::uuid`,
    [invoiceId]
  );

  if (invoiceResult.rows.length === 0) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const inv = invoiceResult.rows[0];

  // Skip if IRN already generated
  if (inv.irn_status === "generated") {
    log.info(`[e-invoice] IRN already generated for invoice ${invoiceId}`);
    return null;
  }

  // Skip if no seller GSTIN (can't generate e-invoice without GSTIN)
  if (!inv.seller_gstin) {
    log.warn(`[e-invoice] No seller GSTIN — skipping IRN for invoice ${invoiceId}`);
    await pool.query(
      `UPDATE invoicing.invoices SET irn_status = 'na' WHERE id = $1::uuid`,
      [invoiceId]
    );
    return null;
  }

  // Mark as pending
  await pool.query(
    `UPDATE invoicing.invoices SET irn_status = 'pending', updated_at = NOW() WHERE id = $1::uuid`,
    [invoiceId]
  );

  // Fetch items
  const itemsResult = await pool.query(
    `SELECT product_name, hsn_code, quantity, unit,
            unit_price_minor, discount_minor, taxable_amount_minor,
            gst_rate, cgst_minor, sgst_minor, igst_minor, total_minor
     FROM invoicing.invoice_items WHERE invoice_id = $1::uuid ORDER BY sort_order`,
    [invoiceId]
  );

  // Resolve seller/buyer state from GSTIN or address
  const sellerState = inv.seller_gstin ? inv.seller_gstin.substring(0, 2) : "08";
  const buyerState = inv.buyer_gstin ? inv.buyer_gstin.substring(0, 2) : "08";

  // Build IRP payload
  const payload = buildEInvoicePayload({
    invoiceNumber: inv.invoice_number,
    invoiceDate: inv.invoice_date,
    invoiceType: inv.invoice_type,
    sellerGstin: inv.seller_gstin,
    sellerName: inv.seller_name,
    sellerAddress: inv.seller_address || "",
    sellerState,
    buyerGstin: inv.buyer_gstin || "",
    buyerName: inv.buyer_name,
    buyerAddress: inv.buyer_address || "",
    buyerState,
    items: itemsResult.rows.map((r) => ({
      productName: r.product_name,
      hsnCode: r.hsn_code || "0000",
      quantity: parseFloat(r.quantity),
      unit: r.unit || "PCS",
      unitPriceMinor: parseInt(r.unit_price_minor, 10),
      discountMinor: parseInt(r.discount_minor, 10),
      taxableAmountMinor: parseInt(r.taxable_amount_minor, 10),
      gstRate: parseFloat(r.gst_rate),
      cgstMinor: parseInt(r.cgst_minor, 10),
      sgstMinor: parseInt(r.sgst_minor, 10),
      igstMinor: parseInt(r.igst_minor, 10),
      totalMinor: parseInt(r.total_minor, 10),
    })),
    subtotalMinor: parseInt(inv.subtotal_minor, 10),
    discountMinor: parseInt(inv.discount_minor, 10),
    taxableAmountMinor: parseInt(inv.taxable_amount_minor, 10),
    cgstMinor: parseInt(inv.cgst_minor, 10),
    sgstMinor: parseInt(inv.sgst_minor, 10),
    igstMinor: parseInt(inv.igst_minor, 10),
    totalAmountMinor: parseInt(inv.total_amount_minor, 10),
  });

  try {
    // Authenticate with IRP
    const authToken = await getIrpAuthToken(config);

    // Call IRP generate endpoint
    const response = await fetch(`${config.irpBaseUrl}/eicore/v1.03/Invoice`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "client_id": config.gspClientId,
        "client_secret": config.gspClientSecret,
        "gstin": config.gstin,
        "authtoken": authToken,
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let responseData: any;
    try {
      responseData = JSON.parse(responseText);
    } catch {
      throw new Error(`IRP returned non-JSON response (${response.status}): ${responseText.substring(0, 500)}`);
    }

    if (!response.ok || !responseData.Irn) {
      throw new Error(`IRP generate failed (${response.status}): ${JSON.stringify(responseData).substring(0, 500)}`);
    }

    const irpResult: IrpGenerateResponse = {
      irn: responseData.Irn,
      ackNumber: responseData.AckNo || "",
      ackDate: responseData.AckDt || "",
      signedInvoice: responseData.SignedInvoice || "",
      signedQrCode: responseData.SignedQRCode || "",
      status: "ACT",
    };

    // Store signed JSON payload in GCS (non-blocking)
    storeSignedPayloadInGcs(pool, invoiceId, inv.invoice_number, irpResult.signedInvoice).catch((err) => {
      log.error(`[e-invoice] Signed payload GCS storage failed for ${invoiceId}:`, err?.message);
    });

    // Update invoice with IRN data
    await pool.query(
      `UPDATE invoicing.invoices
       SET irn = $2, irn_status = 'generated', irn_generated_at = NOW(),
           signed_qr_string = $3, ack_number = $4, ack_date = $5::timestamptz,
           updated_at = NOW()
       WHERE id = $1::uuid`,
      [invoiceId, irpResult.irn, irpResult.signedQrCode, irpResult.ackNumber, irpResult.ackDate || null]
    );

    log.info(`[e-invoice] IRN generated for invoice ${invoiceId}: ${irpResult.irn}`);

    return {
      irn: irpResult.irn,
      signedQrCode: irpResult.signedQrCode,
      ackNumber: irpResult.ackNumber,
    };
  } catch (err: any) {
    // Mark as failed but don't throw — e-invoice is non-blocking for invoice issuance
    log.error(`[e-invoice] IRN generation failed for invoice ${invoiceId}:`, err?.message);

    await pool.query(
      `UPDATE invoicing.invoices SET irn_status = 'failed', updated_at = NOW() WHERE id = $1::uuid`,
      [invoiceId]
    ).catch(() => {}); // Swallow update error

    throw err; // Rethrow for caller to handle
  }
}

// =============================================================================
// IRP API: Cancel IRN (within 24 hours per GST rules)
// =============================================================================

export async function cancelIrn(
  pool: Pool,
  invoiceId: string,
  reason: string
): Promise<void> {
  const config = getEInvoiceConfig();

  if (!config.enabled) {
    throw new Error("E-invoicing is not enabled");
  }

  // Fetch invoice IRN
  const result = await pool.query(
    `SELECT irn, irn_status, irn_generated_at FROM invoicing.invoices WHERE id = $1::uuid`,
    [invoiceId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Invoice ${invoiceId} not found`);
  }

  const { irn, irn_status, irn_generated_at } = result.rows[0];

  if (irn_status !== "generated" || !irn) {
    throw new Error(`Invoice ${invoiceId} does not have a generated IRN (status: ${irn_status})`);
  }

  // Check 24-hour cancellation window
  const generatedAt = new Date(irn_generated_at);
  const hoursSinceGeneration = (Date.now() - generatedAt.getTime()) / (1000 * 60 * 60);
  if (hoursSinceGeneration > 24) {
    throw new Error(`IRN cancellation window expired (generated ${hoursSinceGeneration.toFixed(1)}h ago, max 24h)`);
  }

  const authToken = await getIrpAuthToken(config);

  // IRP cancel endpoint expects: { Irn, CnlRsn (1=Duplicate, 2=DataEntryMistake, 3=OrderCancelled, 4=Other), CnlRem }
  const cnlRsn = reason.toLowerCase().includes("duplicate") ? "1"
    : reason.toLowerCase().includes("data") ? "2"
    : reason.toLowerCase().includes("order") ? "3"
    : "4";

  const response = await fetch(`${config.irpBaseUrl}/eicore/v1.03/Invoice/Cancel`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "client_id": config.gspClientId,
      "client_secret": config.gspClientSecret,
      "gstin": config.gstin,
      "authtoken": authToken,
    },
    body: JSON.stringify({
      Irn: irn,
      CnlRsn: cnlRsn,
      CnlRem: reason.substring(0, 100),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`IRP cancel failed (${response.status}): ${text.substring(0, 500)}`);
  }

  // Update invoice
  await pool.query(
    `UPDATE invoicing.invoices
     SET irn_status = 'cancelled', irn_cancel_reason = $2, irn_cancelled_at = NOW(), updated_at = NOW()
     WHERE id = $1::uuid`,
    [invoiceId, reason]
  );

  log.info(`[e-invoice] IRN cancelled for invoice ${invoiceId}: ${irn}`);
}

// =============================================================================
// GCS: Store signed JSON payload
// =============================================================================

async function storeSignedPayloadInGcs(
  pool: Pool,
  invoiceId: string,
  invoiceNumber: string,
  signedInvoice: string
): Promise<void> {
  if (!signedInvoice) return;

  try {
    const { uploadBuffer } = await import("@supermandi/common");
    const bucket = process.env.GCS_DOCUMENTS_BUCKET || "supermandi-pos-documents";
    const sanitizedNumber = invoiceNumber.replace(/[^a-zA-Z0-9_-]/g, "_");
    const gcsPath = `einvoice/${sanitizedNumber}_signed.json`;

    // Decode the signed invoice (base64 JWT from IRP) and store as JSON
    const payloadBuffer = Buffer.from(JSON.stringify({
      invoiceId,
      invoiceNumber,
      signedInvoice,
      storedAt: new Date().toISOString(),
    }), "utf-8");

    await uploadBuffer(bucket, gcsPath, payloadBuffer, "application/json");

    // Update invoice record
    await pool.query(
      `UPDATE invoicing.invoices SET signed_invoice_gcs_path = $1 WHERE id = $2::uuid`,
      [gcsPath, invoiceId]
    );

    log.info(`[e-invoice] Signed payload stored at ${gcsPath} for invoice ${invoiceId}`);
  } catch (err: any) {
    log.error(`[e-invoice] storeSignedPayloadInGcs error:`, err?.message);
  }
}

// =============================================================================
// QR Code Generation (from signed QR string)
// =============================================================================

/**
 * Generate a QR code PNG buffer from the IRP signed QR string.
 * Returns null if QR data is unavailable.
 */
export async function generateQrCodeBuffer(signedQrString: string): Promise<Buffer | null> {
  if (!signedQrString) return null;

  try {
    const QRCode = await import("qrcode");
    const buffer = await QRCode.toBuffer(signedQrString, {
      type: "png",
      width: 150,
      margin: 1,
      errorCorrectionLevel: "M",
    });
    return buffer;
  } catch (err: any) {
    log.error(`[e-invoice] QR code generation failed:`, err?.message);
    return null;
  }
}

// =============================================================================
// Check if e-invoice is applicable for an invoice
// =============================================================================

/**
 * E-invoice is applicable for B2B invoices where seller GSTIN is present
 * and total amount exceeds the threshold (currently ₹5cr AATO for e-invoicing).
 * Since threshold applies to aggregate turnover (not per-invoice), we generate
 * for all B2B invoices when EINVOICE_ENABLED=true.
 */
export function isEInvoiceApplicable(invoice: {
  sellerGstin?: string;
  buyerGstin?: string;
  invoiceType: string;
}): boolean {
  const config = getEInvoiceConfig();
  if (!config.enabled) return false;

  // Must have seller GSTIN
  if (!invoice.sellerGstin) return false;

  // Only for B2B (both parties have GSTIN) invoices
  if (!invoice.buyerGstin || invoice.buyerGstin === "URP") return false;

  // Only for INV, CRN, DBN types
  const applicableTypes = ["sale", "purchase", "credit_note", "debit_note"];
  if (!applicableTypes.includes(invoice.invoiceType)) return false;

  return true;
}
