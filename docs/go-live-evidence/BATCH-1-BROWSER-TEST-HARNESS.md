# BATCH 1 - Production Browser Test Harness

> **IMPORTANT**: Go-Live verification MUST use `https://supermandi.tech` (production domain).
> The nip.io domain (34.14.220.171.nip.io) is ONLY for local debug/testing.

**Test Date**: _______________
**Operator Name**: _______________
**Environment**: Production (`https://supermandi.tech`)

---

## PRE-TEST SETUP

### 1. Open Chrome DevTools (F12) with these settings:
```
☑ Network tab → Preserve log (CHECKED)
☑ Network tab → Disable cache (CHECKED)
☑ Console tab → Preserve log (CHECKED)
☑ Application tab ready for localStorage inspection
```

### 2. Production URLs
| Portal | URL |
|--------|-----|
| Retailer Admin | `https://supermandi.tech/retailer/login` |
| Supplier Portal | `https://supermandi.tech/supplier/login` |
| API Gateway | `https://supermandi.tech/api/v1/` |
| Health Check | `https://supermandi.tech/api/v1/health` |

### 3. Test Phone Numbers (coordinate with team)
- Retailer Test Phone: `+91__________`
- Supplier Test Phone: `+91__________`

---

## UNIVERSAL DEVTOOLS SNIPPETS

### Snippet A: Storage Audit
```javascript
// PASTE IN CONSOLE - Storage Audit
console.log('=== STORAGE AUDIT ===');
console.log('Keys found:', Object.keys(localStorage).length);
Object.keys(localStorage).sort().forEach(k => {
  const v = localStorage.getItem(k);
  const preview = v ? (v.length > 35 ? v.slice(0,25) + '...' + v.slice(-10) : v) : 'null';
  console.log(`  ${k}: ${preview}`);
});
```

### Snippet B: Token Decode (JWT)
```javascript
// PASTE IN CONSOLE - Decode JWT without external libs
function decodeJWT(token) {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return { error: 'Invalid JWT format' };
    const payload = JSON.parse(atob(parts[1].replace(/-/g,'+').replace(/_/g,'/')));
    const exp = payload.exp ? new Date(payload.exp * 1000) : null;
    const iat = payload.iat ? new Date(payload.iat * 1000) : null;
    return { payload, issued: iat, expires: exp, isExpired: exp ? exp < new Date() : null };
  } catch(e) { return { error: e.message }; }
}
// Usage: decodeJWT(localStorage.getItem('retailer_XXXX_token'))
```

### Snippet C: Network Call Counter
```javascript
// PASTE IN CONSOLE BEFORE TESTING - Tracks API calls
window.__apiCalls = [];
const origFetch = window.fetch;
window.fetch = async function(...args) {
  const start = Date.now();
  const result = await origFetch.apply(this, args);
  const url = typeof args[0] === 'string' ? args[0] : args[0].url;
  window.__apiCalls.push({
    url: url,
    status: result.status,
    time: Date.now() - start
  });
  return result;
};
console.log('API call tracking enabled. Run: console.table(window.__apiCalls)');
```

---

# RET-AUD-011: Firebase OTP Login

## Status: `☐ PASS` `☐ FAIL` `☐ BLOCKED`

### A) Browser Steps (Operator)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `https://supermandi.tech/retailer/login` | Login page loads, phone input visible |
| 2 | Open DevTools → Network tab | Network tab ready |
| 3 | Enter registered phone: `+91XXXXXXXXXX` | Phone input accepts value |
| 4 | Click "Continue" | Registration lookup API called |
| 5 | Wait for OTP screen | reCAPTCHA executes invisibly, OTP input appears |
| 6 | Enter 6-digit OTP from SMS | OTP fields populated |
| 7 | Click "Verify" or auto-submit | Login completes, redirects to store selection or dashboard |

### B) DevTools Evidence to Capture

#### B1. Console Check (run BEFORE login attempt)
```javascript
// Check Firebase initialization
console.log('Firebase Auth:', typeof window.firebase !== 'undefined' || typeof window.firebaseAuth !== 'undefined' ? 'LOADED' : 'NOT FOUND');

// Check for reCAPTCHA
console.log('reCAPTCHA:', typeof window.grecaptcha !== 'undefined' ? 'LOADED' : 'NOT FOUND');

// Check for console errors
console.log('Check Console for any red errors above this line');
```

**Expected Output**:
```
Firebase Auth: LOADED
reCAPTCHA: LOADED
Check Console for any red errors above this line
```

#### B2. Network Calls to Observe

| Call | Method | URL Pattern | Expected Status |
|------|--------|-------------|-----------------|
| 1 | GET | `/api/v1/retailer-admin/registration/lookup?phone=` | 200 |
| 2 | POST | `identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode` | 200 |
| 3 | POST | `identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber` | 200 |
| 4 | POST | `/api/v1/retailer-admin/auth/firebase-otp-login` | 200 |

#### B3. Post-Login Storage Check
```javascript
// Run AFTER successful login
const activeStore = localStorage.getItem('retailer_active_store_id');
console.log('Active Store ID:', activeStore);

if (activeStore) {
  const token = localStorage.getItem(`retailer_${activeStore}_token`);
  const refresh = localStorage.getItem(`retailer_${activeStore}_refresh_token`);
  const user = localStorage.getItem(`retailer_${activeStore}_user`);

  console.log('Token present:', !!token);
  console.log('Refresh token present:', !!refresh);
  console.log('User data present:', !!user);

  if (token) {
    const decoded = decodeJWT(token);
    console.log('Token expires:', decoded.expires);
    console.log('Token payload:', decoded.payload);
  }
}
```

**Expected Output**:
```
Active Store ID: <store-uuid>
Token present: true
Refresh token present: true
User data present: true
Token expires: <future date>
```

### C) Network Proof Template

**Request 1: Registration Lookup**
- URL: `_______________________________________`
- Status: `_____`
- Response: `{ "exists": true, "status": "___", "nextStep": "___" }`

**Request 2: Firebase OTP Login**
- URL: `/api/v1/retailer-admin/auth/firebase-otp-login`
- Status: `_____`
- Response snippet: `{ "success": ___, "token": "eyJ...", "stores": [...] }`

### D) Screenshots Required
1. `RET-011-01-login-page.png` - Initial login page loaded
2. `RET-011-02-otp-screen.png` - OTP input screen
3. `RET-011-03-dashboard.png` - Post-login dashboard
4. `RET-011-04-storage.png` - DevTools Application tab showing localStorage

### E) Pass/Fail Rubric

| Criterion | Required for PASS |
|-----------|-------------------|
| Login page loads without console errors | ☐ |
| Registration lookup returns 200 | ☐ |
| Firebase OTP request succeeds | ☐ |
| OTP verification succeeds | ☐ |
| Backend firebase-otp-login returns 200 | ☐ |
| Token stored in localStorage | ☐ |
| Redirect to dashboard occurs | ☐ |

**If OTP cannot be received** (no real phone):
- Mark as `BLOCKED: Real OTP required`
- Verify partial flow up to OTP screen
- Document that Firebase calls were attempted

---

# RET-AUD-014: Session Persistence Across Refresh

## Status: `☐ PASS` `☐ FAIL` `☐ BLOCKED`

**Prerequisite**: RET-AUD-011 PASS (user is logged in)

### A) Browser Steps (Operator)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Confirm logged into dashboard | Dashboard visible with user data |
| 2 | Note current URL | URL shows `/s/<storeCode>/...` |
| 3 | Run Storage Audit snippet | Token and user data present |
| 4 | Press F5 (hard refresh) | Page reloads |
| 5 | Wait for page load complete | Dashboard reappears |
| 6 | Run Storage Audit again | Same tokens still present |
| 7 | Press Ctrl+Shift+R (cache-bypass refresh) | Page reloads without cache |
| 8 | Verify still logged in | Dashboard still accessible |

### B) DevTools Evidence to Capture

#### B1. Pre-Refresh State
```javascript
// Run BEFORE refresh
console.log('=== PRE-REFRESH STATE ===');
console.log('URL:', location.href);
console.log('Timestamp:', new Date().toISOString());

const activeStore = localStorage.getItem('retailer_active_store_id');
const token = localStorage.getItem(`retailer_${activeStore}_token`);
console.log('Store ID:', activeStore);
console.log('Token hash:', token ? token.slice(-20) : 'NONE');
```

#### B2. Post-Refresh Verification
```javascript
// Run AFTER refresh
console.log('=== POST-REFRESH STATE ===');
console.log('URL:', location.href);
console.log('Timestamp:', new Date().toISOString());

const activeStore = localStorage.getItem('retailer_active_store_id');
const token = localStorage.getItem(`retailer_${activeStore}_token`);
console.log('Store ID:', activeStore);
console.log('Token hash:', token ? token.slice(-20) : 'NONE');

// Check if user object is hydrated
const userStr = localStorage.getItem(`retailer_${activeStore}_user`);
if (userStr) {
  const user = JSON.parse(userStr);
  console.log('User ID:', user.id || user.userId);
  console.log('User Phone:', user.phone);
}
```

### C) Network Proof Template

**On refresh, these calls may occur**:
| Call | URL Pattern | Expected Status |
|------|-------------|-----------------|
| Profile fetch | `/api/v1/retailer-admin/profile` | 200 |
| Store data | `/api/v1/retailer-admin/stores/*` | 200 |

### D) Screenshots Required
1. `RET-014-01-pre-refresh.png` - Dashboard before refresh
2. `RET-014-02-storage-pre.png` - Storage state before refresh
3. `RET-014-03-post-refresh.png` - Dashboard after refresh
4. `RET-014-04-storage-post.png` - Storage state after refresh (tokens unchanged)

### E) Pass/Fail Rubric

| Criterion | Required for PASS |
|-----------|-------------------|
| Token persists after F5 refresh | ☐ |
| Token persists after Ctrl+Shift+R | ☐ |
| User stays on same page (no redirect to login) | ☐ |
| User data re-hydrates correctly | ☐ |
| No 401 errors in Network tab | ☐ |

---

# RET-AUD-021: Protected Route Redirect

## Status: `☐ PASS` `☐ FAIL` `☐ BLOCKED`

### A) Browser Steps (Operator)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open new **Incognito** window (Ctrl+Shift+N) | Fresh browser session |
| 2 | Open DevTools in Incognito | Ready to observe |
| 3 | Navigate to protected URL: `https://supermandi.tech/s/TESTSTORE/products` | Redirect occurs |
| 4 | Observe final URL | Should be `/retailer/login` |
| 5 | Run location check | Confirm redirect |

### B) DevTools Evidence to Capture

#### B1. Incognito Storage Verification
```javascript
// Run in Incognito - should be empty
console.log('=== INCOGNITO STORAGE CHECK ===');
console.log('localStorage keys:', Object.keys(localStorage).length);
console.log('Expected: 0 keys (clean session)');
```

#### B2. Redirect Capture
```javascript
// Run after redirect completes
console.log('=== REDIRECT PROOF ===');
console.log('Final URL:', location.href);
console.log('Expected pattern:', '/retailer/login');
console.log('Match:', location.href.includes('/retailer/login') ? 'PASS' : 'FAIL');
```

### C) Network Proof Template

**Observed behavior**:
| Event | Value |
|-------|-------|
| Initial URL attempted | `https://supermandi.tech/s/TESTSTORE/products` |
| Final URL | `_________________________________` |
| Any 401 responses? | `YES / NO` |
| Client-side redirect? | `YES / NO` |

### D) Screenshots Required
1. `RET-021-01-incognito-empty.png` - Storage tab showing empty localStorage
2. `RET-021-02-redirect-complete.png` - Final URL showing login page
3. `RET-021-03-network.png` - Network tab showing request flow

### E) Pass/Fail Rubric

| Criterion | Required for PASS |
|-----------|-------------------|
| Incognito has no stored tokens | ☐ |
| Protected route is not accessible | ☐ |
| Redirect to `/retailer/login` occurs | ☐ |
| No protected content briefly flashes | ☐ |

---

# RET-AUD-028: Logout Clears Tokens + Redirect

## Status: `☐ PASS` `☐ FAIL` `☐ BLOCKED`

**Prerequisite**: User is logged in (RET-AUD-011 passed)

### A) Browser Steps (Operator)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Confirm logged into dashboard | Dashboard visible |
| 2 | Run Storage Audit | Tokens present |
| 3 | Note token hash | For comparison |
| 4 | Find and click "Logout" button | Usually in sidebar or profile menu |
| 5 | Wait for redirect | Should go to login page |
| 6 | Run Storage Audit again | Tokens should be GONE |
| 7 | Try navigating to protected route | Should stay on login |

### B) DevTools Evidence to Capture

#### B1. Pre-Logout State
```javascript
// Run BEFORE clicking logout
console.log('=== PRE-LOGOUT STATE ===');
const activeStore = localStorage.getItem('retailer_active_store_id');
console.log('Active Store:', activeStore);

const keys = Object.keys(localStorage).filter(k => k.startsWith('retailer_'));
console.log('Retailer keys count:', keys.length);
keys.forEach(k => console.log('  ', k));
```

#### B2. Post-Logout Verification
```javascript
// Run AFTER logout completes
console.log('=== POST-LOGOUT STATE ===');
console.log('Current URL:', location.href);

const activeStore = localStorage.getItem('retailer_active_store_id');
console.log('Active Store:', activeStore, activeStore ? 'FAIL - should be null' : 'PASS');

const remainingKeys = Object.keys(localStorage).filter(k => k.startsWith('retailer_'));
console.log('Remaining retailer keys:', remainingKeys.length);
if (remainingKeys.length > 0) {
  console.log('FAIL - These keys should be cleared:', remainingKeys);
} else {
  console.log('PASS - All retailer keys cleared');
}
```

#### B3. Re-access Attempt
```javascript
// After logout, try to access protected route via console
console.log('Attempting protected route access...');
window.location.href = '/s/ANYSTORE/products';
// Should redirect back to login
```

### C) Network Proof Template

| Event | Expected |
|-------|----------|
| Logout click triggers | Client-side token clear |
| Final URL | `/retailer/login` |
| Any logout API call? | Optional (client-only logout is acceptable) |

### D) Screenshots Required
1. `RET-028-01-pre-logout-storage.png` - Storage with tokens
2. `RET-028-02-logout-button.png` - Logout button location
3. `RET-028-03-post-logout-url.png` - Login page after logout
4. `RET-028-04-post-logout-storage.png` - Empty storage

### E) Pass/Fail Rubric

| Criterion | Required for PASS |
|-----------|-------------------|
| `retailer_active_store_id` cleared | ☐ |
| `retailer_<store>_token` cleared | ☐ |
| `retailer_<store>_refresh_token` cleared | ☐ |
| `retailer_<store>_user` cleared | ☐ |
| Redirect to login page | ☐ |
| Cannot re-access protected route | ☐ |

---

# RET-AUD-038: Token Auto-Refresh Behavior

## Status: `☐ PASS` `☐ FAIL` `☐ BLOCKED`

**Note**: This test requires extended observation or token manipulation.

### A) Browser Steps (Operator)

**Option 1: Observation Method (requires patience)**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login and stay on dashboard | Session active |
| 2 | Note token expiry time | From JWT decode |
| 3 | Keep browser open, interact periodically | Prevents idle timeout |
| 4 | Wait until ~5 min before token expiry | Auto-refresh should trigger |
| 5 | Check Network for refresh call | `/auth/refresh` endpoint called |
| 6 | Run token decode again | New expiry time |

**Option 2: Token Manipulation (faster)**
| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Login and go to dashboard | Session active |
| 2 | Run token expiry shortener | Simulates near-expiry |
| 3 | Wait 1-2 minutes | Refresh should trigger |
| 4 | Check Network tab | Refresh call observed |

### B) DevTools Evidence to Capture

#### B1. Check Current Token Expiry
```javascript
// Decode and check token expiry
const activeStore = localStorage.getItem('retailer_active_store_id');
const token = localStorage.getItem(`retailer_${activeStore}_token`);

if (token) {
  const decoded = decodeJWT(token);
  console.log('=== TOKEN EXPIRY CHECK ===');
  console.log('Token issued:', decoded.issued);
  console.log('Token expires:', decoded.expires);
  console.log('Time until expiry:', Math.round((decoded.expires - new Date()) / 1000 / 60), 'minutes');
  console.log('Auto-refresh triggers at:', new Date(decoded.expires.getTime() - 5*60*1000));
}
```

#### B2. Monitor for Refresh (leave console open)
```javascript
// Enhanced tracking for refresh calls
const origFetch = window.fetch;
window.fetch = async function(...args) {
  const url = typeof args[0] === 'string' ? args[0] : args[0]?.url || '';
  if (url.includes('/auth/refresh')) {
    console.log('🔄 TOKEN REFRESH DETECTED at', new Date().toISOString());
    console.log('URL:', url);
  }
  return origFetch.apply(this, args);
};
console.log('Refresh monitor active. Watch for 🔄 messages...');
```

#### B3. Post-Refresh Token Comparison
```javascript
// Run after refresh is expected to have occurred
const activeStore = localStorage.getItem('retailer_active_store_id');
const token = localStorage.getItem(`retailer_${activeStore}_token`);

if (token) {
  const decoded = decodeJWT(token);
  console.log('=== POST-REFRESH TOKEN ===');
  console.log('New expiry:', decoded.expires);
  console.log('Token refreshed:', decoded.issued > new Date(Date.now() - 5*60*1000) ? 'YES' : 'NO');
}
```

### C) Network Proof Template

| Call | Method | URL | Expected Status | Response |
|------|--------|-----|-----------------|----------|
| Refresh | POST | `/api/v1/retailer-admin/auth/refresh` | 200 | `{ "data": { "accessToken": "..." } }` |

### D) Screenshots Required
1. `RET-038-01-initial-token.png` - Token expiry before refresh
2. `RET-038-02-network-refresh.png` - Network showing refresh call
3. `RET-038-03-new-token.png` - Token expiry after refresh

### E) Pass/Fail Rubric

| Criterion | Required for PASS |
|-----------|-------------------|
| Refresh endpoint exists and is called | ☐ |
| Refresh returns new token | ☐ |
| New token has extended expiry | ☐ |
| Session continues without interruption | ☐ |

**If cannot observe in reasonable time**:
- Mark as `BLOCKED: Requires extended observation or short-lived test token`
- Document that refresh endpoint exists in API

---

# RET-AUD-039: Registration Flow with GSTIN + OTP

## Status: `☐ PASS` `☐ FAIL` `☐ BLOCKED`

### A) Browser Steps (Operator)

| Step | Action | Expected Result |
|------|--------|-----------------|
| 1 | Open `https://supermandi.tech/retailer/register` | Registration page loads |
| 2 | Fill business name | Field accepts input |
| 3 | Fill GSTIN (valid format): `22AAAAA0000A1Z5` | GSTIN validation passes |
| 4 | Fill phone number | Phone field accepts |
| 5 | Fill other required fields | Form populated |
| 6 | Click "Register" or "Continue" | OTP screen appears |
| 7 | Enter OTP | OTP verified |
| 8 | Complete registration | Success or pending approval |

### B) DevTools Evidence to Capture

#### B1. Page Load Check
```javascript
// Check registration page loads correctly
console.log('=== REGISTRATION PAGE CHECK ===');
console.log('URL:', location.href);
console.log('Expected:', location.href.includes('/register') || location.href.includes('/onboard'));

// Check for form elements
const forms = document.querySelectorAll('form');
console.log('Forms found:', forms.length);

// Check for GSTIN field
const gstinField = document.querySelector('[name*="gstin"], [name*="GSTIN"], [placeholder*="GSTIN"]');
console.log('GSTIN field present:', !!gstinField);
```

#### B2. GSTIN Validation Check
```javascript
// Test GSTIN format validation (Indian GSTIN format)
// Format: 22AAAAA0000A1Z5 (2 digit state + 10 char PAN + 1 entity + 1 Z + 1 check)
const validGSTIN = '22AAAAA0000A1Z5';
const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
console.log('GSTIN format valid:', gstinRegex.test(validGSTIN));
```

### C) Network Calls to Observe

| Call | Method | URL Pattern | Expected Status |
|------|--------|-------------|-----------------|
| 1 | POST | `/api/v1/retailer-admin/registration/check-gstin` | 200 |
| 2 | POST | `identitytoolkit.googleapis.com/v1/accounts:sendVerificationCode` | 200 |
| 3 | POST | `identitytoolkit.googleapis.com/v1/accounts:signInWithPhoneNumber` | 200 |
| 4 | POST | `/api/v1/retailer-admin/auth/register` | 200/201 |

### D) Screenshots Required
1. `RET-039-01-register-page.png` - Registration form
2. `RET-039-02-gstin-entered.png` - GSTIN field with valid value
3. `RET-039-03-otp-screen.png` - OTP verification screen
4. `RET-039-04-success.png` - Registration success/pending

### E) Pass/Fail Rubric

| Criterion | Required for PASS |
|-----------|-------------------|
| Registration page loads | ☐ |
| GSTIN field present | ☐ |
| GSTIN validation works | ☐ |
| OTP can be requested | ☐ |
| OTP verification works | ☐ |
| Registration API returns success | ☐ |

**If OTP cannot be received**:
- Mark as `BLOCKED: Real OTP required`
- Verify flow up to OTP screen

---

# SUPPLIER PORTAL EQUIVALENTS

## SUP-011: Firebase OTP Login (Supplier)

**URL**: `https://supermandi.tech/supplier/login`

### Storage Keys (Supplier)
```javascript
// Supplier uses different keys
console.log('supplier_token:', localStorage.getItem('supplier_token') ? 'PRESENT' : 'NONE');
console.log('supplier_last_activity:', localStorage.getItem('supplier_last_activity'));
```

### API Endpoints
| Call | URL |
|------|-----|
| Login | `/api/v1/supplier/auth/firebase-login` |
| Profile | `/api/v1/supplier/profile` |

---

## SUP-021: Protected Route Redirect (Supplier)

**Protected URL to test**: `https://supermandi.tech/supplier/dashboard`

**Expected redirect**: `https://supermandi.tech/supplier/login`

---

## SUP-028: Logout (Supplier)

```javascript
// Post-logout verification for supplier
console.log('=== SUPPLIER POST-LOGOUT ===');
console.log('supplier_token:', localStorage.getItem('supplier_token') ? 'FAIL' : 'PASS - cleared');
console.log('supplier_last_activity:', localStorage.getItem('supplier_last_activity') ? 'FAIL' : 'PASS - cleared');
```

---

# EVIDENCE COLLECTION TEMPLATE

## Summary Table

| Ticket | Status | Root Cause (if FAIL) | Fix Required |
|--------|--------|---------------------|--------------|
| RET-AUD-011 | | | |
| RET-AUD-014 | | | |
| RET-AUD-021 | | | |
| RET-AUD-028 | | | |
| RET-AUD-038 | | | |
| RET-AUD-039 | | | |

## Files Collected

```
docs/go-live-evidence/batch-1/
├── RET-011-01-login-page.png
├── RET-011-02-otp-screen.png
├── RET-011-03-dashboard.png
├── RET-011-04-storage.png
├── RET-011-network.har (exported from DevTools)
├── RET-014-01-pre-refresh.png
├── RET-014-02-storage-pre.png
├── RET-014-03-post-refresh.png
├── RET-014-04-storage-post.png
├── RET-021-01-incognito-empty.png
├── RET-021-02-redirect-complete.png
├── RET-021-03-network.png
├── RET-028-01-pre-logout-storage.png
├── RET-028-02-logout-button.png
├── RET-028-03-post-logout-url.png
├── RET-028-04-post-logout-storage.png
├── RET-038-01-initial-token.png
├── RET-038-02-network-refresh.png
├── RET-038-03-new-token.png
├── RET-039-01-register-page.png
├── RET-039-02-gstin-entered.png
├── RET-039-03-otp-screen.png
└── RET-039-04-success.png
```

---

# FAILURE REMEDIATION MATRIX

| Symptom | Likely Cause | Fix Location | Re-test After |
|---------|--------------|--------------|---------------|
| Firebase not loading | Missing env vars | `.env.production` | Redeploy frontend |
| reCAPTCHA blocked | CSP header | `nginx.conf` | Restart nginx |
| OTP not sending | Firebase quota/config | Firebase console | N/A |
| Login 401 | JWT secret mismatch | API Gateway env | Restart API |
| Token not persisting | localStorage blocked | Browser settings | N/A |
| Redirect not working | Route guard bug | `App.tsx` | Redeploy frontend |
| Logout incomplete | Incomplete clear logic | `AuthContext.tsx` | Redeploy frontend |
| Refresh 401 | Refresh token expired | Token lifetime config | Re-login |

---

# OPERATOR SIGN-OFF

**All Batch 1 tests completed**: ☐ YES ☐ NO

**Evidence files uploaded to**: `_______________________`

**Blocking issues requiring dev fix**:
1. ___________________________________
2. ___________________________________

**Operator signature**: _______________
**Date**: _______________
