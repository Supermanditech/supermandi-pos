// Configure the backend base URL.
//
// ENV-ONLY (no hardcoded URLs): set `EXPO_PUBLIC_API_URL` per environment.
// - Dev/Test APK: set to your LAN backend, e.g. http://192.168.x.x:3001
// - Production: set to your production HTTPS endpoint

const value = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!value) {
  throw new Error(
    "Missing EXPO_PUBLIC_API_URL. Set it to your backend base URL (e.g. http://192.168.x.x:3001)."
  );
}

export const API_BASE_URL = value;

