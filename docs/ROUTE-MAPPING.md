# SuperMandi POS - API Route Mapping

> GW-DECIDE-001: Final Route Ownership Map
> Created: 2026-01-21

## Overview

This document defines the authoritative route ownership map for the SuperMandi POS system.
All routes are accessed via the **API Gateway** on port **3000**.

## Service Architecture

| Service | Internal Port | Description |
|---------|---------------|-------------|
| api-gateway | 3000 | Public entry point, routes + auth |
| backend (monolith) | 3001 | POS endpoints, Admin/POS events, Analytics |
| platform-service | 3002 | Admin stores, Retailer portal, Platform config |
| supplier-service | 3003 | Supplier management |
| catalog-service | 3004 | Product catalog |
| inventory-service | 3005 | Inventory & stock |
| order-service | 3006 | Purchase orders |
| reorder-service | 3007 | Reorder suggestions |
| enroll-service | 3009 | Device enrollment |

---

## Route Mapping Table

### Admin Routes (`/api/v1/admin/*`)

| Route | Target Service | Port | Auth Method | stripPrefix |
|-------|----------------|------|-------------|-------------|
| `/api/v1/admin/pos/events` | backend | 3001 | x-admin-token | false |
| `/api/v1/admin/analytics/*` | backend | 3001 | x-admin-token | false |
| `/api/v1/admin/devices` | backend | 3001 | x-admin-token | false |
| `/api/v1/admin/devices/:id/*` | backend | 3001 | x-admin-token | false |
| `/api/v1/admin/ai/*` | backend | 3001 | x-admin-token | false |
| `/api/v1/admin/barcode-sheets/*` | backend | 3001 | x-admin-token | false |
| `/api/v1/admin/global-products/*` | backend | 3001 | x-admin-token | false |
| `/api/v1/admin/stores/*` | backend | 3001 | x-admin-token | false |
| `/api/v1/admin/pending-suppliers` | platform-service | 3002 | x-admin-token | false |

### POS Routes (`/api/v1/pos/*`)

| Route | Target Service | Port | Auth Method | stripPrefix |
|-------|----------------|------|-------------|-------------|
| `/api/v1/pos/scan/resolve` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/suppliers` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/suppliers/:id` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/events` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/sales/*` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/purchases/*` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/stores/:id/*` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/sync/*` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/devices/*` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/ui-status` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/inventory/*` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/store-products/*` | backend | 3001 | x-device-token | true |
| `/api/v1/pos/enroll` | enroll-service | 3009 | none (enrollment) | true |

### Retailer Admin Routes (`/api/v1/retailer-admin/*`)

| Route | Target Service | Port | Auth Method | stripPrefix |
|-------|----------------|------|-------------|-------------|
| `/api/v1/retailer-admin/auth/*` | backend | 3001 | Firebase token | true |
| `/api/v1/retailer-admin/inventory` | backend | 3001 | JWT (retailer) | false |
| `/api/v1/retailer-admin/inventory/ledger` | backend | 3001 | JWT (retailer) | false |
| `/api/v1/retailer-admin/categories` | backend | 3001 | JWT (retailer) | false |
| `/api/v1/retailer-admin/categories/:id/products` | backend | 3001 | JWT (retailer) | false |
| `/api/v1/retailer-admin/*` | platform-service | 3002 | JWT (retailer) | true |

> **Note**: More specific routes (inventory, categories) must come before the catch-all `/*` route.

### Other Service Routes

| Route | Target Service | Port | Auth Method | stripPrefix |
|-------|----------------|------|-------------|-------------|
| `/api/v1/auth/*` | backend | 3001 | varies | true |
| `/api/v1/platform/*` | platform-service | 3002 | JWT | true |
| `/api/v1/suppliers/*` | supplier-service | 3003 | JWT | true |
| `/api/v1/catalog/*` | catalog-service | 3004 | JWT | true |
| `/api/v1/inventory/*` | inventory-service | 3005 | JWT | true |
| `/api/v1/orders/*` | order-service | 3006 | JWT | true |
| `/api/v1/reorder/*` | reorder-service | 3007 | JWT | true |

---

## Authentication Methods

| Method | Header | Description |
|--------|--------|-------------|
| x-admin-token | `x-admin-token: <ADMIN_TOKEN>` | Static token for superadmin (env: `ADMIN_TOKEN`) |
| x-device-token | `x-device-token: <device_token>` | Device JWT from enrollment |
| JWT (retailer) | `Authorization: Bearer <token>` | Firebase ID token exchanged for JWT |
| Firebase token | `Authorization: Bearer <firebase_id_token>` | Raw Firebase ID token for auth endpoints |

---

## Gateway Configuration Reference

The gateway config is defined in:
- `backend/services/api-gateway/src/config.ts`

Key rules:
1. **More specific routes must come before less specific ones**
2. **Admin routes use `stripPrefix: false`** to preserve full path
3. **POS routes use `stripPrefix: true`** (default) to strip `/api/v1/pos`

---

## Critical Endpoints for Go-Live

These endpoints MUST return 200/401 (never 404) via gateway:

```
# Admin endpoints (via :3000)
GET  /api/v1/admin/pos/events
GET  /api/v1/admin/analytics/overview
GET  /api/v1/admin/devices

# POS endpoints (via :3000)
POST /api/v1/pos/scan/resolve
GET  /api/v1/pos/suppliers

# Retailer Admin endpoints (via :3000) - FE-RETAILER-INVENTORY-001, FE-RETAILER-CAT-001
GET  /api/v1/retailer-admin/inventory
GET  /api/v1/retailer-admin/inventory/ledger
GET  /api/v1/retailer-admin/categories
GET  /api/v1/retailer-admin/categories/:id/products
```

---

## Verification Commands

```bash
# Test admin endpoints (should return 401 without token, 200 with valid token)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/admin/pos/events
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/admin/analytics/overview
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/admin/devices

# Test POS endpoints (should return 401 without token)
curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/v1/pos/scan/resolve
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/pos/suppliers

# Test retailer-admin endpoints (should return 401 without JWT Bearer token)
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/retailer-admin/inventory
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/retailer-admin/inventory/ledger
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/retailer-admin/categories
```

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| BACKEND_SERVICE_URL | http://localhost:3001 | Main backend (monolith) |
| PLATFORM_SERVICE_URL | http://localhost:3002 | Platform service |
| ENROLL_SERVICE_URL | http://supermandi-enroll-service:3009 | Device enrollment |
| AUTH_SERVICE_URL | http://localhost:3001 | Auth (same as backend) |

---

## Change History

| Date | Change | Author |
|------|--------|--------|
| 2026-01-22 | Added Navigation Testability Checklist | Claude |
| 2026-01-21 | FE-RETAILER-INVENTORY-001, FE-RETAILER-CAT-001: Added inventory/categories routes | Claude |
| 2026-01-21 | GW-ROUTES-001: Fixed POS routing to backend, added env vars | Claude |
| 2026-01-21 | Initial route mapping for Go-Live | Claude |

---

## Navigation Testability Checklist (Go-Live)

> Added: 2026-01-22
> Ticket: Reveal + Make Clickable (Live Test)

### A) Retailer Dashboard (Web Desktop)

| Feature/Screen | Route | Navigation Path | Status |
|----------------|-------|-----------------|--------|
| **Dashboard** | `/s/:storeCode` | Sidebar: Dashboard | REACHABLE |
| **Products** | `/s/:storeCode/products` | Sidebar: Products | REACHABLE |
| **Add Product (Web Form)** | `/s/:storeCode/products?action=create` | Dashboard: "Add Products (Without Supplier)" > "Web Form" | REACHABLE |
| **Add Product (CSV)** | `/s/:storeCode/import` | Dashboard: "Add Products (Without Supplier)" > "CSV Upload" | REACHABLE |
| **Product Mode Selection** | Products page | In create form: PACKAGED / LOOSE_BULK toggle | REACHABLE |
| **SKU PDF Download** | `/api/v1/retailer-admin/products/:productId/sku.pdf` | Products page: PDF icon per product, or after create success | REACHABLE |
| **Categories View** | Dashboard page | Dashboard: "Product Categories" section | REACHABLE |
| **Inventory Ledger** | `/s/:storeCode/inventory` | Sidebar: Inventory | REACHABLE |
| **Suppliers** | `/s/:storeCode/suppliers` | Sidebar: Suppliers | REACHABLE |
| **Add Supplier** | `/s/:storeCode/suppliers?action=create` | Dashboard: "Add Supplier (Market Supplier)" OR Suppliers: "+ Add Supplier" | REACHABLE |
| **Import CSV** | `/s/:storeCode/import` | Sidebar: Import CSV | REACHABLE |
| **Compliance Docs** | `/s/:storeCode/compliance` | Sidebar: Compliance | REACHABLE |
| **QA Test Hub** | `/s/:storeCode/_pages` | Direct URL only (developer route) | REACHABLE |

**Entry Points per PDF Spec:**
- "Retailer Dashboard > Primary action > Add Products (Without Supplier) > Web Form" - **WORKING**
- Categories auto-sync from POS taxonomy - **WORKING**
- SKU PDF Download for loose products - **WORKING**

---

### B) SuperMandi Admin Dashboard (Web Desktop)

| Feature/Screen | Tab Name | Navigation Path | Status |
|----------------|----------|-----------------|--------|
| **POS Events Stream** | Events | Header tabs: "Events" | REACHABLE |
| **Device Management** | Devices | Header tabs: "Devices" | REACHABLE |
| **Device Enrollment** | Devices | Devices tab > QR code scanner | REACHABLE |
| **Store Management** | Stores | Header tabs: "Stores" | REACHABLE |
| **Create Store** | Stores | Stores tab > "Create Store" button | REACHABLE |
| **UPI VPA Activation** | Stores | Stores tab > Store row > "Activate UPI" | REACHABLE |
| **Barcode Sheet Gen** | Stores | Stores tab > Store row > "Barcode Sheet" | REACHABLE |
| **Supplier Verification** | Suppliers | Header tabs: "Suppliers" | REACHABLE |
| **Pending Suppliers Badge** | Suppliers | Shows count badge on tab when pending > 0 | REACHABLE |
| **Analytics Dashboard** | Analytics | Header tabs: "Analytics" | REACHABLE |
| **Analytics Sub-tabs** | Analytics | Overview, Devices, Products, Payments, Purchases, Consumer | REACHABLE |
| **Payment Events** | Payments | Header tabs: "Payments" | REACHABLE |
| **AI Ops Copilot** | AI | Header tabs: "SuperMandi AI" | REACHABLE |

**Notes:**
- All 7 tabs always visible with no feature flags
- No role-based access restrictions in UI
- No "Coming Soon" placeholders

---

### C) POS App (Android)

#### Always Accessible Screens

| Screen | Route | Navigation Path | Status |
|--------|-------|-----------------|--------|
| **Splash** | `Splash` | App launch | REACHABLE |
| **Device Enrollment** | `EnrollDevice` | Auto after auth fail | REACHABLE |
| **Main POS (Sell)** | `SellScan` | Default after enrollment | REACHABLE |
| **MENU Tab** | Tab navigation | Bottom tabs: "MENU" | REACHABLE |
| **SELL Tab** | Tab navigation | Bottom tabs: "SELL" | REACHABLE |
| **Payment** | `Payment` | SELL tab: Proceed to checkout | REACHABLE |
| **Success Print** | `SuccessPrint` | After payment complete | REACHABLE |
| **Sales History** | `SalesHistory` | MENU > "Sales History" | REACHABLE |
| **Bill Detail** | `BillDetail` | Sales History > Select bill | REACHABLE |
| **Barcode Sheet** | `BarcodeSheet` | MENU > "Barcode Sheets" | REACHABLE |
| **Stock Inward** | `Inward` | MENU > "Stock Inward" | REACHABLE |
| **Purchase History** | `PurchaseHistory` | MENU > "Purchase History" | REACHABLE |
| **Sales Statement** | `SalesStatement` | MENU > "Sales Statement" or Daily Summary card | REACHABLE |
| **Stock Statement** | `StockStatement` | MENU > "Stock Statement" | REACHABLE |

#### Feature-Gated Screens (Backend Controlled)

| Screen | Route | Feature Flag | Navigation Path | Status |
|--------|-------|--------------|-----------------|--------|
| **PURCHASE Tab** | Tab navigation | `buyEnabled` | Bottom tabs: "PURCHASE" | GATED |
| **REORDER Tab** | Tab navigation | `reorderEnabled` | Bottom tabs: "REORDER" | GATED |
| **Order History** | `OrderHistory` | `buyEnabled` | MENU > "Purchase Orders" | GATED |
| **Order Detail** | `OrderDetail` | `buyEnabled` | Order History > Select order | GATED |
| **GRN** | `GRN` | `buyEnabled` | Order Detail > Receive goods | GATED |
| **Reorder Settings** | `ReorderSettings` | `reorderEnabled` | MENU > "Reorder Settings" | GATED |
| **Reorder Policies** | `ReorderPolicies` | `reorderEnabled` | Reorder Settings > Policies | GATED |
| **UI Showcase** | `UiShowcase` | `__DEV__` or `EXPO_PUBLIC_ENABLE_QA_MENU` | MENU > "UI Showcase" | DEV ONLY |

**Feature Flag Configuration:**

Feature flags are controlled by the backend `/api/v1/pos/ui-status` endpoint:

```json
{
  "features": {
    "buyEnabled": true,      // Enables PURCHASE tab and ordering screens
    "reorderEnabled": true,  // Enables REORDER tab and reorder screens
    "categoryBrowsingEnabled": true,
    "voiceEnabled": true
  }
}
```

**To enable for live testing:** Update backend configuration to return `buyEnabled: true` and `reorderEnabled: true`.

---

### Verification Checklist

#### Retailer Dashboard
- [ ] Login with phone OTP works
- [ ] Dashboard loads with inventory summary
- [ ] "Add Products (Without Supplier)" dropdown opens
- [ ] CSV Upload option navigates to Import page
- [ ] Web Form option opens product create form
- [ ] PACKAGED mode: Barcode field visible
- [ ] LOOSE_BULK mode: Barcode auto-generated info shown
- [ ] Product create succeeds, shows "Synced to POS"
- [ ] SKU PDF download works
- [ ] Categories section shows taxonomy from POS
- [ ] Inventory ledger displays stock movements
- [ ] Suppliers page loads and CRUD works
- [ ] All sidebar navigation items work

#### SuperMandi Admin
- [ ] All 7 tabs visible and clickable
- [ ] Events tab shows POS event stream
- [ ] Devices tab shows device list and enrollment
- [ ] Stores tab allows create/edit stores
- [ ] Suppliers tab shows pending verification queue
- [ ] Analytics tab shows all sub-tabs with data
- [ ] Payments tab filters payment events
- [ ] AI tab accepts queries and responds

#### POS App
- [ ] App launches to Splash then main screen
- [ ] MENU tab accessible
- [ ] SELL tab scanner works
- [ ] Product search works
- [ ] Payment flow completes
- [ ] Sales History shows bills
- [ ] Bill reprint works
- [ ] Barcode Sheet generation works
- [ ] Stock Inward flow works
- [ ] If `buyEnabled`: PURCHASE tab visible
- [ ] If `reorderEnabled`: REORDER tab visible

---

### Audit Result

**Navigation paths verified (2026-01-22):**

- **Retailer Dashboard:** All 6 sidebar items + quick actions reachable (requires Firebase config)
- **SuperMandi Admin:** All 7 tabs reachable (requires x-admin-token)
- **POS App:** All tabs now visible (backend fix applied - GO-LIVE-REVEAL-001)

---

## Troubleshooting Guide

### A) Retailer Dashboard - Login Not Working

**Symptom:** OTP button disabled or shows "Firebase is not configured"

**Root Cause:** Firebase environment variables not set

**Fix:** Configure Firebase in `.env` file:
```bash
# retailer-admin/.env
VITE_FIREBASE_API_KEY=your-api-key
VITE_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=your-project-id
VITE_FIREBASE_STORAGE_BUCKET=your-project.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=123456789
VITE_FIREBASE_APP_ID=1:123456789:web:abcdef
```

**Alternative (Dev only):** Enable demo mode bypass:
```bash
# retailer-admin/.env
VITE_DEMO_MODE=true
```
Then use phone `+919999999999` with any OTP.

---

### B) SuperMandi Admin - API Calls Failing / Blank Tables

**Symptom:** All tabs show loading forever, error banners appear, or tables are empty

**Root Cause:** Missing `x-admin-token` authentication

**Fix Option 1 - Environment Variable:**
```bash
# supermandi-superadmin/.env
VITE_ADMIN_TOKEN=your-admin-token-here
```
The token must match the backend's `ADMIN_TOKEN` environment variable.

**Fix Option 2 - Runtime (Browser Console):**
```javascript
localStorage.setItem('supermandi_admin_token', 'your-admin-token-here');
location.reload();
```

**Verify Backend Token:**
```bash
# Check what token the backend expects
grep ADMIN_TOKEN backend/.env
```

---

### C) POS App - PURCHASE/REORDER Tabs Not Visible

**Symptom:** Only MENU and SELL tabs visible, PURCHASE and REORDER tabs missing

**Root Cause:** Backend `/api/v1/pos/ui-status` wasn't returning feature flags

**Fix Applied:** GO-LIVE-REVEAL-001 - Backend now returns:
```json
{
  "features": {
    "buyEnabled": true,
    "reorderEnabled": true,
    "ordersEnabled": true
  }
}
```

**If still not visible:**
1. Check backend is running and updated
2. Check device is enrolled and active
3. Check `reorder_settings` table for store-specific override:
   ```sql
   SELECT store_id, reorder_enabled FROM reorder_settings WHERE store_id = 'your-store-id';
   ```

---

### D) POS App - All Tabs Except MENU Disabled

**Symptom:** Tabs visible but grayed out and not tappable

**Root Cause:** `storeActive === false` - Store marked inactive in database

**Fix:**
```sql
UPDATE stores SET status = 'active' WHERE id = 'your-store-id';
```

---

### E) POS App - Scanner Not Working

**Symptom:** Scan button disabled or camera won't open

**Possible Causes:**
1. Store inactive (`storeActive === false`)
2. Camera scanner modal already open
3. Onboarding flow active
4. Add Store Product modal open

**Fix:** Close any open modals and ensure store is active.

---

### F) Common Issues Across All Apps

| Issue | Check | Fix |
|-------|-------|-----|
| API returns 401 | Token missing/invalid | Set correct auth token |
| API returns 404 | Route not wired | Check api-gateway config |
| API returns 503 | Backend down | Start backend services |
| Blank page | Console errors | Check browser dev tools |
| Rate limited | Too many requests | Wait 60 seconds |
