// T-303→T-316: POS AI API client
// Calls the AI intelligence endpoints

import { API_BASE_URL } from "../../config/api";
import { getDeviceToken } from "../deviceSession";

async function aiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const token = await getDeviceToken();
  const res = await fetch(`${API_BASE_URL}/api/v1${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options?.headers,
    },
  });
  if (!res.ok) throw new Error(`AI API ${res.status}`);
  return res.json();
}

// T-307: Alerts
export interface Alert {
  id: string; storeId: string; alertType: string; severity: string;
  title: string; message: string; metadata: Record<string, unknown>;
  isRead: boolean; isDismissed: boolean; createdAt: string;
}

export async function getAlerts(opts?: { unreadOnly?: boolean; limit?: number }): Promise<{ alerts: Alert[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.unreadOnly) params.set('unreadOnly', 'true');
  if (opts?.limit) params.set('limit', String(opts.limit));
  return aiFetch(`/pos/ai/alerts?${params}`);
}

export async function getUnreadAlertCount(): Promise<number> {
  const res = await aiFetch<{ count: number }>('/pos/ai/alerts/count');
  return res.count;
}

export async function markAlertRead(alertId: string): Promise<void> {
  await aiFetch(`/pos/ai/alerts/${alertId}/read`, { method: 'PATCH' });
}

export async function dismissAlert(alertId: string): Promise<void> {
  await aiFetch(`/pos/ai/alerts/${alertId}/dismiss`, { method: 'PATCH' });
}

// T-308: Forecasts
export interface Forecast {
  productId: string; productName: string; forecastDate: string;
  predictedQty: number; confidence: number; currentStock: number;
  daysUntilStockout: number | null;
}

export async function getForecasts(opts?: { productId?: string; days?: number }): Promise<{ forecasts: Forecast[] }> {
  const params = new URLSearchParams();
  if (opts?.productId) params.set('productId', opts.productId);
  if (opts?.days) params.set('days', String(opts.days));
  return aiFetch(`/pos/ai/forecasts?${params}`);
}

// T-303: Recommendations
export interface ProductRec {
  productId: string; productName: string; recommendationType: string;
  score: number; currentStock: number; sellPrice: number;
}

export async function getProductRecommendations(productId: string): Promise<{ recommendations: ProductRec[] }> {
  return aiFetch(`/pos/ai/recommendations/${productId}`);
}

export async function getTrendingProducts(): Promise<{ trending: ProductRec[] }> {
  return aiFetch('/pos/ai/trending');
}

// T-310: Auto closing config
export interface AutoClosingConfig {
  enabled: boolean; closeTime: string; lastAutoCloseDate: string | null;
}

export async function getAutoClosingConfig(): Promise<AutoClosingConfig> {
  return aiFetch('/pos/ai/auto-closing/config');
}

export async function updateAutoClosingConfig(config: { enabled?: boolean; closeTime?: string }): Promise<void> {
  await aiFetch('/pos/ai/auto-closing/config', { method: 'PATCH', body: JSON.stringify(config) });
}

// T-311: Price comparisons
export interface PriceComparison {
  productId: string; productName: string; currentPrice: number;
  bestPrice: number; maxSavings: number; maxSavingsPercent: number;
  suppliers: Array<{ supplierId: string; supplierName: string; price: number; savings: number }>;
}

export async function getPriceComparisons(opts?: { onlyWithSavings?: boolean; limit?: number }): Promise<{ comparisons: PriceComparison[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.onlyWithSavings) params.set('onlyWithSavings', 'true');
  if (opts?.limit) params.set('limit', String(opts.limit));
  return aiFetch(`/pos/ai/price-comparisons?${params}`);
}

// T-313: Slow movers
export interface SlowMover {
  productId: string; productName: string; currentStock: number;
  salesLast30Days: number; trend: string; recommendation: string;
}

export async function getSlowMovers(): Promise<{ slowMovers: SlowMover[]; total: number }> {
  return aiFetch('/pos/ai/slow-movers');
}

// T-314: Expiry tracking
export interface ExpiryItem {
  productId: string; productName: string; expiryDate: string;
  daysUntilExpiry: number; currentStock: number; urgency: string; suggestedAction: string;
}

export async function getExpiringProducts(opts?: { daysAhead?: number }): Promise<{ items: ExpiryItem[]; total: number }> {
  const params = new URLSearchParams();
  if (opts?.daysAhead) params.set('daysAhead', String(opts.daysAhead));
  return aiFetch(`/pos/ai/expiring?${params}`);
}

export async function updateProductExpiry(productId: string, expiryDate: string | null): Promise<void> {
  await aiFetch(`/pos/ai/expiry/${productId}`, { method: 'PATCH', body: JSON.stringify({ expiryDate }) });
}
