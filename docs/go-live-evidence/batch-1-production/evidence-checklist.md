# BATCH 1 EVIDENCE CHECKLIST (PRODUCTION)

**Domain**: `https://supermandi.tech`
**Date**: _______________
**Operator**: _______________

---

## PRE-FLIGHT: URL Map Verification

Run this curl verification to confirm all URLs work:

```bash
for url in "/" "/retailer/" "/retailer/login" "/retailer/register" "/supplier/" "/supplier/login" "/supplier/login/" "/admin/" "/api/v1/health"; do
  echo -n "$url: "
  curl -sI "https://supermandi.tech$url" 2>/dev/null | head -1
done
```

**Expected Output**:
```
/: HTTP/1.1 200 OK
/retailer/: HTTP/1.1 200 OK
/retailer/login: HTTP/1.1 200 OK
/retailer/register: HTTP/1.1 200 OK
/supplier/: HTTP/1.1 200 OK
/supplier/login: HTTP/1.1 308 Permanent Redirect
/supplier/login/: HTTP/1.1 200 OK
/admin/: HTTP/1.1 200 OK
/api/v1/health: HTTP/1.1 200 OK
```

- [ ] All URLs return expected status codes

---

## RET-AUD-011: Firebase OTP Login

| # | Step | Check |
|---|------|-------|
| 1 | Open `https://supermandi.tech/retailer/login` | [ ] Page loads |
| 2 | F12 → Console → paste devtools snippets | [ ] All loaded |
| 3 | Run `checkFirebase()` | [ ] Firebase: LOADED |
| 4 | Enter phone number | [ ] Field accepts |
| 5 | Click Continue | [ ] Network: `/registration/lookup` = 200 |
| 6 | Wait for OTP screen | [ ] reCAPTCHA invisible, OTP input shows |
| 7 | Enter OTP from SMS | [ ] OTP accepted |
| 8 | Verify login completes | [ ] Network: `/auth/firebase-otp-login` = 200 |
| 9 | Confirm dashboard | [ ] `checkRetailerAuth()` → authenticated: true |

**Screenshots**:
- [ ] `RET-011-01-login-page.png`
- [ ] `RET-011-02-otp-screen.png`
- [ ] `RET-011-03-dashboard.png`
- [ ] `RET-011-04-storage.png`

**Status**: [ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## RET-AUD-014: Session Persistence

**Prereq**: Logged in from RET-011

| # | Step | Check |
|---|------|-------|
| 1 | On dashboard | [ ] `checkRetailerAuth()` → token present |
| 2 | Note token hash (last 20 chars) | `____________` |
| 3 | Press F5 (refresh) | [ ] Page reloads |
| 4 | Run `checkRetailerAuth()` | [ ] Same token hash |
| 5 | Press Ctrl+Shift+R (hard refresh) | [ ] Page reloads |
| 6 | Check auth again | [ ] Still authenticated |

**Screenshots**:
- [ ] `RET-014-01-pre-refresh.png`
- [ ] `RET-014-02-storage-pre.png`
- [ ] `RET-014-03-post-refresh.png`
- [ ] `RET-014-04-storage-post.png`

**Status**: [ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## RET-AUD-021: Protected Route Redirect

**Use Incognito window (Ctrl+Shift+N)**

| # | Step | Check |
|---|------|-------|
| 1 | Open Incognito window | [ ] New window |
| 2 | F12 → Application → Storage | [ ] localStorage empty |
| 3 | Navigate to `https://supermandi.tech/s/TESTSTORE/products` | [ ] Redirect happens |
| 4 | Check URL | [ ] Now at `/retailer/login` |
| 5 | Console: `location.href` | [ ] Contains `/login` |

**Screenshots**:
- [ ] `RET-021-01-incognito-empty.png`
- [ ] `RET-021-02-redirect-complete.png`
- [ ] `RET-021-03-network.png`

**Status**: [ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## RET-AUD-028: Logout Clears Tokens

**Prereq**: Logged in

| # | Step | Check |
|---|------|-------|
| 1 | On dashboard | [ ] `auditStorage()` → retailer keys present |
| 2 | Find logout button | [ ] Button visible |
| 3 | Click logout | [ ] Processing |
| 4 | Wait for redirect | [ ] At login page |
| 5 | Console: `verifyLogout()` | [ ] All PASS |
| 6 | Try protected URL | [ ] Stays on login |

**Screenshots**:
- [ ] `RET-028-01-pre-logout-storage.png`
- [ ] `RET-028-02-logout-button.png`
- [ ] `RET-028-03-post-logout-url.png`
- [ ] `RET-028-04-post-logout-storage.png`

**Status**: [ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## RET-AUD-038: Token Auto-Refresh

| # | Step | Check |
|---|------|-------|
| 1 | Login | [ ] `checkRetailerAuth()` → note expiry |
| 2 | Console: `enableNetworkMonitor()` | [ ] Monitor active |
| 3 | Wait or use short-lived token | [ ] Watch for refresh |
| 4 | If refresh seen | [ ] Network: `/auth/refresh` = 200 |
| 5 | Check new token | [ ] `checkRetailerAuth()` → new expiry |

**Note**: Mark BLOCKED if token expiry > 1 hour and cannot wait

**Screenshots**:
- [ ] `RET-038-01-initial-token.png`
- [ ] `RET-038-02-network-refresh.png` (if observable)
- [ ] `RET-038-03-new-token.png` (if observable)

**Status**: [ ] PASS  [ ] FAIL  [ ] BLOCKED: ________________

---

## RET-AUD-039: Registration + GSTIN

| # | Step | Check |
|---|------|-------|
| 1 | Open `https://supermandi.tech/retailer/register` | [ ] Page loads |
| 2 | Find GSTIN field | [ ] Field exists |
| 3 | Enter `22AAAAA0000A1Z5` | [ ] Validation passes |
| 4 | Fill other required fields | [ ] Form accepts |
| 5 | Submit | [ ] OTP screen appears |
| 6 | Enter OTP | [ ] OTP verified |
| 7 | Complete | [ ] Success or pending approval |

**Screenshots**:
- [ ] `RET-039-01-register-page.png`
- [ ] `RET-039-02-gstin-entered.png`
- [ ] `RET-039-03-otp-screen.png`
- [ ] `RET-039-04-success.png`

**Status**: [ ] PASS  [ ] FAIL  [ ] BLOCKED

---

## FINAL CHECKLIST

- [ ] All 6 tickets tested
- [ ] All screenshots saved with correct names
- [ ] `exportResults()` JSON saved as `export-data.json`
- [ ] This checklist filled in
- [ ] Blocking issues documented below

## BLOCKING ISSUES

1. ___________________________________
2. ___________________________________

## SIGN-OFF

**Operator**: _______________
**Date**: _______________
**Overall Result**: [ ] ALL PASS  [ ] PARTIAL  [ ] BLOCKED
