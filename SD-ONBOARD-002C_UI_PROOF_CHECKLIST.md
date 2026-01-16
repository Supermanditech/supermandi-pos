# SD-ONBOARD-002C UI Proof Video Checklist

## Prerequisites
- [ ] Redmi phone with SuperMandi POS app installed
- [ ] iMin or Sunmi POS device with app installed
- [ ] VM backend running with SD-ONBOARD-002C deployed
- [ ] Device registered to DEMO001 store (store_id: `a0000000-0000-0000-0000-000000000001`)
- [ ] Network connectivity to VM (34.14.220.171)

## Test Data Available

**Seeded Barcodes (DEMO001 - should return FOUND):**
| Barcode | Product Name | Sell Price | Stock |
|---------|--------------|------------|-------|
| 8901003000001 | Parle-G Biscuits 110g | ₹10.50 | 49 |
| 8901003000002 | Tata Salt 600g | ₹27.00 | 26 |
| 8901003000010 | Dettol Soap 175g | ₹47.00 | 55 |

**Cross-Store Prefill Barcode (should return NEEDS_CREATE + other_store prefill):**
| Barcode | Product Name | Prefill Source |
|---------|--------------|----------------|
| 7777777777777 | Other Store Exclusive Item | other_store |

**Unknown Barcode (should return NEEDS_CREATE without prefill):**
| Barcode | Expected Result |
|---------|-----------------|
| 9999999999999 | NEEDS_CREATE, no prefill |

---

## SELL Flow Test Cases

### Test 1: Seeded Barcode → Immediate Cart Add
**Purpose:** Verify digitised inventory works in SELL flow

**Steps:**
1. [ ] Open SELL screen on device
2. [ ] Scan barcode `8901003000001` (Parle-G Biscuits)
3. [ ] **Expected:** Product added DIRECTLY to cart (no modal)
4. [ ] **Verify in cart:**
   - [ ] Name: "Parle-G Biscuits 110g"
   - [ ] Price: ₹10.50
   - [ ] Stock indicator shows qty available
5. [ ] Repeat with `8901003000010` (Dettol Soap)
6. [ ] **Expected:** Second product added to cart
7. [ ] Proceed to checkout - total should calculate correctly

**Pass Criteria:** Both products added without modal, prices and stock visible

---

### Test 2: Unknown Barcode → FAST_SELL Modal → Cart
**Purpose:** Verify unknown barcode opens modal for quick capture

**Steps:**
1. [ ] Open SELL screen
2. [ ] Scan barcode `9999999999999` (unknown)
3. [ ] **Expected:** AddStoreProductModal opens
4. [ ] **Verify modal shows:**
   - [ ] Barcode displayed: `9999999999999`
   - [ ] "Enter product details manually" hint (no prefill)
   - [ ] FAST_SELL tab selected by default
5. [ ] Enter details:
   - [ ] Name: "Test Product"
   - [ ] Sell Price: ₹25.00
   - [ ] Stock: 10
6. [ ] Tap "Save & Add to Cart"
7. [ ] **Expected:** Modal closes, product added to cart
8. [ ] **Verify in cart:**
   - [ ] Name: "Test Product"
   - [ ] Price: ₹25.00
   - [ ] Stock: 10

**Pass Criteria:** Modal opens, fields editable, product saved and added to cart

---

### Test 3: Prefill from Platform Catalog → Modal Pre-populated
**Purpose:** Verify prefill works from platform catalog

**Steps:**
1. [ ] Open SELL screen
2. [ ] Scan barcode `5555555555555` (platform catalog product)
3. [ ] **Expected:** AddStoreProductModal opens with prefilled data
4. [ ] **Verify modal shows:**
   - [ ] "Prefilled from SuperMandi catalog" hint
   - [ ] Name prefilled (from catalog)
   - [ ] Unit prefilled
   - [ ] Brand prefilled
   - [ ] Sell Price: EMPTY (retailer must enter)
5. [ ] Enter sell price: ₹125.00
6. [ ] Tap "Save & Add to Cart"
7. [ ] **Expected:** Product saved with catalog metadata + retailer price

**Pass Criteria:** Prefill data visible, only price needs entry

---

### Test 4: Cross-Store Prefill (SD-ONBOARD-002C specific)
**Purpose:** Verify cross-store prefill shows "other_store" source

**Steps:**
1. [ ] Open SELL screen
2. [ ] Scan barcode `7777777777777` (exists only in other store)
3. [ ] **Expected:** AddStoreProductModal opens
4. [ ] **Verify modal shows:**
   - [ ] "Prefilled from other store (no prices)" hint
   - [ ] Name prefilled: "Other Store Exclusive Item"
   - [ ] Brand prefilled: "OtherBrand"
   - [ ] Unit prefilled: "pcs"
   - [ ] Sell Price: EMPTY
   - [ ] MRP: EMPTY
5. [ ] Enter sell price: ₹80.00
6. [ ] Tap "Save & Add to Cart"
7. [ ] **Expected:** Product saved with other_store metadata

**Pass Criteria:** Cross-store prefill hint visible, metadata prefilled, no prices

---

### Test 5: Duplicate Barcode Scan Guard
**Purpose:** Verify HID continuous scan doesn't spam duplicate items

**Steps:**
1. [ ] Open SELL screen with empty cart
2. [ ] Scan barcode `8901003000001` (seeded product)
3. [ ] **Expected:** Product added to cart (qty: 1)
4. [ ] Immediately scan same barcode again (within 500ms)
5. [ ] **Expected:** Quantity increments to 2 (not duplicate line item)
6. [ ] While modal is open (scan unknown barcode first)
7. [ ] Scan same barcode again
8. [ ] **Expected:** Scan ignored while modal is open

**Pass Criteria:** No duplicate line items, quantity increments, scan disabled during modal

---

### Test 6: DIGITISATION Mode
**Purpose:** Verify full digitisation capture works

**Steps:**
1. [ ] Open SELL screen
2. [ ] Scan unknown barcode `8888888888888`
3. [ ] **Expected:** Modal opens in FAST_SELL tab
4. [ ] Switch to "Digitisation" tab
5. [ ] **Verify additional fields appear:**
   - [ ] Purchase Price (required)
   - [ ] MRP
   - [ ] Variant
   - [ ] Pack Size
   - [ ] Description
6. [ ] Fill all fields and save
7. [ ] **Expected:** Product created with full metadata

**Pass Criteria:** Digitisation tab shows extra fields, all fields saved

---

### Test 7: Stock Display in Cart
**Purpose:** Verify stock quantities visible in cart

**Steps:**
1. [ ] Add seeded products to cart (8901003000001, 8901003000010)
2. [ ] Expand cart view
3. [ ] **Verify for each item:**
   - [ ] Stock badge shows available quantity
   - [ ] Low stock warning if qty < threshold
4. [ ] Add quantity beyond available stock
5. [ ] **Expected:** Warning or prevention of over-sell

**Pass Criteria:** Stock visible, low stock warnings work

---

### Test 8: Checkout with Digitised Products
**Purpose:** Verify complete checkout flow with new products

**Steps:**
1. [ ] Add mix of seeded + newly created products to cart
2. [ ] Proceed to checkout
3. [ ] Select payment mode (Cash)
4. [ ] Complete sale
5. [ ] **Expected:** Bill generated with correct totals
6. [ ] **Verify backend:**
   - [ ] `sales` record created
   - [ ] `sale_items` has correct `store_product_id`
   - [ ] Stock decremented in `store_products.current_stock`

**Pass Criteria:** Sale completes, stock updated, bill correct

---

## Version Verification

Before starting tests, verify backend version:
```bash
ssh -i ~/.ssh/supermandi_vm_key claude@34.14.220.171 \
  "docker logs supermandi-enroll-service 2>&1 | grep 'running on port' | tail -1"
```
**Expected:** `Enroll service v6 (SD-ONBOARD-002C) running on port 3009`

---

## Recording Tips

1. Start recording BEFORE opening the app
2. Show device screen clearly
3. Pause briefly on each verification point
4. Narrate what you're testing
5. Show both success and edge cases
6. End with version banner verification

---

## Files Involved

**Frontend (React Native):**
- `src/screens/PosRootLayout.tsx` - Main SELL screen with modal integration
- `src/components/sell/AddStoreProductModal.tsx` - Product capture modal
- `src/services/scan/handleScan.ts` - Scan resolution and cart add logic
- `src/services/api/scanApi.ts` - API types including PrefillSource

**Backend (VM):**
- `/var/supermandi/scripts/enroll-service-v6.js` - Main service with scan/resolve
- `POST /scan/resolve` - Returns FOUND/NEEDS_CREATE with prefill
- `POST /store-products` - Creates new store product

**Repo Source:**
- `scripts/enroll-service-v6.js` - Durable source (deploy from repo)
- `scripts/deploy-enroll-v6.sh` - Deployment script
