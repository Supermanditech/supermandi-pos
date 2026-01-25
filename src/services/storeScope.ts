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
    try {
      const scopedKey = await getStoreScopedKey(key);
      const value = await AsyncStorage.getItem(scopedKey);

      // AUD-058-A FIX: Validate JSON is parseable before returning
      // This prevents createJSONStorage from failing silently with corrupted data
      if (value !== null) {
        try {
          JSON.parse(value); // Validate JSON
        } catch (parseError) {
          console.error(`[StoreScope] Corrupted JSON in storage key ${scopedKey}, clearing:`, parseError);
          await AsyncStorage.removeItem(scopedKey);
          return null;
        }
      }
      return value;
    } catch (error) {
      console.error(`[StoreScope] Failed to get item ${key}:`, error);
      return null;
    }
  },
  async setItem(key: string, value: string): Promise<void> {
    try {
      const scopedKey = await getStoreScopedKey(key);
      await AsyncStorage.setItem(scopedKey, value);
    } catch (error) {
      console.error(`[StoreScope] Failed to set item ${key}:`, error);
    }
  },
  async removeItem(key: string): Promise<void> {
    try {
      const scopedKey = await getStoreScopedKey(key);
      await AsyncStorage.removeItem(scopedKey);
    } catch (error) {
      console.error(`[StoreScope] Failed to remove item ${key}:`, error);
    }
  }
};

export async function getStoreScopeSuffix(): Promise<string> {
  const storeId = await getDeviceStoreId();
  return normalizeStoreScope(storeId);
}
