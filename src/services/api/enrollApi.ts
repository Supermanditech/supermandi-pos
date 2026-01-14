import { apiClient, ApiError } from "./apiClient";
import { API_BASE_URL } from "../../config/api";
import { Platform } from "react-native";

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

// Generate a unique device ID
function generateDeviceId(): string {
  return "dev_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
}

export async function enrollDevice(input: {
  enrollmentCode: string;
  deviceMeta?: DeviceMeta;
}): Promise<DeviceEnrollResponse> {
  // Build request body - field names match backend exactly
  const requestBody = {
    enrollmentCode: input.enrollmentCode,
    deviceId: generateDeviceId(),
    deviceType: input.deviceMeta?.deviceType || Platform.OS || "android",
    deviceLabel: input.deviceMeta?.label || "POS Device",
  };

  try {
    console.log("[enrollDevice] Calling gateway:", API_BASE_URL);
    const response = await apiClient.post<DeviceEnrollResponse>("/api/v1/pos/enroll", requestBody);
    console.log("[enrollDevice] Success:", response.deviceId, response.storeId);
    return response;
  } catch (error) {
    // Log detailed error for debugging
    if (error instanceof ApiError) {
      console.error("[enrollDevice] Failed:", error.status, error.message, error.payload);
    } else {
      console.error("[enrollDevice] Failed:", error);
    }
    throw error;
  }
}
