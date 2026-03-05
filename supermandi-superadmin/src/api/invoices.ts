// T-071, T-072, T-073: Invoice API client for SuperAdmin
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

// =============================================================================
// Types
// =============================================================================

export type InvoiceModel = "buy_resell" | "platform_fee";
export type InvoiceType = "purchase" | "sale" | "commission" | "credit_note" | "debit_note";
export type InvoiceStatus = "draft" | "issued" | "paid" | "overdue" | "cancelled" | "void";

export interface InvoiceListItem {
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

export interface InvoiceDetail extends InvoiceListItem {
  sellerType: string;
  sellerGstin?: string;
  sellerAddress?: string;
  buyerType: string;
  buyerGstin?: string;
  buyerAddress?: string;
  taxableAmountMinor: number;
  discountMinor: number;
  cgstMinor: number;
  sgstMinor: number;
  igstMinor: number;
  platformFeePercent?: number;
  fiscalYear?: string;
  issuedAt?: string;
  paidAt?: string;
  items: InvoiceItem[];
  payments: InvoicePayment[];
}

export interface InvoiceItem {
  id: string;
  productName: string;
  productSku?: string;
  hsnCode?: string;
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
}

export interface InvoicePayment {
  id: string;
  paymentDate: string;
  amountMinor: number;
  paymentMode: string;
  paymentReference?: string;
  createdAt: string;
}

export interface CreatePurchaseInvoiceInput {
  supplierId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPriceMinor?: number;
    discountMinor?: number;
    gstRate?: number;
    hsnCode?: string;
  }>;
  purchaseOrderNumber?: string;
  referenceNote?: string;
  dueDate?: string;
}

export interface CreateSaleInvoiceInput {
  storeId: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPriceMinor?: number;
    discountMinor?: number;
    gstRate?: number;
    hsnCode?: string;
  }>;
  referenceNote?: string;
  dueDate?: string;
}

export interface CreateCommissionInvoiceInput {
  supplierId: string;
  storeId?: string;
  items: Array<{
    productId: string;
    quantity: number;
    unitPriceMinor?: number;
    discountMinor?: number;
    gstRate?: number;
    hsnCode?: string;
  }>;
  platformFeePercent: number;
  referenceNote?: string;
  dueDate?: string;
  orderId?: string;
}

export interface RecordPaymentInput {
  amountMinor: number;
  paymentMode: string;
  paymentReference?: string;
}

export interface InvoiceListFilters {
  invoiceModel?: InvoiceModel;
  invoiceType?: InvoiceType;
  status?: InvoiceStatus;
  sellerType?: string;
  sellerId?: string;
  buyerType?: string;
  buyerId?: string;
  fiscalYear?: string;
  limit?: number;
  offset?: number;
}

// =============================================================================
// API Functions
// =============================================================================

export async function listInvoices(filters: InvoiceListFilters = {}): Promise<{ data: InvoiceListItem[]; total: number }> {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([k, v]) => {
    if (v !== undefined && v !== null && v !== "") params.set(k, String(v));
  });
  const qs = params.toString();
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/invoices${qs ? `?${qs}` : ""}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to list invoices. Please try again.');
  const json = await res.json();
  return { data: json.data || [], total: json.total || 0 };
}

export async function getInvoice(invoiceId: string): Promise<InvoiceDetail> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/invoices/${invoiceId}`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to get invoice. Please try again.');
  const json = await res.json();
  return json.data;
}

export async function createPurchaseInvoice(input: CreatePurchaseInvoiceInput): Promise<InvoiceListItem> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/invoices/purchase`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create purchase invoice. Please try again.');
  const json = await res.json();
  return json.data;
}

export async function createSaleInvoice(input: CreateSaleInvoiceInput): Promise<InvoiceListItem> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/invoices/sale`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create sale invoice. Please try again.');
  const json = await res.json();
  return json.data;
}

export async function createCommissionInvoice(input: CreateCommissionInvoiceInput): Promise<InvoiceListItem> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/invoices/commission`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create commission invoice. Please try again.');
  const json = await res.json();
  return json.data;
}

export async function createSupplierSaleInvoice(input: CreateCommissionInvoiceInput): Promise<InvoiceListItem> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/invoices/supplier-sale`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to create supplier sale invoice. Please try again.');
  const json = await res.json();
  return json.data;
}

export async function issueInvoice(invoiceId: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/invoices/${invoiceId}/issue`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  if (!res.ok) throw new Error('Failed to issue invoice. Please try again.');
}

export async function recordPayment(invoiceId: string, input: RecordPaymentInput): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/invoices/${invoiceId}/payment`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error('Failed to record payment. Please try again.');
}

export async function cancelInvoice(invoiceId: string, reason?: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/invoices/${invoiceId}/cancel`, {
    method: "POST",
    headers: { ...getAuthHeaders(), "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  if (!res.ok) throw new Error('Failed to cancel invoice. Please try again.');
}

export function getInvoicePdfUrl(invoiceId: string): string {
  return `${API_BASE}/api/v1/admin/invoices/${invoiceId}/pdf`;
}

export async function downloadInvoicePdf(invoiceId: string, invoiceNumber: string): Promise<void> {
  const res = await fetchWithTimeout(`${API_BASE}/api/v1/admin/invoices/${invoiceId}/pdf`, {
    headers: getAuthHeaders(),
  });
  if (!res.ok) throw new Error('Failed to download PDF. Please try again.');

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${invoiceNumber.replace(/\//g, "-")}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
