import Constants from "expo-constants";

// Priority: EXPO_PUBLIC_ env vars (dev override) > app.json extra (production)
const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  (Constants.expoConfig as any)?.extra?.API_URL ||
  (Constants.manifest as any)?.extra?.API_URL;

if (!API_URL) {
  throw new Error("API_URL missing from env or app config");
}

export const API_BASE_URL = API_URL;

// Build info for dev verification (set by tools/dev/redmi.ps1)
export const BUILD_INFO = {
  gitSha: process.env.EXPO_PUBLIC_GIT_SHA || "unknown",
  fingerprint: process.env.EXPO_PUBLIC_WORKTREE_FINGERPRINT || process.env.EXPO_PUBLIC_GIT_SHA || "unknown",
  branch: process.env.EXPO_PUBLIC_GIT_BRANCH || "unknown",
  isDirty: process.env.EXPO_PUBLIC_WORKTREE_DIRTY === "1",
  modifiedCount: parseInt(process.env.EXPO_PUBLIC_MODIFIED_COUNT || "0", 10),
  untrackedCount: parseInt(process.env.EXPO_PUBLIC_UNTRACKED_COUNT || "0", 10),
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
