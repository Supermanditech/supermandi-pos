import { apiClient } from "./apiClient";

export type DeviceEnrollResponse = {
  deviceId: string;
  storeId: string;
  deviceToken: string;
  storeActive: boolean;
};

export type DeviceMeta = {
  manufacturer?: string | null;
  model?: string | null;
  androidVersion?: string | null;
  appVersion?: string | null;
  label?: string | null;
  printingMode?: string | null;
  deviceType?: string | null;
};

export async function enrollDevice(input: {
  code: string;
  deviceMeta?: DeviceMeta;
}): Promise<DeviceEnrollResponse> {
  return apiClient.post<DeviceEnrollResponse>("/api/v1/pos/enroll", input);
}
