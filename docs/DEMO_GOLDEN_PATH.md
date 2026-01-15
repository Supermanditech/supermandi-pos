# Demo Store Golden Path QA Checklist

> Generated: 2026-01-15
> End-to-end verification for demo store functionality

---

## Prerequisites

Before starting the golden path test:

1. **Device enrolled** to a demo store (code starting with DM, QA, TS, ST, or containing demo/test/qa-/staging)
2. **Demo data seeded** via UI Showcase > "Seed Demo Data" button
3. **Network connected** to backend services

---

## Phase 1: Enrollment & Status

| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 1.1 | Launch app | Splash screen appears | [ ] |
| 1.2 | If not enrolled, enter demo code (e.g., SM-DEMO01) | Enrollment succeeds | [ ] |
| 1.3 | Check status bar | Shows store name/code (not raw UUID) | [ ] |
| 1.4 | Re-launch app | Auto-login to same store | [ ] |
| 1.5 | Note: Re-enrollment with same code | Should work (multi-use for demo) | [ ] |

---

## Phase 2: SELL Tab (Core Flow)

| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 2.1 | Tap SELL tab | Scan/search screen appears | [ ] |
| 2.2 | Search for "Tata Salt" | Demo product appears in list | [ ] |
| 2.3 | Tap product | Product detail modal opens | [ ] |
| 2.4 | Tap "Add to Cart" | Product added, cart icon shows count | [ ] |
| 2.5 | Add 2 more products | Cart count increases | [ ] |
| 2.6 | Tap cart icon | Cart sheet opens with all items | [ ] |
| 2.7 | Tap "Checkout" | Payment screen opens | [ ] |
| 2.8 | Select CASH payment | Payment method selected | [ ] |
| 2.9 | Enter amount and complete | Success screen with bill number | [ ] |
| 2.10 | Tap "Print" or "Done" | Returns to SELL screen | [ ] |

---

## Phase 3: BUY Tab (Supplier Ordering)

| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 3.1 | Tap BUY tab | Supplier catalog appears | [ ] |
| 3.2 | See supplier list | 3 demo suppliers visible | [ ] |
| 3.3 | Tap a supplier | Supplier products list opens | [ ] |
| 3.4 | See product catalog | Products with prices visible | [ ] |
| 3.5 | Add product to purchase cart | Cart icon shows count | [ ] |
| 3.6 | Tap cart icon | Purchase cart modal opens | [ ] |
| 3.7 | Review grouped items by supplier | Items grouped correctly | [ ] |
| 3.8 | Tap "Place Order" | Order created successfully | [ ] |

---

## Phase 4: REORDER Tab (Auto-Reorder)

| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 4.1 | Tap REORDER tab | Reorder suggestions appear | [ ] |
| 4.2 | See suggestion cards | Shows products below reorder level | [ ] |
| 4.3 | Tap suggestion card | Edit reorder modal opens | [ ] |
| 4.4 | Modify quantity | Quantity updates | [ ] |
| 4.5 | Tap "Dismiss" on a card | Dismiss reason modal appears | [ ] |
| 4.6 | Select reason and confirm | Suggestion removed from list | [ ] |

---

## Phase 5: MENU Tab (Navigation)

| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 5.1 | Tap MENU tab | Menu screen with all links | [ ] |

### Sales Section
| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 5.2 | Tap "Bills / Sales History" | Sales history list appears | [ ] |
| 5.3 | Verify list has items | Demo bills visible (10 records) | [ ] |
| 5.4 | Tap a bill | Bill detail screen opens | [ ] |
| 5.5 | Verify bill items | Line items with prices visible | [ ] |
| 5.6 | Back to Menu | Returns to menu | [ ] |
| 5.7 | Tap "Barcode Sheets" | Barcode sheet generator opens | [ ] |
| 5.8 | Verify products listed | Demo products with barcodes visible | [ ] |

### Purchasing Section
| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 5.9 | Tap "Purchase Orders" | Order history list appears | [ ] |
| 5.10 | Verify list has items | Demo orders visible (5 records) | [ ] |
| 5.11 | Tap an order | Order detail screen opens | [ ] |
| 5.12 | Verify order items | Line items with quantities visible | [ ] |
| 5.13 | Back to Menu | Returns to menu | [ ] |
| 5.14 | Tap "Inward / Stock Receipt" | Inward screen opens | [ ] |
| 5.15 | Verify manual entry form | Form fields visible | [ ] |
| 5.16 | Tap "Purchase History" | Purchase history list appears | [ ] |
| 5.17 | Verify list has items | GRN/inward records visible | [ ] |

### Reports Section
| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 5.18 | Tap "Sales Statement" | Sales statement screen opens | [ ] |
| 5.19 | Verify data loads | Summary with totals visible | [ ] |
| 5.20 | Tap "Stock Statement" | Stock statement screen opens | [ ] |
| 5.21 | Verify data loads | Stock levels by product visible | [ ] |

### Reorder Section
| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 5.22 | Tap "Auto-Reorder Settings" | Reorder settings screen opens | [ ] |
| 5.23 | Verify config options | Enable/disable toggles visible | [ ] |
| 5.24 | Tap "Reorder Policies" | Policies list appears | [ ] |
| 5.25 | Verify list has items | Demo policies visible (5 records) | [ ] |
| 5.26 | Tap a policy row | Edit policy modal opens | [ ] |
| 5.27 | Modify min stock level | Value updates | [ ] |

### Settings Section
| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 5.28 | Tap "Switch Store" | Enrollment screen appears | [ ] |
| 5.29 | Verify can enter new code | Code input field active | [ ] |
| 5.30 | Back to Menu | Returns to menu | [ ] |
| 5.31 | Tap "Language Toggle" | Language changes | [ ] |

---

## Phase 6: Special Screens

| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 6.1 | From OrderDetail, tap "Receive Stock" | GRN screen opens | [ ] |
| 6.2 | Verify order items loaded | Items from PO visible | [ ] |
| 6.3 | Enter received quantities | Quantities update | [ ] |
| 6.4 | Complete GRN | Stock updated, returns to order detail | [ ] |

---

## Phase 7: QA Tools (Dev Only)

| Step | Action | Expected Result | Pass |
|------|--------|-----------------|------|
| 7.1 | From Menu, tap "UI Showcase" | QA screen opens | [ ] |
| 7.2 | Tap "Seed Demo Data" | Seed runs, shows counts | [ ] |
| 7.3 | Tap any stack screen | Navigation works | [ ] |
| 7.4 | Tap ProductDetailModal | Modal opens with mock data | [ ] |
| 7.5 | Tap PurchaseCartModal | Modal opens | [ ] |

---

## Summary Scorecard

| Phase | Tests | Passed | Status |
|-------|-------|--------|--------|
| 1. Enrollment | 5 | __ / 5 | __ |
| 2. SELL | 10 | __ / 10 | __ |
| 3. BUY | 8 | __ / 8 | __ |
| 4. REORDER | 6 | __ / 6 | __ |
| 5. MENU | 31 | __ / 31 | __ |
| 6. Special | 4 | __ / 4 | __ |
| 7. QA Tools | 5 | __ / 5 | __ |
| **TOTAL** | **69** | __ / 69 | __ |

---

## Known Issues / Notes

1. **BillDetail requires saleId**: Navigation from SalesHistory passes saleId correctly
2. **OrderDetail requires orderId**: Navigation from OrderHistory passes orderId correctly
3. **GRN requires orderId**: Only accessible from OrderDetail with valid order
4. **Demo codes bypass expiry**: SM-DEMO* codes work even if expired

---

## Test Environment

| Property | Value |
|----------|-------|
| Tester | ________________ |
| Date | ________________ |
| App Version | ________________ |
| Device | ________________ |
| Backend URL | ________________ |
| Demo Store Code | ________________ |

---

## Sign-Off

- [ ] All critical paths pass
- [ ] No blocking bugs found
- [ ] Demo store ready for customer presentation

Approved by: ________________ Date: ________________
