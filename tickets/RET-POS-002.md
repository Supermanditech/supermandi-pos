# RET-POS-002 — POS Limited Mode Enforcement

**Category:** RETAILER ONBOARDING — POS FLOW (PRIMARY)

**Scope:** POS App + Backend

---

## Implement

In **LIMITED MODE**:

### Allowed:
- App navigation
- Product creation

### Blocked:
- SELL
- UPI QR
- Payments
- Invoice finalization

---

## Acceptance

- [ ] SELL APIs blocked server-side if status ≠ ACTIVE

---

## A) Existing Code Audit (before implementation)

### rg searches ran:

```bash
rg "LIMITED|limited.*mode" --type ts -l
rg "status.*ACTIVE|isActive" --type ts -l
rg "sell|SELL|invoice" --type ts -l
rg "payment.*block|block.*payment" --type ts -l
```

### Current flow summary:

**Backend API Checks:**
- Current: Most endpoints don't check store status
- `backend/src/routes/v1/pos/` — POS endpoints
- No consistent status gating middleware
- Some ad-hoc checks in individual routes

**POS App:**
- No LIMITED MODE concept currently
- All features available once device enrolled
- No UI-level feature gating based on store status

**Current SELL/Payment Flow:**
- `POST /api/v1/pos/sales` — Creates sale (no status check)
- `POST /api/v1/pos/payments` — Records payment (no status check)
- `GET /api/v1/pos/qr` — Generates UPI QR (no status check)

### Gaps vs plan:

- [ ] **No LIMITED MODE**: Concept doesn't exist in POS
- [ ] **No server-side gating**: APIs don't check store status
- [ ] **No UI gating**: All features visible/accessible
- [ ] **No status-based middleware**: Need central enforcement

### Retailer Dashboard already covers part of this ticket?

**NO** — Retailer Dashboard doesn't have SELL/POS features. This is POS-only functionality.

---

## B) Implementation Subtickets (UI→API→DB)

### B.1) UI Subtickets

#### B.1.1) POS Screens
- [ ] **RET-POS-002-UI-1**: Limited Mode indicator
  - File: `src/components/LimitedModeBar.tsx` (NEW)
  - Persistent banner: "Your store is pending approval. Some features are limited."
  - Show on all screens when status ≠ ACTIVE

- [ ] **RET-POS-002-UI-2**: Feature gating in Sell screen
  - File: `src/screens/SellScreen.tsx`
  - If LIMITED MODE: Show overlay "Feature locked until store approved"
  - Disable cart actions, checkout button

- [ ] **RET-POS-002-UI-3**: Feature gating in Payments
  - File: `src/screens/PaymentsScreen.tsx`
  - If LIMITED MODE: Show lock overlay
  - Disable payment recording

- [ ] **RET-POS-002-UI-4**: Feature gating in UPI QR
  - File: `src/screens/QRScreen.tsx` or `src/components/UpiQR.tsx`
  - If LIMITED MODE: Don't generate QR
  - Show "QR payments available after approval"

- [ ] **RET-POS-002-UI-5**: Product creation allowed
  - File: `src/screens/ProductsScreen.tsx`
  - Verify: Product creation works in LIMITED MODE
  - Add, edit, delete products should work

### B.2) API Subtickets

#### B.2.1) Status Gate Middleware
- [ ] **RET-POS-002-API-MW**: Create POS status middleware
  - File: `backend/src/middleware/posStatusGate.ts` (NEW)
  - Applied to sensitive POS endpoints
  - Checks store status from JWT/context
  - Returns `403 { error: "STORE_NOT_ACTIVE", status: "..." }` if not ACTIVE

#### B.2.2) Apply to SELL Endpoints
- [ ] **RET-POS-002-API-SELL**: Gate sales endpoints
  - File: `backend/src/routes/v1/pos/sales.ts`
  - Apply middleware to:
    - `POST /api/v1/pos/sales` — Create sale
    - `POST /api/v1/pos/sales/:id/finalize` — Finalize invoice
    - `POST /api/v1/pos/sales/:id/void` — Void sale

#### B.2.3) Apply to Payment Endpoints
- [ ] **RET-POS-002-API-PAY**: Gate payment endpoints
  - File: `backend/src/routes/v1/pos/payments.ts`
  - Apply middleware to:
    - `POST /api/v1/pos/payments` — Record payment
    - `GET /api/v1/pos/qr` — Generate UPI QR

#### B.2.4) Allowed Endpoints (no gating)
- [ ] **RET-POS-002-API-ALLOW**: Verify allowed endpoints work
  - `GET /api/v1/pos/products` — List products ✓
  - `POST /api/v1/pos/products` — Create product ✓
  - `PUT /api/v1/pos/products/:id` — Update product ✓
  - `DELETE /api/v1/pos/products/:id` — Delete product ✓
  - `GET /api/v1/pos/store` — Get store info ✓

### B.3) DB/Migration Subtickets

#### B.3.1) No new migrations needed
- Status field already exists in `platform.stores`
- No new columns required for this ticket

---

## C) Deployment Subtickets (VM)

### Services to rebuild:

| Service | Rebuild Required | Reason |
|---------|------------------|--------|
| `main-backend` | YES | New status gate middleware |
| `api-gateway` | NO | No routing changes |
| `nginx` | NO | No changes |

### Deploy commands:

```bash
# On VM (34.14.220.171)
cd /opt/supermandi

# 1. Rebuild main-backend with new middleware
docker compose -f docker-compose.prod.yml up -d --build main-backend

# 2. Test endpoints immediately after deploy
curl -X POST http://34.14.220.171:3000/api/v1/pos/sales \
  -H "Authorization: Bearer TOKEN_OF_NON_ACTIVE_STORE" \
  -H "Content-Type: application/json" \
  -d '{"items": []}'
# Should return 403
```

### POS App Update:
- POS app needs update for UI gating
- Can be OTA update (Expo) or app store

---

## D) Verification Proof (must be attached per ticket)

### D.1) Curl Proof

```bash
# Get store status
curl -X GET https://supermandi.tech/api/v1/pos/store \
  -H "Authorization: Bearer NON_ACTIVE_STORE_TOKEN"
# Expected: 200 { "id": "...", "status": "PAYMENTS_SUBMITTED", ... }

# Try to create sale (BLOCKED)
curl -X POST https://supermandi.tech/api/v1/pos/sales \
  -H "Authorization: Bearer NON_ACTIVE_STORE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"product_id": "...", "quantity": 1}]}'
# Expected: 403 { "error": "STORE_NOT_ACTIVE", "status": "PAYMENTS_SUBMITTED" }

# Try to record payment (BLOCKED)
curl -X POST https://supermandi.tech/api/v1/pos/payments \
  -H "Authorization: Bearer NON_ACTIVE_STORE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"sale_id": "...", "amount": 100, "method": "cash"}'
# Expected: 403 { "error": "STORE_NOT_ACTIVE" }

# Try to generate QR (BLOCKED)
curl -X GET https://supermandi.tech/api/v1/pos/qr \
  -H "Authorization: Bearer NON_ACTIVE_STORE_TOKEN"
# Expected: 403 { "error": "STORE_NOT_ACTIVE" }

# Create product (ALLOWED)
curl -X POST https://supermandi.tech/api/v1/pos/products \
  -H "Authorization: Bearer NON_ACTIVE_STORE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Product", "price": 100}'
# Expected: 201 { "id": "...", "name": "Test Product" }

# After store approved, try sale again
curl -X POST https://supermandi.tech/api/v1/pos/sales \
  -H "Authorization: Bearer ACTIVE_STORE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"items": [{"product_id": "...", "quantity": 1}]}'
# Expected: 201 { "id": "...", "status": "pending" }
```

### D.2) Real-user Proof

1. **Non-ACTIVE store on POS:**
   - Login to POS with non-ACTIVE store
   - See LIMITED MODE banner at top

2. **Try SELL (blocked):**
   - Go to Sell screen
   - See "Feature locked" overlay
   - Cannot add items to cart

3. **Try Payments (blocked):**
   - Go to Payments
   - See locked state
   - Cannot record payments

4. **Try UPI QR (blocked):**
   - Go to QR screen
   - See "QR payments available after approval"

5. **Product creation (allowed):**
   - Go to Products
   - Create new product successfully
   - Edit product successfully

6. **After admin approval:**
   - Admin approves store
   - Refresh POS
   - LIMITED MODE banner gone
   - All features now accessible

### D.3) Evidence Required
- [ ] Screenshot: POS LIMITED MODE banner
- [ ] Screenshot: Sell screen locked
- [ ] Screenshot: Payment screen locked
- [ ] Screenshot: QR screen locked
- [ ] Screenshot: Product created successfully in LIMITED MODE
- [ ] Screenshot: All features unlocked after ACTIVE
- [ ] Curl output logs (403 for blocked, 201 for allowed)

### D.4) Pass/Fail Criteria

| Test | Pass Criteria |
|------|---------------|
| LIMITED MODE banner | Shows on all screens when not ACTIVE |
| SELL blocked | 403 from API, UI shows locked |
| Payments blocked | 403 from API, UI shows locked |
| UPI QR blocked | 403 from API, UI shows locked |
| Products allowed | 201 from API, UI works normally |
| Navigation allowed | All screens accessible |
| Unlock on ACTIVE | All features work after approval |

---

## Retailer Dashboard Impact Review

**Retailer Dashboard impact reviewed: NO**

This ticket is POS-only. Retailer Dashboard doesn't have SELL/Payment features. However, Retailer Dashboard should:
- Show store status (covered in CORE-001)
- Indicate what's pending for approval
