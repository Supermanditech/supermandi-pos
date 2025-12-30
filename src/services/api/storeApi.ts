import { apiClient, ApiError } from "./apiClient";
import { getDeviceStoreId } from "../deviceSession";

export type StoreStatusResponse = {
  storeId: string;
  active: boolean;
  name?: string;
};

export async function fetchStoreStatus(storeId?: string): Promise<StoreStatusResponse> {
  const resolvedStoreId = storeId ?? (await getDeviceStoreId());
  if (!resolvedStoreId) {
    throw new ApiError(401, "device_not_enrolled");
  }
  return apiClient.get<StoreStatusResponse>(`/api/v1/pos/stores/${resolvedStoreId}/status`);
}
