import { Platform } from "react-native";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { API_BASE_URL } from "../config/api";
import { getDeviceToken } from "./deviceSession";
import { storeScopedStorage } from "./storeScope";

import { SK_DEVICE_INFO } from "../constants/storageKeys";
const DEVICE_INFO_KEY = SK_DEVICE_INFO;

export type DeviceInfo = {
  deviceId: string;
  storeId: string | null;
  storeName: string | null;
};

// P3-001: Device metadata for backend sync
export type DeviceMeta = {
  manufacturer: string | null;
  model: string | null;
  androidVersion: string | null;
  appVersion: string | null;
};

function getAppVersion(): string {
  const v = (Constants.expoConfig as any)?.version ?? (Constants.manifest as any)?.version;
  return typeof v === "string" && v.trim() ? v.trim() : "unknown";
}

// P3-001: Get current device metadata
export function getDeviceMeta(): DeviceMeta {
  return {
    manufacturer: Device.manufacturer ?? null,
    model: Device.modelName ?? Device.deviceName ?? Constants.deviceName ?? null,
    androidVersion: Platform.OS === "android" ? String(Platform.Version) : Device.osVersion ?? null,
    appVersion: getAppVersion()
  };
}

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

// P3-001: Update device metadata on backend (called on app startup)
// This ensures devices enrolled before the expo-device fix get their metadata captured
export async function updateDeviceMetadata(): Promise<void> {
  try {
    const token = await getDeviceToken();
    if (!token) return; // Not enrolled yet

    const meta = getDeviceMeta();
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "X-Device-Token": token
    };

    const response = await fetch(`${API_BASE_URL}/api/v1/pos/devices/me`, {
      method: "PATCH",
      headers,
      body: JSON.stringify(meta)
    });

    if (!response.ok) {
      console.warn("[deviceInfo] Failed to update metadata:", response.status);
    }
  } catch (error) {
    // Non-critical, just log
    console.warn("[deviceInfo] Failed to update metadata:", error);
  }
}
