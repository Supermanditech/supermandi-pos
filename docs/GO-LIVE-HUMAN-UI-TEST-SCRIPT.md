# GO-LIVE HUMAN UI TEST SCRIPT

**Date:** 2026-01-28
**Pre-requisite:** Claude API/DB tests passed 31/31
**Status:** AWAITING HUMAN UI VALIDATION

---

## TEST URLS

| App | URL | Purpose |
|-----|-----|---------|
| Supplier Portal | http://34.14.220.171:3001/login | Supplier product creation |
| SuperAdmin | http://34.14.220.171:8080 | Product approval |
| Retailer Admin | http://34.14.220.171:8081 | Catalog management |
| POS Backend | http://34.14.220.171:3000 | API Gateway |

---

## TEST FLOW (EXECUTE IN ORDER)

### 1. SUPPLIER PORTAL TEST

**URL:** http://34.14.220.171:3001/login

| Step | Action | Expected Result | Evidence to Collect |
|------|--------|-----------------|---------------------|
| 1.1 | Open login page | Page loads without errors | Screenshot of login page |
| 1.2 | Login with supplier credentials | Redirects to dashboard | Screenshot of dashboard |
| 1.3 | Click "Add Product" or equivalent | Product form opens | Screenshot of form |
| 1.4 | Fill product details: | Form accepts input | - |
| | - Name: `GL-TEST-PRODUCT-[TIMESTAMP]` | | |
| | - Barcode: `1234567890123` (or unique) | | |
| | - MRP: 100.00 | | |
| | - Purchase Price: 80.00 | | |
| 1.5 | Submit product | Success message shown | Screenshot of success |
| 1.6 | Check product list | Status = **"Pending"** | Screenshot showing pending status |

**Record the barcode used:** `__________________`

---

### 2. SUPERADMIN TEST

**URL:** http://34.14.220.171:8080

| Step | Action | Expected Result | Evidence to Collect |
|------|--------|-----------------|---------------------|
| 2.1 | Login as SuperAdmin | Dashboard loads | Screenshot |
| 2.2 | Navigate to "Pending Products" | List of pending products shown | Screenshot |
| 2.3 | Find the product created in Step 1 | Product visible with name/barcode | Screenshot showing product |
| 2.4 | Click "Approve" | Approval succeeds | Screenshot |
| 2.5 | Verify status change | Status = **"Approved"** | Screenshot |
| 2.6 | Verify timestamp | Approval timestamp displayed | Screenshot showing timestamp |

---

### 3. RETAILER ADMIN TEST

**URL:** http://34.14.220.171:8081

| Step | Action | Expected Result | Evidence to Collect |
|------|--------|-----------------|---------------------|
| 3.1 | Login as Retailer | Dashboard loads | Screenshot |
| 3.2 | Navigate to "Supplier Catalog" | Catalog page opens | Screenshot |
| 3.3 | Search/find approved product | Product from Step 2 visible | Screenshot |
| 3.4 | Click "Add to My Catalog" | Product added successfully | Screenshot of success |
| 3.5 | Navigate to "My Catalog" | Product appears in store catalog | Screenshot |
| 3.6 | Verify `inStoreCatalog = true` | Product marked as in-store | Screenshot showing status |

---

### 4. POS MOBILE APP TEST (CRITICAL - GL-POS-002)

**Device:** Physical POS device or emulator connected to VM backend

| Step | Action | Expected Result | Evidence to Collect |
|------|--------|-----------------|---------------------|
| 4.1 | Open POS app | App loads, settings sync | Screenshot |
| 4.2 | Go to SELL screen | Scanner ready | Screenshot |
| 4.3 | Scan barcode from Step 1 | **PRODUCT FOUND** | Screenshot/video of scan |
| 4.4 | Verify product name | Matches name from Step 1 | Screenshot |
| 4.5 | Verify price | Correct price displayed | Screenshot |
| 4.6 | Verify stock | Stock quantity shown | Screenshot |
| 4.7 | Add to cart | Item added | Screenshot |
| 4.8 | Complete sale (test mode OK) | Sale successful | Screenshot of receipt |

---

## EVIDENCE CHECKLIST

| Item | Collected? | File Name |
|------|------------|-----------|
| Supplier login screenshot | ☐ | |
| Supplier product created screenshot | ☐ | |
| Barcode value used | ☐ | Value: __________ |
| SuperAdmin pending list screenshot | ☐ | |
| SuperAdmin approval screenshot | ☐ | |
| Retailer catalog screenshot | ☐ | |
| Retailer add-to-catalog screenshot | ☐ | |
| POS barcode scan screenshot/video | ☐ | |
| POS product found screenshot | ☐ | |
| POS sale complete screenshot | ☐ | |
| Any error messages (exact text) | ☐ | |
| Test completion timestamp | ☐ | Time: __________ |

---

## PASS/FAIL CRITERIA

### PASS Conditions (ALL must be true):
- [ ] All 4 UI flows complete without errors
- [ ] No manual page refresh required
- [ ] No direct database edits used
- [ ] Product flows from Supplier → SuperAdmin → Retailer → POS
- [ ] POS barcode scan finds the product (GL-POS-002 verified)

### FAIL Conditions (ANY triggers FAIL):
- [ ] Any UI page fails to load
- [ ] Product not visible in pending queue
- [ ] Approval fails
- [ ] Product not found in Retailer Catalog
- [ ] **POS barcode scan fails to find product** (CRITICAL)
- [ ] Price or stock incorrect in POS

---

## TEST RESULT

**Tester Name:** _________________________
**Test Date/Time:** _________________________
**Barcode Used:** _________________________

| Flow | Result |
|------|--------|
| 1. Supplier Portal | ☐ PASS / ☐ FAIL |
| 2. SuperAdmin | ☐ PASS / ☐ FAIL |
| 3. Retailer Admin | ☐ PASS / ☐ FAIL |
| 4. POS Mobile | ☐ PASS / ☐ FAIL |

**FINAL VERDICT:**

☐ **GO-LIVE PASS** (All 4 flows passed)

☐ **GO-LIVE BLOCKED** (Failed step: _______________)

**Notes/Issues:**
```
[Record any issues, errors, or observations here]
```

---

## SIGN-OFF

| Role | Name | Signature | Date |
|------|------|-----------|------|
| Tester | | | |
| QA Lead | | | |
| Product Owner | | | |
