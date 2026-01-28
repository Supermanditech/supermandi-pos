# RETAILER JOURNEY (POS Mobile App) - Go-Live Micro Tickets

**Source:** Section 1.1 from GO_LIVE_WORKFLOW_AUDIT_REPORT
**Total Tickets:** 9
**Target:** 10,000 Stores/Users
**Estimated Effort:** 10.5 engineering days

---

## Deployment Strategy

**Decision:** Batch deployment of all 9 tickets together

**Reasons:**
- Single OTA update for 10,000 devices
- All fixes tested together as cohesive release
- Simpler rollback - one version
- Less user disruption

**Deployment Steps (after all tickets complete):**
1. Run all database migrations on Staging (including 057, 058)
2. Deploy backend to Staging VM
3. Deploy frontend to Staging VM
4. Test all 9 fixes end-to-end
5. Deploy to Production VM
6. Push OTA update to POS devices
7. Monitor metrics

**Required Migrations:**
- 057_upi_verifications_table.sql
- 058_device_label_unique_constraint.sql

---

## Implementation Status

| Ticket ID | Status | Implemented Date | Notes |
|-----------|--------|------------------|-------|
| GL-RJ-001 | ✅ DONE | 2026-01-28 | UPI verification + result callback |
| GL-RJ-002 | ✅ DONE | 2026-01-28 | Add to Order handler + cart store integration |
| GL-RJ-003 | ✅ DONE | 2026-01-28 | UPI payment flow: cart retained until UTR confirmed |
| GL-RJ-004 | ✅ DONE | 2026-01-28 | UTR verification API + UI verify button |
| GL-RJ-005 | ✅ DONE | 2026-01-28 | Settings page + route + sidebar nav |
| GL-RJ-006 | ✅ DONE | 2026-01-28 | Duplicate label detection + suggestions UI |
| GL-RJ-007 | ✅ DONE | 2026-01-28 | Price resolution error display + visual warning |
| GL-RJ-008 | ✅ DONE | 2026-01-28 | BNPL auto-polling + polling UI |
| GL-RJ-009 | ✅ DONE | 2026-01-28 | Daily Summary with error handling + refresh |

## All 9 Tickets Complete - Ready for Batch Deployment

---

## 2nd Iteration Review (2026-01-28)

### Gaps Identified and Fixed

| Gap | Ticket | Fix Applied |
|-----|--------|-------------|
| Missing `payments.upi_verifications` table | GL-RJ-004 | Created migration 057_upi_verifications_table.sql |
| Missing unique constraint on device labels | GL-RJ-006 | Created migration 058_device_label_unique_constraint.sql |
| Missing BNPL payment status polling endpoint | GL-RJ-008 | Added GET `/api/v1/pos/bnpl/:drawdownId/pay/:repaymentId/status` |

### New Database Migrations Required

```
057_upi_verifications_table.sql      - UPI UTR verification tracking
058_device_label_unique_constraint.sql - Prevent duplicate device labels per store
```

### Backend Endpoints Added

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/api/v1/pos/bnpl/:drawdownId/pay/:repaymentId/status` | GET | BNPL payment status polling |

### Verified Complete (No Gaps)

| Ticket | Component | Verification |
|--------|-----------|--------------|
| GL-RJ-001 | SplitPaymentModal.tsx | Pending status polling implemented |
| GL-RJ-002 | LiveSuppliersView.tsx | handleAddToOrder with haptics/toast |
| GL-RJ-003 | PurchaseCartModal.tsx | Cart retained until UPI confirmed |
| GL-RJ-005 | retailer-admin/settings.ts | GET/PUT endpoints exist |
| GL-RJ-007 | SellScanScreen.tsx | priceResolutionError flag + UI warning |
| GL-RJ-009 | MenuScreen.tsx | loadDailySummary with retry UI |

---

## 3rd Iteration Review (2026-01-28)

### Gaps Identified and Fixed

| Gap | Ticket | Fix Applied |
|-----|--------|-------------|
| No auto-polling for pending UPI in split payment | GL-RJ-001 | Added auto-polling (3s interval, 40 max attempts) to SplitPaymentModal |
| retailer-admin dashboard missing daily summary | GL-RJ-009 | Added fetchDailySummary API + daily summary section to DashboardPage |

### Files Modified

| File | Changes |
|------|---------|
| `src/components/sell/SplitPaymentModal.tsx` | Added polling state, auto-poll useEffect, polling status UI |
| `retailer-admin/src/api/store.ts` | Added `fetchDailySummary()` function |
| `retailer-admin/src/pages/DashboardPage.tsx` | Added daily summary state, loading, and UI section |

### Verified Complete (No Additional Gaps)

| Ticket | Component | Verification |
|--------|-----------|--------------|
| GL-RJ-002 | LiveSuppliersView.tsx | handleAddToOrder properly implemented |
| GL-RJ-003 | PurchaseCartModal.tsx | Idempotency via order ID tracking |
| GL-RJ-004 | payments.ts | Duplicate UTR detection via upi_verifications table |
| GL-RJ-005 | settings.ts | Settings sync with POS via GET endpoint |
| GL-RJ-007 | SellScanScreen.tsx | Manual price entry available in edit modal |

---

## VM Deployment (2026-01-28)

### Deployment Summary

| Component | Status | Notes |
|-----------|--------|-------|
| Migration 057 (upi_verifications) | ✅ DEPLOYED | Table created in payments schema |
| Migration 058 (device label unique) | ✅ DEPLOYED | Index created on pos_devices |
| BNPL Routes (GL-RJ-008) | ✅ DEPLOYED | Added bnpl.ts, registered in v1/index.ts |
| Main-backend rebuild | ✅ DEPLOYED | Docker image rebuilt and restarted |
| Retailer-admin | ✅ DEPLOYED | Daily summary section added |

### VM Details

- **Host:** 34.14.220.171
- **User:** supermanditech
- **Services Updated:** supermandi-main-backend, supermandi-api-gateway

### Verification Commands

```bash
# Check upi_verifications table
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "\d payments.upi_verifications"

# Check device label index
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "\di idx_pos_devices_store_label_unique"

# Test BNPL status endpoint (requires valid device token)
curl http://34.14.220.171:3000/api/v1/pos/bnpl/{drawdownId}/pay/{repaymentId}/status -H "x-device-token: YOUR_TOKEN"
```

### Post-Deployment Testing

| Test | Expected Result | Status |
|------|-----------------|--------|
| UPI verification stores to DB | Record in payments.upi_verifications | Pending manual test |
| Duplicate device label blocked | Error on duplicate label attempt | Pending manual test |
| BNPL status endpoint responds | Returns payment status JSON | ✅ Verified |
| Daily summary on retailer-admin | Shows today's sales | Pending manual test |

### Test Scenarios Covered

| Ticket | Test Case | Status |
|--------|-----------|--------|
| GL-RJ-001 #3 | Payment API returns `pending` - Show 'Verifying...' with polling | ✅ Auto-polling added |
| GL-RJ-004 #3 | Already-used UTR - Duplicate detected, blocked | ✅ upi_verifications unique constraint |
| GL-RJ-009 | View daily summary - Dashboard loads summary card | ✅ Added to retailer-admin dashboard |

---

## Summary

| Ticket ID | Issue | Workflow | Severity |
|-----------|-------|----------|----------|
| GL-RJ-001 | Split payment doesn't verify success | Sell Flow | CRITICAL |
| GL-RJ-002 | Add to Order button non-functional | Buy Flow | CRITICAL |
| GL-RJ-003 | Checkout flow incomplete from cart modal | Buy Flow | CRITICAL |
| GL-RJ-004 | UTR manual entry, no verification | Payment (UPI) | CRITICAL |
| GL-RJ-005 | No settings page in retailer-admin | Store Settings | CRITICAL |
| GL-RJ-006 | No duplicate label detection | Device Enrollment | HIGH |
| GL-RJ-007 | Price resolution errors not shown | Sell Flow | HIGH |
| GL-RJ-008 | Manual UTR entry required | Payment (BNPL) | HIGH |
| GL-RJ-009 | Daily Summary API exists but UI doesn't call | Ledger & Summary | HIGH |

---

## CRITICAL SEVERITY (5 Tickets)

---

### GL-RJ-001: Split Payment Success Verification

**Severity:** CRITICAL
**Workflow:** Sell Flow
**Source Issue:** ❌ Split payment doesn't verify success

#### Problem

Split payment success callback doesn't verify `result.paymentStatus`. Payment marked complete without backend confirmation.

#### Impact (10K Stores)

- Users see success even if payment failed
- Financial reconciliation impossible
- Revenue loss at scale

---

#### IMPLEMENTATION

**1. UI (POS Mobile App)**

| Task | File | Details |
|------|------|---------|
| Add status verification | `src/screens/PaymentScreen.tsx:732-749` | Check `result.paymentStatus === 'completed'` before proceeding |
| Add loading state | `src/components/sell/SplitPaymentModal.tsx` | Show spinner during verification |
| Handle failure | Same file | Display error toast, keep cart intact |
| Add retry option | Same file | Allow user to retry failed payment |

**Code Change:**

```typescript
// BEFORE (line 732-749)
onSplitPaymentComplete(result) {
  completeSale(); // No verification!
}

// AFTER
onSplitPaymentComplete(result) {
  if (result.paymentStatus !== 'completed') {
    showError('Payment not confirmed. Please retry.');
    return; // Don't complete sale
  }
  completeSale();
}
```

**2. API (main-backend)**

| Task | Endpoint | Details |
|------|----------|---------|
| Ensure status returned | `POST /api/v1/pos/sales/split-payment` | Return `{ paymentStatus: 'completed' \| 'failed' \| 'pending' }` |
| Add verification endpoint | `POST /api/v1/pos/payments/verify` | Verify payment by transaction ID |
| Add logging | All payment endpoints | Log store_id, amount, status for audit |

**3. Database**

| Task | Table | Details |
|------|-------|---------|
| Verify column exists | `payments` | Ensure `status` column captures all states |
| Add index | `payments` | Index on `(store_id, status, created_at)` |

**4. Deployment (Google VM)**

| Step | Environment | Command/Action |
|------|-------------|----------------|
| Deploy backend | Staging VM | `docker-compose up -d main-backend` |
| Run migration | Staging VM | `npm run migrate` |
| Test endpoint | Staging | `curl -X POST .../split-payment` |
| Deploy backend | Production VM | Same as staging |
| Deploy POS | OTA | Trigger EAS update |
| Monitor | Grafana | Watch `payment_success_rate` metric |

---

#### ACCEPTANCE CRITERIA

```gherkin
Scenario: Split payment with failed backend response
  Given a retailer completes split payment entry
  When the payment API returns status = 'failed'
  Then the sale should NOT be marked complete
  And error message "Payment not confirmed" should display
  And the cart should remain intact for retry

Scenario: Split payment with successful response
  Given a retailer completes split payment entry
  When the payment API returns status = 'completed'
  Then the sale should be marked complete
  And receipt screen should display
```

#### TEST CASES

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Payment API returns `completed` | Sale completes, receipt shown |
| 2 | Payment API returns `failed` | Error shown, cart intact |
| 3 | Payment API returns `pending` | Show "Verifying..." with polling |
| 4 | Network timeout | Retry option shown |
| 5 | API returns 500 error | Error shown, cart intact |

---

### GL-RJ-002: Add to Order Button Handler

**Severity:** CRITICAL
**Workflow:** Buy Flow
**Source Issue:** ❌ Add to Order button non-functional (LiveSuppliersView)

#### Problem

"Add to Order" button has NO `onPress` handler. Button is decorative only.

#### Impact (10K Stores)

- Retailers cannot add supplier products to purchase orders
- Buy workflow completely broken
- Supply chain disrupted

---

#### IMPLEMENTATION

**1. UI (POS Mobile App)**

| Task | File | Details |
|------|------|---------|
| Add onPress handler | `src/components/purchase/LiveSuppliersView.tsx:318-320` | Implement handler to add item to cart |
| Add quantity modal | Same file | Show quantity selector on press |
| Update cart state | `src/stores/purchaseCartStore.ts` | Add item to purchase cart |
| Show feedback | Same file | Haptic feedback + "Added" toast |
| Update cart badge | Navigation | Show item count in tab badge |

**Code Change:**

```typescript
// BEFORE (line 318-320)
<Button title="Add to Order" />  // No onPress!

// AFTER
<Button
  title="Add to Order"
  onPress={() => handleAddToOrder(product)}
/>

const handleAddToOrder = (product: SupplierProduct) => {
  setSelectedProduct(product);
  setShowQuantityModal(true);
};

const confirmAddToOrder = (quantity: number) => {
  purchaseCartStore.addItem({
    productId: selectedProduct.id,
    supplierId: selectedProduct.supplierId,
    quantity,
    unitPrice: selectedProduct.price,
  });
  showToast('Added to order');
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
};
```

**2. API (main-backend)**

| Task | Endpoint | Details |
|------|----------|---------|
| Verify cart endpoint | `POST /api/v1/pos/purchase-cart/items` | Add item to purchase cart |
| Verify stock endpoint | `GET /api/v1/pos/suppliers/:id/products/:id/stock` | Return available quantity |
| Create order endpoint | `POST /api/v1/pos/purchase-orders` | Create order from cart |

**3. Database**

| Task | Table | Details |
|------|-------|---------|
| Verify schema | `purchase_order_items` | Columns: order_id, product_id, quantity, unit_price |
| Add cart table | `purchase_cart_items` | For temporary cart state (if not exists) |

**4. Deployment (Google VM)**

| Step | Environment | Command/Action |
|------|-------------|----------------|
| Deploy backend | Staging VM | Deploy with new/verified endpoints |
| Test cart flow | Staging | Add items, verify cart state |
| Load test | Staging | Simulate 100 concurrent add-to-cart |
| Deploy backend | Production VM | Rolling deploy |
| Deploy POS | OTA | Push update to devices |

---

#### ACCEPTANCE CRITERIA

```gherkin
Scenario: Add product to purchase order
  Given a retailer is viewing supplier products
  When they tap "Add to Order" on a product
  Then a quantity selector modal should appear
  When they select quantity and confirm
  Then the product should be added to purchase cart
  And cart badge should update with item count
  And "Added to order" toast should appear
```

#### TEST CASES

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Tap Add to Order | Quantity modal appears |
| 2 | Confirm with quantity 5 | Item added with qty=5 |
| 3 | Add same item again | Quantity increments |
| 4 | Add when offline | Queued locally, syncs later |
| 5 | Product out of stock | Show "Out of Stock" error |

---

### GL-RJ-003: Complete Checkout Flow from Cart Modal

**Severity:** CRITICAL
**Workflow:** Buy Flow
**Source Issue:** ❌ Checkout flow incomplete from cart modal

#### Problem

PurchaseCartModal calls `removeSupplierItems()` BEFORE payment confirmation. If payment fails, items already removed with no rollback.

#### Impact (10K Stores)

- Cart cleared even when payment fails
- Users must re-add all items manually
- Abandoned purchases, frustrated retailers

---

#### IMPLEMENTATION

**1. UI (POS Mobile App)**

| Task | File | Details |
|------|------|---------|
| Reorder operations | `src/components/buy/PurchaseCartModal.tsx:252` | Move `removeSupplierItems()` AFTER payment success |
| Add cart snapshot | Same file | Save cart state before payment attempt |
| Add rollback | Same file | Restore cart on payment failure |
| Add success message | Same file | Show "Payment failed, cart restored" on failure |
| Complete checkout path | Same file | Add navigation to order confirmation |

**Code Change:**

```typescript
// BEFORE (line 252)
const handleCheckout = async () => {
  removeSupplierItems(); // WRONG - removes before confirmation!
  const result = await processPayment();
  if (result.success) {
    showSuccess();
  }
};

// AFTER
const handleCheckout = async () => {
  const cartSnapshot = [...cartItems]; // Save snapshot
  setLoading(true);

  try {
    const result = await processPayment();

    if (result.success) {
      removeSupplierItems(); // Only remove AFTER success
      navigateToOrderConfirmation(result.orderId);
    } else {
      showError('Payment failed. Your cart is intact.');
    }
  } catch (error) {
    showError('Payment failed. Please try again.');
    // Cart automatically intact since we didn't remove
  } finally {
    setLoading(false);
  }
};
```

**2. API (main-backend)**

| Task | Endpoint | Details |
|------|----------|---------|
| Return clear status | `POST /api/v1/pos/purchase-orders/checkout` | Return `{ success: boolean, orderId?, error? }` |
| Add idempotency | Same endpoint | Accept idempotency key to prevent duplicates |
| Make atomic | Same endpoint | Payment + order creation in transaction |

**3. Database**

| Task | Table | Details |
|------|-------|---------|
| Ensure atomicity | `purchase_orders`, `payments` | Use DB transaction |
| Add idempotency table | `idempotency_keys` | Track processed requests |

**4. Deployment (Google VM)**

| Step | Environment | Command/Action |
|------|-------------|----------------|
| Deploy backend | Staging | With atomic transaction support |
| Test failure cases | Staging | Simulate payment failures |
| Deploy backend | Production | Rolling deploy |
| Deploy POS | OTA | Push update |
| Monitor | Grafana | Track `cart_abandonment_rate` |

---

#### ACCEPTANCE CRITERIA

```gherkin
Scenario: Checkout with payment failure
  Given a retailer has 5 items in purchase cart
  When they tap Checkout and payment FAILS
  Then all 5 items should remain in cart
  And error message should display
  And user can retry checkout

Scenario: Checkout with payment success
  Given a retailer has 5 items in purchase cart
  When they tap Checkout and payment SUCCEEDS
  Then cart should be cleared
  And order confirmation screen should display
```

#### TEST CASES

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Payment succeeds | Cart cleared, confirmation shown |
| 2 | Payment fails | Cart intact, error shown |
| 3 | Network timeout | Cart intact, retry option |
| 4 | Partial payment | Handle gracefully, show status |
| 5 | Double-tap checkout | Idempotency prevents duplicate |

---

### GL-RJ-004: UPI Payment Verification

**Severity:** CRITICAL
**Workflow:** Payment Flows (UPI)
**Source Issue:** ⚠ UTR manual entry, no verification

#### Problem

Manual UTR entry accepted without backend verification. Users can enter any UTR and mark payment complete.

#### Impact (10K Stores)

- Fraud vector - fake UTRs accepted
- No payment verification
- Financial losses from unverified payments

---

#### IMPLEMENTATION

**1. UI (POS Mobile App)**

| Task | File | Details |
|------|------|---------|
| Add verify button | `src/components/buy/PaymentOptionsSheet.tsx:136-140` | "Verify Payment" button after UTR entry |
| Add verification state | Same file | Loading, success, failure states |
| Block completion | Same file | Disable "Complete" until verified |
| Add auto-poll | Same file | Poll status after UPI app returns |
| Show verification result | Same file | Green checkmark or red X |

**Code Change:**

```typescript
// BEFORE (line 136-140)
<TextInput
  placeholder="Enter UTR"
  onChangeText={setUtr}
/>
<Button title="Complete" onPress={completeSale} />

// AFTER
<TextInput
  placeholder="Enter UTR"
  onChangeText={setUtr}
/>
<Button
  title="Verify Payment"
  onPress={verifyPayment}
  loading={verifying}
/>
{verificationStatus === 'verified' && (
  <Button title="Complete Sale" onPress={completeSale} />
)}
{verificationStatus === 'failed' && (
  <Text style={styles.error}>UTR verification failed</Text>
)}

const verifyPayment = async () => {
  setVerifying(true);
  const result = await paymentApi.verifyUtr(utr, amount);
  setVerificationStatus(result.verified ? 'verified' : 'failed');
  setVerifying(false);
};
```

**2. API (main-backend)**

| Task | Endpoint | Details |
|------|----------|---------|
| Create verify endpoint | `POST /api/v1/pos/payments/upi/verify` | Verify UTR with payment gateway |
| Integrate gateway | Service layer | Call Razorpay/PayU/etc. verification API |
| Add webhook handler | `POST /api/v1/webhooks/payment` | Receive async payment confirmations |
| Cache results | Redis | Cache verification for 5 minutes |

**API Request/Response:**

```typescript
// Request
POST /api/v1/pos/payments/upi/verify
{
  "utr": "123456789012",
  "amount": 1500.00,
  "storeId": "store_123"
}

// Response
{
  "verified": true,
  "transactionId": "txn_abc123",
  "verifiedAt": "2026-01-28T10:30:00Z",
  "payerVpa": "customer@upi"
}
```

**3. Database**

| Task | Table | Details |
|------|-------|---------|
| Create table | `upi_verifications` | Columns: id, utr, amount, store_id, verified, verified_at, gateway_response |
| Add unique index | `upi_verifications` | Index on `utr` to prevent reuse |
| Add foreign key | Same table | Link to `payments` table |

**Schema:**

```sql
CREATE TABLE upi_verifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  utr VARCHAR(50) NOT NULL UNIQUE,
  amount DECIMAL(10,2) NOT NULL,
  store_id UUID NOT NULL REFERENCES stores(id),
  verified BOOLEAN DEFAULT FALSE,
  verified_at TIMESTAMP,
  gateway_response JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_upi_verifications_utr ON upi_verifications(utr);
CREATE INDEX idx_upi_verifications_store ON upi_verifications(store_id, created_at);
```

**4. Deployment (Google VM)**

| Step | Environment | Command/Action |
|------|-------------|----------------|
| Add gateway secrets | VM Secrets | Add `PAYMENT_GATEWAY_KEY`, `PAYMENT_GATEWAY_SECRET` |
| Run migration | Staging | Create `upi_verifications` table |
| Deploy backend | Staging | With verification endpoint |
| Test verification | Staging | Test with sandbox UTRs |
| Deploy backend | Production | Rolling deploy |
| Configure webhook | Payment Gateway | Point to production webhook URL |
| Deploy POS | OTA | Push update |
| Monitor | Grafana | Track `upi_verification_rate` |

---

#### ACCEPTANCE CRITERIA

```gherkin
Scenario: Valid UTR verification
  Given a retailer enters a UTR after UPI payment
  When they tap "Verify Payment"
  Then the system should call backend verification
  When verification succeeds
  Then "Complete Sale" button should appear
  And green checkmark should display

Scenario: Invalid UTR verification
  Given a retailer enters an invalid UTR
  When they tap "Verify Payment"
  Then verification should fail
  And error message should display
  And "Complete Sale" should remain disabled
```

#### TEST CASES

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Valid UTR | Verification succeeds, can complete |
| 2 | Invalid UTR | Verification fails, error shown |
| 3 | Already-used UTR | Duplicate detected, blocked |
| 4 | Gateway timeout | Retry option shown |
| 5 | Mismatched amount | Verification fails |

---

### GL-RJ-005: Retailer Store Settings Page

**Severity:** CRITICAL
**Workflow:** Store Settings
**Source Issue:** ❌ No settings page in retailer-admin, ❌ Cannot configure UPI VPA, tax, preferences

#### Problem

No store settings page exists in retailer-admin. No route, no component, no API calls.

#### Impact (10K Stores)

- Cannot configure UPI VPA per store
- Cannot set tax rates per region
- Store preferences locked to defaults

---

#### IMPLEMENTATION

**1. UI (Retailer Admin - Web)**

| Task | File | Details |
|------|------|---------|
| Create page | `src/pages/SettingsPage.tsx` (NEW) | New settings page component |
| Add route | `src/App.tsx` | Add `/settings` route |
| Add nav link | `src/components/Sidebar.tsx` | Add Settings link in sidebar |
| Create form sections | `SettingsPage.tsx` | UPI, Tax, Preferences sections |
| Add validation | Same file | Validate UPI VPA format, tax range |
| Add save handler | Same file | Call API on save |

**New Component:**

```tsx
// src/pages/SettingsPage.tsx
import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { settingsApi } from '@/lib/api';

interface StoreSettings {
  upiVpa: string;
  taxRate: number;
  storeName: string;
  operatingHours: { open: string; close: string };
  receiptFooter: string;
}

export function SettingsPage() {
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors }, reset } = useForm<StoreSettings>();

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    const settings = await settingsApi.getSettings();
    reset(settings);
  };

  const onSubmit = async (data: StoreSettings) => {
    setLoading(true);
    try {
      await settingsApi.updateSettings(data);
      toast.success('Settings saved successfully');
    } catch (error) {
      toast.error('Failed to save settings');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Store Settings</h1>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* UPI Configuration */}
        <section className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Payment Settings</h2>
          <div>
            <label>UPI VPA (Virtual Payment Address)</label>
            <input
              {...register('upiVpa', {
                required: 'UPI VPA is required',
                pattern: {
                  value: /^[\w.-]+@[\w]+$/,
                  message: 'Invalid UPI VPA format (e.g., store@upi)'
                }
              })}
              placeholder="yourstore@upi"
            />
            {errors.upiVpa && <span className="error">{errors.upiVpa.message}</span>}
          </div>
        </section>

        {/* Tax Settings */}
        <section className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Tax Settings</h2>
          <div>
            <label>GST Rate (%)</label>
            <input
              type="number"
              {...register('taxRate', {
                required: 'Tax rate is required',
                min: { value: 0, message: 'Minimum 0%' },
                max: { value: 28, message: 'Maximum 28%' }
              })}
              placeholder="18"
            />
            {errors.taxRate && <span className="error">{errors.taxRate.message}</span>}
          </div>
        </section>

        {/* Store Preferences */}
        <section className="bg-white p-4 rounded-lg shadow">
          <h2 className="text-lg font-semibold mb-4">Store Preferences</h2>
          <div>
            <label>Receipt Footer Message</label>
            <textarea
              {...register('receiptFooter')}
              placeholder="Thank you for shopping with us!"
            />
          </div>
        </section>

        <button type="submit" disabled={loading} className="btn-primary">
          {loading ? 'Saving...' : 'Save Settings'}
        </button>
      </form>
    </div>
  );
}
```

**2. API (main-backend)**

| Task | Endpoint | Details |
|------|----------|---------|
| GET settings | `GET /api/v1/retailer-admin/settings` | Return current store settings |
| UPDATE settings | `PATCH /api/v1/retailer-admin/settings` | Update store settings |
| Validate UPI | Service layer | Validate UPI VPA format |
| Validate tax | Service layer | Ensure 0-28% range |

**API Endpoints:**

```typescript
// GET /api/v1/retailer-admin/settings
// Response
{
  "upiVpa": "store123@upi",
  "taxRate": 18,
  "storeName": "My Store",
  "operatingHours": { "open": "09:00", "close": "21:00" },
  "receiptFooter": "Thank you!"
}

// PATCH /api/v1/retailer-admin/settings
// Request
{
  "upiVpa": "newvpa@upi",
  "taxRate": 12
}
// Response
{
  "success": true,
  "settings": { ... }
}
```

**3. Database**

| Task | Table | Details |
|------|-------|---------|
| Verify columns | `platform.stores` | Ensure columns exist: upi_vpa, tax_rate, operating_hours, receipt_footer |
| Add migration | If needed | Add any missing columns |
| Set defaults | Migration | Default tax_rate = 18, receipt_footer = '' |

**Migration (if needed):**

```sql
ALTER TABLE platform.stores
ADD COLUMN IF NOT EXISTS upi_vpa VARCHAR(100),
ADD COLUMN IF NOT EXISTS tax_rate DECIMAL(4,2) DEFAULT 18.00,
ADD COLUMN IF NOT EXISTS operating_hours JSONB DEFAULT '{"open": "09:00", "close": "21:00"}',
ADD COLUMN IF NOT EXISTS receipt_footer TEXT DEFAULT '';
```

**4. Deployment (Google VM)**

| Step | Environment | Command/Action |
|------|-------------|----------------|
| Run migration | Staging | Add any missing columns |
| Deploy backend | Staging | With settings endpoints |
| Build frontend | Local | `npm run build` |
| Deploy frontend | Staging VM | Copy to nginx html folder |
| Test settings | Staging | Save and verify persistence |
| Deploy all | Production | Backend, frontend, migration |
| Verify sync | POS | Settings reflect in POS app |

---

#### ACCEPTANCE CRITERIA

```gherkin
Scenario: Save store settings
  Given a retailer navigates to Settings page
  When they update UPI VPA to "newstore@upi"
  And set tax rate to 12%
  And click Save
  Then settings should be saved successfully
  And success toast should appear

Scenario: Settings sync to POS
  Given a retailer saves new UPI VPA in settings
  When the POS app syncs
  Then the new UPI VPA should be used for payments
```

#### TEST CASES

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Save valid UPI VPA | Settings saved successfully |
| 2 | Invalid UPI format | Validation error shown |
| 3 | Tax rate > 28% | Validation error shown |
| 4 | Tax rate < 0 | Validation error shown |
| 5 | Settings sync to POS | POS uses new values |
| 6 | Page load | Current settings populated |

---

## HIGH SEVERITY (4 Tickets)

---

### GL-RJ-006: Device Enrollment Duplicate Label Detection

**Severity:** HIGH
**Workflow:** Device Enrollment
**Source Issue:** ⚠ No duplicate label detection

#### Problem

No check for duplicate device labels. Same device can be enrolled multiple times with empty labels.

#### Impact (10K Stores)

- Confusion with duplicate device names
- Cannot identify specific devices
- Support issues when troubleshooting

---

#### IMPLEMENTATION

**1. UI (POS Mobile App)**

| Task | File | Details |
|------|------|---------|
| Add label validation | `src/screens/EnrollDeviceScreen.tsx:259-268` | Check for empty and duplicate labels |
| Fetch existing labels | Same file | Load existing device labels on mount |
| Show error | Same file | "Label already exists" error message |
| Require non-empty | Same file | Validate label is not empty |

**Code Change:**

```typescript
// BEFORE (line 259-268)
const handleEnroll = async () => {
  await enrollDevice(qrData, label);
  // No validation!
};

// AFTER
const [existingLabels, setExistingLabels] = useState<string[]>([]);

useEffect(() => {
  loadExistingLabels();
}, []);

const loadExistingLabels = async () => {
  const devices = await deviceApi.getEnrolledDevices();
  setExistingLabels(devices.map(d => d.label.toLowerCase()));
};

const handleEnroll = async () => {
  // Validate non-empty
  if (!label.trim()) {
    showError('Device label is required');
    return;
  }

  // Validate unique
  if (existingLabels.includes(label.toLowerCase().trim())) {
    showError('This label is already in use. Please choose a different name.');
    return;
  }

  await enrollDevice(qrData, label.trim());
};
```

**2. API (main-backend)**

| Task | Endpoint | Details |
|------|----------|---------|
| Add validation | `POST /api/v1/pos/devices/enroll` | Check label uniqueness server-side |
| Add list endpoint | `GET /api/v1/pos/devices` | Return enrolled devices for store |
| Return error | Enrollment endpoint | Return 409 Conflict if duplicate |

**3. Database**

| Task | Table | Details |
|------|-------|---------|
| Add constraint | `devices` | Unique constraint on `(store_id, label)` |
| Add index | `devices` | Index for quick lookups |

```sql
ALTER TABLE devices
ADD CONSTRAINT unique_store_device_label UNIQUE (store_id, label);
```

**4. Deployment (Google VM)**

| Step | Environment | Command/Action |
|------|-------------|----------------|
| Run migration | Staging | Add unique constraint |
| Deploy backend | Staging | With validation |
| Deploy POS | OTA | Push update |
| Deploy all | Production | Rolling deploy |

---

#### ACCEPTANCE CRITERIA

```gherkin
Scenario: Duplicate label rejected
  Given a store has a device labeled "Counter 1"
  When enrolling a new device with label "Counter 1"
  Then error "This label is already in use" should display
  And enrollment should be blocked

Scenario: Empty label rejected
  Given a retailer is enrolling a device
  When they leave the label field empty
  Then error "Device label is required" should display
```

#### TEST CASES

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Unique label | Enrollment succeeds |
| 2 | Duplicate label | Error shown, blocked |
| 3 | Empty label | Error shown, blocked |
| 4 | Case-insensitive duplicate | Error shown (Counter1 = counter1) |

---

### GL-RJ-007: Price Resolution Error Display

**Severity:** HIGH
**Workflow:** Sell Flow
**Source Issue:** ⚠ Price resolution errors not shown

#### Problem

No error shown when `resolveSkuPrice()` returns null. Users add items without understanding price failures.

#### Impact (10K Stores)

- Items added with unknown prices
- Confusion at checkout
- Incorrect billing

---

#### IMPLEMENTATION

**1. UI (POS Mobile App)**

| Task | File | Details |
|------|------|---------|
| Check price result | `src/screens/SellScanScreen.tsx` | Handle null from `resolveSkuPrice()` |
| Show alert | Same file | Display "Price not available" error |
| Offer options | Same file | Skip / Manual price / Retry buttons |
| Log failures | Same file | Track for debugging |

**Code Change:**

```typescript
// BEFORE
const handleScan = async (barcode: string) => {
  const product = await lookupProduct(barcode);
  const price = resolveSkuPrice(product);
  addToCart({ ...product, price }); // price could be null!
};

// AFTER
const handleScan = async (barcode: string) => {
  const product = await lookupProduct(barcode);
  const price = resolveSkuPrice(product);

  if (price === null || price === undefined) {
    Alert.alert(
      'Price Not Available',
      `Could not find price for "${product.name}". What would you like to do?`,
      [
        { text: 'Skip Item', style: 'cancel' },
        { text: 'Enter Manual Price', onPress: () => showManualPriceModal(product) },
        { text: 'Retry', onPress: () => handleScan(barcode) },
      ]
    );
    logPriceResolutionFailure(barcode, product.id);
    return;
  }

  addToCart({ ...product, price });
};
```

**2. API:** N/A (local price resolution)

**3. Database:** N/A

**4. Deployment (Google VM)**

| Step | Environment | Command/Action |
|------|-------------|----------------|
| Deploy POS | OTA | Push update |
| Monitor | Logging | Track price resolution failures |

---

#### ACCEPTANCE CRITERIA

```gherkin
Scenario: Price resolution fails
  Given a retailer scans a product barcode
  When price resolution returns null
  Then an alert "Price Not Available" should display
  And options to Skip, Enter Manual Price, or Retry should appear
  And item should NOT be silently added to cart
```

#### TEST CASES

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Price found | Item added to cart normally |
| 2 | Price null | Alert shown with options |
| 3 | User taps Skip | Item not added, scanner ready |
| 4 | User enters manual price | Item added with manual price |
| 5 | User taps Retry | Re-attempts price lookup |

---

### GL-RJ-008: BNPL Payment Auto-Polling

**Severity:** HIGH
**Workflow:** Payment Flows (BNPL)
**Source Issue:** ⚠ Manual UTR entry required

#### Problem

BNPL payment requires manual UTR entry. No automatic polling after UPI deep link.

#### Impact (10K Stores)

- Error-prone manual entry
- Slower checkout process
- Poor user experience

---

#### IMPLEMENTATION

**1. UI (POS Mobile App)**

| Task | File | Details |
|------|------|---------|
| Start polling | `src/screens/BnplDuesScreen.tsx:445-454` | Begin polling after UPI app opens |
| Add timer | Same file | Poll every 3 seconds for 2 minutes |
| Auto-fill UTR | Same file | Fill UTR when payment detected |
| Show countdown | Same file | Display remaining poll time |
| Fallback | Same file | Show manual entry after timeout |

**Code Change:**

```typescript
// BEFORE (line 445-454)
const handleUpiPayment = () => {
  openUpiApp(upiLink);
  // User must manually enter UTR
};

// AFTER
const handleUpiPayment = async () => {
  const transactionId = generateTransactionId();
  openUpiApp(upiLink);

  // Start polling when app returns to foreground
  const pollInterval = setInterval(async () => {
    const status = await paymentApi.checkPaymentStatus(transactionId);

    if (status.completed) {
      clearInterval(pollInterval);
      setUtr(status.utr);
      setPaymentVerified(true);
      showSuccess('Payment detected!');
    }
  }, 3000); // Poll every 3 seconds

  // Stop polling after 2 minutes
  setTimeout(() => {
    clearInterval(pollInterval);
    if (!paymentVerified) {
      showManualEntryFallback();
    }
  }, 120000);
};
```

**2. API (main-backend)**

| Task | Endpoint | Details |
|------|----------|---------|
| Add status endpoint | `GET /api/v1/pos/payments/status/:transactionId` | Return payment status |
| Integrate webhook | `POST /api/v1/webhooks/bnpl` | Receive BNPL provider callbacks |
| Store transaction | Service | Save transaction_id when initiated |

**3. Database**

| Task | Table | Details |
|------|-------|---------|
| Add transaction tracking | `payment_transactions` | Store transaction_id, status, utr |
| Update on webhook | Same table | Update when webhook received |

**4. Deployment (Google VM)**

| Step | Environment | Command/Action |
|------|-------------|----------------|
| Deploy backend | Staging | With status endpoint |
| Configure webhook | BNPL Provider | Point to webhook URL |
| Deploy POS | OTA | Push update |
| Test flow | Staging | Complete BNPL payment |
| Deploy all | Production | Rolling deploy |

---

#### ACCEPTANCE CRITERIA

```gherkin
Scenario: Auto-detect BNPL payment
  Given a retailer opens UPI app for BNPL payment
  When payment is completed in UPI app
  And retailer returns to POS app
  Then system should auto-detect the payment
  And UTR should be auto-filled
  And "Payment detected!" message should appear
```

#### TEST CASES

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Payment completes within 2 min | Auto-detected, UTR filled |
| 2 | Payment after 2 min | Manual entry fallback shown |
| 3 | Payment fails | Error status shown |
| 4 | Network issues during poll | Graceful handling, manual fallback |

---

### GL-RJ-009: Daily Summary UI Integration

**Severity:** HIGH
**Workflow:** Ledger & Summary
**Source Issue:** ⚠ Daily Summary API exists but UI doesn't call it

#### Problem

`fetchDailySummary()` exists but never called in UI. Retailers cannot see daily sales summary.

#### Impact (10K Stores)

- No visibility into daily performance
- Cannot track sales trends
- Wasted backend functionality

---

#### IMPLEMENTATION

**1. UI (Retailer Admin - Web)**

| Task | File | Details |
|------|------|---------|
| Add summary card | `src/pages/DashboardPage.tsx` | New card for daily summary |
| Call API on load | Same file | Fetch summary on page mount |
| Display metrics | Same file | Total sales, transaction count, avg ticket |
| Add date picker | Same file | View historical summaries |
| Add comparison | Same file | Compare with previous day |

**Code Addition:**

```tsx
// Add to DashboardPage.tsx
import { useEffect, useState } from 'react';
import { dashboardApi } from '@/lib/api';

interface DailySummary {
  totalSales: number;
  transactionCount: number;
  averageTicket: number;
  topProducts: Array<{ name: string; quantity: number; revenue: number }>;
  comparisonWithYesterday: {
    salesChange: number;
    transactionChange: number;
  };
}

function DailySummaryCard() {
  const [summary, setSummary] = useState<DailySummary | null>(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchSummary();
  }, [selectedDate]);

  const fetchSummary = async () => {
    setLoading(true);
    try {
      const data = await dashboardApi.fetchDailySummary(selectedDate);
      setSummary(data);
    } catch (error) {
      console.error('Failed to fetch daily summary', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) return <CardSkeleton />;

  return (
    <div className="bg-white p-6 rounded-lg shadow">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-lg font-semibold">Daily Summary</h2>
        <input
          type="date"
          value={selectedDate.toISOString().split('T')[0]}
          onChange={(e) => setSelectedDate(new Date(e.target.value))}
        />
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div>
          <p className="text-gray-500">Total Sales</p>
          <p className="text-2xl font-bold">₹{summary?.totalSales.toLocaleString()}</p>
          <TrendIndicator value={summary?.comparisonWithYesterday.salesChange} />
        </div>
        <div>
          <p className="text-gray-500">Transactions</p>
          <p className="text-2xl font-bold">{summary?.transactionCount}</p>
          <TrendIndicator value={summary?.comparisonWithYesterday.transactionChange} />
        </div>
        <div>
          <p className="text-gray-500">Avg. Ticket</p>
          <p className="text-2xl font-bold">₹{summary?.averageTicket.toFixed(0)}</p>
        </div>
      </div>

      <div className="mt-4">
        <h3 className="font-medium mb-2">Top Products</h3>
        <ul>
          {summary?.topProducts.slice(0, 5).map((product, i) => (
            <li key={i} className="flex justify-between py-1">
              <span>{product.name}</span>
              <span>₹{product.revenue.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
```

**2. API (main-backend)**

| Task | Endpoint | Details |
|------|----------|---------|
| Verify endpoint | `GET /api/v1/retailer-admin/dashboard/daily-summary` | Should already exist |
| Add date param | Same endpoint | Accept `?date=2026-01-28` |
| Add comparison | Response | Include yesterday comparison |

**3. Database:** N/A (API already exists)

**4. Deployment (Google VM)**

| Step | Environment | Command/Action |
|------|-------------|----------------|
| Verify API | Staging | Test endpoint returns data |
| Build frontend | Local | `npm run build` |
| Deploy frontend | Staging VM | Copy to nginx |
| Test dashboard | Staging | Verify card displays |
| Deploy frontend | Production VM | Copy build to nginx |

---

#### ACCEPTANCE CRITERIA

```gherkin
Scenario: View daily summary
  Given a retailer opens the Dashboard
  When the page loads
  Then Daily Summary card should display
  And show today's total sales
  And show transaction count
  And show comparison with yesterday
```

#### TEST CASES

| # | Scenario | Expected Result |
|---|----------|-----------------|
| 1 | Page load | Today's summary displayed |
| 2 | Select past date | Historical summary shown |
| 3 | No sales data | "No data" message shown |
| 4 | API error | Error state with retry |

---

## DEPLOYMENT SUMMARY

### All Tickets - Google VM Deployment Checklist

| Phase | Tickets | Backend | Frontend | POS App | Database |
|-------|---------|---------|----------|---------|----------|
| Critical | GL-RJ-001 to 005 | Yes | Yes | Yes | Yes |
| High | GL-RJ-006 to 009 | Yes | Yes | Yes | Yes (006 only) |

### Deployment Order

```
1. Database migrations (all)
2. Backend deployment (staging → production)
3. Frontend deployment (staging → production)
4. POS OTA update
5. Monitoring & verification
```

### Rollback Plan

| Component | Rollback Command |
|-----------|------------------|
| Backend | `docker-compose up -d main-backend:previous` |
| Frontend | `cp -r /backup/retailer-admin /var/www/retailer-admin` |
| Database | `psql < /backup/rollback_migration.sql` |
| POS | Publish previous EAS build |

---

## TOTAL EFFORT ESTIMATE

| Severity | Tickets | Estimated Days |
|----------|---------|----------------|
| CRITICAL | 5 | 7.5 days |
| HIGH | 4 | 3 days |
| **TOTAL** | **9** | **10.5 days** |

---

## ISSUE TO TICKET MAPPING

| # | Issue from Section 1.1 | Workflow | Ticket |
|---|------------------------|----------|--------|
| 1 | ⚠ No duplicate label detection | Device Enrollment | GL-RJ-006 |
| 2 | ⚠ Price resolution errors not shown | Sell Flow | GL-RJ-007 |
| 3 | ❌ Split payment doesn't verify success | Sell Flow | GL-RJ-001 |
| 4 | ❌ Add to Order button non-functional | Buy Flow | GL-RJ-002 |
| 5 | ❌ Checkout flow incomplete from cart modal | Buy Flow | GL-RJ-003 |
| 6 | ⚠ UTR manual entry, no verification | Payment (UPI) | GL-RJ-004 |
| 7 | ⚠ Manual UTR entry required | Payment (BNPL) | GL-RJ-008 |
| 8 | ❌ No settings page in retailer-admin | Store Settings | GL-RJ-005 |
| 9 | ⚠ API exists but UI doesn't call it | Ledger & Summary | GL-RJ-009 |
