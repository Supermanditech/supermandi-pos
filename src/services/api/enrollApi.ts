import { apiClient } from "./apiClient";
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
  code: string;
  deviceMeta?: DeviceMeta;
}): Promise<DeviceEnrollResponse> {
  // Try the main API first
  try {
    return await apiClient.post<DeviceEnrollResponse>("/api/v1/pos/enroll", input);
  } catch (mainError) {
    console.log("[enrollDevice] Main API failed, trying enrollment service on port 3009");

    // Fallback to enrollment service on port 3009
    const enrollmentUrl = API_BASE_URL.replace(":3000", ":3009").replace(/\/$/, "");
    const deviceId = generateDeviceId();

    const response = await fetch(`${enrollmentUrl}/api/v1/pos/enroll`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        enrollmentCode: input.code,
        deviceId,
        deviceType: input.deviceMeta?.deviceType || Platform.OS || "android",
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Enrollment failed: ${response.status}`);
    }

    const data = await response.json();
    return {
      deviceId: data.deviceId,
      storeId: data.storeId,
      deviceToken: data.deviceToken,
      storeActive: true,
    };
  }
}
