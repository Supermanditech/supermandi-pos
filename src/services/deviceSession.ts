import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "supermandi.device.session.v1";

export type DeviceSession = {
  deviceId: string;
  storeId: string;
  deviceToken: string;
  deviceType?: string | null;
};

function normalizeSession(value: unknown): DeviceSession | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const deviceId = typeof candidate.deviceId === "string" ? candidate.deviceId.trim() : "";
  const storeId = typeof candidate.storeId === "string" ? candidate.storeId.trim() : "";
  const deviceToken = typeof candidate.deviceToken === "string" ? candidate.deviceToken.trim() : "";
  const deviceType = typeof candidate.deviceType === "string" ? candidate.deviceType.trim() : null;
  if (!deviceId || !storeId || !deviceToken) return null;
  return { deviceId, storeId, deviceToken, deviceType };
}

async function secureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getDeviceSession(): Promise<DeviceSession | null> {
  const secureAvailable = await secureStoreAvailable();
  if (secureAvailable) {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (raw) {
        const parsed = normalizeSession(JSON.parse(raw));
        if (parsed) return parsed;
      }
    } catch {
      // Fall through to AsyncStorage
    }
  }
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveDeviceSession(session: DeviceSession): Promise<void> {
  const secureAvailable = await secureStoreAvailable();
  const payload = JSON.stringify(session);
  if (secureAvailable) {
    try {
      await SecureStore.setItemAsync(SESSION_KEY, payload);
      return;
    } catch {
      // Fall back to AsyncStorage
    }
  }
  await AsyncStorage.setItem(SESSION_KEY, payload);
}

export async function clearDeviceSession(): Promise<void> {
  const secureAvailable = await secureStoreAvailable();
  if (secureAvailable) {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      // Ignore and still clear AsyncStorage
    }
  }
  await AsyncStorage.removeItem(SESSION_KEY);
}

export async function getDeviceToken(): Promise<string | null> {
  const session = await getDeviceSession();
  return session?.deviceToken ?? null;
}

export async function getDeviceStoreId(): Promise<string | null> {
  const session = await getDeviceSession();
  return session?.storeId ?? null;
}

export async function getDeviceIdFromSession(): Promise<string | null> {
  const session = await getDeviceSession();
  return session?.deviceId ?? null;
}
