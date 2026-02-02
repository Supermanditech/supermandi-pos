# REG-AUTH-401 — POS App LIMITED MODE Integration

**Category:** AUTH & IDENTITY (POS APP)

**Scope:** React Native POS App (Expo)

**Depends On:** REG-AUTH-204 (Limited Mode + Status Gates)

---

## Execution Rule for Claude

- Implement exactly as written.
- No redesign, no shortcuts, no skipping states.
- LIMITED MODE banner MUST show for non-ACTIVE stores.
- SELL/BUY/REORDER tabs MUST be blocked when store is not ACTIVE.

---

## What is This Ticket?

This ticket implements LIMITED MODE display for the POS App:

1. **Backend**: Add `storeStatus` to ui-status API response
2. **Frontend**: Create `LimitedModeBanner` component
3. **Frontend**: Integrate banner in `PosRootLayout`
4. **Frontend**: Update `uiStatusApi` to parse storeStatus

---

## User Flow

```
STORE IN LIMITED MODE:
1. POS device enrolled to store with status ≠ ACTIVE
2. Device boots and fetches ui-status
3. ui-status returns storeStatus (e.g., "KYC_SUBMITTED")
4. LimitedModeBanner displays with status-specific message
5. SELL/BUY/REORDER tabs are disabled (MENU only)
6. User sees blocked/allowed actions in expandable section

STORE BECOMES ACTIVE:
1. Admin approves store in SuperAdmin
2. Next ui-status poll returns storeStatus = "ACTIVE"
3. LimitedModeBanner hides
4. All tabs become accessible
```

---

## Implementation Details

### 1. Backend: ui-status API Enhancement

**Location:** `backend/src/routes/v1/pos/uiStatus.ts`

**Changes:**
- Added `storeStatus` variable to capture store status from database
- Returns `storeStatus` in JSON response (uppercase normalized)

**Response Format:**
```json
{
  "storeId": "uuid",
  "storeName": "Store Name",
  "storeCode": "SM-ABC123",
  "storeStatus": "KYC_SUBMITTED",
  "storeActive": false,
  "deviceActive": true,
  ...
}
```

### 2. Frontend: LimitedModeBanner Component

**Location:** `src/components/LimitedModeBanner.tsx`

**Features:**
- Status-specific colors and icons
- Status-specific messages explaining the situation
- Expandable "View restrictions" section
- Lists blocked actions (SELL, Payments, Orders, Reorders)
- Lists allowed actions (View Menu, View Products, Sync Data)
- Automatically hides when status is ACTIVE

**Supported Statuses:**
| Status | Color | Message |
|--------|-------|---------|
| DRAFT | Amber | Complete registration and upload documents |
| KYC_SUBMITTED | Blue | Documents being reviewed (1-2 business days) |
| PAYMENTS_SUBMITTED | Blue | Application in final review |
| ENROLLED | Amber | Awaiting full approval |
| NEEDS_FIX | Red | Update information and resubmit |
| REJECTED | Red | Application not approved - contact support |
| EXPIRED | Gray | Application expired - contact support |
| PENDING | Amber | Pending admin approval |

### 3. Frontend: uiStatusApi Update

**Location:** `src/services/api/uiStatusApi.ts`

**Changes:**
- Added `storeStatus` to `UiStatusResponse` type
- Parse `storeStatus` from both nested and flat response formats
- Uppercase normalization for consistent comparison

### 4. Frontend: PosRootLayout Integration

**Location:** `src/screens/PosRootLayout.tsx`

**Changes:**
- Import `LimitedModeBanner` component
- Add `storeStatus` state variable
- Update `loadStatus` to set storeStatus from API response
- Replace DEV-055 store inactive banner with LimitedModeBanner
- Removed unused `storeInactiveBanner` styles

---

## Code Files

### Created:
- `src/components/LimitedModeBanner.tsx` — LIMITED MODE banner component
- `tickets/REG-AUTH-401.md` — This documentation

### Modified:
- `backend/src/routes/v1/pos/uiStatus.ts` — Added storeStatus field
- `src/services/api/uiStatusApi.ts` — Parse storeStatus
- `src/screens/PosRootLayout.tsx` — Integrate LimitedModeBanner

---

## API Endpoint Changes

| Endpoint | Change |
|----------|--------|
| `GET /api/v1/pos/ui-status` | Added `storeStatus` field |

---

## Verification Proof

### Manual Test Steps

1. **LIMITED MODE Banner Display:**
```
1. Enroll POS device to store with status = KYC_SUBMITTED
2. Open app and navigate to main screen
3. Verify LIMITED MODE banner appears
4. Verify message says "Your documents are being reviewed..."
5. Tap "View restrictions"
6. Verify blocked actions listed: Create Sales, Process Payments, etc.
7. Verify allowed actions listed: View Menu, View Products, etc.
```

2. **Tab Blocking:**
```
1. With LIMITED MODE active (storeStatus ≠ ACTIVE)
2. Verify SELL tab is disabled/blocked
3. Verify PURCHASE tab is disabled/blocked
4. Verify REORDER tab is disabled/blocked
5. Verify MENU tab is accessible
6. Verify scan operations show "Store is inactive" toast
```

3. **Status Transition:**
```
1. Start with store status = KYC_SUBMITTED
2. Admin changes store status to ACTIVE
3. Wait for next ui-status poll (60 seconds)
4. Verify LIMITED MODE banner disappears
5. Verify all tabs become accessible
```

---

## Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| Banner shows for KYC_SUBMITTED | Yellow/blue banner with review message |
| Banner shows for NEEDS_FIX | Red banner with action required message |
| Banner hides for ACTIVE | No banner visible |
| Restrictions expandable | Tap shows blocked/allowed lists |
| Tabs blocked in LIMITED MODE | Only MENU accessible |
| Scan blocked in LIMITED MODE | Toast shows "Store is inactive" |

---

## Differences from Web Apps (REG-AUTH-301, REG-AUTH-302)

| Feature | Web Apps | POS App |
|---------|----------|---------|
| Registration Flow | Multi-step form at /onboard | N/A - uses enrollment code |
| Auth Method | Firebase Phone OTP | Device Token |
| Status Source | JWT claims + API | ui-status API |
| Banner Location | Dashboard layout | PosRootLayout |
| Styling | CSS/Tailwind | React Native StyleSheet |

---

## Architecture Notes

The POS app uses **device enrollment** rather than user registration:

1. **Enrollment Code**: Generated by SuperAdmin, ties device to store
2. **Device Token**: Authenticates all POS API calls
3. **Store Status**: Derived from `platform.stores.status` column
4. **LIMITED MODE**: Triggered when store status ≠ 'ACTIVE'

The registration-first principle is enforced at the store level:
- Store must be created (via retailer web registration)
- Store must be approved (status = ACTIVE)
- Only then can POS devices operate fully

---

## Change Log

| Date | Version | Change |
|------|---------|--------|
| 2026-02-02 | 1.0.0 | Initial implementation |

---

**IMPLEMENTED BY:** Claude Code (REG-AUTH-401)
