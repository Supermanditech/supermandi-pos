import { apiClient } from "./apiClient";

export type UiStatusResponse = {
  storeId?: string;
  deviceId?: string;
  storeActive: boolean;
  deviceActive: boolean;
  pendingOutboxCount: number;
  lastSyncAt?: string | null;
  lastSeenOnline?: string | null;
  printerOk?: boolean | null;
  scannerOk?: boolean | null;
};

export async function fetchUiStatus(): Promise<UiStatusResponse> {
  return apiClient.get<UiStatusResponse>("/api/v1/pos/ui-status");
}
