# V3 Gap Tickets — Derived from Screen Registry

> HEAD: 1c6cc860 | 103 fixes | Zero drift
> Source: V3_SCREEN_REGISTRY.md — 27 screens, 12 gaps identified

## HIGH Priority (2)

### V3-057: Integrate SMS gateway for OTP delivery
- **Screen**: 2 (Login)
- **Gap**: OTP is console.log only — no SMS/WhatsApp delivery
- **Scope**:
  - Backend: Add SMS provider integration (MSG91 or Twilio)
  - Config: EXPO_PUBLIC_SMS_PROVIDER, SMS_API_KEY env vars
  - File: backend/src/routes/v1/pos/otpAuth.ts (replace console.log with SMS call)
  - NEW: backend/src/services/smsService.ts (provider abstraction)
  - Fallback: WhatsApp Business API as secondary channel
- **DB**: None
- **GCP**: Add SMS_API_KEY to Secret Manager

### V3-058: Wire real wholesale pricing from supplier_products
- **Screen**: 3 (Sell), 14 (Buy)
- **Gap**: Trade price uses estimated 85% of MRP instead of real PTR/PTS
- **Scope**:
  - Frontend: SellScreenV3 reads priceTradeMinor from product (already has the field)
  - Backend: Return ptr_minor, pts_minor in store-products response
  - DB: Migration 190 adds wholesale columns (WRITTEN, not applied)
  - Requires: GCP staging deploy to apply migration 190
- **Blocked by**: GCP deploy (ON HOLD per operator)

## MEDIUM Priority (5)

### V3-059: Wire dynamic categories from getFmcgCategories API
- **Screen**: 3 (Sell)
- **Gap**: Category chips use static list, not API-driven
- **Scope**:
  - File: src/screens/v3/SellScreenV3.tsx
  - Change: Replace static CATEGORIES with useEffect calling getFmcgCategories
  - API: catalogApi.getFmcgCategories(storeId) — already exists
  - Fallback: Static list if API fails

### V3-060: Wire product photo capture in NewProductScreenV3
- **Screen**: 8 (New Product)
- **Gap**: Camera icon shows but no expo-camera integration
- **Scope**:
  - File: src/screens/v3/NewProductScreenV3.tsx
  - Add: expo-image-picker for camera/gallery
  - Upload: POST /api/v1/pos/store-products/:id/image (existing endpoint)
  - Fallback: Product created without photo (placeholder shown)

### V3-061: Implement split payment in PaymentScreenV3
- **Screen**: 9 (Payment Hub)
- **Gap**: Split Payment button exists but no implementation
- **Scope**:
  - File: src/screens/v3/PaymentScreenV3.tsx
  - Add: Split modal — enter Cash amount, remainder auto-calc for UPI/Due
  - API: createSplitPayment from posApi (already exists)
  - UI: Two-column amount entry, method selectors

### V3-062: Finance screen — full BNPL loan management UI
- **Screen**: 22 (Finance)
- **Gap**: Shows offer count only, no full loan list or application flow
- **Scope**:
  - File: src/screens/v3/FinanceScreenV3.tsx
  - Add: Offers tab (list from getCreditOffers), Loans tab (from getCreditApplications), Apply flow
  - API: creditApi.getCreditOffers, applyForCredit, getCreditApplications — all exist
  - Feature gate: Check credit feature enabled before showing

### V3-063: Multi-store selector for same-phone users
- **Screen**: 2 (Login)
- **Gap**: OTP verify returns first ACTIVE store (LIMIT 1)
- **Scope**:
  - Backend: Remove LIMIT 1, return all stores for phone
  - Frontend: If >1 store returned, show store selector screen before POS
  - NEW screen: StoreSelectScreenV3 (simple list with store name + code)

## LOW Priority (5)

### V3-064: Persist recent searches to AsyncStorage
- **Screen**: 4 (Search)

### V3-065: Enforce max 3 parked carts in CartSheetV3
- **Screen**: 5 (Cart)

### V3-066: Reports week/month period aggregation
- **Screen**: 23 (Reports)

### V3-067: Sales history bill detail sub-screen
- **Screen**: 26 (Sales History)

### V3-068: Wire Register here link to Linking.openURL
- **Screen**: 2 (Login)

---

## Implementation Order
1. V3-059 (dynamic categories) — quick, no backend change
2. V3-060 (photo capture) — medium, expo-image-picker
3. V3-068 (register link) — trivial
4. V3-064 (recent searches) — quick
5. V3-065 (parked cart limit) — quick
6. V3-061 (split payment) — medium
7. V3-062 (finance UI) — medium
8. V3-066 (reports periods) — low
9. V3-067 (bill detail) — low
10. V3-057 (SMS gateway) — HIGH but requires SMS provider account
11. V3-058 (wholesale pricing) — HIGH but blocked by GCP deploy
12. V3-063 (multi-store) — needs backend change
