import { API_BASE_URL } from "../../config/api";
import { getDeviceToken, getDeviceSession } from "../deviceSession";
import { useSettingsStore } from "../../stores/settingsStore";

export type UiStatusResponse = {
  storeId?: string | null;
  storeName?: string | null;
  storeCode?: string | null; // STORECODE-003: Human-readable store code
  deviceId?: string | null;
  storeActive: boolean | null;
  deviceActive: boolean | null;
  pendingOutboxCount: number;
  lastSyncAt?: string | null;
  lastSeenOnline?: string | null;
  upiVpa?: string | null;
  printerOk?: boolean | null;
  scannerOk?: boolean | null;
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
      deviceId: (device.id as string) ?? (device.label as string) ?? null,
      storeActive: store.isDemo !== undefined ? true : ((store.status ?? 'active') === 'active'),
      deviceActive: (device.active as boolean) ?? true,
      pendingOutboxCount: 0,
      features: {
        scan_lookup_v2: (features.scanLookupV2 as boolean) ?? true,
        reorderEnabled: (features.reorderEnabled as boolean) ?? true,
        buyEnabled: true,
        inventoryEnabled: true,
        suppliersEnabled: true,
        ordersEnabled: true,
      },
    };
  }

  // Legacy flat format: { storeId, storeName, storeCode, deviceId, ... }
  return {
    storeId: (obj.storeId as string) ?? null,
    storeName: (obj.storeName as string) ?? null,
    storeCode: (obj.storeCode as string) ?? null,
    deviceId: (obj.deviceId as string) ?? null,
    storeActive: (obj.storeActive as boolean) ?? null,
    deviceActive: (obj.deviceActive as boolean) ?? null,
    pendingOutboxCount: (obj.pendingOutboxCount as number) ?? 0,
    features: obj.features as UiStatusResponse['features'],
  };
}

function getDefaultUiStatus(): UiStatusResponse {
  return {
    storeActive: true,
    deviceActive: true,
    pendingOutboxCount: 0,
    features: {
      reorderEnabled: true,
      inventoryEnabled: true,
      suppliersEnabled: true,
      ordersEnabled: true,
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
