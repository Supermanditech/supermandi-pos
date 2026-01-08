import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDeviceStoreId } from "./deviceSession";

const STORE_SCOPE_FALLBACK = "unassigned";

export function normalizeStoreScope(storeId?: string | null): string {
  const raw = typeof storeId === "string" ? storeId.trim() : "";
  if (!raw) return STORE_SCOPE_FALLBACK;
  const safe = raw.replace(/[^a-zA-Z0-9_-]/g, "_");
  return safe || STORE_SCOPE_FALLBACK;
}

export function buildStoreScopedKey(baseKey: string, storeId?: string | null): string {
  const scope = normalizeStoreScope(storeId);
  return `${baseKey}.${scope}`;
}

export async function getStoreScopedKey(baseKey: string): Promise<string> {
  const storeId = await getDeviceStoreId();
  return buildStoreScopedKey(baseKey, storeId);
}

export const storeScopedStorage = {
  async getItem(key: string): Promise<string | null> {
    const scopedKey = await getStoreScopedKey(key);
    return AsyncStorage.getItem(scopedKey);
  },
  async setItem(key: string, value: string): Promise<void> {
    const scopedKey = await getStoreScopedKey(key);
    await AsyncStorage.setItem(scopedKey, value);
  },
  async removeItem(key: string): Promise<void> {
    const scopedKey = await getStoreScopedKey(key);
    await AsyncStorage.removeItem(scopedKey);
  }
};

export async function getStoreScopeSuffix(): Promise<string> {
  const storeId = await getDeviceStoreId();
  return normalizeStoreScope(storeId);
}
