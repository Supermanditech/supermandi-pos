# REG-AUTH-302 — Supplier Portal UI (Registration-First Onboarding)

**Category:** AUTH & IDENTITY (FRONTEND)

**Scope:** supplier-portal (Next.js 16)

**Depends On:** REG-AUTH-202, REG-AUTH-204

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- Registration MUST be completed before OTP login is allowed.
- LIMITED MODE banner MUST show for non-verified suppliers.

---

## What is This Ticket?

This ticket implements the Registration-First UI for the Supplier Portal:

1. **SupplierOnboardingPage** — Multi-step registration form at /onboard
2. **LimitedModeBanner** — Shows when supplier status ≠ verified
3. **API Functions** — Registration API integration
4. **Dashboard Integration** — Banner in protected layout

---

## User Flow

```
NEW SUPPLIER FLOW:
1. Go to /onboard
2. Fill business details (business name, owner name, GSTIN required, email, phone, address)
3. Optionally add bank details (can be done later)
4. Verify phone with OTP
5. Upload KYC documents (PAN, GSTIN certificate, address proof)
6. Submit → Status: KYC_SUBMITTED
7. Wait for admin approval → Status: verified
8. Login and use full features

EXISTING APPLICATION RESUME:
1. Go to /onboard
2. Enter GSTIN (already exists)
3. System detects existing application
4. Resume from where they left off
```

---

## Implementation Details

### 1. SupplierOnboardingPage

**Location:** `supplier-portal/src/app/(auth)/onboard/page.tsx`

**Multi-step form:**
- Step 1 (business): Business name, owner name, GSTIN (required), email, phone, address, bank details (optional)
- Step 2 (phone): Send OTP button (reCAPTCHA)
- Step 3 (otp): 6-digit OTP verification
- Step 4 (kyc): Upload PAN, GSTIN certificate, address proof
- Step 5 (success): Show application status and next steps

**Key Features:**
- GSTIN validation (15 chars, correct format, REQUIRED for suppliers)
- GSTIN uniqueness check (resumes existing application)
- Optional bank details (can be added later in KYC)
- File upload with size/type validation
- Progress indicator
- Toast notifications for feedback

### 2. LimitedModeBanner.tsx

**Location:** `supplier-portal/src/components/LimitedModeBanner.tsx`

**Shows when:** `supplier.verificationStatus !== 'verified'`

**Status-specific displays:**
- pending: "Your account is pending admin approval"
- DRAFT: "Complete registration and upload documents"
- KYC_SUBMITTED: "Documents being reviewed"
- NEEDS_FIX: "Action required - update information"
- rejected: "Application not approved - contact support"

**Features:**
- Expandable restrictions list
- Blocked actions: Add Products, Process Orders, Receive Payouts
- Allowed actions: View Dashboard, Edit Profile, Upload Documents

### 3. API Functions

**Location:** `supplier-portal/src/lib/api.ts`

**Added Functions:**
```typescript
// Check if GSTIN exists
checkSupplierGstin(gstin: string)

// Create new application
createSupplierApplication(input: SupplierRegistrationInput)

// Verify OTP with applicationId (CRITICAL!)
verifySupplierOtp(idToken: string, applicationId: string)

// Submit KYC documents
submitSupplierKyc(applicationId: string)

// Get application status
getSupplierApplicationStatus(applicationId: string)

// Upload document
uploadSupplierDocument(applicationId: string, type: string, file: File)
```

### 4. Dashboard Layout Integration

**Location:** `supplier-portal/src/app/(dashboard)/layout.tsx`

**Added:**
- Import LimitedModeBanner component
- Render banner for non-verified suppliers above main content

---

## Code Files

### Created:
- `supplier-portal/src/app/(auth)/onboard/page.tsx` — Multi-step registration
- `supplier-portal/src/components/LimitedModeBanner.tsx` — LIMITED MODE banner
- `tickets/REG-AUTH-302.md` — This documentation

### Modified:
- `supplier-portal/src/lib/api.ts` — Added registration API functions
- `supplier-portal/src/app/(dashboard)/layout.tsx` — Added LimitedModeBanner

---

## API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/supplier/registration/check-gstin` | POST | Check if GSTIN exists |
| `/api/v1/supplier/registration/create` | POST | Create new application |
| `/api/v1/supplier/registration/verify-otp` | POST | Verify phone OTP (requires applicationId!) |
| `/api/v1/supplier/registration/submit-kyc` | POST | Submit KYC documents |
| `/api/v1/supplier/registration/status/:id` | GET | Get application status |
| `/api/v1/documents/upload` | POST | Upload document files |

---

## Verification Proof

### Manual Test Steps

1. **New Registration Flow:**
```
1. Navigate to /onboard
2. Fill all business details (GSTIN required)
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
1. Navigate to /onboard
2. Enter a GSTIN that already exists
3. Verify toast shows "Existing application found"
4. Resume from appropriate step
```

3. **LIMITED MODE Banner:**
```
1. Login as supplier with status = pending
2. Verify LIMITED MODE banner appears on dashboard
3. Verify blocked actions are listed
4. Verify allowed actions are listed
```

---

## Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Onboarding page loads | /onboard shows form |
| GSTIN required | Empty GSTIN shows error |
| GSTIN validation | Invalid GSTIN shows error message |
| Phone OTP sends | Firebase sends SMS after reCAPTCHA |
| OTP verification | Successful verify moves to KYC step |
| Document upload | Files upload to backend successfully |
| KYC submission | Status changes to KYC_SUBMITTED |
| LIMITED MODE banner | Shows for non-verified suppliers |
| Banner hides for verified | No banner when status = verified |

---

## Differences from Retailer (REG-AUTH-301)

| Feature | Retailer | Supplier |
|---------|----------|----------|
| GSTIN | Required | Required |
| Bank Details | At approval | Optional at registration |
| Status Field | applicationStatus | verificationStatus |
| Active Status | 'ACTIVE' | 'verified' |
| Portal Framework | React + Vite | Next.js 16 |
| Styling | Custom CSS | Tailwind CSS |

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-02 | 1.0.0 | Initial implementation |

---

**IMPLEMENTED BY:** Claude Code (REG-AUTH-302)
