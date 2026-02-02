# REG-AUTH-301 — Retailer Web UI (Registration-First Onboarding)

**Category:** AUTH & IDENTITY (FRONTEND)

**Scope:** retailer-admin (React + Vite)

**Depends On:** REG-AUTH-201, REG-AUTH-204

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- Registration MUST be completed before OTP login is allowed.
- LIMITED MODE banner MUST show for non-ACTIVE users.

---

## What is This Ticket?

This ticket implements the Registration-First UI for the Retailer Web Dashboard:

1. **RetailerOnboardingPage** — Multi-step registration form
2. **LimitedModeBanner** — Shows when user status ≠ ACTIVE
3. **AuthContext Updates** — Track applicationId and status
4. **Route Changes** — Add /retailer/onboard route

---

## User Flow

```
NEW RETAILER FLOW:
1. Go to /retailer/onboard
2. Fill business details (store name, GSTIN, address, phone)
3. Verify phone with OTP
4. Upload KYC documents (PAN, GSTIN certificate, address proof)
5. Submit → Status: KYC_SUBMITTED
6. Wait for admin approval → Status: ACTIVE
7. Login and use full features

EXISTING APPLICATION RESUME:
1. Go to /retailer/onboard
2. Enter GSTIN (already exists)
3. System detects existing application
4. Resume from where they left off
```

---

## Implementation Details

### 1. RetailerOnboardingPage.tsx

**Location:** `retailer-admin/src/pages/RetailerOnboardingPage.tsx`

**Multi-step form:**
- Step 1 (business): Store name, owner name, GSTIN, phone, email, address
- Step 2 (phone): Send OTP button (reCAPTCHA)
- Step 3 (otp): 6-digit OTP verification
- Step 4 (kyc): Upload PAN, GSTIN certificate, address proof
- Step 5 (success): Show application status and next steps

**Key Features:**
- GSTIN validation (15 chars, correct format)
- Pincode validation (6 digits)
- File upload with size/type validation (max 5MB, JPEG/PNG/WebP/PDF)
- Progress indicator showing current step
- Resume flow for existing GSTIN

### 2. LimitedModeBanner.tsx

**Location:** `retailer-admin/src/components/LimitedModeBanner.tsx`

**Shows when:** `user.applicationStatus !== 'ACTIVE'`

**Status-specific displays:**
- DRAFT: "Complete your registration and upload documents"
- KYC_SUBMITTED: "Your documents are being reviewed"
- PAYMENTS_SUBMITTED: "Final review stage"
- NEEDS_FIX: "Action required - please update your information"
- EXPIRED: "Application expired - contact support"

**Features:**
- Expandable restrictions list
- Blocked actions: Create Sales, Accept Payments, Place Reorders, etc.
- Allowed actions: View Dashboard, View Products, Edit Profile, etc.

### 3. AuthContext Updates

**Location:** `retailer-admin/src/lib/AuthContext.tsx`

**Added to User interface:**
```typescript
interface User {
  id: string;
  phone: string;
  role: string;
  applicationId?: string;      // REG-AUTH-301
  applicationStatus?: string;  // REG-AUTH-301
}
```

**Added to AuthContextType:**
```typescript
interface AuthContextType {
  // ... existing fields
  isLimitedMode: boolean;       // REG-AUTH-301
  applicationStatus: string | null;  // REG-AUTH-301
}
```

### 4. Route Changes

**Location:** `retailer-admin/src/App.tsx`

**Added route:**
```typescript
<Route path="/retailer/onboard" element={<RetailerOnboardingPage />} />
```

### 5. ProtectedLayout Integration

**Location:** `retailer-admin/src/components/ProtectedLayout.tsx`

**Added:**
- Import LimitedModeBanner
- Get isLimitedMode, applicationStatus from useAuth
- Render banner above main content when in LIMITED MODE

---

## Code Files

### Created:
- `retailer-admin/src/pages/RetailerOnboardingPage.tsx` — Multi-step registration
- `retailer-admin/src/components/LimitedModeBanner.tsx` — LIMITED MODE banner
- `tickets/REG-AUTH-301.md` — This documentation

### Modified:
- `retailer-admin/src/App.tsx` — Added /retailer/onboard route
- `retailer-admin/src/lib/AuthContext.tsx` — Added applicationId, applicationStatus, isLimitedMode
- `retailer-admin/src/components/ProtectedLayout.tsx` — Added LimitedModeBanner

---

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/retailer-admin/registration/check-gstin` | POST | Check if GSTIN exists |
| `/api/v1/retailer-admin/registration/create` | POST | Create new application |
| `/api/v1/retailer-admin/registration/verify-otp` | POST | Verify phone OTP (requires applicationId!) |
| `/api/v1/retailer-admin/registration/submit-kyc` | POST | Submit KYC documents |
| `/api/v1/documents/upload` | POST | Upload document files |

---

## Verification Proof

### Manual Test Steps

1. **New Registration Flow:**
```
1. Navigate to /retailer/onboard
2. Fill all business details
3. Click Continue
4. Verify reCAPTCHA appears
5. Click Send OTP
6. Enter OTP and verify
7. Upload 3 required documents
8. Click Submit Documents
9. See success screen with application status
```

2. **GSTIN Resume Flow:**
```
1. Navigate to /retailer/onboard
2. Enter a GSTIN that already exists
3. Verify system detects existing application
4. Resume from appropriate step
```

3. **LIMITED MODE Banner:**
```
1. Login as user with status = KYC_SUBMITTED
2. Verify LIMITED MODE banner appears
3. Verify blocked actions are listed
4. Verify allowed actions are listed
```

---

## Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Onboarding page loads | /retailer/onboard shows form |
| GSTIN validation | Invalid GSTIN shows error message |
| Phone OTP sends | Firebase sends SMS after reCAPTCHA |
| OTP verification | Successful verify moves to KYC step |
| Document upload | Files upload to backend successfully |
| KYC submission | Status changes to KYC_SUBMITTED |
| LIMITED MODE banner | Shows for non-ACTIVE users |
| Banner hides for ACTIVE | No banner when status = ACTIVE |

---

## Frontend Requirements Summary

### Registration Form
- Phone input with country code
- GSTIN input with format validation
- Address fields (line1, line2, city, state, pincode)
- File upload with drag-drop support
- Progress indicator

### LIMITED MODE UI
- Banner at top of dashboard
- Status badge showing current status
- Expandable restrictions list
- Link to complete registration if needed

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-02 | 1.0.0 | Initial implementation |

---

**IMPLEMENTED BY:** Claude Code (REG-AUTH-301)
