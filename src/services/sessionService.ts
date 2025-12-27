import { ApiError } from "./api/apiClient";
import * as authApi from "./api/authApi";
import { getAuthToken } from "./api/storage";

// Temporary (until a Login screen exists): auto-provision a device user.
const DEV_EMAIL = "pos@supermandi.local";
const DEV_PASSWORD = "pos1234";

export async function ensureSession(): Promise<void> {
  const existing = await getAuthToken();
  if (existing) return;

  try {
    await authApi.register(DEV_EMAIL, DEV_PASSWORD, "POS Device");
  } catch (e) {
    // ignore "already exists"
    if (!(e instanceof ApiError && e.status === 409)) throw e;
  }

  await authApi.login(DEV_EMAIL, DEV_PASSWORD);
}

