import { POS_API_URL } from "../../config/api";

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
    inventoryEnabled?: boolean;
    suppliersEnabled?: boolean;
    ordersEnabled?: boolean;
  };
};

export async function fetchUiStatus(): Promise<UiStatusResponse> {
  const response = await fetch(`${POS_API_URL}/api/v1/pos/ui-status`);
  if (!response.ok) {
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
  return response.json();
}
