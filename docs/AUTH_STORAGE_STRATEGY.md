# Auth Storage Strategy — ISSUE-MICRO-080

Per-surface authentication storage and token lifecycle.

## Summary

| Surface | Storage | Token Type | Lifetime | Refresh |
|---------|---------|-----------|----------|---------|
| POS App (RN) | expo-secure-store | Device JWT | 7 days | Auto-refresh via /auth/refresh |
| Retailer Admin | HttpOnly cookie | Session JWT | 24 hours | Auto-refresh via /auth/refresh |
| Supplier Portal | HttpOnly cookie | Session JWT | 24 hours | Auto-refresh via /auth/refresh |
| SuperAdmin | localStorage | Session JWT | 24 hours | Manual via /admin/auth/refresh |

## POS App (React Native / Expo)

- **Storage**: `expo-secure-store` (encrypted keychain on iOS, Android Keystore)
- **Token**: Device JWT issued at enrollment via `/api/v1/pos/enroll`
- **Header**: `X-Device-Token: <jwt>`
- **Refresh**: Automatic via `/api/v1/pos/auth/refresh` (7-day rolling)
- **Logout**: Token cleared from SecureStore, session invalidated server-side
- **Offline**: Token cached locally; sync continues until expiry

## Retailer Admin (Vite SPA)

- **Storage**: HttpOnly cookie (`sm_session`) set by backend
- **Indicator**: Non-HttpOnly `sm_auth` cookie for client-side session detection
- **Token**: Session JWT set via `Set-Cookie` on login
- **Header**: Sent automatically via `credentials: 'include'`
- **Refresh**: Automatic via `/api/v1/retailer-admin/auth/refresh`
- **Logout**: POST to `/api/v1/retailer-admin/auth/logout`, cookies cleared
- **CSRF**: Protected via `X-Requested-With` header check

## Supplier Portal (Next.js)

- **Storage**: HttpOnly cookie (`sm_session`) set by backend
- **Indicator**: Non-HttpOnly `sm_auth` cookie for client-side session detection
- **Token**: Session JWT set via `Set-Cookie` on login
- **Header**: Sent automatically via `credentials: 'include'`
- **Refresh**: Automatic via `/api/v1/supplier/auth/refresh`
- **Logout**: POST to `/api/v1/supplier/auth/logout`, cookies cleared
- **CSRF**: Protected via `X-Requested-With` header check

## SuperAdmin (Vite SPA)

- **Storage**: `localStorage` (`supermandi_admin_session`, `supermandi_admin_session_expiry`)
- **Token**: Session JWT issued after email OTP verification
- **Header**: `Authorization: Bearer <jwt>`
- **Refresh**: POST to `/api/v1/admin/auth/refresh` with current token
- **Idle timeout**: 30 minutes (AUTH-EXPIRY-003)
- **Logout**: POST to `/api/v1/admin/auth/logout`, localStorage cleared

## Security Notes

1. HttpOnly cookies (Retailer/Supplier) prevent XSS token theft
2. SuperAdmin uses localStorage due to session-based admin auth flow
3. POS uses device-bound tokens (not user tokens) stored in encrypted keystore
4. All tokens have server-side expiry; client expiry is advisory only
5. CORS restricted to explicit allowed origins (no wildcards in production)
