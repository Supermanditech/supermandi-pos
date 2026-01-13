import Constants from "expo-constants";

// Read API URL from app.json -> extra (production-safe)
const API_URL =
  (Constants.expoConfig as any)?.extra?.API_URL ||
  (Constants.manifest as any)?.extra?.API_URL;

if (!API_URL) {
  throw new Error("API_URL missing from app config (app.json -> extra.API_URL)");
}

// POS API URL for legacy POS endpoints (enrollment service)
const POS_URL =
  (Constants.expoConfig as any)?.extra?.POS_API_URL ||
  (Constants.manifest as any)?.extra?.POS_API_URL ||
  API_URL.replace(":3000", ":3009");

export const API_BASE_URL = API_URL;
export const POS_API_URL = POS_URL;
