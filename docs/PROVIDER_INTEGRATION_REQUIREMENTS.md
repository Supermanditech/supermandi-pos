# PROVIDER INTEGRATION REQUIREMENTS AUDIT
## SuperMandi POS - UPI SELL + BNPL + CREDIT / OCEN

**Audit Date:** 2026-01-27
**Branch:** main
**Commit:** 96796f0
**API Gateway:** http://34.14.220.171:3000

---

# DELIVERABLE 1: INTEGRATION SURFACE MAP

---

## 1. UPI SELL Integration Surface Map

### A) User Flow (POS UI)

**Screens Involved:**
- `PaymentScreen.tsx` - Main payment flow
- `SplitPaymentModal` component - Split payment (UPI + Cash)

**User Actions & Expected Outcomes:**

| Step | User Action | System Response | Expected Outcome |
|------|-------------|-----------------|------------------|
| 1 | Selects "UPI" payment mode | Checks store UPI config | QR code generation begins |
| 2 | System generates QR | Calls `/payments/upi/generate` | QR displayed with 15-min expiry |
| 3 | Customer scans QR | Pays via UPI app | Payment captured by provider |
| 4 | Clicks "Payment Received" | Calls `/payments/upi/confirm-manual` | Sale marked complete |
| 5 | (Alt) Split Payment | Calls `/payments/split` | UPI QR + Cash collection flow |

**Failure Cases:**

| Scenario | Error Code | UI Behavior |
|----------|------------|-------------|
| QR Expiry (15 min) | `expired` | Status auto-set to `failed`, prompt retry |
| UPI Offline | `upi_offline_blocked` | Alert shown, auto-switch to Cash mode |
| UPI VPA Missing | `upi_vpa_missing` | Alert shown, auto-switch to Cash mode |
| Store Inactive | `store_inactive` | Navigate back to SellScan |
| Duplicate Payment | HTTP 409 | Reuse existing payment if < 15 min |
| Payment Failed (webhook) | `payment.failed` | Show failure reason from provider |

### B) Backend Contract (UPI Endpoints)

#### POST `/api/v1/pos/payments/upi/generate` (SM-010)
**Purpose:** Generate UPI QR code for SELL payment

**Headers:**
```
X-Device-Token: <device_jwt> (required)
Content-Type: application/json
```

**Request:**
```json
{
  "saleId": "string (UUID, required)",
  "amountMinor": "integer (positive, paise, required)"
}
```

**Response (200):**
```json
{
  "paymentId": "UUID",
  "orderId": "SM_<timestamp>_<random>",
  "qrData": "upi://pay?pa=<vpa>&pn=<name>&am=<amount>&cu=INR&tr=<txnId>",
  "upiVpa": "store@upi",
  "expiresAt": "ISO-8601 (15 min from now)"
}
```

**Status Codes:**
| Code | Condition |
|------|-----------|
| 200 | Success |
| 400 | Missing/invalid saleId or amountMinor; sale already paid |
| 402 | UPI not configured for store |
| 409 | Duplicate payment (idempotency violation) |
| 503 | Database unavailable |

---

#### GET `/api/v1/pos/payments/upi/:paymentId/status` (SM-011)
**Purpose:** Poll UPI payment status

**Headers:**
```
X-Device-Token: <device_jwt> (required)
```

**Response (200):**
```json
{
  "status": "initiated | completed | failed | awaiting_cash",
  "upiTxnRef": "string | null",
  "payerVpa": "string | null",
  "failureReason": "string | null"
}
```

**Status Codes:** 200, 400, 404, 500, 503

---

#### POST `/api/v1/pos/payments/split` (SM-013)
**Purpose:** Create split payment (UPI + Cash)

**Request:**
```json
{
  "saleId": "UUID",
  "payments": [
    { "mode": "UPI", "amountMinor": 50000 },
    { "mode": "CASH", "amountMinor": 25000 }
  ]
}
```

**Validation Rules:**
- Minimum 2 payment methods
- No duplicate modes
- Total must match sale total
- UPI requires store UPI config

**Response (200):**
```json
{
  "paymentIds": ["uuid1", "uuid2"],
  "totalAmount": 75000,
  "upiPayment": {
    "paymentId": "uuid1",
    "orderId": "SM_xxx",
    "qrData": "upi://...",
    "expiresAt": "ISO-8601"
  },
  "cashPayment": {
    "paymentId": "uuid2",
    "status": "pending"
  }
}
```

---

#### POST `/api/v1/webhooks/razorpay/payments` (GL-AUD-002)
**Purpose:** Receive Razorpay payment webhook

**Headers:**
```
x-razorpay-signature: <HMAC-SHA256 of body>
Content-Type: application/json
```

**Request (from Razorpay):**
```json
{
  "event": "payment.captured | payment.failed | payment.authorized",
  "payload": {
    "payment": {
      "entity": {
        "id": "pay_xxxxx",
        "order_id": "SM_xxxxx",
        "amount": 50000,
        "currency": "INR",
        "status": "captured | failed",
        "method": "upi",
        "vpa": "customer@upi",
        "error_code": "string (if failed)",
        "error_description": "string (if failed)"
      }
    }
  }
}
```

**Response (200):**
```json
{
  "status": "ok | ignored | error",
  "event": "payment.captured",
  "paymentId": "uuid"
}
```

**Status Codes:** 200, 401 (invalid signature), 400, 422

### C) DB State Machine (UPI SELL)

**Table:** `payments.sell_payments`

**Columns:**
| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| sale_id | UUID | FK to sales |
| store_id | UUID | FK to stores |
| mode | VARCHAR(20) | 'CASH', 'UPI', 'DUE', 'SPLIT' |
| amount_minor | INTEGER | Amount in paise |
| upi_order_id | VARCHAR(100) | Provider order ID (SM_xxx) |
| upi_payment_id | VARCHAR(100) | Razorpay payment ID |
| upi_qr_data | TEXT | Full UPI intent string |
| upi_vpa | VARCHAR(100) | Store's VPA |
| upi_payer_vpa | VARCHAR(100) | Customer's VPA |
| upi_txn_ref | VARCHAR(100) | UPI transaction reference |
| status | VARCHAR(20) | Payment status |
| is_split | BOOLEAN | Split payment flag |
| initiated_at | TIMESTAMPTZ | When payment started |
| completed_at | TIMESTAMPTZ | When payment completed |
| failure_reason | TEXT | Error message if failed |
| webhook_payload | JSONB | Full Razorpay webhook |
| idempotency_key | VARCHAR(100) | Unique (deduplication) |

**Status State Machine:**
```
pending → initiated → completed ✓
                   → failed (with failure_reason)
                   → awaiting_cash (split payment, UPI done)
                   → expired (15 min timeout)
```

**Indexes (for 10K stores):**
- `idx_sell_payments_store(store_id, status)`
- `idx_sell_payments_order(upi_order_id)`
- `idx_sell_payments_status(status) WHERE status = 'initiated'`

---

## 2. BNPL Integration Surface Map

### A) User Flow (POS UI)

**Screens Involved:**
- `BnplDuesScreen.tsx` - BNPL management and repayment
- `BuyScreen.tsx` - BNPL badge indicator (GL-AUD-007)
- Order payment options flow

**User Actions & Expected Outcomes:**

| Step | User Action | System Response | Expected Outcome |
|------|-------------|-----------------|------------------|
| 1 | Views BUY screen | Checks BNPL enabled | Shows "BNPL" badge if enabled |
| 2 | Selects PO for payment | Calls payment-options API | Shows BNPL option if eligible |
| 3 | Chooses BNPL mode | Creates drawdown | PO marked as bnpl_pending |
| 4 | Views BNPL Dues screen | Fetches active drawdowns | Lists outstanding dues |
| 5 | Clicks "Pay Now" | Initiates repayment | UPI deep link or cash option |
| 6 | Completes UPI payment | Enters UTR | Drawdown marked as paid |

**Failure Cases:**

| Scenario | Error Code | UI Behavior |
|----------|------------|-------------|
| Credit limit exceeded | `bnpl_limit_exceeded` | Show available credit |
| BNPL not enabled | `bnpl_not_enabled` | Option hidden/disabled |
| Drawdown not found | 404 | Error alert |
| Payment expired | `expired` | Prompt to reinitiate |

### B) Backend Contract (BNPL Endpoints)

#### GET `/api/v1/pos/bnpl/active`
**Purpose:** Get active BNPL drawdowns for store

**Headers:**
```
X-Device-Token: <device_jwt> (required)
```

**Response (200):**
```json
{
  "success": true,
  "drawdowns": [
    {
      "id": "uuid",
      "supplierId": "uuid",
      "supplierName": "Supplier ABC",
      "orderNumber": "PO-001",
      "purchaseOrderId": "uuid",
      "principalMinor": 500000,
      "dueDate": "2026-02-03",
      "status": "active",
      "daysRemaining": 7,
      "isOverdue": false
    }
  ],
  "totalOutstanding": 1500000,
  "creditLimit": 5000000,
  "availableCredit": 3500000,
  "bnplEnabled": true,
  "maxDays": 7
}
```

---

#### POST `/api/v1/pos/bnpl/:drawdownId/pay`
**Purpose:** Initiate BNPL repayment

**Request:**
```json
{
  "mode": "UPI | CASH",
  "amountMinor": 500000
}
```

**Response (200 - UPI mode):**
```json
{
  "success": true,
  "repaymentId": "uuid",
  "drawdownId": "uuid",
  "amountMinor": 500000,
  "mode": "UPI",
  "upiCollect": {
    "vpa": "supermandi@upi",
    "amount": 5000.00,
    "deepLink": "upi://pay?pa=supermandi@upi&am=5000.00&..."
  },
  "expiresAt": "ISO-8601 (15 min)"
}
```

**Response (200 - CASH mode):**
```json
{
  "success": true,
  "repaymentId": "uuid",
  "drawdownId": "uuid",
  "status": "paid",
  "paidAt": "ISO-8601"
}
```

---

#### POST `/api/v1/pos/bnpl/:drawdownId/pay/confirm`
**Purpose:** Confirm UPI repayment with UTR

**Request:**
```json
{
  "repaymentId": "uuid",
  "upiTxnRef": "UTR123456789"
}
```

**Response (200):**
```json
{
  "success": true,
  "status": "paid",
  "drawdownId": "uuid",
  "repaymentId": "uuid",
  "paidAt": "ISO-8601"
}
```

---

#### GET `/api/v1/orders/stores/:storeId/orders/:orderId/payment-options` (SM-016)
**Purpose:** Get payment options including BNPL eligibility

**Response (200):**
```json
{
  "success": true,
  "orderAmount": 500000,
  "supplierId": "uuid",
  "supplierName": "Supplier ABC",
  "options": [
    {
      "mode": "BNPL",
      "available": true,
      "maxDays": 7,
      "availableCredit": 3500000,
      "description": "Pay within 7 days"
    },
    {
      "mode": "UPI",
      "available": true,
      "description": "Pay now via UPI"
    }
  ]
}
```

### C) DB State Machine (BNPL)

**Table:** `payments.bnpl_drawdowns`

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| store_id | UUID | FK to stores |
| supplier_id | UUID | FK to suppliers |
| purchase_order_id | UUID | FK to purchase_orders |
| principal_minor | INTEGER | Amount in paise |
| due_date | DATE | Repayment deadline |
| status | VARCHAR(20) | Drawdown status |
| paid_at | TIMESTAMPTZ | When repaid |
| paid_amount_minor | INTEGER | Amount paid |

**Status State Machine:**
```
active → paid ✓ (successful repayment)
      → overdue (due_date passed, still unpaid)
      → defaulted (enforcement action)
```

**Table:** `payments.bnpl_settings`

| Column | Type | Default |
|--------|------|---------|
| supplier_id | UUID | NULL (global) |
| max_credit_minor | INTEGER | 5000000 (₹50k) |
| default_tenure_days | INTEGER | 7 |
| is_active | BOOLEAN | TRUE |

---

## 3. CREDIT / OCEN Integration Surface Map

### A) User Flow (POS UI)

**Screens Involved:**
- `CreditScreen.tsx` - Credit offers, applications, KYC

**Tabs:**
1. **Offers Tab** - Available credit offers
2. **Active Loans Tab** - Disbursed loans (NOT IMPLEMENTED - placeholder)
3. **History Tab** - Application history

**User Actions & Expected Outcomes:**

| Step | User Action | System Response | Expected Outcome |
|------|-------------|-----------------|------------------|
| 1 | Opens Credit screen | Fetches offers + score | Shows credit score & offers |
| 2 | Clicks "Apply Now" | Opens application modal | Step 1: Amount selection |
| 3 | Enters amount | Validates against limit | Proceeds to KYC step |
| 4 | Enters PAN + Aadhaar | Calls KYC API | Verification processed |
| 5 | KYC approved | Shows approval | Displays disbursement ETA |

**Credit Scoring Factors:**
- Monthly GMV (0-30 pts)
- Transaction count (0-20 pts)
- BNPL repayment rate (0-30 pts)
- Account age (0-20 pts)

**Score Tiers:**
| Score | Points | Eligible Amount | Interest Rate |
|-------|--------|-----------------|---------------|
| EXCELLENT | 80+ | ₹2,00,000 | 15% p.a. |
| GOOD | 60-79 | ₹1,00,000 | 18% p.a. |
| FAIR | 40-59 | ₹50,000 | 21% p.a. |
| POOR | <40 | ₹25,000 | Rejected |

### B) Backend Contract (Credit Endpoints)

#### GET `/api/v1/pos/credit/offers`
**Purpose:** Get available credit offers with score

**Response (200):**
```json
{
  "success": true,
  "offers": [
    {
      "id": "uuid",
      "source": "SUPERMANDI",
      "amountMinor": 5000000,
      "tenureMonths": 12,
      "interestRateAnnual": 21.0,
      "emiMinor": 458333,
      "validUntil": "2026-02-26"
    }
  ],
  "creditScore": "FAIR",
  "eligibleAmount": 5000000,
  "scoringFactors": {
    "monthlyGmv": 1200000,
    "transactionCount": 45,
    "bnplRepaymentRate": 100,
    "accountAge": 2
  },
  "activeApplication": null
}
```

---

#### POST `/api/v1/pos/credit/apply`
**Purpose:** Apply for credit offer

**Request:**
```json
{
  "offerId": "uuid",
  "requestedAmountMinor": 3000000
}
```

**Response (200):**
```json
{
  "success": true,
  "applicationId": "uuid",
  "status": "submitted",
  "nextStep": "KYC",
  "message": "Application submitted. Please complete KYC."
}
```

**Error Codes:**
- 400: `expired` - Offer expired
- 400: `amount_exceeds_limit` - Amount > offer limit
- 409: `application_in_progress` - Existing pending app

---

#### POST `/api/v1/pos/credit/:applicationId/kyc`
**Purpose:** Submit KYC documents

**Request:**
```json
{
  "panNumber": "ABCDE1234F",
  "aadhaarLast4": "1234"
}
```

**Response (200):**
```json
{
  "success": true,
  "kycStatus": "verified",
  "applicationStatus": "approved",
  "approvedAmount": 3000000,
  "disbursementEta": "24 hours",
  "message": "Credit application approved."
}
```

### C) DB State Machine (Credit)

**Table:** `payments.credit_offers`

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| store_id | UUID | FK to stores |
| offer_source | VARCHAR(50) | 'SUPERMANDI', 'OCEN', 'PARTNER_BANK' |
| amount_minor | INTEGER | Offer amount |
| tenure_months | INTEGER | 3, 6, 12 |
| interest_rate_annual | DECIMAL(5,2) | APR |
| emi_minor | INTEGER | Calculated EMI |
| status | VARCHAR(20) | Offer status |
| valid_until | TIMESTAMPTZ | Expiration |

**Offer Status State Machine:**
```
available → applied → approved → disbursed ✓
                   → rejected
         → expired (validity ended)
```

**Table:** `payments.credit_applications`

| Column | Type | Purpose |
|--------|------|---------|
| id | UUID | Primary key |
| store_id | UUID | FK to stores |
| offer_id | UUID | FK to credit_offers |
| requested_amount_minor | INTEGER | Applied amount |
| status | VARCHAR(20) | Application status |
| kyc_status | VARCHAR(20) | KYC verification status |
| pan_number | VARCHAR(10) | PAN (migration 055) |
| aadhaar_last4 | VARCHAR(4) | Aadhaar last 4 |
| approved_amount_minor | INTEGER | Approved amount |
| disbursed_amount_minor | INTEGER | Disbursed amount |
| disbursed_at | TIMESTAMPTZ | Disbursement date |

**Application Status State Machine:**
```
submitted → processing → approved → disbursed ✓
                      → rejected
```

**KYC Status State Machine:**
```
pending → submitted → verified ✓
                   → rejected
```

### OCEN STATUS: NOT IMPLEMENTED

**Missing OCEN Components:**
- No OCEN API gateway integration
- No consent artifacts handling
- No Aadhaar Account (AA) integration
- No LSP/NBFC partner routing
- No lender marketplace
- No KFS (Key Fact Statement) generation
- No sanction letter automation
- No repayment schedule generation

---

# DELIVERABLE 2: PROVIDER REQUIREMENTS SPEC

---

## 1. SELL UPI Provider Requirements

### Integration Types Supported by Code

| Integration Type | Status | Notes |
|-----------------|--------|-------|
| Dynamic QR | ✅ Implemented | Per-transaction QR via order creation |
| Static QR | ❌ Not supported | Would need store-level static QR |
| UPI Intent | ✅ Implemented | `upi://pay` deep links |
| Order Creation + Capture | ✅ Implemented | Razorpay order flow |
| Polling | ✅ Implemented | Status polling endpoint |
| Webhooks | ✅ Implemented | payment.captured/failed |

### Required Provider Objects & IDs

| Object | Format | Example | Purpose |
|--------|--------|---------|---------|
| order_id | `SM_<base36_ts>_<8char>` | `SM_LK4M2N_ABC12345` | Internal order reference |
| payment_id | Provider format | `pay_xxxxxxxxxxxx` | Razorpay payment ID |
| signature | HMAC-SHA256 | Hex string | Webhook verification |
| receipt | Same as order_id | `SM_LK4M2N_ABC12345` | Reconciliation |
| customer | Not used | - | Optional in current impl |
| notes | Not used | - | Optional metadata |

### Required Environment Configuration

```bash
# UPI Payment Provider (Razorpay)
RAZORPAY_KEY_ID=rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=xxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=xxxxxxxxxxxxxxxxxxxx
RAZORPAY_ACCOUNT_NUMBER=xxxxxxxxxxxx

# Store UPI VPA (per-store in platform.stores)
# Each store needs: upi_vpa column set
```

### Webhook Requirements

**Required Events:**
| Event | Purpose | Handler |
|-------|---------|---------|
| `payment.captured` | Mark payment complete | Updates sell_payments.status |
| `payment.failed` | Record failure reason | Updates with error_description |
| `payment.authorized` | Optional logging | Logged, no action |

**Webhook URL to Register:**
```
POST https://<domain>/api/v1/webhooks/razorpay/payments
```

**Signature Verification:**
- Algorithm: HMAC-SHA256
- Input: Raw JSON body
- Secret: `RAZORPAY_WEBHOOK_SECRET`
- Header: `x-razorpay-signature`

### Data Fields Required from Provider

| Field | Source | Usage |
|-------|--------|-------|
| QR String | Built internally | `upi://pay?pa=...&am=...` |
| UPI VPA | Store config | Payee address |
| Expiry Time | Calculated | 15 minutes from creation |
| Payment Status | Webhook | completed/failed |
| UTR/Txn Ref | Webhook payload | Reconciliation |
| Payer VPA | Webhook payload | Audit trail |
| Error Code | Webhook payload | Failure diagnosis |

### Reconciliation Requirements

| Requirement | Implementation |
|-------------|----------------|
| Success Verification | Webhook signature + order_id match |
| Duplicate Handling | idempotency_key unique constraint |
| Partial Failures | Not applicable (atomic payments) |
| Refunds | Status = 'refunded' (not yet implemented) |

---

## 2. BNPL Provider Requirements

### Integration Model Expected

| Model | Status | Notes |
|-------|--------|-------|
| Pre-approved offers | ❌ Not used | No external pre-approval |
| On-demand underwriting | ❌ Not used | No external underwriting |
| Line of credit | ✅ Implemented | Store-level credit limit |
| Invoice financing | ✅ Implemented | PO-based drawdowns |

**Current Implementation:** In-house SuperMandi BNPL (no external provider)

### Required API Surfaces (If External Provider)

| API | Purpose | Current Status |
|-----|---------|----------------|
| Eligibility Check | Check if store qualifies | ✅ Internal (credit limit calc) |
| Offers List | Show available terms | ✅ Internal (7-day fixed) |
| Select Offer / Initiate | Create drawdown | ✅ Internal |
| Repayment Schedule | Show payment plan | ⚠️ Simple (single due date) |
| Repayment Collection | Collect via UPI/Cash | ✅ Internal |
| Settlement to Supplier | Pay supplier | ✅ Via Razorpay Payouts |

### Required Data Fields

| Field | Type | Source |
|-------|------|--------|
| Interest Rate | Decimal | 0% (7-day BNPL) |
| Fees | Integer | 0 (no fees) |
| APR | Decimal | 0% |
| Tenure | Integer | 7 days (configurable) |
| EMI | Integer | N/A (single payment) |
| Due Date | Date | Creation + tenure days |

### KFS Display Requirements

**NOT IMPLEMENTED** - Required for RBI compliance:
- Loan amount
- Interest rate (0% for BNPL)
- Tenure and schedule
- Fees and charges
- Prepayment terms
- Default consequences

### KYC Dependencies

**Current:** None for BNPL (uses store registration KYC)

**If External Provider Required:**
- Store GSTIN verification
- Authorized signatory PAN
- Bank account verification

---

## 3. CREDIT Provider / OCEN Requirements

### Code Alignment Assessment

| Integration Model | Aligned | Notes |
|-------------------|---------|-------|
| Direct NBFC Integration | ❌ | No NBFC API code |
| OCEN via LSP | ❌ | No OCEN gateway code |
| OCEN via Gateway | ❌ | No consent/AA code |
| In-house Credit | ✅ | Current implementation |

### OCEN Artifacts (If Implementing)

**Required OCEN Artifacts:**

| Artifact | Status | Purpose |
|----------|--------|---------|
| Consent Artifacts | ❌ Not implemented | User consent for data sharing |
| AA (Account Aggregator) | ❌ Not implemented | Financial data fetch |
| Lender Offer Format | ❌ Not implemented | Standardized offer structure |
| KFS (Key Fact Statement) | ❌ Not implemented | RBI disclosure requirement |
| Sanction Letter | ❌ Not implemented | Loan approval document |
| Disbursal Notification | ❌ Not implemented | Fund transfer confirmation |
| Repayment Schedule | ⚠️ Partial | No amortization table |

### Required APIs (OCEN Implementation)

| API Category | Required APIs |
|--------------|---------------|
| Borrower Profile/KYC | PAN verification, Aadhaar eKYC, GSTIN validation |
| Fetch Offers | Lender offers aggregation, rate comparison |
| Apply | Loan application submission, document upload |
| Status Tracking | Application status, sanction status, disbursal status |
| Repayments | EMI schedule, payment collection, prepayment |

### Required Callbacks/Webhooks (OCEN)

| Webhook Event | Purpose |
|---------------|---------|
| `offer.updated` | Lender offer changes |
| `kyc.verified` | KYC completion |
| `loan.sanctioned` | Loan approval |
| `loan.disbursed` | Fund transfer complete |
| `repayment.success` | EMI payment received |
| `repayment.failed` | EMI payment failed |
| `loan.closed` | Loan fully repaid |

---

# DELIVERABLE 3: PROVIDER MATCHING CHECKLIST

---

## UPI PSP Provider Checklist

| Requirement | Must Have | Razorpay | PhonePe | Paytm | Cashfree |
|-------------|-----------|----------|---------|-------|----------|
| **APIs** |
| Create Order | ✅ | ✅ | ✅ | ✅ | ✅ |
| Generate QR | ✅ | ✅ | ✅ | ✅ | ✅ |
| UPI Intent Support | ✅ | ✅ | ✅ | ✅ | ✅ |
| Payment Status API | ✅ | ✅ | ✅ | ✅ | ✅ |
| Refund API | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| **Webhooks** |
| payment.captured | ✅ | ✅ | ✅ | ✅ | ✅ |
| payment.failed | ✅ | ✅ | ✅ | ✅ | ✅ |
| refund.processed | ⚠️ | ✅ | ✅ | ✅ | ✅ |
| **Auth Model** |
| API Key + Secret | ✅ | ✅ | ✅ | ✅ | ✅ |
| OAuth | ❌ | ❌ | ⚠️ | ⚠️ | ❌ |
| **Compliance** |
| PCI DSS | ✅ | ✅ | ✅ | ✅ | ✅ |
| Indian Data Residency | ✅ | ✅ | ✅ | ✅ | ✅ |
| **SLA** |
| Webhook Delivery | <5s | ✅ | ✅ | ✅ | ✅ |
| API Uptime | 99.9% | ✅ | ✅ | ✅ | ✅ |
| **Sandbox** |
| Test Environment | ✅ | ✅ | ✅ | ✅ | ✅ |
| Test Cards/VPAs | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## BNPL Provider Checklist

| Requirement | Must Have | Current (In-house) | External BNPL |
|-------------|-----------|-------------------|---------------|
| **APIs** |
| Eligibility Check | ✅ | ✅ (credit limit) | Required |
| Create Drawdown | ✅ | ✅ | Required |
| Repayment Collection | ✅ | ✅ (UPI/Cash) | Required |
| Settlement to Merchant | ⚠️ | ✅ (Razorpay) | Required |
| **Webhooks** |
| drawdown.created | ⚠️ | ❌ | Recommended |
| repayment.received | ⚠️ | ❌ | Recommended |
| **KYC** |
| Store Verification | ⚠️ | ❌ | Required |
| **Compliance** |
| KFS Generation | ✅ | ❌ | Required |
| RBI Guidelines | ✅ | ⚠️ | Required |

---

## OCEN/LSP/Credit Provider Checklist

| Requirement | Must Have | Current | OCEN/LSP |
|-------------|-----------|---------|----------|
| **APIs** |
| Borrower Profile | ✅ | ⚠️ (basic) | Required |
| Fetch Offers | ✅ | ✅ (internal) | Required |
| Apply for Loan | ✅ | ✅ | Required |
| KYC Submission | ✅ | ✅ (PAN/Aadhaar) | Required |
| Disbursal Status | ✅ | ⚠️ (mock) | Required |
| Repayment Schedule | ✅ | ❌ | Required |
| EMI Collection | ✅ | ❌ | Required |
| **Webhooks** |
| kyc.verified | ✅ | ❌ | Required |
| loan.sanctioned | ✅ | ❌ | Required |
| loan.disbursed | ✅ | ❌ | Required |
| repayment.success | ✅ | ❌ | Required |
| **Consent** |
| AA Integration | ✅ | ❌ | Required |
| Consent Artifacts | ✅ | ❌ | Required |
| **Documents** |
| KFS | ✅ | ❌ | Required |
| Sanction Letter | ✅ | ❌ | Required |
| Loan Agreement | ✅ | ❌ | Required |

---

# DELIVERABLE 4: WHAT I MUST PROVIDE LATER

## Exact Values Required for Production Implementation

### 1. UPI Payment Provider (Razorpay)

```bash
# Environment Variables Required
RAZORPAY_KEY_ID=           # Format: rzp_live_xxxxxxxxxxxx
RAZORPAY_KEY_SECRET=       # Format: xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_WEBHOOK_SECRET=   # Format: xxxxxxxxxxxxxxxxxxxxxxxx
RAZORPAY_ACCOUNT_NUMBER=   # Format: xxxxxxxxxxxx (for payouts)
```

**Webhook URL to Register in Razorpay Dashboard:**
```
Production: https://<your-domain>/api/v1/webhooks/razorpay/payments
Staging:    https://<staging-domain>/api/v1/webhooks/razorpay/payments
```

**Webhook Events to Enable:**
- `payment.captured`
- `payment.failed`
- `payment.authorized`

**IP Allowlisting (if required):**
```
Server IP: 34.14.220.171 (current VM)
```

### 2. Supplier Payouts (Razorpay X)

```bash
# Additional Environment Variables
PAYOUT_PROCESS_API_KEY=    # Internal API key for payout trigger
                           # Default: sm_payout_dev_key (change in production!)
```

**Webhook URL for Payouts:**
```
Production: https://<your-domain>/api/v1/webhooks/razorpay
```

**Payout Webhook Events to Enable:**
- `payout.processed`
- `payout.failed`
- `payout.reversed`
- `payout.queued`

### 3. Per-Store UPI Configuration

Each store requires these columns populated in `platform.stores`:
```sql
upi_vpa                    -- Store's UPI VPA (e.g., store123@upi)
razorpay_account_id        -- Razorpay account ID (if using sub-accounts)
razorpay_fund_account_id   -- For supplier payouts
razorpay_contact_id        -- Razorpay contact for payouts
```

### 4. BNPL Configuration (Per Store)

```sql
-- platform.stores columns
bnpl_enabled               -- Boolean: Enable BNPL for store
bnpl_credit_limit          -- Integer: Credit limit in paise (default: 5000000)
bnpl_max_days              -- Integer: Repayment tenure (default: 7)
```

### 5. Credit Configuration (Per Store)

```sql
-- platform.stores columns
credit_enabled             -- Boolean: Enable credit features
credit_limit               -- Integer: Credit limit in paise (default: 0)
```

### 6. BNPL Collection VPA

```bash
# For BNPL repayment collection
SUPERMANDI_COLLECTION_VPA= # Format: supermandi@upi (or your collection VPA)
```

---

## Sandbox vs Production Separation Plan

### Environment Variables by Environment

| Variable | Development | Staging | Production |
|----------|-------------|---------|------------|
| `NODE_ENV` | development | staging | production |
| `RAZORPAY_KEY_ID` | rzp_test_xxx | rzp_test_xxx | rzp_live_xxx |
| `RAZORPAY_KEY_SECRET` | test_secret | test_secret | live_secret |
| `RAZORPAY_WEBHOOK_SECRET` | test_webhook | test_webhook | live_webhook |
| `PAYOUT_PROCESS_API_KEY` | sm_payout_dev_key | sm_payout_staging | <secure_random> |

### Webhook Verification Behavior

| Environment | Signature Required |
|-------------|-------------------|
| Development | Optional (logged warning) |
| Staging | Optional (logged warning) |
| Production | **REQUIRED** (401 if missing/invalid) |

---

## Whitelisting Requirements

### Razorpay IP Allowlist (Outbound from Server)
```
# If Razorpay requires whitelisting your server IP:
Production VM: 34.14.220.171
```

### Razorpay Webhook Source IPs (Inbound)
```
# Razorpay webhook source IPs to allow:
# (Verify current list from Razorpay documentation)
```

---

## Certificate/Key Details

### Webhook Signature Verification

**Algorithm:** HMAC-SHA256
**Implementation:**
```typescript
const expectedSignature = crypto
  .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
  .update(rawBody)
  .digest("hex");

// Timing-safe comparison
crypto.timingSafeEqual(
  Buffer.from(receivedSignature),
  Buffer.from(expectedSignature)
);
```

### No Additional Certificates Required
- Razorpay uses API key authentication (not certificate-based)
- HTTPS is required for webhook endpoints (handled by load balancer/proxy)

---

## Summary: Items to Provide Before Go-Live

| # | Item | Format | Required For |
|---|------|--------|--------------|
| 1 | `RAZORPAY_KEY_ID` | `rzp_live_xxxxxxxxxxxx` | UPI Payments |
| 2 | `RAZORPAY_KEY_SECRET` | 24+ char string | UPI Payments |
| 3 | `RAZORPAY_WEBHOOK_SECRET` | 24+ char string | Webhook verification |
| 4 | `RAZORPAY_ACCOUNT_NUMBER` | 12-digit number | Supplier payouts |
| 5 | `PAYOUT_PROCESS_API_KEY` | Secure random string | Payout trigger auth |
| 6 | `SUPERMANDI_COLLECTION_VPA` | UPI VPA format | BNPL collection |
| 7 | Store UPI VPAs | Per-store config | SELL payments |
| 8 | Production domain | HTTPS URL | Webhook registration |
| 9 | Server IP whitelist | IP address | If required by provider |

---

## OCEN/Credit Provider (Future)

If implementing OCEN integration, additional requirements:
- OCEN gateway credentials
- LSP registration
- AA (Account Aggregator) credentials
- NBFC partner agreements
- KYC provider API keys (for eKYC)
- Digital signature certificates (for consent)

---

*End of Provider Integration Requirements Audit*
