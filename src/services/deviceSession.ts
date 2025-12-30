import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "supermandi.device.session.v1";

export type DeviceSession = {
  deviceId: string;
  storeId: string;
  deviceToken: string;
};

function normalizeSession(value: unknown): DeviceSession | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Record<string, unknown>;
  const deviceId = typeof candidate.deviceId === "string" ? candidate.deviceId.trim() : "";
  const storeId = typeof candidate.storeId === "string" ? candidate.storeId.trim() : "";
  const deviceToken = typeof candidate.deviceToken === "string" ? candidate.deviceToken.trim() : "";
  if (!deviceId || !storeId || !deviceToken) return null;
  return { deviceId, storeId, deviceToken };
}

async function secureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getDeviceSession(): Promise<DeviceSession | null> {
  if (!(await secureStoreAvailable())) return null;
  try {
    const raw = await SecureStore.getItemAsync(SESSION_KEY);
    if (!raw) return null;
    return normalizeSession(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function saveDeviceSession(session: DeviceSession): Promise<void> {
  if (!(await secureStoreAvailable())) {
    throw new Error("secure storage unavailable");
  }
  const payload = JSON.stringify(session);
  await SecureStore.setItemAsync(SESSION_KEY, payload);
}

export async function clearDeviceSession(): Promise<void> {
  if (!(await secureStoreAvailable())) return;
  await SecureStore.deleteItemAsync(SESSION_KEY);
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
