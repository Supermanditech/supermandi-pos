#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0667 — GST TCS Applicability
# ────────────────────────────────────────────────────────────────
# Documents Section 52 GST TCS requirements for e-commerce
# operators and when SuperMandi qualifies.
#
# Usage:  bash scripts/docs/gst-tcs-guide.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'GUIDE'
================================================================
  GST TCS APPLICABILITY — SuperMandi E-Commerce Operator
================================================================

1. APPLICABLE SECTION
---------------------

  Section 52 of the CGST Act, 2017

  - Applies to "electronic commerce operators" who collect
    consideration on behalf of suppliers
  - TCS = Tax Collected at Source
  - Rate: 1% (0.5% CGST + 0.5% SGST, or 1% IGST for inter-state)

2. WHEN SUPERMANDI QUALIFIES AS E-COMMERCE OPERATOR
----------------------------------------------------

  SuperMandi qualifies as an e-commerce operator ONLY when
  operating under the SUPERMANDI_PRINCIPAL billing model:

    SUPERMANDI_PRINCIPAL model:
      - SuperMandi takes title of goods from suppliers
      - Resells to retailers (kirana stores) on its own account
      - SuperMandi is the seller of record
      - TCS obligation APPLIES

    MARKETPLACE model (current default):
      - Suppliers sell directly to retailers via platform
      - SuperMandi is intermediary (facilitates, does not own goods)
      - SuperMandi collects payment on behalf of suppliers
      - TCS obligation APPLIES (Section 52 covers this)

    DIRECT_SUPPLY model:
      - Retailers buy directly from suppliers
      - SuperMandi only provides software/logistics
      - No TCS obligation

  Summary: TCS applies when SuperMandi either takes title of
  goods OR collects consideration on behalf of suppliers.

3. TCS RATE AND CALCULATION
---------------------------

  Rate: 1% of NET VALUE of taxable supplies

  Net value = Gross value of supplies
             - Returns (within the return window)
             - GST charged by supplier

  Example:
    Supplier X ships goods worth ₹1,00,000 (incl. GST ₹15,254)
    Net taxable value = ₹84,746
    TCS @ 1% = ₹847 (₹424 CGST + ₹423 SGST)

  SuperMandi deducts ₹847 from supplier payout and deposits
  with government.

4. GSTR-8 FILING
-----------------

  E-commerce operators must file GSTR-8 MONTHLY.

  Due date: 10th of the following month

  Contents of GSTR-8:
    a) Details of supplies made through the e-commerce platform
    b) Amount of TCS collected
    c) TCS deposited with government
    d) Any amendments to previously filed returns

  Steps:
    1. Calculate TCS on each supplier's monthly net supplies
    2. Deduct TCS from supplier payouts
    3. Deposit TCS via GST portal (PMT-06 challan)
    4. File GSTR-8 by 10th of next month
    5. Supplier claims TCS credit in their GSTR-2A

5. IMPLEMENTATION NOTES
-----------------------

  Current status: POST-LAUNCH FEATURE

  This applies only when SuperMandi operates as an e-commerce
  operator (SUPERMANDI_PRINCIPAL or MARKETPLACE billing model).

  For initial kirana pilot with DIRECT_SUPPLY model, TCS does
  not apply. Implementation is deferred until billing model
  changes.

  When triggered, required changes:
    - Add tcs_collections table (supplier_id, month, amount, gstr8_ref)
    - Add TCS calculation to settlement/payout service
    - Auto-generate GSTR-8 data export (JSON for GST portal upload)
    - Supplier dashboard showing TCS deducted + credit available
    - Monthly reconciliation report for finance team
    - Integration with GST portal API (when available)

================================================================
  END OF GST TCS GUIDE
================================================================
GUIDE
