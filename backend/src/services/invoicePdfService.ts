// T-073: Invoice PDF Generation Service
// Generates GST-compliant invoice PDFs using pdfkit

import PDFDocument from "pdfkit";

// =============================================================================
// Types
// =============================================================================

export interface InvoicePdfData {
  // Header
  invoiceNumber: string;
  invoiceDate: string;
  dueDate?: string;
  invoiceModel: string;
  invoiceType: string;
  status: string;
  fiscalYear?: string;

  // E-invoice (GCP-STG-0078)
  irn?: string;
  ackNumber?: string;
  ackDate?: string;
  qrCodeBuffer?: Buffer; // PNG buffer for QR code image

  // Parties
  sellerName: string;
  sellerGstin?: string;
  sellerAddress?: string;
  buyerName: string;
  buyerGstin?: string;
  buyerAddress?: string;

  // GCP-STG-0352: Place of Supply (GST compliance Rule 46)
  placeOfSupply?: string; // e.g. "Maharashtra (27)" — if omitted, derived from buyerGstin

  // Items
  items: Array<{
    productName: string;
    productSku?: string;
    hsnCode?: string;
    quantity: number;
    unit?: string;
    unitPriceMinor: number;
    discountMinor: number;
    taxableAmountMinor: number;
    gstRate: number;
    cgstMinor: number;
    sgstMinor: number;
    igstMinor: number;
    totalMinor: number;
  }>;

  // Totals
  subtotalMinor: number;
  discountMinor: number;
  taxableAmountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  totalTaxMinor: number;
  totalAmountMinor: number;
  amountPaidMinor: number;
  balanceDueMinor: number;

  // Platform fee
  platformFeePercent?: number;
  platformFeeMinor?: number;

  // Payments
  payments?: Array<{
    paymentDate: string;
    amountMinor: number;
    paymentMode: string;
    paymentReference?: string;
  }>;
}

// =============================================================================
// Helpers
// =============================================================================

// GCP-STG-0352: GST state code → state name mapping (GSTIN first 2 digits)
// Source: CBIC notification, same codes as gstCompliance.ts STATE_CODES (reversed)
const GST_STATE_CODE_MAP: Record<string, string> = {
  "01": "Jammu and Kashmir", "02": "Himachal Pradesh", "03": "Punjab",
  "04": "Chandigarh", "05": "Uttarakhand", "06": "Haryana",
  "07": "Delhi", "08": "Rajasthan", "09": "Uttar Pradesh",
  "10": "Bihar", "11": "Sikkim", "12": "Arunachal Pradesh",
  "13": "Nagaland", "14": "Manipur", "15": "Mizoram",
  "16": "Tripura", "17": "Meghalaya", "18": "Assam",
  "19": "West Bengal", "20": "Jharkhand", "21": "Odisha",
  "22": "Chhattisgarh", "23": "Madhya Pradesh", "24": "Gujarat",
  "25": "Daman and Diu", "26": "Dadra and Nagar Haveli", "27": "Maharashtra",
  "29": "Karnataka", "30": "Goa", "31": "Lakshadweep",
  "32": "Kerala", "33": "Tamil Nadu", "34": "Puducherry",
  "35": "Andaman and Nicobar", "36": "Telangana", "37": "Andhra Pradesh",
  "38": "Ladakh",
};

/**
 * GCP-STG-0352: Derive "Place of Supply" from explicit field, buyer GSTIN, or seller GSTIN.
 * Returns formatted string e.g. "Maharashtra (27)" or null if undeterminable.
 */
export function derivePlaceOfSupply(
  placeOfSupply?: string,
  buyerGstin?: string,
  sellerGstin?: string,
): string | null {
  // 1. Explicit value takes precedence
  if (placeOfSupply) return placeOfSupply;

  // 2. Derive from buyer GSTIN first 2 digits (standard GST state code)
  const gstin = buyerGstin || sellerGstin;
  if (gstin && gstin.length >= 2) {
    const code = gstin.substring(0, 2);
    const stateName = GST_STATE_CODE_MAP[code];
    if (stateName) return `${stateName} (${code})`;
  }

  return null;
}

function formatAmount(minor: number): string {
  const rupees = (minor / 100).toFixed(2);
  return `₹${rupees}`;
}

function formatDate(dateStr: string): string {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  return d.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

function getInvoiceTitle(model: string, type: string): string {
  if (type === "commission") return "Commission Invoice";
  if (type === "credit_note") return "Credit Note";
  if (type === "debit_note") return "Debit Note";
  if (model === "buy_resell") {
    return type === "purchase" ? "Purchase Invoice" : "Sale Invoice";
  }
  if (model === "platform_fee") {
    return type === "sale" ? "Supplier Sale Invoice" : "Invoice";
  }
  return "Tax Invoice";
}

// =============================================================================
// PDF Generation
// =============================================================================

export function generateInvoicePdf(data: InvoicePdfData): InstanceType<typeof PDFDocument> {
  const doc = new PDFDocument({
    size: "A4",
    margin: 40,
    info: {
      Title: `Invoice ${data.invoiceNumber}`,
      Author: "SUPERMANDI TECH PRIVATE LIMITED",
    },
  });

  const pageWidth = 595.28 - 80; // A4 width minus margins
  const leftCol = 40;
  const rightCol = 320;

  // =========================================================================
  // Header
  // =========================================================================
  doc.fontSize(18).font("Helvetica-Bold")
    .text(getInvoiceTitle(data.invoiceModel, data.invoiceType), leftCol, 40, { align: "center" });

  doc.moveDown(0.3);
  doc.fontSize(9).font("Helvetica")
    .text("(Under GST Rules)", { align: "center" });

  // Invoice meta — left side
  let y = 90;
  doc.fontSize(10).font("Helvetica-Bold").text("Invoice No:", leftCol, y);
  doc.font("Helvetica").text(data.invoiceNumber, leftCol + 80, y);

  y += 16;
  doc.font("Helvetica-Bold").text("Date:", leftCol, y);
  doc.font("Helvetica").text(formatDate(data.invoiceDate), leftCol + 80, y);

  if (data.dueDate) {
    y += 16;
    doc.font("Helvetica-Bold").text("Due Date:", leftCol, y);
    doc.font("Helvetica").text(formatDate(data.dueDate), leftCol + 80, y);
  }

  // Status — right side
  doc.fontSize(10).font("Helvetica-Bold").text("Status:", rightCol, 90);
  doc.font("Helvetica").text(data.status.toUpperCase(), rightCol + 50, 90);

  if (data.fiscalYear) {
    doc.font("Helvetica-Bold").text("F.Y.:", rightCol, 106);
    doc.font("Helvetica").text(data.fiscalYear, rightCol + 50, 106);
  }

  // GCP-STG-0078: IRN details (if e-invoice generated)
  if (data.irn) {
    let irnY = data.fiscalYear ? 122 : 106;
    doc.fontSize(7).font("Helvetica-Bold").text("IRN:", rightCol, irnY);
    doc.font("Helvetica").text(data.irn, rightCol + 25, irnY, { width: 200 });
    irnY += 10;
    if (data.ackNumber) {
      doc.font("Helvetica-Bold").text("Ack:", rightCol, irnY);
      doc.font("Helvetica").text(`${data.ackNumber}${data.ackDate ? ` (${data.ackDate})` : ""}`, rightCol + 25, irnY);
    }
  }

  // =========================================================================
  // Seller / Buyer boxes
  // =========================================================================
  y = 145;
  const boxHeight = 70;
  const halfWidth = pageWidth / 2 - 5;

  // Seller box
  doc.rect(leftCol, y, halfWidth, boxHeight).stroke();
  doc.fontSize(9).font("Helvetica-Bold").text("From (Seller):", leftCol + 5, y + 5);
  doc.font("Helvetica").text(data.sellerName || "", leftCol + 5, y + 18, { width: halfWidth - 10 });
  if (data.sellerGstin) {
    doc.fontSize(8).text(`GSTIN: ${data.sellerGstin}`, leftCol + 5, y + 32);
  }
  if (data.sellerAddress) {
    doc.fontSize(8).text(data.sellerAddress, leftCol + 5, y + 44, { width: halfWidth - 10 });
  }

  // Buyer box
  const buyerX = leftCol + halfWidth + 10;
  doc.rect(buyerX, y, halfWidth, boxHeight).stroke();
  doc.fontSize(9).font("Helvetica-Bold").text("To (Buyer):", buyerX + 5, y + 5);
  doc.font("Helvetica").text(data.buyerName || "", buyerX + 5, y + 18, { width: halfWidth - 10 });
  if (data.buyerGstin) {
    doc.fontSize(8).text(`GSTIN: ${data.buyerGstin}`, buyerX + 5, y + 32);
  }
  if (data.buyerAddress) {
    doc.fontSize(8).text(data.buyerAddress, buyerX + 5, y + 44, { width: halfWidth - 10 });
  }

  // =========================================================================
  // GCP-STG-0352: Place of Supply (GST Rule 46 mandatory field)
  // =========================================================================
  const pos = derivePlaceOfSupply(data.placeOfSupply, data.buyerGstin, data.sellerGstin);
  if (pos) {
    y = y + boxHeight + 4;
    doc.fontSize(8).font("Helvetica-Bold").text("Place of Supply:", leftCol, y);
    doc.font("Helvetica").text(pos, leftCol + 90, y);
    y += 14;
  } else {
    y = 230;
  }

  // =========================================================================
  // Items table
  // =========================================================================
  // Ensure items table starts below Place of Supply (or at default 230)
  if (y < 230) y = 230;

  // Column widths
  const cols = {
    sno: 25,
    name: 130,
    hsn: 50,
    qty: 40,
    rate: 55,
    disc: 45,
    taxable: 55,
    gst: 35,
    tax: 45,
    total: 55,
  };

  // Table header
  doc.rect(leftCol, y, pageWidth, 18).fill("#333");
  doc.fillColor("white").fontSize(7).font("Helvetica-Bold");

  let x = leftCol + 3;
  doc.text("#", x, y + 4, { width: cols.sno });
  x += cols.sno;
  doc.text("Item", x, y + 4, { width: cols.name });
  x += cols.name;
  doc.text("HSN", x, y + 4, { width: cols.hsn });
  x += cols.hsn;
  doc.text("Qty", x, y + 4, { width: cols.qty, align: "right" });
  x += cols.qty;
  doc.text("Rate", x, y + 4, { width: cols.rate, align: "right" });
  x += cols.rate;
  doc.text("Disc", x, y + 4, { width: cols.disc, align: "right" });
  x += cols.disc;
  doc.text("Taxable", x, y + 4, { width: cols.taxable, align: "right" });
  x += cols.taxable;
  doc.text("GST%", x, y + 4, { width: cols.gst, align: "right" });
  x += cols.gst;
  doc.text("Tax", x, y + 4, { width: cols.tax, align: "right" });
  x += cols.tax;
  doc.text("Total", x, y + 4, { width: cols.total, align: "right" });

  y += 18;
  doc.fillColor("black").font("Helvetica").fontSize(7);

  // Table rows
  for (let i = 0; i < data.items.length; i++) {
    const item = data.items[i];
    const rowHeight = 14;

    if (i % 2 === 0) {
      doc.rect(leftCol, y, pageWidth, rowHeight).fill("#f8f8f8");
      doc.fillColor("black");
    }

    x = leftCol + 3;
    doc.text(String(i + 1), x, y + 3, { width: cols.sno });
    x += cols.sno;
    doc.text(item.productName.substring(0, 30), x, y + 3, { width: cols.name });
    x += cols.name;
    doc.text(item.hsnCode || "-", x, y + 3, { width: cols.hsn });
    x += cols.hsn;
    doc.text(`${item.quantity} ${item.unit || ""}`, x, y + 3, { width: cols.qty, align: "right" });
    x += cols.qty;
    doc.text(formatAmount(item.unitPriceMinor), x, y + 3, { width: cols.rate, align: "right" });
    x += cols.rate;
    doc.text(item.discountMinor > 0 ? formatAmount(item.discountMinor) : "-", x, y + 3, { width: cols.disc, align: "right" });
    x += cols.disc;
    doc.text(formatAmount(item.taxableAmountMinor), x, y + 3, { width: cols.taxable, align: "right" });
    x += cols.taxable;
    doc.text(`${item.gstRate}%`, x, y + 3, { width: cols.gst, align: "right" });
    x += cols.gst;
    const totalItemTax = item.cgstMinor + item.sgstMinor + item.igstMinor;
    doc.text(formatAmount(totalItemTax), x, y + 3, { width: cols.tax, align: "right" });
    x += cols.tax;
    doc.text(formatAmount(item.totalMinor), x, y + 3, { width: cols.total, align: "right" });

    y += rowHeight;

    // Page break check
    if (y > 700) {
      doc.addPage();
      y = 40;
    }
  }

  // Bottom line
  doc.moveTo(leftCol, y).lineTo(leftCol + pageWidth, y).stroke();

  // =========================================================================
  // Totals
  // =========================================================================
  y += 10;
  const totalsX = leftCol + pageWidth - 200;
  const totalsValX = leftCol + pageWidth - 70;

  doc.fontSize(8).font("Helvetica");
  doc.text("Subtotal:", totalsX, y, { width: 120 });
  doc.text(formatAmount(data.subtotalMinor), totalsValX, y, { width: 70, align: "right" });

  if (data.discountMinor > 0) {
    y += 14;
    doc.text("Discount:", totalsX, y, { width: 120 });
    doc.text(`-${formatAmount(data.discountMinor)}`, totalsValX, y, { width: 70, align: "right" });
  }

  y += 14;
  doc.text("Taxable Amount:", totalsX, y, { width: 120 });
  doc.text(formatAmount(data.taxableAmountMinor), totalsValX, y, { width: 70, align: "right" });

  if (data.cgstMinor > 0) {
    y += 14;
    doc.text("CGST:", totalsX, y, { width: 120 });
    doc.text(formatAmount(data.cgstMinor), totalsValX, y, { width: 70, align: "right" });
  }
  if (data.sgstMinor > 0) {
    y += 14;
    doc.text("SGST:", totalsX, y, { width: 120 });
    doc.text(formatAmount(data.sgstMinor), totalsValX, y, { width: 70, align: "right" });
  }
  if (data.igstMinor > 0) {
    y += 14;
    doc.text("IGST:", totalsX, y, { width: 120 });
    doc.text(formatAmount(data.igstMinor), totalsValX, y, { width: 70, align: "right" });
  }

  if (data.platformFeePercent && data.platformFeeMinor) {
    y += 14;
    doc.text(`Platform Fee (${data.platformFeePercent}%):`, totalsX, y, { width: 120 });
    doc.text(formatAmount(data.platformFeeMinor), totalsValX, y, { width: 70, align: "right" });
  }

  y += 16;
  doc.moveTo(totalsX, y).lineTo(totalsX + 200, y).stroke();
  y += 4;
  doc.fontSize(10).font("Helvetica-Bold");
  doc.text("Total:", totalsX, y, { width: 120 });
  doc.text(formatAmount(data.totalAmountMinor), totalsValX, y, { width: 70, align: "right" });

  if (data.amountPaidMinor > 0) {
    y += 18;
    doc.fontSize(8).font("Helvetica");
    doc.text("Amount Paid:", totalsX, y, { width: 120 });
    doc.text(formatAmount(data.amountPaidMinor), totalsValX, y, { width: 70, align: "right" });

    y += 14;
    doc.font("Helvetica-Bold");
    doc.text("Balance Due:", totalsX, y, { width: 120 });
    doc.text(formatAmount(data.balanceDueMinor), totalsValX, y, { width: 70, align: "right" });
  }

  // =========================================================================
  // Payment history (if any)
  // =========================================================================
  if (data.payments && data.payments.length > 0) {
    y += 30;

    if (y > 680) {
      doc.addPage();
      y = 40;
    }

    doc.fontSize(9).font("Helvetica-Bold").text("Payment History", leftCol, y);
    y += 14;

    doc.fontSize(7).font("Helvetica");
    for (const payment of data.payments) {
      doc.text(
        `${formatDate(payment.paymentDate)} — ${formatAmount(payment.amountMinor)} via ${payment.paymentMode}${payment.paymentReference ? ` (Ref: ${payment.paymentReference})` : ""}`,
        leftCol, y
      );
      y += 12;
    }
  }

  // =========================================================================
  // GCP-STG-0078: QR Code (if e-invoice signed QR available)
  // =========================================================================
  if (data.qrCodeBuffer) {
    // Place QR code in bottom-left, above footer
    const qrSize = 100;
    const qrY = Math.min(y + 20, 650);

    if (qrY > 700) {
      doc.addPage();
      doc.image(data.qrCodeBuffer, leftCol, 40, { width: qrSize, height: qrSize });
      doc.fontSize(7).font("Helvetica").text("Scan for e-invoice verification", leftCol, 40 + qrSize + 2, { width: qrSize + 20 });
      if (data.irn) {
        doc.fontSize(6).text(`IRN: ${data.irn.substring(0, 32)}...`, leftCol, 40 + qrSize + 12, { width: 200 });
      }
    } else {
      doc.image(data.qrCodeBuffer, leftCol, qrY, { width: qrSize, height: qrSize });
      doc.fontSize(7).font("Helvetica").text("Scan for e-invoice verification", leftCol, qrY + qrSize + 2, { width: qrSize + 20 });
      if (data.irn) {
        doc.fontSize(6).text(`IRN: ${data.irn.substring(0, 32)}...`, leftCol, qrY + qrSize + 12, { width: 200 });
      }
    }
  }

  // =========================================================================
  // Footer
  // =========================================================================
  y = 760;
  doc.fontSize(7).font("Helvetica")
    .text("This is a computer-generated invoice and does not require a signature.", leftCol, y, {
      align: "center",
      width: pageWidth,
    });

  y += 10;
  doc.text("SUPERMANDI TECH PRIVATE LIMITED", leftCol, y, {
    align: "center",
    width: pageWidth,
  });

  doc.end();
  return doc;
}
