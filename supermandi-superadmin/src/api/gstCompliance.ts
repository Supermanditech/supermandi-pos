// T-235: GST Compliance API client for SuperAdmin
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '') as string;
import { getAuthHeaders, fetchWithTimeout } from "./authToken";

// Types
export interface GstSummary {
  storeId: string;
  month: string;
  totalSales: number;
  totalPurchases: number;
  cgstCollected: number;
  sgstCollected: number;
  igstCollected: number;
  cessCollected: number;
  totalTaxCollected: number;
  inputCgst: number;
  inputSgst: number;
  inputIgst: number;
  inputCess: number;
  totalInputCredit: number;
  netPayable: number;
  invoiceCount: number;
  stateBreakdown: Array<{ state: string; taxableValue: number; cgst: number; sgst: number; igst: number }>;
  supplierBreakdown: Array<{ supplierName: string; gstin: string; taxableValue: number; totalTax: number }>;
}

export interface StoreGstOverview {
  storeId: string;
  storeName: string;
  storeCode: string;
  gstin: string | null;
  totalSales: number;
  totalTax: number;
  invoiceCount: number;
  lastFiled: string | null;
}

export interface GstStoresOverviewResponse {
  stores: StoreGstOverview[];
  totals: { totalSales: number; totalTax: number; totalInvoices: number };
  filingDeadline: string;
}

function base(): string {
  return API_BASE || "";
}

// Backend expects ?month=M&year=YYYY, frontend uses YYYY-MM format
function parseMonthYear(monthStr?: string): string {
  if (!monthStr) return "";
  const [year, month] = monthStr.split("-");
  if (year && month) return `?month=${parseInt(month)}&year=${parseInt(year)}`;
  return "";
}

export async function fetchGstSummary(storeId: string, month?: string): Promise<GstSummary> {
  const qs = parseMonthYear(month);
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/gst/summary/${encodeURIComponent(storeId)}${qs}`, {
    headers: getAuthHeaders(),
  });
  // R7.SA.009: Use human-readable error messages instead of HTTP status codes
  if (!res.ok) throw new Error(res.status === 404 ? "GST data not found for this store and period" : res.status === 403 ? "Access denied" : "Failed to load GST summary");
  const json = await res.json();
  // Backend returns data wrapper or direct — handle both
  const raw = json.data || json;
  return {
    storeId: raw.storeId || storeId,
    month: raw.month || month || "",
    totalSales: raw.totalTaxable || raw.totalAmount || 0,
    totalPurchases: 0,
    cgstCollected: raw.cgst || 0,
    sgstCollected: raw.sgst || 0,
    igstCollected: raw.igst || 0,
    cessCollected: raw.cess || 0,
    totalTaxCollected: raw.totalTax || 0,
    inputCgst: 0, inputSgst: 0, inputIgst: 0, inputCess: 0,
    totalInputCredit: 0,
    netPayable: raw.totalTax || 0,
    invoiceCount: raw.totalInvoices || 0,
    stateBreakdown: raw.stateBreakdown || [],
    supplierBreakdown: raw.supplierBreakdown || [],
  };
}

export async function exportGstr1(storeId: string, month?: string): Promise<Blob> {
  const qs = parseMonthYear(month);
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/gst/summary/${encodeURIComponent(storeId)}/export${qs}`, {
    headers: getAuthHeaders(),
  });
  // R7.SA.009: Human-readable error message instead of HTTP status code
  if (!res.ok) throw new Error(res.status === 404 ? "No GST data available for export in this period" : res.status === 403 ? "Access denied" : "Failed to export GSTR-1");
  return res.blob();
}

export async function fetchGstStoresOverview(month?: string): Promise<GstStoresOverviewResponse> {
  const qs = parseMonthYear(month);
  const res = await fetchWithTimeout(`${base()}/api/v1/admin/gst/stores-overview${qs}`, {
    headers: getAuthHeaders(),
  });
  // R7.SA.009: Human-readable error message instead of HTTP status code
  if (!res.ok) throw new Error(res.status === 403 ? "Access denied" : "Failed to load GST stores overview");
  const json = await res.json();
  // Backend returns { success, period, totals, stores, filingDeadline } at top level
  const raw = json.data || json;
  return {
    stores: (raw.stores || []).map((s: Record<string, unknown>) => ({
      storeId: s.storeId || "",
      storeName: s.storeName || "",
      storeCode: s.storeCode || "",
      gstin: s.gstin || null,
      totalSales: (s.totalTaxable as number) || (s.totalAmount as number) || 0,
      totalTax: (s.totalTax as number) || 0,
      invoiceCount: (s.totalInvoices as number) || 0,
      lastFiled: (s.generatedAt as string) || null,
    })),
    totals: {
      totalSales: raw.totals?.totalTaxable || raw.totals?.totalAmount || 0,
      totalTax: raw.totals?.totalTax || 0,
      totalInvoices: raw.totals?.totalInvoices || 0,
    },
    filingDeadline: raw.filingDeadline || "",
  };
}
