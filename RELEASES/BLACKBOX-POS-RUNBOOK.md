# BLACKBOX VERIFICATION RUNBOOK: POS SELL + BUY + REORDER + LEDGER + PAYMENTS
**Date:** 2026-02-08 | **For:** Operator manual testing | **Device:** POS tablet (Redmi) + PC (Chrome Incognito)

---

## PREREQUISITES

1. Local production Docker stack running (`docker-compose.local-prod.yml`)
2. Migration 108 applied (GRN tables)
3. POS app running via Expo Go on Redmi device
4. At least 1 enrolled store with device token
5. At least 1 verified supplier linked to the store
6. At least 5 approved products in store catalog
7. Chrome Incognito for Retailer Web + SuperAdmin portals

**Record before starting:**
- GIT_SHA: _______________
- RC_TAG: _______________
- Docker digest (backend): _______________

---

## JOURNEY 1: SELL FLOW (Full end-to-end)

### Step 1.1: Search for a product
| Action | Expected | If Failure |
|--------|----------|------------|
| Open POS app → SELL tab | Sell screen with search bar visible | Screenshot: app state + console logs |
| Type "cha" in search bar (min 2 chars) | Product list appears within 2s with matching products (Chai, Chawal, etc.) | Screenshot: empty state. Check: is store enrolled? Does store have products? |
| Type full product name | Exact match appears at top | Screenshot: search results. API log: `GET /pos/store-products/search?q=...` |
| Clear search, type barcode number | Product with that barcode appears | Screenshot. If not found: check store_product_barcodes table |

**Evidence to capture:** Screenshot of search results showing product name, price, stock qty.

---

### Step 1.2: Scan a barcode (HID scanner)
| Action | Expected | If Failure |
|--------|----------|------------|
| Focus on search bar | Cursor blinking in search field | N/A |
| Scan product barcode with HID scanner | Product auto-added to cart within 500ms. Toast: "Added [product name]" | Screenshot + console. Check: is HID buffer accumulating? Timing issues? |
| Scan same barcode again within 1s | Toast: "Already in cart" OR quantity increments to 2 | If duplicate added: capture duplicate guard timing |
| Scan unknown barcode | Toast: "Product not found" | Screenshot. Check: is barcode in store_product_barcodes? |
| Rapid-fire scan same barcode 10x in 2s | Storm detection kicks in: max 8 scans, then cooldown | If all 10 processed: capture storm detection log |

**Evidence to capture:** Screenshot of cart after HID scan, console log showing scan timing.

---

### Step 1.3: Build a cart
| Action | Expected | If Failure |
|--------|----------|------------|
| Tap product from search results | Added to cart, qty = 1 | Screenshot: cart state |
| Tap same product again | Qty increments to 2 | If new line created: P0-CART-001 bug |
| Tap pencil/edit on cart item | Edit modal opens: qty, price editable | Screenshot |
| Change qty to 5 | Cart updates, line total = price x 5 | Screenshot with totals |
| Change qty to 0 | Item removed from cart | Screenshot |
| Add 3 different products | 3 cart lines, correct subtotal | Screenshot of full cart |
| Apply 10% discount (if UI exists) | Discount line appears, total reduced by 10% | Screenshot |

**Evidence to capture:** Screenshot of cart with 3 items, discounts, totals visible.

---

### Step 1.4: Cash payment
| Action | Expected | If Failure |
|--------|----------|------------|
| Tap "Checkout" / "Pay" | Payment screen shows total, payment options | Screenshot |
| Select CASH | Cash payment selected | N/A |
| Tap "Confirm Payment" | Loading spinner → Success screen | If error: screenshot + API response. Check: is store ACTIVE? |
| Verify success screen | Shows: bill number, amount, "CASH" label | Screenshot |
| Check receipt | Print dialog appears with receipt content | Screenshot of receipt |

**API evidence:** Check backend log for `POST /pos/sales` (201) → `POST /pos/sales/:id/confirm` (200) → `POST /pos/payments/cash` (200)

---

### Step 1.5: UPI payment
| Action | Expected | If Failure |
|--------|----------|------------|
| Add items to cart again | Cart populated | N/A |
| Select UPI payment | QR code generated with amount | If no QR: check store.upi_vpa in DB |
| Verify QR data | Shows: VPA, amount in rupees, transaction ref | Screenshot of QR screen |
| (Simulate) Enter UTR manually | UTR format validated (12-22 alphanumeric) | Screenshot if rejected |
| Confirm payment | Success screen with UPI label | Screenshot |

**API evidence:** `POST /pos/payments/upi/generate` (200) → `GET /pos/payments/upi/:id/status` (polling) → manual confirm

---

### Step 1.6: DUE/Credit payment
| Action | Expected | If Failure |
|--------|----------|------------|
| Add items to cart | Cart populated | N/A |
| Select DUE payment | Due option available | If missing: check payment options |
| Confirm DUE | Success screen with "DUE" label | Screenshot |
| Check accounts_receivable | New AR record created with sale amount | SQL: `SELECT * FROM payments.accounts_receivable ORDER BY created_at DESC LIMIT 1` |

---

### Step 1.7: Verify stock decrement
| Action | Expected | If Failure |
|--------|----------|------------|
| Note stock qty before sale (from Step 1.1) | e.g., stock = 50 | Record value |
| After payment complete, search same product | Stock = 50 - qty_sold | If stock unchanged: check inventory ledger service |
| Check inventory ledger | New entry with `transaction_type='sale'`, `delta_qty=-N` | SQL: `SELECT * FROM inventory.inventory_ledger WHERE reference_id='<saleId>' ORDER BY created_at DESC` |
| Check stock_balances | `current_qty` matches expected | SQL: `SELECT current_qty FROM inventory.stock_balances WHERE store_id='<storeId>' AND product_id='<productId>'` |

**Evidence to capture:** SQL query results showing ledger entry + stock balance.

---

## JOURNEY 2: BUY/PURCHASE FLOW

### Step 2.1: Browse supplier catalog
| Action | Expected | If Failure |
|--------|----------|------------|
| Open POS app → BUY tab | Purchase screen loads | If empty: P0-BUY-001 (catalog not wired) — capture screenshot + log |
| See supplier products | List of products with supplier names, prices | If empty: check supplier linked to store, products approved |
| Search by product name | Filtered results | Screenshot |
| Scan barcode in purchase context | Supplier product resolved | If not found: barcode not in supplier_products |

**Note:** If BUY tab shows empty catalog, this is a known P0 blocker. Document and move to Step 2.3 (manual order).

---

### Step 2.2: Build purchase cart
| Action | Expected | If Failure |
|--------|----------|------------|
| Tap product → Add to cart | Added with supplier binding | If no supplier: check supplierProductId |
| Change quantity | MOQ enforced (qty >= MOQ) | If qty < MOQ accepted: capture |
| Add products from different suppliers | Cart groups by supplier | Screenshot of grouped cart |
| Tap "Place Order" | Confirmation screen with supplier breakdown | Screenshot |

---

### Step 2.3: Place purchase order
| Action | Expected | If Failure |
|--------|----------|------------|
| Confirm order | Order created, status = "submitted" | If error: capture API response |
| Check order in POS order list | Order appears with correct status | `GET /orders/stores/:storeId/orders` → find order |
| Check order detail | Line items match cart | Screenshot |

**DB evidence:** `SELECT id, order_number, status, total_amount FROM orders.purchase_orders ORDER BY created_at DESC LIMIT 1`

---

### Step 2.4: Supplier confirms order (via Supplier Portal or API)
| Action | Expected | If Failure |
|--------|----------|------------|
| As supplier: view order | Order visible in supplier portal | If not: check supplier_id matching |
| Supplier confirms order | Status → "confirmed" | API: `PATCH /supplier/orders/:id/status` body: `{status: "confirmed"}` |
| Supplier adds shipment | Status → "shipped", tracking info saved | API: `PATCH /supplier/orders/:id/shipment` |

---

### Step 2.5: GRN (Receive Goods)
| Action | Expected | If Failure |
|--------|----------|------------|
| In POS, open confirmed/shipped order | Order detail with line items | Screenshot |
| Tap "Receive Goods" | GRN form: items with qty fields | If button missing: check order status |
| Enter received quantities (full receive) | All items qty = ordered qty | N/A |
| Confirm receive | GRN saved, order status → "delivered" | If error: capture API response |
| Check stock after GRN | Stock increased by received qty | SQL: check inventory.stock_balances |
| Check inventory ledger | Entry with `transaction_type='purchase_received'` | SQL: `SELECT * FROM inventory.inventory_ledger WHERE reference_type='po' ORDER BY created_at DESC` |

**Evidence to capture:** SQL showing GRN ledger entry + updated stock balance.

---

### Step 2.6: Partial receive
| Action | Expected | If Failure |
|--------|----------|------------|
| Create new order, get it confirmed | Order in "confirmed" status | N/A |
| Receive only half the items | GRN saved, order status → "partial_received" | If status wrong: P0-BUY-005 |
| Receive remaining items | Order status → "delivered" | Screenshot + SQL |

---

## JOURNEY 3: REORDER FLOW

### Step 3.1: Configure reorder settings
| Action | Expected | If Failure |
|--------|----------|------------|
| Menu → Reorder Settings | Settings screen loads | If missing: check reorderEnabled flag |
| Toggle auto-reorder ON | Setting saved | API: `PATCH /reorder/stores/:storeId/reorder/settings` |
| Set require-approval = YES | Setting saved | N/A |

---

### Step 3.2: Set product reorder policies
| Action | Expected | If Failure |
|--------|----------|------------|
| Menu → Reorder Policies | Product list with policy fields | Screenshot |
| Set min threshold = 10, target = 50 for a product | Policy saved | API check |
| Reduce stock below 10 (via sell) | Pending reorder appears in Reorder tab | If not: check backend reorder calculation |

---

### Step 3.3: Approve pending reorders
| Action | Expected | If Failure |
|--------|----------|------------|
| Open Reorder tab | Pending reorders listed | Screenshot |
| Select reorders → Tap "Approve" | Confirmation dialog appears | If English in Hindi mode: P1-I18N-001 |
| Confirm approval | Draft POs created, navigate to Buy cart option | Screenshot |
| Check draft POs | POs mapped to correct suppliers with suggested quantities | SQL: `SELECT * FROM orders.purchase_orders WHERE order_type='reorder' ORDER BY created_at DESC` |

---

## JOURNEY 4: LEDGER + SYNC VERIFICATION

### Step 4.1: Verify sell ledger on Retailer Web
| Action | Expected | If Failure |
|--------|----------|------------|
| Open Retailer Web (Chrome Incognito) | Login → Dashboard | N/A |
| Navigate to Inventory / Stock Statement | Product list with stock quantities | Screenshot |
| Find product sold in Journey 1 | Stock = original - sold qty | If stale: check sync timing |
| Check ledger entries | Sale entry with correct delta, timestamp | Screenshot of ledger |

---

### Step 4.2: LWW conflict test
| Action | Expected | If Failure |
|--------|----------|------------|
| POS: note stock of product X (e.g., 50) | Stock = 50 | N/A |
| Dashboard: update stock to 40 | Stock updated to 40 | Retailer Web: edit product stock |
| POS: try to update stock to 45 (with stale timestamp) | Rejected with 409 "stale_write" | If accepted: LWW broken — capture API response |
| POS: refresh and update stock to 45 (fresh timestamp) | Accepted, stock = 45 | Screenshot |

---

### Step 4.3: Stock statement
| Action | Expected | If Failure |
|--------|----------|------------|
| POS: navigate to Stock Statement (Menu → Reports) | Statement loads with all products | Screenshot |
| Verify: SKU, barcode, qty, value present | All fields populated | If missing fields: capture |
| Verify store isolation | Only current store's products shown | If other store's products: CRITICAL |

---

## JOURNEY 5: BNPL VERIFICATION

### Step 5.1: View BNPL dues
| Action | Expected | If Failure |
|--------|----------|------------|
| Menu → BNPL Dues | Dues screen loads | If missing: check menu/feature flag |
| View active drawdowns | List with supplier names, amounts, due dates | Screenshot |
| View summary | Total outstanding vs credit limit | Screenshot |

### Step 5.2: Repay BNPL
| Action | Expected | If Failure |
|--------|----------|------------|
| Tap drawdown → Pay | Payment modal (UPI/CASH) | Screenshot |
| Select CASH | Mark as paid | If error: capture API |
| Verify drawdown status | Status updated to "repaid" | SQL: `SELECT * FROM payments.bnpl_drawdowns WHERE id='...'` |

---

## JOURNEY 6: i18n VERIFICATION

### Step 6.1: Language switch
| Action | Expected | If Failure |
|--------|----------|------------|
| Menu → Settings → Language → Hindi | All UI text switches to Hindi | Screenshot |
| Navigate: SELL → search → cart → payment | All labels in Hindi | If English found: note exact location |
| Navigate: BUY → catalog → cart | All labels in Hindi | If English found: note |
| Navigate: REORDER → pending → approve | Dialog text in Hindi | If English dialog: P1-I18N-001 |
| Switch back to English | All text reverts | Screenshot |

### Step 6.2: Currency formatting
| Action | Expected | If Failure |
|--------|----------|------------|
| In Hindi mode, check product prices | Format: ₹1,00,000 (Indian lakhs) | If ₹100,000 (US format): capture |
| Check cart totals | INR symbol + Indian grouping | Screenshot |

---

## JOURNEY 7: FAILURE INJECTION

### Step 7.1: Network errors
| Action | Expected | If Failure |
|--------|----------|------------|
| Turn off WiFi on POS device | Offline indicator appears | If no indicator: capture |
| Try to search products | Graceful fallback or cached results | If crash: screenshot + stack trace |
| Try to scan barcode | Local lookup or "offline" message | If crash: capture |
| Create a sale (offline mode) | Offline sale created with "OFF-" bill prefix | If error: capture |
| Turn WiFi back on | Sync indicator, pending sales synced | Check outbox count |

### Step 7.2: Auth errors (401)
| Action | Expected | If Failure |
|--------|----------|------------|
| Expire device token (via admin: deactivate device) | 401 on next API call | N/A |
| Try to create sale | Redirect to re-enrollment screen | If crash or silent fail: capture |

### Step 7.3: Duplicate scan guard
| Action | Expected | If Failure |
|--------|----------|------------|
| Scan same barcode 2x within 1s | Only 1 cart item added | If 2 items: capture timing |
| Rapid-fire 10 scans in 2s | Storm detection: max 8 processed | If all 10: capture |

### Step 7.4: Insufficient stock
| Action | Expected | If Failure |
|--------|----------|------------|
| Set product stock to 1 | Stock = 1 | Via POS or dashboard |
| Add 1 to cart | Qty = 1 | N/A |
| Try to add another | Stock limit message shown | If allowed: capture |
| Try to checkout with qty > stock | Error: insufficient stock | If succeeds: CRITICAL — capture |

### Step 7.5: Double payment prevention
| Action | Expected | If Failure |
|--------|----------|------------|
| Create sale, start cash payment | Payment processing | N/A |
| Tap confirm again (rapidly) | Second tap ignored (cart locked) | If double payment: CRITICAL — capture |

---

## FAILURE CAPTURE TEMPLATE

When any step fails:

```
FAILURE REPORT
==============
Journey: [1-7]
Step: [e.g., 1.4]
Severity: [P0/P1/P2]
Description: [What happened]
Expected: [What should have happened]
Actual: [What actually happened]

Evidence:
- Screenshot: [filename]
- API Response: [JSON or status code]
- Console Log: [relevant lines]
- DB Query: [SQL + result]

Reproducible: [Yes/No/Sometimes]
Device: [Redmi / PC / Both]
Language: [EN / HI]
Network: [Online / Offline]
```

---

## COMPLETION CHECKLIST

| Journey | Status | Evidence Captured |
|---------|--------|-------------------|
| 1. SELL (search) | [ ] PASS / [ ] FAIL | [ ] Screenshots [ ] API logs |
| 1. SELL (HID scan) | [ ] PASS / [ ] FAIL | [ ] Screenshots [ ] Console |
| 1. SELL (cart) | [ ] PASS / [ ] FAIL | [ ] Screenshots |
| 1. SELL (cash payment) | [ ] PASS / [ ] FAIL | [ ] Screenshots [ ] DB proof |
| 1. SELL (UPI payment) | [ ] PASS / [ ] FAIL | [ ] Screenshots [ ] DB proof |
| 1. SELL (DUE payment) | [ ] PASS / [ ] FAIL | [ ] Screenshots [ ] DB proof |
| 1. SELL (stock decrement) | [ ] PASS / [ ] FAIL | [ ] SQL results |
| 2. BUY (catalog) | [ ] PASS / [ ] FAIL / [ ] BLOCKED | [ ] Screenshots |
| 2. BUY (cart + order) | [ ] PASS / [ ] FAIL | [ ] Screenshots [ ] DB proof |
| 2. BUY (supplier confirm) | [ ] PASS / [ ] FAIL | [ ] API proof |
| 2. BUY (GRN full) | [ ] PASS / [ ] FAIL | [ ] Screenshots [ ] SQL |
| 2. BUY (GRN partial) | [ ] PASS / [ ] FAIL | [ ] Screenshots [ ] SQL |
| 3. REORDER (settings) | [ ] PASS / [ ] FAIL | [ ] Screenshots |
| 3. REORDER (approve) | [ ] PASS / [ ] FAIL | [ ] Screenshots [ ] SQL |
| 4. LEDGER (sell) | [ ] PASS / [ ] FAIL | [ ] SQL results |
| 4. LEDGER (GRN) | [ ] PASS / [ ] FAIL | [ ] SQL results |
| 4. SYNC (LWW) | [ ] PASS / [ ] FAIL | [ ] API response |
| 4. STOCK STATEMENT | [ ] PASS / [ ] FAIL | [ ] Screenshots |
| 5. BNPL | [ ] PASS / [ ] FAIL | [ ] Screenshots [ ] SQL |
| 6. i18n (Hindi) | [ ] PASS / [ ] FAIL | [ ] Screenshots |
| 6. i18n (currency) | [ ] PASS / [ ] FAIL | [ ] Screenshots |
| 7. FAILURE: network | [ ] PASS / [ ] FAIL | [ ] Screenshots |
| 7. FAILURE: auth 401 | [ ] PASS / [ ] FAIL | [ ] Screenshots |
| 7. FAILURE: duplicate scan | [ ] PASS / [ ] FAIL | [ ] Screenshots |
| 7. FAILURE: insufficient stock | [ ] PASS / [ ] FAIL | [ ] Screenshots |
| 7. FAILURE: double payment | [ ] PASS / [ ] FAIL | [ ] Screenshots |

**Sign-off:** _________________ Date: _________________
