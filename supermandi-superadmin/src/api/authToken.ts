/**
 * Admin token source for SuperAdmin UI.
 *
 * Priority:
 * 1) Build-time token from Vite env (`VITE_ADMIN_TOKEN`)
 * 2) Runtime token set in the browser (localStorage)
 *
 * This prevents needing to hardcode secrets into the repo.
 */

const ENV_ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

export const ADMIN_TOKEN_STORAGE_KEY = "supermandi_admin_token";

export function getAdminToken(): string | undefined {
  const envToken = (ENV_ADMIN_TOKEN ?? "").trim();
  if (envToken) return envToken;

  try {
    const v = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    const token = (v ?? "").trim();
    if (token) return token;
  } catch {
    // ignore (SSR / privacy mode)
  }
  return undefined;
}

