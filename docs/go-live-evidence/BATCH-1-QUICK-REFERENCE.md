# BATCH 1 QUICK REFERENCE CARD

**Print this page and check off as you go**

> **IMPORTANT**: Go-Live verification MUST use `https://supermandi.tech` (production domain).
> The nip.io domain (34.14.220.171.nip.io) is ONLY for local debug/testing.

---

## SETUP (5 min)

```powershell
# Run in PowerShell to create evidence folder + templates
cd C:\supermandi-pos
.\scripts\verification\batch1-evidence-collector.ps1
```

Then in Chrome DevTools Console, paste the contents of `devtools-snippets.js`

---

## RET-AUD-011: Firebase OTP Login

**URL**: `https://supermandi.tech/retailer/login`

| Step | Do | Check |
|------|----|-------|
| 1 | Open URL | ☐ Page loads |
| 2 | F12 → Console | ☐ `checkFirebase()` → all LOADED |
| 3 | Enter phone | ☐ Field accepts |
| 4 | Click Continue | ☐ Network: `/registration/lookup` = 200 |
| 5 | Wait for OTP screen | ☐ reCAPTCHA invisible, OTP input shows |
| 6 | Enter OTP | ☐ OTP accepted |
| 7 | Verify | ☐ Network: `/auth/firebase-otp-login` = 200 |
| 8 | Dashboard | ☐ `checkRetailerAuth()` → authenticated: true |

**Screenshots**: login-page, otp-screen, dashboard, storage
**Status**: ☐ PASS ☐ FAIL ☐ BLOCKED

---

## RET-AUD-014: Session Persistence

**Prereq**: Logged in from RET-011

| Step | Do | Check |
|------|----|-------|
| 1 | On dashboard | ☐ `checkRetailerAuth()` → token present |
| 2 | Note token hash | ☐ Last 20 chars: `____________` |
| 3 | Press F5 | ☐ Page reloads |
| 4 | Check auth | ☐ `checkRetailerAuth()` → same token |
| 5 | Ctrl+Shift+R | ☐ Hard refresh |
| 6 | Check auth again | ☐ Still authenticated |

**Screenshots**: pre-refresh, storage-pre, post-refresh, storage-post
**Status**: ☐ PASS ☐ FAIL ☐ BLOCKED

---

## RET-AUD-021: Protected Route Redirect

**Use Incognito window (Ctrl+Shift+N)**

| Step | Do | Check |
|------|----|-------|
| 1 | Open Incognito | ☐ New window |
| 2 | F12 → Application | ☐ localStorage empty |
| 3 | Navigate to: `https://supermandi.tech/s/TEST/products` | ☐ Redirect happens |
| 4 | Check URL | ☐ Now at `/retailer/login` |
| 5 | Console: `location.href` | ☐ Contains `/login` |

**Screenshots**: incognito-empty, redirect-complete, network
**Status**: ☐ PASS ☐ FAIL ☐ BLOCKED

---

## RET-AUD-028: Logout

**Prereq**: Logged in

| Step | Do | Check |
|------|----|-------|
| 1 | On dashboard | ☐ `auditStorage()` → retailer keys present |
| 2 | Find logout | ☐ Button visible (sidebar/menu) |
| 3 | Click logout | ☐ Processing... |
| 4 | Wait | ☐ Redirect to login |
| 5 | Console | ☐ `verifyLogout()` → all PASS |
| 6 | Try protected URL | ☐ Stays on login |

**Screenshots**: pre-logout-storage, logout-button, post-logout-url, post-logout-storage
**Status**: ☐ PASS ☐ FAIL ☐ BLOCKED

---

## RET-AUD-038: Token Auto-Refresh

**This may require waiting or mark BLOCKED**

| Step | Do | Check |
|------|----|-------|
| 1 | Login | ☐ `checkRetailerAuth()` → note expiry |
| 2 | Console | ☐ `enableNetworkMonitor()` |
| 3 | Wait (or use short-lived token) | ☐ Watch for 🔄 message |
| 4 | If refresh seen | ☐ Network: `/auth/refresh` = 200 |
| 5 | Check new token | ☐ `checkRetailerAuth()` → new expiry |

**Alternative**: Mark `BLOCKED: Requires extended observation` if token has long expiry

**Screenshots**: initial-token, network-refresh, new-token
**Status**: ☐ PASS ☐ FAIL ☐ BLOCKED

---

## RET-AUD-039: Registration + GSTIN

**URL**: `https://supermandi.tech/retailer/register`

| Step | Do | Check |
|------|----|-------|
| 1 | Open URL | ☐ Registration form loads |
| 2 | Find GSTIN field | ☐ Field exists |
| 3 | Enter: `22AAAAA0000A1Z5` | ☐ Validation passes |
| 4 | Fill other fields | ☐ Form accepts |
| 5 | Submit | ☐ OTP screen appears |
| 6 | Enter OTP | ☐ OTP verified |
| 7 | Complete | ☐ Success or pending approval |

**Screenshots**: register-page, gstin-entered, otp-screen, success
**Status**: ☐ PASS ☐ FAIL ☐ BLOCKED

---

## KEY NETWORK ENDPOINTS TO WATCH

| Endpoint | Expected | Ticket |
|----------|----------|--------|
| `/api/v1/retailer-admin/registration/lookup` | 200 | 011 |
| `/api/v1/retailer-admin/auth/firebase-otp-login` | 200 | 011 |
| `/api/v1/retailer-admin/auth/refresh` | 200 | 038 |
| `/api/v1/retailer-admin/auth/register` | 200/201 | 039 |
| `identitytoolkit.googleapis.com/*` | 200 | 011,039 |

---

## DEVTOOLS QUICK COMMANDS

```javascript
// Run these during testing:

checkFirebase()       // Verify Firebase/reCAPTCHA loaded
checkRetailerAuth()   // Check tokens and expiry
checkSupplierAuth()   // For supplier portal
auditStorage()        // List all localStorage
verifyLogout()        // Confirm logout cleared keys
enableNetworkMonitor() // Track API calls
exportResults()       // Get JSON of all data
```

---

## IF SOMETHING FAILS

| Symptom | Try |
|---------|-----|
| Firebase not loading | Check console for CSP errors |
| reCAPTCHA blocked | Check nginx CSP headers |
| OTP not arriving | Check Firebase console quotas |
| Login 401 | Check API Gateway logs |
| Token not persisting | Check browser allows localStorage |
| Redirect broken | Check React Router config |

---

## FINAL CHECKLIST

☐ All 6 tickets tested
☐ All screenshots saved with correct names
☐ `exportResults()` JSON saved
☐ test-results.md filled in
☐ Blocking issues documented
☐ Evidence folder uploaded to shared drive

**Operator**: _______________
**Date**: _______________
