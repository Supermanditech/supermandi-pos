// GO-LIVE-105: Use SecureStore for auth tokens (encrypted, not accessible via device backup)
// AsyncStorage is plaintext and can be extracted from device backups
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

const TOKEN_KEY = "supermandi.auth.token";

// GO-LIVE-105: Check if SecureStore is available on this device
async function secureStoreAvailable(): Promise<boolean> {
  try {
    return await SecureStore.isAvailableAsync();
  } catch {
    return false;
  }
}

export async function getAuthToken(): Promise<string | null> {
  // GO-LIVE-105: Try SecureStore first (encrypted storage)
  const secureAvailable = await secureStoreAvailable();
  if (secureAvailable) {
    try {
      const token = await SecureStore.getItemAsync(TOKEN_KEY);
      if (token) return token;
    } catch {
      // Fall through to AsyncStorage migration check
    }
  }

  // Fallback to AsyncStorage (for migration from old versions)
  try {
    const token = await AsyncStorage.getItem(TOKEN_KEY);
    if (token && secureAvailable) {
      // Migrate to SecureStore and clear from AsyncStorage
      try {
        await SecureStore.setItemAsync(TOKEN_KEY, token);
        await AsyncStorage.removeItem(TOKEN_KEY);
        console.log("[storage] Migrated auth token to SecureStore");
      } catch {
        // Migration failed, keep in AsyncStorage
      }
    }
    return token;
  } catch {
    return null;
  }
}

export async function setAuthToken(token: string): Promise<void> {
  // GO-LIVE-105: Store in SecureStore (encrypted) if available
  const secureAvailable = await secureStoreAvailable();
  if (secureAvailable) {
    try {
      await SecureStore.setItemAsync(TOKEN_KEY, token);
      // Clear from AsyncStorage if migrating
      try {
        await AsyncStorage.removeItem(TOKEN_KEY);
      } catch {
        // Ignore cleanup errors
      }
      return;
    } catch (e) {
      console.warn("[storage] SecureStore save failed, falling back to AsyncStorage:", e);
    }
  }
  // Fallback to AsyncStorage (less secure, but works on all devices)
  await AsyncStorage.setItem(TOKEN_KEY, token);
}

export async function clearAuthToken(): Promise<void> {
  // GO-LIVE-105: Clear from both storage locations
  const secureAvailable = await secureStoreAvailable();
  if (secureAvailable) {
    try {
      await SecureStore.deleteItemAsync(TOKEN_KEY);
    } catch {
      // Ignore errors
    }
  }
  try {
    await AsyncStorage.removeItem(TOKEN_KEY);
  } catch {
    // Ignore errors
  }
}

