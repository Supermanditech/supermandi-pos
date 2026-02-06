import { apiClient, ApiError } from "./apiClient";
import { API_BASE_URL } from "../../config/api";
import AsyncStorage from "@react-native-async-storage/async-storage";

// DEV-071: Device enrollment with multi-use codes and idempotent enrollment support
// GL-RJ-006: Added duplicate label detection

export type DeviceEnrollResponse = {
  deviceId: string;
  storeId: string;
  storeName?: string;  // GO-LIVE: Store name from SuperAdmin
  storeCode?: string;  // GO-LIVE: Human-readable store code
  deviceToken: string;
  storeActive: boolean;
  reEnrolled?: boolean;
  // ISSUE-MICRO-030: Number of active POS devices for this store (server may add this field)
  activeDeviceCount?: number;
};

export type DeviceMeta = {
  manufacturer?: string | null;
  model?: string | null;
  androidVersion?: string | null;
  appVersion?: string | null;
  label?: string | null;
  printingMode?: string | null;
  deviceType?: string | null;
  deviceFingerprint?: string | null;
};

// DEV-071: Generate or retrieve persistent device fingerprint for idempotent enrollment
const FINGERPRINT_KEY = "supermandi.device_fingerprint";

async function getOrCreateDeviceFingerprint(): Promise<string> {
  let fingerprint = await AsyncStorage.getItem(FINGERPRINT_KEY);
  if (!fingerprint) {
    // Generate a stable fingerprint (UUID-like)
    fingerprint = "fp_" + Math.random().toString(36).substring(2, 15) + Date.now().toString(36);
    await AsyncStorage.setItem(FINGERPRINT_KEY, fingerprint);
  }
  return fingerprint;
}

export async function enrollDevice(input: {
  enrollmentCode: string;
  deviceMeta?: DeviceMeta;
}): Promise<DeviceEnrollResponse> {
  // DEV-071: Get persistent device fingerprint for idempotent enrollment
  const deviceFingerprint = await getOrCreateDeviceFingerprint();

  // Build request body with BOTH field names for backward/forward compatibility
  // - Old servers expect: enrollmentCode
  // - New servers expect: code
  // Send both until all servers are upgraded (safe to remove enrollmentCode after v3.1)
  const requestBody = {
    code: input.enrollmentCode,
    enrollmentCode: input.enrollmentCode, // backward compat with old servers
    deviceMeta: {
      ...input.deviceMeta,
      deviceFingerprint,
    },
  };

  try {
    console.log("[enrollDevice] Calling gateway:", API_BASE_URL);
    const response = await apiClient.post<DeviceEnrollResponse>("/api/v1/pos/enroll", requestBody);
    console.log("[enrollDevice] Success:", response.deviceId, response.storeId, response.reEnrolled ? "(re-enrolled)" : "");
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

// =============================================================================
// GL-RJ-006: Duplicate Label Detection
// =============================================================================

export type DeviceLabelInfo = {
  label: string;
  deviceId: string;
  status: 'active' | 'inactive';
  lastSeen?: string;
};

export type CheckDuplicateLabelResponse = {
  isDuplicate: boolean;
  existingDevice?: DeviceLabelInfo;
  suggestions?: string[];
};

/**
 * GL-RJ-006: Check if a device label already exists for the store
 * This is called before enrollment to prevent duplicate labels
 */
export async function checkDuplicateLabel(input: {
  enrollmentCode: string;
  label: string;
}): Promise<CheckDuplicateLabelResponse> {
  try {
    const response = await apiClient.post<CheckDuplicateLabelResponse>(
      "/api/v1/pos/enroll/check-label",
      {
        code: input.enrollmentCode,
        label: input.label.trim(),
      }
    );
    return response;
  } catch (error) {
    // On error, allow enrollment to proceed (don't block on label check failure)
    console.warn("[checkDuplicateLabel] Check failed, allowing enrollment:", error);
    return { isDuplicate: false };
  }
}
