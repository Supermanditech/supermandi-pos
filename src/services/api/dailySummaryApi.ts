// TICKET-002: Daily Summary API for POS
// Fetches today's sales summary from backend

import { apiClient } from "./apiClient";

// Types matching shared-types.ts
export interface PaymentBreakdown {
  cash: number;
  upi: number;
  card: number;
  credit: number;
}

export interface TopSellingItem {
  productId: string;
  productName: string;
  quantitySold: number;
  totalAmount: number;
}

export interface DailySummary {
  date: string;
  totalSales: number;
  totalBills: number;
  averageBillValue: number;
  paymentBreakdown: PaymentBreakdown;
  itemsSold: number;
  topSellingItems: TopSellingItem[];
}

interface DailySummaryResponse {
  success: boolean;
  data: DailySummary;
}

/**
 * Fetch today's sales summary for the current store
 * @param date Optional date in YYYY-MM-DD format (defaults to today)
 */
export async function getDailySummary(date?: string): Promise<DailySummary> {
  try {
    const path = date
      ? `/api/v1/pos/daily-summary?date=${date}`
      : "/api/v1/pos/daily-summary";
    const response = await apiClient.get<DailySummaryResponse>(path);
    return response.data;
  } catch (error) {
    console.error("[dailySummaryApi] getDailySummary failed:", error);
    throw error;
  }
}
