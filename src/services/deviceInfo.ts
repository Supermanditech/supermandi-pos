import AsyncStorage from "@react-native-async-storage/async-storage";
import { apiClient } from "./api/apiClient";

const DEVICE_INFO_KEY = "supermandi.pos.device.info.v1";

export type DeviceInfo = {
  deviceId: string;
  storeId: string | null;
  storeName: string | null;
};

function normalizeDeviceInfo(raw: unknown): DeviceInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as Record<string, unknown>;
  const deviceId = typeof candidate.deviceId === "string" ? candidate.deviceId.trim() : "";
  const storeId = typeof candidate.storeId === "string" ? candidate.storeId.trim() : null;
  const storeName = typeof candidate.storeName === "string" ? candidate.storeName.trim() : null;
  if (!deviceId) return null;
  return { deviceId, storeId, storeName };
}

export async function fetchDeviceInfo(): Promise<DeviceInfo> {
  return apiClient.get<DeviceInfo>("/api/v1/pos/devices/me");
}

export async function getCachedDeviceInfo(): Promise<DeviceInfo | null> {
  try {
    const raw = await AsyncStorage.getItem(DEVICE_INFO_KEY);
    if (!raw) return null;
    return normalizeDeviceInfo(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function cacheDeviceInfo(info: DeviceInfo): Promise<void> {
  const payload = JSON.stringify(info);
  await AsyncStorage.setItem(DEVICE_INFO_KEY, payload);
}
