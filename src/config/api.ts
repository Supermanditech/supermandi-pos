// Configure the backend base URL.
//
// ENV-ONLY (no hardcoded URLs): set `EXPO_PUBLIC_API_URL` per environment.
// - Example format: http(s)://HOST:PORT

const value = process.env.EXPO_PUBLIC_API_URL?.trim();

if (!value) {
  throw new Error(
    "Missing EXPO_PUBLIC_API_URL. Set it to your backend base URL (example: http(s)://HOST:PORT)."
  );
}

export const API_BASE_URL = value;

