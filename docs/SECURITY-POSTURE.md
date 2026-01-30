# SuperMandi Security Posture

## GO-LIVE-108: CSRF Protection Assessment

**Date:** 2026-01-30
**Status:** NOT APPLICABLE

### Analysis

The SuperMandi web portals (retailer-admin, supplier-portal, superadmin) use JWT-based authentication with tokens stored in localStorage and sent via Authorization headers. This architecture is inherently protected against CSRF attacks.

### Why CSRF Protection is NOT Needed:

1. **No Cookie-Based Authentication**: Authentication tokens are stored in localStorage, not cookies
2. **Explicit Header Attachment**: Tokens must be explicitly added to the `Authorization: Bearer <token>` header by JavaScript
3. **Same-Origin Policy**: Cross-origin requests cannot access localStorage or programmatically set Authorization headers
4. **No Automatic Credential Sending**: Unlike cookies, localStorage values are not automatically sent with requests

### References:
- OWASP CSRF Prevention Cheat Sheet: "If you must use a custom request header... the token value need not be random. This is because by default, browsers do not allow JavaScript to make cross origin requests with custom headers."
- MDN Web Docs: "Cookies with SameSite=Strict are only sent in a first-party context and will not be sent with requests initiated by third party websites."

### Recommendation:
No additional CSRF tokens are required for the current JWT-based authentication architecture.
