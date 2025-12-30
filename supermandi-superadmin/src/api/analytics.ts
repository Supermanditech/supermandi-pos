import { getAdminToken } from "./authToken";

const API_BASE = import.meta.env.VITE_API_BASE_URL as string | undefined;

function requireApiBase(): string {
  if (!API_BASE) {
    throw new Error("VITE_API_BASE_URL is missing (set it in .env / hosting env vars)");
  }
  return API_BASE;
}

async function getJson<T>(path: string): Promise<T> {
  const base = requireApiBase();
  const token = getAdminToken();
  const res = await fetch(`${base}${path}`, {
    headers: {
      Accept: "application/json",
      ...(token ? { "x-admin-token": token } : {})
    }
  });

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401) {
      throw new Error("Unauthorized (set VITE_ADMIN_TOKEN to match backend ADMIN_TOKEN)");
    }
    const msg =
      (data && typeof data === "object" && "error" in data
        ? String((data as any).error)
        : `Request failed (${res.status})`);
    throw new Error(msg);
  }
  return data as T;
}

export type OverviewResponse = {
  overview: {
    storeId?: string;
    range: { from: string; to: string };
    sales_total: { pos_minor: number; consumer_minor: number; total_minor: number };
    collections_total_minor: number;
    payment_split_minor: { cash: number; upi: number; due: number };
    due_outstanding: { total_minor: number; buckets: Array<{ label: string; total_minor: number; count: number }> };
    new_products_created_count: number;
    devices: { online: number; offline: number; pending_outbox_total: number };
    profit: {
      gross_profit_minor: number;
      margin_percent: number | null;
      profit_confidence: "HIGH" | "MED" | "LOW";
      missing_cost_items_count: number;
      missing_fields: string[];
    } | null;
    profit_missing_fields: string[];
  };
};

export async function fetchAnalyticsOverview(params: { storeId?: string; from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params.storeId) qs.set("storeId", params.storeId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return getJson<OverviewResponse>(`/api/v1/admin/analytics/overview?${qs.toString()}`);
}

export type DevicesResponse = {
  devices: Array<{
    device_id: string;
    store_id: string;
    label: string | null;
    device_type: string | null;
    active: boolean;
    last_seen_online: string | null;
    last_sync_at: string | null;
    pending_outbox_count: number;
    sales_count: number;
    sales_total_minor: number;
    collections_count: number;
    collections_total_minor: number;
    offline_sales_count: number;
  }>;
  total: number;
  range: { from: string; to: string };
  storeId?: string;
};

export async function fetchAnalyticsDevices(params: { storeId?: string; from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params.storeId) qs.set("storeId", params.storeId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return getJson<DevicesResponse>(`/api/v1/admin/analytics/devices?${qs.toString()}`);
}

export type ProductsResponse = {
  products: {
    storeId?: string;
    range: { from: string; to: string };
    top_products: Array<{
      product_id: string;
      name: string;
      barcode: string;
      category: string | null;
      source: "retailer_created" | "supermandi_catalog";
      quantity: number;
      total_minor: number;
    }>;
    new_products_created_count: number;
    new_products_created: Array<{ id: string; name: string; barcode: string; created_at: string }>;
    sales_by_group: Array<{ group: string; total_minor: number; quantity: number }>;
    group_by: "category" | "hour" | "day";
    missing_fields: string[];
  };
};

export async function fetchAnalyticsProducts(params: { storeId?: string; from?: string; to?: string; groupBy?: string }) {
  const qs = new URLSearchParams();
  if (params.storeId) qs.set("storeId", params.storeId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  if (params.groupBy) qs.set("groupBy", params.groupBy);
  return getJson<ProductsResponse>(`/api/v1/admin/analytics/products?${qs.toString()}`);
}

export type PurchasesResponse = {
  purchases: {
    storeId?: string;
    range: { from: string; to: string };
    total_minor: number;
    vendor_breakdown: Array<{ supplier: string; total_minor: number }>;
    sku_cost_summary: Array<{
      product_id: string | null;
      sku: string | null;
      quantity: number;
      avg_cost_minor: number;
      last_cost_minor: number | null;
    }>;
  };
};

export async function fetchAnalyticsPurchases(params: { storeId?: string; from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params.storeId) qs.set("storeId", params.storeId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return getJson<PurchasesResponse>(`/api/v1/admin/analytics/purchases?${qs.toString()}`);
}

export type ConsumerSalesResponse = {
  consumer_sales: {
    storeId?: string;
    range: { from: string; to: string };
    total_minor: number;
    payment_split_minor: { cash: number; upi: number; due: number };
    status_counts: Array<{ status: string; count: number }>;
  };
};

export async function fetchAnalyticsConsumerSales(params: { storeId?: string; from?: string; to?: string }) {
  const qs = new URLSearchParams();
  if (params.storeId) qs.set("storeId", params.storeId);
  if (params.from) qs.set("from", params.from);
  if (params.to) qs.set("to", params.to);
  return getJson<ConsumerSalesResponse>(`/api/v1/admin/analytics/consumer-sales?${qs.toString()}`);
}
