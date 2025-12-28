import Constants from "expo-constants";

// Read API URL from app.json -> extra (production-safe)
const API_URL =
  Constants.expoConfig?.extra?.API_URL ||
  Constants.manifest?.extra?.API_URL;

if (!API_URL) {
  throw new Error("API_URL missing from app config (app.json -> extra.API_URL)");
}

export const API_BASE_URL = API_URL;
