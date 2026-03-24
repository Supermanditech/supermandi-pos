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
  upiVpa?: string | null; // #329-332: Payment setup — null means not set yet
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
import { SK_DEVICE_FINGERPRINT } from "../../constants/storageKeys";
const FINGERPRINT_KEY = SK_DEVICE_FINGERPRINT;

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
    // ENROLLAPI-DEV-GUARDS-MISSING: guard API URL logging to prevent Logcat leakage in release builds
    if (__DEV__) console.log("[enrollDevice] Calling gateway:", API_BASE_URL);
    const response = await apiClient.post<DeviceEnrollResponse>("/api/v1/pos/enroll", requestBody);
    if (__DEV__) console.log("[enrollDevice] Success:", response.deviceId, response.storeId, response.reEnrolled ? "(re-enrolled)" : "");
    return response;
  } catch (error) {
    // Log detailed error for debugging (dev only — avoids leaking error codes in Logcat)
    if (__DEV__) {
      if (error instanceof ApiError) {
        console.error("[enrollDevice] Failed:", error.status, error.message, error.payload);
      } else {
        console.error("[enrollDevice] Failed:", error);
      }
    }
    throw error;
  }
}

// #329: GL-RJ-006 checkDuplicateLabel removed — simplified activation flow has no device labels

// =============================================================================
// Phone-based activation lookup (#329-332)
// =============================================================================
export type LookupActivationResponse = {
  code: string;
  storeName: string;
};

export async function lookupActivation(phone: string): Promise<LookupActivationResponse> {
  return apiClient.post<LookupActivationResponse>("/api/v1/pos/lookup-activation", { phone });
}

// =============================================================================
// Payment settings (#329-332)
// =============================================================================
export type PaymentSettingsInput = {
  upiVpa?: string;
  bankAccountNumber?: string;
  bankIfsc?: string;
};

export type PaymentSettingsResponse = {
  success: boolean;
  upiVpa: string | null;
  bankAccountNumber: string | null;
  bankIfsc: string | null;
};

export async function updatePaymentSettings(
  input: PaymentSettingsInput
): Promise<PaymentSettingsResponse> {
  return apiClient.patch<PaymentSettingsResponse>("/api/v1/pos/store/payment-settings", input);
}
