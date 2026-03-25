#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0672 — Quick Re-Order from Last Week
# ────────────────────────────────────────────────────────────────
# Documents the feature design for one-tap reorder from recent
# purchase orders in the POS BUY flow.
#
# Usage:  bash scripts/docs/quick-reorder-feature.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'GUIDE'
================================================================
  QUICK RE-ORDER FROM LAST WEEK — POS Feature Design
================================================================

1. FEATURE OVERVIEW
-------------------

  Allow kirana store owners to quickly repeat a recent purchase
  order with one tap, reducing the time to restock commonly
  ordered items from suppliers.

  User story:
    "As a retailer, I want to repeat my last week's order so
    I can restock popular items without manually searching and
    adding each product again."

2. API ENDPOINT
---------------

  GET /api/v1/pos/purchase-orders/recent

  Query parameters:
    days=7          (default: 7, max: 30)
    supplier_id     (optional: filter by supplier)
    status=RECEIVED (only show completed POs)

  Response:
    {
      "orders": [
        {
          "po_id": "PO-20260315-001",
          "supplier_name": "Amul Distributors",
          "created_at": "2026-03-15T10:30:00Z",
          "total_items": 12,
          "total_amount": 15400,
          "items": [
            {
              "product_id": "SKU-001",
              "product_name": "Amul Butter 500g",
              "quantity_ordered": 24,
              "unit_price": 275,
              "current_stock": 8,
              "reorder_suggested": 16
            }
          ]
        }
      ]
    }

  Authorization: JWT with store_id derived from token
  Store isolation: WHERE store_id = $token.storeId

3. "REPEAT ORDER" BUTTON FLOW
------------------------------

  Step 1: User navigates to BUY tab → Recent Orders section
  Step 2: User sees list of last 7 days' purchase orders
  Step 3: User taps "Repeat Order" on a specific PO
  Step 4: System pre-fills BUY cart with same items/quantities

  Smart adjustments:
    a) Check current stock levels for each item
    b) Suggested quantity = original_qty - current_stock
       (never negative, minimum 0)
    c) Flag items that are now discontinued or unavailable
    d) Flag items with price changes since last order
    e) User can edit quantities before confirming

  Example:
    Original PO: Amul Butter 500g × 24
    Current stock: 8 units
    Suggested reorder: 16 units (24 - 8)

4. UI COMPONENTS
----------------

  Recent Orders List (BUY tab):
    - Card per PO: supplier name, date, item count, total
    - "Repeat Order" button (primary action)
    - "View Details" link (secondary)
    - Sort: most recent first

  Pre-filled Cart Review:
    - All items from original PO listed
    - Editable quantity field per item
    - "Adjusted" badge on items with stock-based suggestion
    - "Unavailable" badge on discontinued items (greyed out)
    - "Price Changed" badge with old → new price
    - "Confirm Order" button at bottom
    - Running total updates as quantities change

5. STOCK-LEVEL ADJUSTMENT LOGIC
---------------------------------

  function calculateReorderQty(originalQty, currentStock) {
    const suggested = originalQty - currentStock;
    return Math.max(0, suggested);
  }

  Edge cases:
    - currentStock >= originalQty → suggested = 0, show "Well stocked"
    - Product discontinued → show "Unavailable", exclude from cart
    - Supplier changed price → show warning, use new price
    - Product moved to different supplier → show warning

6. IMPLEMENTATION NOTES
-----------------------

  Current status: POST-LAUNCH UX ENHANCEMENT

  Priority: LOW — basic BUY flow works without this feature.
  Kirana stores typically have regular weekly orders from the
  same suppliers, making this a high-value convenience feature.

  Dependencies:
    - Purchase order history must be stored (already exists)
    - Current stock levels query (already exists via inventory)
    - Supplier product catalog (already exists via catalog-service)

  Estimated effort: 2-3 days (backend endpoint + POS UI)

================================================================
  END OF QUICK RE-ORDER FEATURE GUIDE
================================================================
GUIDE
