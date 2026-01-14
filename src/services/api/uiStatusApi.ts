import { API_BASE_URL } from "../../config/api";
import { getDeviceToken } from "../deviceSession";

export type UiStatusResponse = {
  storeId?: string | null;
  storeName?: string | null;
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
  };
};

export async function fetchUiStatus(): Promise<UiStatusResponse> {
  const deviceToken = await getDeviceToken();
  const tokenSuffix = deviceToken ? deviceToken.slice(-6) : "none";
  console.log("[uiStatus] Fetching with token:", tokenSuffix);

  const response = await fetch(`${API_BASE_URL}/api/v1/pos/ui-status`, {
    headers: {
      ...(deviceToken ? { "X-Device-Token": deviceToken } : {}),
    },
  });

  if (!response.ok) {
    console.log("[uiStatus] Failed:", response.status);
    // Return default status if service unavailable
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

  const data = await response.json();
  console.log("[uiStatus] Response:", data.storeId, data.storeName);
  return data;
}
