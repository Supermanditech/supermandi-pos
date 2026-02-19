// AUTH-SESSION-169: Shared cookie utility for auth session persistence
// Sets HttpOnly cookies on login/refresh responses so frontend can maintain
// session across page refreshes (sm_auth indicator + sm_access_token + sm_refresh_token)
//
// Mirrors backend/services/auth-service/src/utils/cookies.ts but for the main backend routes.

import { Response, Request } from 'express';

// Cookie names (must match frontend hasAuthCookie() check)
const ACCESS_TOKEN_COOKIE = 'sm_access_token';
const REFRESH_TOKEN_COOKIE = 'sm_refresh_token';
const AUTH_INDICATOR_COOKIE = 'sm_auth'; // Non-HttpOnly, readable by JS

interface CookieConfig {
  secure: boolean;
  domain?: string;
  sameSite: 'lax' | 'strict' | 'none';
}

function getCookieConfig(): CookieConfig {
  // Secure cookies in all environments except local development
  const isSecure = process.env.NODE_ENV !== 'development' || process.env.COOKIE_SECURE === 'true';
  return {
    secure: isSecure,
    domain: process.env.COOKIE_DOMAIN || undefined,
    sameSite: 'lax',
  };
}

/**
 * Set HttpOnly auth cookies on the response.
 * Called after successful login or token refresh.
 */
export function setAuthCookies(
  res: Response,
  accessToken: string,
  refreshToken: string,
  accessTokenMaxAgeSec: number,
  refreshTokenMaxAgeSec: number,
): void {
  const cfg = getCookieConfig();

  // Access token - HttpOnly (JS can't read), sent on all /api requests
  res.cookie(ACCESS_TOKEN_COOKIE, accessToken, {
    httpOnly: true,
    secure: cfg.secure,
    sameSite: cfg.sameSite,
    domain: cfg.domain,
    path: '/api',
    maxAge: accessTokenMaxAgeSec * 1000,
  });

  // Refresh token - HttpOnly, sent on all /api requests
  res.cookie(REFRESH_TOKEN_COOKIE, refreshToken, {
    httpOnly: true,
    secure: cfg.secure,
    sameSite: cfg.sameSite,
    domain: cfg.domain,
    path: '/api',
    maxAge: refreshTokenMaxAgeSec * 1000,
  });

  // Auth indicator - NOT HttpOnly, JS can check document.cookie for auth state
  res.cookie(AUTH_INDICATOR_COOKIE, '1', {
    httpOnly: false,
    secure: cfg.secure,
    sameSite: cfg.sameSite,
    domain: cfg.domain,
    path: '/',
    maxAge: refreshTokenMaxAgeSec * 1000,
  });
}

/**
 * Clear all auth cookies on the response.
 * Called on logout.
 */
export function clearAuthCookies(res: Response): void {
  const cfg = getCookieConfig();
  const base = {
    secure: cfg.secure,
    sameSite: cfg.sameSite as boolean | 'lax' | 'strict' | 'none',
    domain: cfg.domain,
  };

  res.clearCookie(ACCESS_TOKEN_COOKIE, { ...base, path: '/api' });
  res.clearCookie(REFRESH_TOKEN_COOKIE, { ...base, path: '/api' });
  res.clearCookie(AUTH_INDICATOR_COOKIE, { ...base, path: '/' });
}

/**
 * Extract refresh token from request.
 * Prefers body (backward compatible with POS app), falls back to cookie.
 */
export function getRefreshTokenFromRequest(req: Request): string | undefined {
  // Prefer body (explicit, backward compatible)
  if (req.body?.refreshToken) {
    return req.body.refreshToken;
  }

  // Fall back to cookie
  const cookieHeader = req.headers.cookie;
  if (!cookieHeader) return undefined;

  const match = cookieHeader.match(/(?:^|;\s*)sm_refresh_token=([^;]*)/);
  return match && match[1] ? decodeURIComponent(match[1]) : undefined;
}
