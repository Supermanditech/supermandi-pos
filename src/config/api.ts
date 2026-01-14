import Constants from "expo-constants";

// Priority: EXPO_PUBLIC_ env vars (dev override) > app.json extra (production)
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig as any)?.extra?.API_URL ||
  (Constants.manifest as any)?.extra?.API_URL;

if (!API_URL) {
  throw new Error("API_URL missing from env or app config");
}

// POS API URL for legacy POS endpoints (enrollment service)
const POS_URL =
  process.env.EXPO_PUBLIC_POS_API_URL ||
  (Constants.expoConfig as any)?.extra?.POS_API_URL ||
  (Constants.manifest as any)?.extra?.POS_API_URL ||
  API_URL.replace(":3000", ":3009");

export const API_BASE_URL = API_URL;
export const POS_API_URL = POS_URL;

// Build info for dev verification (set by tools/dev/redmi.ps1)
export const BUILD_INFO = {
  gitSha: process.env.EXPO_PUBLIC_GIT_SHA || "unknown",
  buildTime: process.env.EXPO_PUBLIC_BUILD_TIME || "unknown",
  isDevBuild: __DEV__,
};

// Test store credentials (DEV only, read from env vars)
export const TEST_STORE_CONFIG = __DEV__
  ? {
      phone: process.env.EXPO_PUBLIC_TEST_PHONE || "",
      pin: process.env.EXPO_PUBLIC_TEST_PIN || "",
      storeName: process.env.EXPO_PUBLIC_TEST_STORE_NAME || "TEST STORE",
    }
  : null;
