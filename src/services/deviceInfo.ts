import { API_BASE_URL } from "../config/api";
import { getDeviceToken } from "./deviceSession";
import { storeScopedStorage } from "./storeScope";

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
  const token = await getDeviceToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) {
    headers["X-Device-Token"] = token;
  }
  const response = await fetch(`${API_BASE_URL}/api/v1/pos/devices/me`, { headers });
  if (!response.ok) {
    throw new Error(`Device info fetch failed: ${response.status}`);
  }
  return response.json();
}

export async function getCachedDeviceInfo(): Promise<DeviceInfo | null> {
  try {
    const raw = await storeScopedStorage.getItem(DEVICE_INFO_KEY);
    if (!raw) return null;
    return normalizeDeviceInfo(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function cacheDeviceInfo(info: DeviceInfo): Promise<void> {
  const payload = JSON.stringify(info);
  await storeScopedStorage.setItem(DEVICE_INFO_KEY, payload);
}
