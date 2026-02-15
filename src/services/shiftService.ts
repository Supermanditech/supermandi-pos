// T-192: Shift Management service — API calls for shift start/end and history
import { apiClient } from "./api/apiClient";

// =============================================================================
// TYPES
// =============================================================================

export interface Shift {
  id: string;
  staffId: string;
  staffName: string;
  startedAt: string;
  endedAt: string | null;
  openingCashMinor: number;
  closingCashMinor: number | null;
  expectedCashMinor: number | null;
  varianceMinor: number | null;
  salesCount: number;
  salesTotalMinor: number;
  salesByPaymentType: {
    cashMinor: number;
    upiMinor: number;
    dueMinor: number;
    cardMinor: number;
  } | null;
  notes: string | null;
  status: "ACTIVE" | "CLOSED";
}

export interface StartShiftRequest {
  openingCashMinor: number;
}

export interface EndShiftRequest {
  closingCashMinor: number;
  notes?: string;
}

interface CurrentShiftResponse {
  shift: Shift | null;
}

interface StartShiftResponse {
  shift: Shift;
}

interface EndShiftResponse {
  shift: Shift;
}

interface ShiftHistoryResponse {
  shifts: Shift[];
}

// =============================================================================
// API CALLS
// =============================================================================

export async function getCurrentShift(): Promise<Shift | null> {
  const response = await apiClient.get<CurrentShiftResponse>(
    `/api/v1/pos/shifts/current`
  );
  return response.shift;
}

export async function startShift(data: StartShiftRequest): Promise<Shift> {
  const response = await apiClient.post<StartShiftResponse>(
    `/api/v1/pos/shifts/start`,
    data
  );
  return response.shift;
}

export async function endShift(shiftId: string, data: EndShiftRequest): Promise<Shift> {
  const response = await apiClient.post<EndShiftResponse>(
    `/api/v1/pos/shifts/${encodeURIComponent(shiftId)}/end`,
    data
  );
  return response.shift;
}

export async function getShiftHistory(): Promise<Shift[]> {
  const response = await apiClient.get<ShiftHistoryResponse>(
    `/api/v1/pos/shifts/history`
  );
  return response.shifts;
}
