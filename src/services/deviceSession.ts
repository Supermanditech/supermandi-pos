import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const SESSION_KEY = "supermandi.device.session.v1";

export type DeviceSession = {
  deviceId: string;
  storeId: string;
  deviceToken: string;
  deviceType?: string | null;
};

// POS-SESSION-001: In-memory cache to eliminate SecureStore hot-loop reads
// Token is read from storage ONCE on app start, then served from memory
let cachedSession: DeviceSession | null = null;
let cacheLoaded = false;
let inflightPromise: Promise<DeviceSession | null> | null = null;

// Throttled logging - only log SecureStore retrieval once per minute max
let lastLogTime = 0;
const LOG_THROTTLE_MS = 60000; // 1 minute

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

// POS-SESSION-001: Internal function to load from storage (called only when cache is empty)
async function loadFromStorage(): Promise<DeviceSession | null> {
  const secureAvailable = await secureStoreAvailable();
  if (secureAvailable) {
    try {
      const raw = await SecureStore.getItemAsync(SESSION_KEY);
      if (raw) {
        const parsed = normalizeSession(JSON.parse(raw));
        if (parsed) {
          // Throttled logging - only log if enough time has passed
          const now = Date.now();
          if (now - lastLogTime > LOG_THROTTLE_MS) {
            console.log(`[deviceSession] Loaded from SecureStore: deviceId=${parsed.deviceId}, tokenLen=${parsed.deviceToken?.length ?? 0}`);
            lastLogTime = now;
          }
          return parsed;
        }
      }
    } catch {
      // SecureStore read failed — check AsyncStorage for migration
    }

    // ISSUE-MICRO-031: SecureStore available but empty/failed — check AsyncStorage for migration
    try {
      const asyncRaw = await AsyncStorage.getItem(SESSION_KEY);
      if (asyncRaw) {
        const parsed = normalizeSession(JSON.parse(asyncRaw));
        if (parsed) {
          try {
            await SecureStore.setItemAsync(SESSION_KEY, asyncRaw);
            await AsyncStorage.removeItem(SESSION_KEY);
            console.log(`[deviceSession] ISSUE-MICRO-031: Migrated session from AsyncStorage to SecureStore`);
          } catch {
            console.warn(`[deviceSession] ISSUE-MICRO-031: Migration to SecureStore failed, session remains in AsyncStorage`);
          }
          return parsed;
        }
      }
    } catch {
      // No data in AsyncStorage either
    }

    return null;
  }

  // ISSUE-MICRO-031: SecureStore NOT available — log security warning
  console.warn(`[deviceSession] ISSUE-MICRO-031: SecureStore not available — token stored in plaintext AsyncStorage`);
  try {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = normalizeSession(JSON.parse(raw));
    if (parsed) {
      const now = Date.now();
      if (now - lastLogTime > LOG_THROTTLE_MS) {
        console.log(`[deviceSession] Loaded from AsyncStorage: deviceId=${parsed.deviceId}, tokenLen=${parsed.deviceToken?.length ?? 0}`);
        lastLogTime = now;
      }
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * POS-SESSION-001: Get device session with in-memory caching
 * - First call: loads from SecureStore/AsyncStorage and caches
 * - Subsequent calls: returns cached value instantly (no I/O)
 * - Concurrent calls: deduped via inflightPromise
 */
export async function getDeviceSession(): Promise<DeviceSession | null> {
  // Return cached value if available
  if (cacheLoaded) {
    return cachedSession;
  }

  // Dedupe concurrent calls - return existing promise if one is in flight
  if (inflightPromise) {
    return inflightPromise;
  }

  // Load from storage (only happens once)
  inflightPromise = loadFromStorage().then(session => {
    cachedSession = session;
    cacheLoaded = true;
    inflightPromise = null;
    return session;
  }).catch(err => {
    inflightPromise = null;
    throw err;
  });

  return inflightPromise;
}

/**
 * POS-SESSION-001: Save session and update in-memory cache
 */
export async function saveDeviceSession(session: DeviceSession): Promise<void> {
  const secureAvailable = await secureStoreAvailable();
  const payload = JSON.stringify(session);

  console.log(`[deviceSession] Saving session: deviceId=${session.deviceId}, storeId=${session.storeId}, tokenLen=${session.deviceToken?.length ?? 0}`);

  if (secureAvailable) {
    try {
      await SecureStore.setItemAsync(SESSION_KEY, payload);
      console.log(`[deviceSession] Saved to SecureStore`);
      // Update cache immediately after successful save
      cachedSession = session;
      cacheLoaded = true;
      return;
    } catch (e) {
      console.warn(`[deviceSession] SecureStore save failed, falling back to AsyncStorage:`, e);
    }
  }
  // ISSUE-MICRO-031: Plaintext fallback — SecureStore unavailable or failed
  console.warn(`[deviceSession] ISSUE-MICRO-031: Saving to AsyncStorage (PLAINTEXT) — SecureStore unavailable or failed`);
  await AsyncStorage.setItem(SESSION_KEY, payload);
  // Update cache immediately after successful save
  cachedSession = session;
  cacheLoaded = true;
}

/**
 * POS-SESSION-001: Clear session from storage AND memory cache
 */
export async function clearDeviceSession(): Promise<void> {
  // Clear cache first
  cachedSession = null;
  cacheLoaded = true; // Mark as loaded (with null value) to prevent re-read

  const secureAvailable = await secureStoreAvailable();
  if (secureAvailable) {
    try {
      await SecureStore.deleteItemAsync(SESSION_KEY);
    } catch {
      // Ignore and still clear AsyncStorage
    }
  }
  await AsyncStorage.removeItem(SESSION_KEY);
  console.log(`[deviceSession] Session cleared`);
}

/**
 * POS-SESSION-001: Force reload from storage (use sparingly)
 * Only needed if external process modified storage
 */
export async function forceReloadSession(): Promise<DeviceSession | null> {
  cacheLoaded = false;
  cachedSession = null;
  return getDeviceSession();
}

// Convenience functions - all use cached session
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

/**
 * POS-SESSION-001: Get cached session synchronously (returns null if not yet loaded)
 * Use this in hot paths where you know cache is already loaded
 */
export function getCachedSession(): DeviceSession | null {
  return cachedSession;
}

/**
 * POS-SESSION-001: Check if cache is loaded
 */
export function isCacheLoaded(): boolean {
  return cacheLoaded;
}
