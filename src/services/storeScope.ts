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

      // GO-LIVE FIX: Only validate JSON for keys that are expected to contain JSON
      // Plain string values (like PosMode "SELL"/"PURCHASE") should NOT be JSON-validated
      // This was causing false "corrupted JSON" errors for valid non-JSON string values
      if (value !== null && (value.startsWith("{") || value.startsWith("["))) {
        try {
          JSON.parse(value); // Validate JSON only for object/array values
        } catch (parseError) {
          // GO-LIVE FIX: Only clear this specific key, NEVER clear session keys
          // Verify we're not accidentally touching the device session
          if (scopedKey.includes("device.session")) {
            console.error(`[StoreScope] CRITICAL: Attempted to clear session key ${scopedKey}, aborting`);
            return null;
          }
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
