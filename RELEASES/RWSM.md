# Retailer Web Screen Map (RWSM)

> **Purpose**: Complete inventory of every Retailer Web screen/route for screenwise testing.
> **Generated**: 2026-02-13
> **Source**: Codebase analysis of `retailer-admin/src/`
> **Total Screens**: 16 (3 public + 12 protected + 1 dev-only)

---

## Route Map

```
/retailer/login                          PUBLIC   LoginPage
/retailer/register                       PUBLIC   RegisterPage
/retailer/forgot-password                PUBLIC   ForgotPasswordPage
/s/:storeCode/                           AUTH     DashboardPage
/s/:storeCode/products                   AUTH     ProductsPage
/s/:storeCode/inventory                  AUTH     InventoryPage
/s/:storeCode/suppliers                  AUTH     SuppliersPage
/s/:storeCode/supplier-catalog           AUTH     SupplierCatalogPage
/s/:storeCode/import                     AUTH     ImportPage
/s/:storeCode/compliance                 AUTH     CompliancePage
/s/:storeCode/settings                   AUTH     SettingsPage
/s/:storeCode/settings/payments          AUTH     PaymentsPage
/s/:storeCode/devices                    AUTH     DeviceActivationPage
/s/:storeCode/admin/suppliers            ADMIN    SupplierQueuePage
/s/:storeCode/admin/products             ADMIN    ProductQueuePage
/s/:storeCode/_pages                     DEV      AllPagesPage
```

---

## Screen Details

### S01: Login Page

| Field | Value |
|-------|-------|
| **Route** | `/retailer/login` |
| **File** | `retailer-admin/src/pages/LoginPage.tsx` |
| **Navigation** | Direct URL, linked from Register page |
| **Role** | Public (no auth) |
| **Actions** | Phone lookup, Send OTP (Firebase), Verify OTP, Select store |
| **APIs** | `GET /api/v1/retailer-admin/registration/lookup?phone=`, `POST /api/v1/retailer-admin/auth/firebase-otp-login` |
| **Dependencies** | Firebase Auth |
| **POS Link** | None |
| **SA Link** | SA user status (active/suspended) blocks login |
| **States** | Phone input → OTP → Store select → Redirect to dashboard |

---

### S02: Register Page

| Field | Value |
|-------|-------|
| **Route** | `/retailer/register` |
| **File** | `retailer-admin/src/pages/RegisterPage.tsx` |
| **Navigation** | Link from Login page |
| **Role** | Public (no auth) |
| **Actions** | Send OTP, Verify OTP, Submit business details, Upload KYC docs (PAN, GSTIN Cert, Address Proof), Submit application |
| **APIs** | `POST .../registration/create`, `POST .../registration/verify-otp`, `POST .../registration/documents`, `POST .../registration/submit-kyc`, `GET .../registration/lookup` |
| **Dependencies** | Firebase Auth, Document upload |
| **POS Link** | None |
| **SA Link** | SA Applications tab reviews/approves registration |
| **States** | Phone → OTP → Business Details → Document Upload → Success |
| **Validation** | GSTIN (15-char format), Pincode (6 digits), Email (optional), Terms checkbox |

---

### S03: Forgot Password Page

| Field | Value |
|-------|-------|
| **Route** | `/retailer/forgot-password` |
| **File** | `retailer-admin/src/pages/ForgotPasswordPage.tsx` |
| **Navigation** | Link from Login page |
| **Role** | Public |
| **Actions** | Redirect to login (OTP-only auth model, no password reset) |
| **APIs** | None |
| **Dependencies** | None |

---

### S04: Dashboard Page

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/` |
| **File** | `retailer-admin/src/pages/DashboardPage.tsx` |
| **Navigation** | Sidebar: Dashboard (first item) |
| **Role** | Any authenticated user |
| **Actions** | View metrics (4 cards), View daily sales summary, Search (products/suppliers/barcodes), View categories (edit name, hide/show), View inventory table (paginated, 20/page), Quick actions (Add products, Add supplier, Export) |
| **APIs** | `GET .../inventory`, `GET .../categories`, `PATCH .../categories/:id`, `DELETE .../categories/:id`, `GET .../search?q=`, `GET .../dashboard/daily-summary` |
| **Dependencies** | None |
| **POS Link** | Daily summary matches POS MenuScreen daily totals; Inventory totals match POS StockStatement |
| **SA Link** | Store must be ACTIVE in SA |
| **States** | Loading (shimmer skeletons), Loaded, Empty (no products CTA), Error |

---

### S05: Products Page

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/products` |
| **File** | `retailer-admin/src/pages/ProductsPage.tsx` |
| **Navigation** | Sidebar: Products |
| **Role** | Any authenticated user |
| **Actions** | List products (search, category filter, supplier filter), View/Edit/Delete product, Add new product, Bulk import CSV |
| **APIs** | `GET .../products`, `GET .../products/:id`, `POST .../products`, `PATCH .../products/:id`, `DELETE .../products/:id` |
| **Dependencies** | Categories, Suppliers |
| **POS Link** | Products visible in POS SellScan catalog; Price changes affect POS checkout |
| **SA Link** | SA can approve/reject pending products from suppliers |
| **States** | Loading, Loaded (list), Empty, Error |

---

### S06: Inventory Page

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/inventory` |
| **File** | `retailer-admin/src/pages/InventoryPage.tsx` |
| **Navigation** | Sidebar: Inventory |
| **Role** | Any authenticated user |
| **Actions** | View ledger entries (INWARD/OUTWARD/ADJUSTMENT), Filter by transaction type, Filter by date range, View SKU count + total entries + today's movements |
| **APIs** | `GET .../inventory/ledger?limit=100&transactionType=&startDate=&endDate=` |
| **Dependencies** | None |
| **POS Link** | POS sales create OUTWARD entries; POS inward/GRN creates INWARD entries; Must match POS StockStatement |
| **SA Link** | None directly |
| **States** | Loading, Loaded (list + filters), Empty, Error |

---

### S07: Suppliers Page

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/suppliers` |
| **File** | `retailer-admin/src/pages/SuppliersPage.tsx` |
| **Navigation** | Sidebar: Suppliers |
| **Role** | Any authenticated user |
| **Actions** | List suppliers (search), View/Edit supplier, Add new supplier (market or self), Filter by verification status, View supplier products |
| **APIs** | `GET .../suppliers`, `GET .../suppliers/:id`, `POST .../suppliers`, `PATCH .../suppliers/:id`, `DELETE .../suppliers/:id` |
| **Dependencies** | Supplier Portal (for verified suppliers) |
| **POS Link** | POS PurchaseScreen shows same supplier list for buying |
| **SA Link** | SA Suppliers tab verifies/suspends suppliers |
| **States** | Loading, Loaded (list), Empty, Error |

---

### S08: Supplier Catalog Page

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/supplier-catalog` |
| **File** | `retailer-admin/src/pages/SupplierCatalogPage.tsx` |
| **Navigation** | Sidebar: Supplier Catalog |
| **Role** | Any authenticated user |
| **Actions** | Browse approved products from verified suppliers, Search, Add product to store catalog, Paginated (50/page) |
| **APIs** | `GET .../supplier-catalog?query=&offset=&limit=50`, `POST .../supplier-catalog/:productId/add` |
| **Dependencies** | Supplier Portal products (read-only) |
| **POS Link** | Added products appear in POS catalog for selling |
| **SA Link** | SA must approve supplier + products first |
| **States** | Loading, Loaded (grid), Empty, Error |

---

### S09: Import Page (CSV)

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/import` |
| **File** | `retailer-admin/src/pages/ImportPage.tsx` |
| **Navigation** | Sidebar: Import CSV |
| **Role** | Any authenticated user |
| **Actions** | Upload CSV (drag-drop or picker), Validate, Preview errors, Commit (async), Poll progress |
| **APIs** | `GET .../products/import/template`, `POST .../products/import/validate`, `POST .../products/import/commit`, `GET .../products/import/:jobId` |
| **Dependencies** | None |
| **POS Link** | Imported products appear in POS catalog |
| **SA Link** | None |
| **States** | Upload, Validating, Preview (errors), Committing (progress), Done, Error |
| **Constraints** | Max 5MB file, 10K rows, 10 uploads/hour rate limit |

---

### S10: Compliance Page

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/compliance` |
| **File** | `retailer-admin/src/pages/CompliancePage.tsx` |
| **Navigation** | Sidebar: Compliance |
| **Role** | Any authenticated user |
| **Actions** | Upload compliance docs (GSTIN, FSSAI, Shop License, PAN, Trade License, Address Proof), View status, View rejection reasons, Delete documents |
| **APIs** | `GET .../compliance/documents`, `POST .../compliance/documents`, `DELETE .../compliance/documents/:id` |
| **Dependencies** | None |
| **POS Link** | None |
| **SA Link** | SA Documents tab reviews/approves compliance docs |
| **States** | Loading, Loaded (doc grid), Empty (no docs), Error |

---

### S11: Settings Page

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/settings` |
| **File** | `retailer-admin/src/pages/SettingsPage.tsx` |
| **Navigation** | Sidebar: Settings |
| **Role** | Any authenticated user |
| **Actions** | Edit UPI VPA, Set tax rate, Edit store name, Set operating hours, Edit receipt footer, Set GST number, Edit address, Edit phone |
| **APIs** | `GET .../settings`, `PATCH .../settings` |
| **Dependencies** | None |
| **POS Link** | POS uses same UPI VPA for payment; Tax rate affects POS checkout |
| **SA Link** | SA can override store config |
| **States** | Loading, Loaded (form), Save success, Save error |

---

### S12: Payments Page

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/settings/payments` |
| **File** | `retailer-admin/src/pages/PaymentsPage.tsx` |
| **Navigation** | Sidebar: Payments (child of Settings) |
| **Role** | Any authenticated user |
| **Actions** | Configure UPI VPA, Configure bank account (optional), Configure IFSC |
| **APIs** | `GET .../settings`, `PATCH .../settings` |
| **Dependencies** | None |
| **POS Link** | POS UPI payment uses this VPA |
| **SA Link** | SA payment method control (CASH/UPI/DUE toggles) |
| **States** | Loading, Loaded, Save success, Save error |

---

### S13: Device Activation Page

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/devices` |
| **File** | `retailer-admin/src/pages/DeviceActivationPage.tsx` |
| **Navigation** | Sidebar: Devices |
| **Role** | Any authenticated user |
| **Actions** | Enter activation code (SM-XXXX-XX), Activate POS device, View device list, Deactivate device, View device fingerprint/model/version/last seen |
| **APIs** | `GET .../devices`, `POST .../devices/activate`, `PATCH .../devices/:id`, `DELETE .../devices/:id` |
| **Dependencies** | POS app (generates activation codes) |
| **POS Link** | Direct — POS device enrollment links to this store |
| **SA Link** | SA Devices tab can reset/disable devices |
| **States** | Loading, Loaded (device list), Activation modal, Success, Error |

---

### S14: Supplier Queue Page (Admin)

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/admin/suppliers` |
| **File** | `retailer-admin/src/pages/admin/SupplierQueuePage.tsx` |
| **Navigation** | Sidebar: Supplier Queue (admin section, requires admin/owner/superadmin role) |
| **Role** | **Admin only** (admin OR superadmin OR owner) |
| **Actions** | View pending suppliers, Approve supplier, Reject supplier (with reason) |
| **APIs** | `GET .../admin/suppliers/pending`, `POST .../admin/suppliers/:id/approve`, `POST .../admin/suppliers/:id/reject` |
| **Dependencies** | Supplier Portal integration |
| **POS Link** | Approved suppliers become available for POS purchasing |
| **SA Link** | SA also has supplier verification queue |
| **States** | Loading, Loaded (queue), Empty (no pending), Error |

---

### S15: Product Queue Page (Admin)

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/admin/products` |
| **File** | `retailer-admin/src/pages/admin/ProductQueuePage.tsx` |
| **Navigation** | Sidebar: Product Queue (admin section) |
| **Role** | **Admin only** (admin OR superadmin OR owner) |
| **Actions** | View pending products, Edit before approval (name, category, margin, BNPL), Approve product, Reject product (with reason) |
| **APIs** | `GET .../admin/products/pending`, `PATCH .../admin/products/:id`, `POST .../admin/products/:id/approve`, `POST .../admin/products/:id/reject` |
| **Dependencies** | Supplier Portal product integration |
| **POS Link** | Approved products scannable/sellable in POS |
| **SA Link** | SA also has product approval queue |
| **States** | Loading, Loaded (queue), Empty, Error |

---

### S16: All Pages Directory (Dev Only)

| Field | Value |
|-------|-------|
| **Route** | `/s/:storeCode/_pages` |
| **File** | `retailer-admin/src/pages/AllPagesPage.tsx` |
| **Navigation** | None (dev-only, hidden in production via `import.meta.env.DEV`) |
| **Role** | Any authenticated user (dev mode only) |
| **Actions** | QA reference — links to all screens |
| **Dependencies** | None |

---

## Auth Guards

| Guard | Scope | Effect |
|-------|-------|--------|
| `ProtectedRoute` | All `/s/:storeCode/*` routes | Redirect to `/retailer/login` if unauthenticated |
| `AdminRoute` | `/s/:storeCode/admin/*` | Show "Access Denied" if role not admin/owner/superadmin |
| Limited Mode (REG-AUTH-301) | User status != ACTIVE | Only Dashboard, Settings, Devices visible; banner shown |

## Navigation Sidebar

| Order | Label | Route | Role | Limited Mode |
|-------|-------|-------|------|-------------|
| 1 | Dashboard | `/s/:storeCode/` | All | Visible |
| 2 | Products | `/s/:storeCode/products` | All | Hidden |
| 3 | Inventory | `/s/:storeCode/inventory` | All | Hidden |
| 4 | Suppliers | `/s/:storeCode/suppliers` | All | Hidden |
| 5 | Supplier Catalog | `/s/:storeCode/supplier-catalog` | All | Hidden |
| 6 | Import CSV | `/s/:storeCode/import` | All | Hidden |
| 7 | Compliance | `/s/:storeCode/compliance` | All | Hidden |
| 8 | Settings | `/s/:storeCode/settings` | All | Visible |
| 9 | Payments | `/s/:storeCode/settings/payments` | All | Hidden |
| 10 | Devices | `/s/:storeCode/devices` | All | Visible |
| — | **Admin Section** | — | — | — |
| 11 | Supplier Queue | `/s/:storeCode/admin/suppliers` | Admin | Hidden |
| 12 | Product Queue | `/s/:storeCode/admin/products` | Admin | Hidden |

---

## API Base

All protected endpoints: `/api/v1/retailer-admin/*`
Auth endpoints: `/api/v1/retailer-admin/auth/*` and `/api/v1/retailer-admin/registration/*`
Gateway proxy: `api-gateway/src/config.ts` L312

## Store Isolation

- Server derives `storeId` from JWT `x-actor-id` header
- Client-sent storeId is NEVER trusted
- Every query: `WHERE store_id = $token.storeId`
