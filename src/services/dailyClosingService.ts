// T-191: Daily Closing / Z-Report service — API calls for daily cash reconciliation
import { apiClient } from "./api/apiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface DailyClosingSummary {
  date: string; // YYYY-MM-DD
  openingCashMinor: number;
  totalSalesMinor: number;
  salesByPaymentType: {
    cashMinor: number;
    upiMinor: number;
    dueMinor: number;
    cardMinor: number;
  };
  refundsMinor: number;
  expectedCashMinor: number;
  transactionCount: number;
}

export interface DailyClosingRecord {
  id: string;
  date: string; // YYYY-MM-DD
  openingCashMinor: number;
  totalSalesMinor: number;
  expectedCashMinor: number;
  actualCashMinor: number;
  varianceMinor: number;
  closedByStaffId: string;
  closedByStaffName: string;
  notes?: string | null;
  closedAt: string;
}

export interface CloseDayRequest {
  date: string; // YYYY-MM-DD
  actualCashMinor: number;
  notes?: string;
}

interface DailyClosingSummaryResponse {
  summary: DailyClosingSummary;
}

interface CloseDayResponse {
  record: DailyClosingRecord;
}

interface DailyClosingHistoryResponse {
  records: DailyClosingRecord[];
}

// =============================================================================
// API CALLS
// =============================================================================

export async function getDailyClosingSummary(date?: string): Promise<DailyClosingSummary> {
  const params = date ? `?date=${encodeURIComponent(date)}` : "";
  const response = await apiClient.get<DailyClosingSummaryResponse>(
    `/api/v1/pos/daily-closing/summary${params}`
  );
  return response.summary;
}

export async function closeDay(data: CloseDayRequest): Promise<DailyClosingRecord> {
  const response = await apiClient.post<CloseDayResponse>(
    `/api/v1/pos/daily-closing/close`,
    data
  );
  return response.record;
}

export async function getDailyClosingHistory(): Promise<DailyClosingRecord[]> {
  const response = await apiClient.get<DailyClosingHistoryResponse>(
    `/api/v1/pos/daily-closing/history`
  );
  return response.records;
}
