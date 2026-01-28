# Supplier Journey End-to-End Test Checklist

**GL-WF Tickets Implemented:** GL-WF-008, GL-WF-018, GL-WF-039, GL-WF-040, GL-WF-041, GL-WF-042, GL-WF-043, GL-WF-044, GL-WF-058, GL-WF-061

---

> **GL-QA-003: NO DB INSERT WORKAROUNDS ALLOWED**
>
> All tests MUST be performed through the UI only. Direct database inserts, curl hacks,
> or any manual DB manipulation are NOT permitted for go-live validation.
>
> - Supplier product creation: Must use Supplier Portal UI
> - Product approval: Must use SuperAdmin UI
> - Catalog sync: Must use Retailer Admin UI
> - POS scans: Must use actual POS barcode scanner
>
> Any test results obtained via DB inserts will be considered INVALID for go-live sign-off.

---

## Pre-requisites

1. Run database migration:
   ```bash
   cd backend && pnpm migrate:up
   ```

2. Start backend services:
   ```bash
   cd backend && pnpm dev
   ```

3. Start supplier portal:
   ```bash
   cd supplier-portal && npm run dev
   ```

4. Access supplier portal at: `http://localhost:3001`

---

## Test Flow 1: Account Creation & Authentication

### 1.1 Registration (GL-WF: Account Creation)
- [ ] Navigate to `/register`
- [ ] Fill in business details:
  - Business Name
  - Contact Person
  - Email
  - Phone
  - Password
  - PAN Number
  - GSTIN Number
  - Bank Account Number
  - IFSC Code
  - Account Holder Name
- [ ] Submit registration form
- [ ] Verify successful redirect to login page
- [ ] Verify supplier created with `verification_status = 'pending'`

### 1.2 Login (GL-WF: Login)
- [ ] Navigate to `/login`
- [ ] Enter email and password
- [ ] Verify successful login redirects to `/dashboard`
- [ ] Verify JWT token stored in localStorage
- [ ] Test invalid credentials - should show error

### 1.3 Forgot Password (GL-WF: Password Reset)
- [ ] Navigate to `/forgot-password`
- [ ] Enter registered email
- [ ] Verify password reset email sent (check logs)
- [ ] Use reset token to set new password
- [ ] Login with new password

### 1.4 Logout Confirmation (GL-WF-061)
- [ ] Click Logout button in sidebar
- [ ] Verify confirmation modal appears
- [ ] Click Cancel - modal closes, still logged in
- [ ] Click Logout - logged out and redirected to login

---

## Test Flow 2: KYC & Bank Verification

### 2.1 KYC Documents Upload (GL-WF-018)
Navigate to `/kyc`

- [ ] Upload PAN Card document
  - Select file
  - Enter PAN number
  - Submit and verify success
- [ ] Upload GSTIN Certificate
- [ ] Upload Cancelled Cheque
- [ ] Upload Address Proof
- [ ] Verify document list shows uploaded files
- [ ] Test delete document - verify removed

### 2.2 IFSC Lookup (GL-WF-040)
- [ ] Enter valid IFSC code (e.g., `SBIN0001234`)
- [ ] Click "Verify IFSC"
- [ ] Verify bank name and branch auto-populated
- [ ] Test invalid IFSC - should show error

### 2.3 Bank Account Verification (GL-WF-041, GL-WF-042)
- [ ] Enter bank account number
- [ ] Enter verified IFSC code
- [ ] Enter account holder name
- [ ] Click "Verify Bank Account"
- [ ] Verify penny drop validation success
- [ ] Verify verified status shown

### 2.4 Payout Readiness Indicator (GL-WF-043)
- [ ] On KYC page, verify "Payout Readiness Checklist" section shows:
  - [ ] Documents uploaded status
  - [ ] Bank verified status
  - [ ] Overall "Ready for Payouts" badge when all complete

---

## Test Flow 3: Product Management

### 3.1 Product Creation (GL-WF: Product Creation)
Navigate to `/products`

- [ ] Click "Add Product"
- [ ] Fill in product details:
  - Name
  - Barcode (valid EAN/UPC)
  - Category
  - Unit
  - MRP (must be > purchase price)
  - Purchase Price
  - Stock Quantity
- [ ] Submit and verify product created
- [ ] Verify product shows in list with "pending" status

### 3.2 Product Approval Visibility (GL-WF-058)
- [ ] Verify pending products show yellow badge
- [ ] Verify products visible but noted as "pending approval"
- [ ] After admin approval, status changes to "active"

### 3.3 CSV Upload
Navigate to `/upload`

- [ ] Download template
- [ ] Fill with multiple products
- [ ] Upload CSV
- [ ] Verify products created with validation errors shown

---

## Test Flow 4: Order Management

### 4.1 View Orders
Navigate to `/orders`

- [ ] Verify order list loads
- [ ] Test status filter (pending/confirmed/shipped/delivered)
- [ ] Verify order details show all items

### 4.2 Confirm Order
- [ ] Find pending order
- [ ] Click "Confirm" button
- [ ] Verify status changes to "confirmed"

### 4.3 Shipment Tracking (GL-WF-039)
- [ ] Click "Mark as Shipped" on confirmed order
- [ ] Select carrier from dropdown (Delhivery, BlueDart, etc.)
- [ ] Enter tracking number
- [ ] Submit shipment info
- [ ] Verify order shows tracking details
- [ ] Verify status changes to "shipped"

---

## Test Flow 5: Earnings & Payouts

### 5.1 Earnings Dashboard (GL-WF-044)
Navigate to `/earnings`

- [ ] Verify summary cards show:
  - Total Revenue
  - Available Balance
  - Total Paid Out
  - Pending Payouts
- [ ] Verify KYC warning banner if not payout-ready

### 5.2 Payout History
- [ ] Verify payout list loads
- [ ] Verify status badges (pending/processing/completed/failed)
- [ ] Verify pagination works
- [ ] Test desktop table view
- [ ] Test mobile card view

---

## API Endpoints Reference

### Authentication
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/supplier/auth/register` | Register new supplier |
| POST | `/api/v1/supplier/auth/login` | Login |
| POST | `/api/v1/supplier/auth/forgot-password` | Request password reset |
| POST | `/api/v1/supplier/auth/reset-password` | Reset password |
| POST | `/api/v1/supplier/auth/change-password` | Change password |

### KYC & Bank
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/supplier/kyc/status` | Get KYC status |
| GET | `/api/v1/supplier/kyc/documents` | List KYC documents |
| POST | `/api/v1/supplier/kyc/documents/:type` | Upload document |
| DELETE | `/api/v1/supplier/kyc/documents/:id` | Delete document |
| POST | `/api/v1/supplier/kyc/verify-ifsc` | Verify IFSC code |
| POST | `/api/v1/supplier/kyc/verify-bank` | Verify bank account |

### Products
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/supplier/products` | List products |
| POST | `/api/v1/supplier/products` | Create product |
| PATCH | `/api/v1/supplier/products/:id` | Update product |
| DELETE | `/api/v1/supplier/products/:id` | Delete product |
| POST | `/api/v1/supplier/products/csv` | Bulk upload CSV |

### Orders
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/supplier/orders` | List orders |
| PATCH | `/api/v1/supplier/orders/:id/status` | Update order status |
| PATCH | `/api/v1/supplier/orders/:id/shipment` | Add shipment tracking |

### Payouts
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/supplier/payouts` | List payouts |
| GET | `/api/v1/supplier/payouts/summary` | Get payout summary |
| GET | `/api/v1/supplier/payouts/:id` | Get payout details |

---

## Database Migration Required

Before testing, run migration `061_shipment_tracking_columns.sql`:
- Adds shipment tracking columns to `purchase_orders`
- Fixes `order_events` table for purchase_order_id
- Creates necessary indexes

---

## Known Limitations

1. Email verification not implemented (flagged in audit)
2. Barcode validation is basic (requires enhanced validation)
3. Category selection is free-text (no standardized list)
4. Re-submission workflow for rejected products not implemented

---

## Test Results

| Flow | Status | Tester | Date | Notes |
|------|--------|--------|------|-------|
| Registration | | | | |
| Login | | | | |
| Password Reset | | | | |
| KYC Upload | | | | |
| Bank Verification | | | | |
| Product Creation | | | | |
| Order Management | | | | |
| Shipment Tracking | | | | |
| Earnings View | | | | |

---

*Generated: 2026-01-28*
*Ticket Reference: GL-SUP-TICKETS*
