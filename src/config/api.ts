import Constants from "expo-constants";

// GL-TRACE-001: Helper to get config extra values from expoConfig (primary source)
// The app.config.js computes build info at bundle time and embeds it in extra
const getExtra = (): Record<string, unknown> => {
  // Try expoConfig first (modern Expo SDK 46+)
  // Then fall back to manifest (deprecated but might exist in older setups)
  const extra =
    (Constants.expoConfig as any)?.extra ||
    (Constants.manifest as any)?.extra ||
    {};

  // Debug log in development
  if (__DEV__) {
    console.log("[api.ts] expoConfig.extra keys:", Object.keys(extra));
  }

  return extra;
};

// Priority for API_URL:
// 1. EXPO_PUBLIC_API_URL env var (dev override via redmi.ps1 or .env.local)
// 2. extra.API_URL from app.json (production default)
const extra = getExtra();

const API_URL =
  process.env.EXPO_PUBLIC_API_URL ||
  extra.API_URL;

if (!API_URL) {
  throw new Error("API_URL missing from env or app.json extra");
}

export const API_BASE_URL = String(API_URL);

// Log API URL in dev
if (__DEV__) {
  console.log("[api.ts] API_BASE_URL:", API_BASE_URL);
}

// GL-TRACE-001: Build info with robust fallback chain
// 1. app.config.js extra (computed at bundle time) - PRIMARY SOURCE
// 2. EXPO_PUBLIC_* env vars (only if inlined at bundle time)
// 3. Timestamp-based fallback (should NEVER be needed)
const FALLBACK_ID = `F${Date.now().toString(36).toUpperCase()}`;

function getStringValue(primary: unknown, secondary: unknown, fallback: string): string {
  if (typeof primary === "string" && primary && primary !== "unknown") return primary;
  if (typeof secondary === "string" && secondary && secondary !== "unknown") return secondary;
  return fallback;
}

export const BUILD_INFO = {
  // Git SHA - NEVER "unknown"
  gitSha: getStringValue(
    extra.BUILD_GIT_SHA,
    process.env.EXPO_PUBLIC_GIT_SHA,
    FALLBACK_ID
  ),

  // Fingerprint (sha or sha-dirty-hash) - NEVER "unknown"
  fingerprint: getStringValue(
    extra.BUILD_FINGERPRINT,
    process.env.EXPO_PUBLIC_WORKTREE_FINGERPRINT,
    getStringValue(extra.BUILD_GIT_SHA, process.env.EXPO_PUBLIC_GIT_SHA, FALLBACK_ID)
  ),

  // Branch name
  branch: getStringValue(
    extra.BUILD_BRANCH,
    process.env.EXPO_PUBLIC_GIT_BRANCH,
    "unknown"
  ),

  // Dirty flag
  isDirty:
    extra.BUILD_IS_DIRTY === true ||
    process.env.EXPO_PUBLIC_WORKTREE_DIRTY === "1",

  // Modified file counts
  modifiedCount:
    typeof extra.BUILD_MODIFIED_COUNT === "number"
      ? extra.BUILD_MODIFIED_COUNT
      : parseInt(process.env.EXPO_PUBLIC_MODIFIED_COUNT || "0", 10),

  untrackedCount:
    typeof extra.BUILD_UNTRACKED_COUNT === "number"
      ? extra.BUILD_UNTRACKED_COUNT
      : parseInt(process.env.EXPO_PUBLIC_UNTRACKED_COUNT || "0", 10),

  // Build time - NEVER "unknown"
  buildTime: getStringValue(
    extra.BUILD_TIME,
    process.env.EXPO_PUBLIC_BUILD_TIME,
    new Date().toISOString()
  ),

  // Build ID (unique per bundle)
  buildId: getStringValue(
    extra.BUILD_ID,
    null,
    FALLBACK_ID
  ),

  // Dev mode flag
  isDevBuild: __DEV__,
};

// Log BUILD_INFO on startup in dev mode
if (__DEV__) {
  console.log("[api.ts] BUILD_INFO:", {
    ...BUILD_INFO,
    source: extra.BUILD_GIT_SHA ? "app.config.js" : "fallback",
  });
}

// Test store credentials (DEV only, read from env vars)
export const TEST_STORE_CONFIG = __DEV__
  ? {
      phone: process.env.EXPO_PUBLIC_TEST_PHONE || "",
      pin: process.env.EXPO_PUBLIC_TEST_PIN || "",
      storeName: process.env.EXPO_PUBLIC_TEST_STORE_NAME || "TEST STORE",
    }
  : null;
