import { API_BASE_URL } from "../../config/api";
import { getDeviceToken, getDeviceSession } from "../deviceSession";
import { getDeviceMeta } from "../deviceInfo";
import { useSettingsStore } from "../../stores/settingsStore";
import { ApiError } from "./apiClient";

export type UiStatusResponse = {
  storeId?: string | null;
  storeName?: string | null;
  storeCode?: string | null; // STORECODE-003: Human-readable store code
  // REG-AUTH-401: Store status for LIMITED MODE display
  storeStatus?: string | null;
  deviceId?: string | null;
  storeActive: boolean | null;
  deviceActive: boolean | null;
  pendingOutboxCount: number;
  lastSyncAt?: string | null;
  lastSeenOnline?: string | null;
  upiVpa?: string | null;
  allowedPaymentMethods?: string[] | null; // SA-P1-006: Payment methods allowed for this store
  printerOk?: boolean | null;
  scannerOk?: boolean | null;
  // SA-P2-003: Minimum app version enforcement
  forceUpdate?: boolean;
  minAppVersion?: string | null;
  features?: {
    scan_lookup_v2?: boolean;
    reorderEnabled?: boolean;
    buyEnabled?: boolean;
    inventoryEnabled?: boolean;
    suppliersEnabled?: boolean;
    ordersEnabled?: boolean;
    creditEnabled?: boolean; // SM-022: Credit/Loans feature flag
    bnplEnabled?: boolean; // GL-AUD-007: BNPL badge on BUY screen
  };
};

// POS-V5: Parse both old and new backend response formats
function parseUiStatusResponse(raw: unknown): UiStatusResponse {
  if (!raw || typeof raw !== 'object') {
    return getDefaultUiStatus();
  }
  const obj = raw as Record<string, unknown>;

  // Check for POS v5 nested format: { success: true, data: { store: {...}, device: {...}, features: {...} } }
  if (obj.success === true && obj.data && typeof obj.data === 'object') {
    const data = obj.data as Record<string, unknown>;
    const store = (data.store as Record<string, unknown>) ?? {};
    const device = (data.device as Record<string, unknown>) ?? {};
    const features = (data.features as Record<string, unknown>) ?? {};

    return {
      storeId: (store.id as string) ?? null,
      storeName: (store.name as string) ?? null,
      storeCode: (store.code as string) ?? null,
      // REG-AUTH-401: Store status for LIMITED MODE display
      storeStatus: store.status ? String(store.status).toUpperCase() : null,
      deviceId: (device.id as string) ?? (device.label as string) ?? null,
      storeActive: store.isDemo !== undefined ? true : ((store.status ?? 'active') === 'active'),
      deviceActive: (device.active as boolean) ?? true,
      pendingOutboxCount: 0,
      // SA-P1-006: Parse allowed payment methods from store data
      allowedPaymentMethods: Array.isArray(store.allowedPaymentMethods) ? store.allowedPaymentMethods as string[] : null,
      // SA-P2-003: Version enforcement from nested format
      forceUpdate: (data.forceUpdate as boolean) ?? false,
      minAppVersion: (data.minAppVersion as string) ?? null,
      features: {
        scan_lookup_v2: (features.scanLookupV2 as boolean) ?? true,
        reorderEnabled: (features.reorderEnabled as boolean) ?? true,
        buyEnabled: (features.buyEnabled as boolean) ?? true,
        inventoryEnabled: true,
        suppliersEnabled: true,
        ordersEnabled: true,
        // CA-1.4-005: Credit enabled from backend
        creditEnabled: (features.creditEnabled as boolean) ?? false,
        bnplEnabled: (features.bnplEnabled as boolean) ?? false,
      },
    };
  }

  // Legacy flat format: { storeId, storeName, storeCode, storeStatus, deviceId, ... }
  return {
    storeId: (obj.storeId as string) ?? null,
    storeName: (obj.storeName as string) ?? null,
    storeCode: (obj.storeCode as string) ?? null,
    // REG-AUTH-401: Store status for LIMITED MODE display
    storeStatus: obj.storeStatus ? String(obj.storeStatus).toUpperCase() : null,
    deviceId: (obj.deviceId as string) ?? null,
    storeActive: (obj.storeActive as boolean) ?? null,
    deviceActive: (obj.deviceActive as boolean) ?? null,
    pendingOutboxCount: (obj.pendingOutboxCount as number) ?? 0,
    // SA-P1-006: Parse allowed payment methods from legacy flat format
    allowedPaymentMethods: Array.isArray(obj.allowedPaymentMethods) ? obj.allowedPaymentMethods as string[] : null,
    // SA-P2-003: Version enforcement from flat format
    forceUpdate: (obj.forceUpdate as boolean) ?? false,
    minAppVersion: (obj.minAppVersion as string) ?? null,
    features: (obj.features as UiStatusResponse['features']) ?? getDefaultUiStatus().features,
  };
}

function getDefaultUiStatus(): UiStatusResponse {
  return {
    storeActive: true,
    deviceActive: true,
    pendingOutboxCount: 0,
    // SA-P2-003: Default no enforcement when offline/error
    forceUpdate: false,
    // SA-P1-006: Default all payment methods enabled
    allowedPaymentMethods: ['CASH', 'UPI', 'DUE'],
    features: {
      reorderEnabled: true,
      inventoryEnabled: true,
      suppliersEnabled: true,
      ordersEnabled: true,
      // CA-1.4-005: Default credit disabled until backend confirms
      creditEnabled: false,
      bnplEnabled: false,
    },
  };
}

export async function fetchUiStatus(): Promise<UiStatusResponse> {
  const deviceToken = await getDeviceToken();
  const tokenSuffix = deviceToken ? deviceToken.slice(-6) : "none";
  console.log("[uiStatus] Fetching with token:", tokenSuffix);

  // If no token, return defaults with local store info
  if (!deviceToken) {
    console.log("[uiStatus] No token, returning defaults with local store info");
    const session = await getDeviceSession();
    const settings = useSettingsStore.getState();
    return {
      ...getDefaultUiStatus(),
      storeId: session?.storeId ?? null,
      storeName: settings.storeName ?? null,
      storeCode: settings.storeCode ?? null,
      deviceId: session?.deviceId ?? null,
    };
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/v1/pos/ui-status`, {
      headers: {
        "X-Device-Token": deviceToken,
        "X-App-Version": getDeviceMeta().appVersion ?? "unknown",
      },
    });

    if (!response.ok) {
      console.log("[uiStatus] Failed:", response.status);
      // Fall back to local session data
      const session = await getDeviceSession();
      const settings = useSettingsStore.getState();
      return {
        ...getDefaultUiStatus(),
        storeId: session?.storeId ?? null,
        storeName: settings.storeName ?? null,
        storeCode: settings.storeCode ?? null,
        deviceId: session?.deviceId ?? null,
      };
    }

    const data = await response.json();
    const parsed = parseUiStatusResponse(data);
    console.log("[uiStatus] Response:", parsed.storeId, parsed.storeName, parsed.storeCode);
    return parsed;
  } catch (err) {
    console.error("[uiStatus] Error:", err);
    // Fall back to local session data on network error
    const session = await getDeviceSession();
    const settings = useSettingsStore.getState();
    return {
      ...getDefaultUiStatus(),
      storeId: session?.storeId ?? null,
      storeName: settings.storeName ?? null,
      storeCode: settings.storeCode ?? null,
      deviceId: session?.deviceId ?? null,
    };
  }
}

/**
 * SCR-AUDIT-310: Strict version of fetchUiStatus that THROWS on errors.
 *
 * Used by gate screens (ForceUpdate, DeviceBlocked) where returning safe defaults
 * would incorrectly let the user bypass the security gate.
 *
 * The regular fetchUiStatus() returns defaults on errors (correct for PosRootLayout
 * offline mode). This version throws so callers can show an error alert instead
 * of navigating away from the gate.
 */
export async function fetchUiStatusStrict(): Promise<UiStatusResponse> {
  const deviceToken = await getDeviceToken();
  if (!deviceToken) {
    throw new ApiError(401, "DEVICE_SESSION_MISSING");
  }

  const response = await fetch(`${API_BASE_URL}/api/v1/pos/ui-status`, {
    headers: {
      "X-Device-Token": deviceToken,
      "X-App-Version": getDeviceMeta().appVersion ?? "unknown",
    },
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "");
    let message = `Server error (${response.status})`;
    try {
      const data = JSON.parse(text);
      if (data?.error) {
        message = typeof data.error === "string" ? data.error : data.error?.code || message;
      }
    } catch {
      // JSON parse failed — use default message
    }
    throw new ApiError(response.status, message);
  }

  const data = await response.json();
  return parseUiStatusResponse(data);
}
