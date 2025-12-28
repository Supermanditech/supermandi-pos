/**
 * Admin token source for SuperAdmin UI.
 *
 * Priority:
 * 1) Runtime token set in the browser (localStorage)
 * 2) Build-time token from Vite env (`VITE_ADMIN_TOKEN`)
 *
 * This prevents needing to hardcode secrets into the repo.
 */

const ENV_ADMIN_TOKEN = import.meta.env.VITE_ADMIN_TOKEN as string | undefined;

export const ADMIN_TOKEN_STORAGE_KEY = "supermandi_admin_token";

export function getAdminToken(): string | undefined {
  try {
    const v = localStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
    const token = (v ?? "").trim();
    if (token) return token;
  } catch {
    // ignore (SSR / privacy mode)
  }

  const envToken = (ENV_ADMIN_TOKEN ?? "").trim();
  return envToken || undefined;
}

