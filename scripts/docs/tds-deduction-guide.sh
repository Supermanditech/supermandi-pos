#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0666 — TDS Deduction on Supplier Payouts
# ────────────────────────────────────────────────────────────────
# Documents Section 194Q TDS requirements for B2B payments
# exceeding ₹50L annual threshold.
#
# Usage:  bash scripts/docs/tds-deduction-guide.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'GUIDE'
================================================================
  TDS DEDUCTION ON SUPPLIER PAYOUTS — SuperMandi B2B
================================================================

1. APPLICABLE SECTION
---------------------

  Section 194Q of the Income Tax Act, 1961

  - Applies to BUYERS whose total turnover exceeds ₹10 crore
    in the preceding financial year
  - TDS is deducted on purchase of goods from a resident seller
    when aggregate value exceeds ₹50 lakh in a financial year

2. TDS RATE
-----------

  Rate:  0.1% of the amount exceeding ₹50 lakh

  Example:
    Annual purchases from Supplier X = ₹75,00,000
    Threshold                        = ₹50,00,000
    Taxable amount                   = ₹25,00,000
    TDS @ 0.1%                       = ₹2,500

  If seller does not furnish PAN:
    Rate increases to 5% (Section 206AA)

3. WHEN TO DEDUCT
-----------------

  - TDS must be deducted at the TIME OF CREDIT or TIME OF
    PAYMENT to the supplier, whichever is earlier
  - Deduction applies per-supplier, per-financial-year
  - Track cumulative purchases per supplier across all stores

  SuperMandi Implementation:
    - supplier_payouts table tracks cumulative_annual_amount
    - When cumulative > 50,00,000 for a supplier, flag for TDS
    - TDS amount = 0.1% × (payout_amount) for subsequent payouts
    - Deducted amount recorded in tds_deductions table

4. CHALLAN FILING
-----------------

  Form 26Q — Quarterly TDS return for non-salary deductions

  Due dates:
    Q1 (Apr–Jun):  31 July
    Q2 (Jul–Sep):  31 October
    Q3 (Oct–Dec):  31 January
    Q4 (Jan–Mar):  31 May

  Deposit timeline:
    - Government deductors: same day
    - Other deductors: 7th of the following month
    - March deductions: 30th April

  Steps:
    1. Deduct TDS from supplier payout
    2. Deposit via Challan 281 on NSDL/TIN portal
    3. File Form 26Q quarterly
    4. Issue Form 16A to suppliers (certificate of TDS)

5. SUPERMANDI APPLICABILITY
---------------------------

  Current status: POST-LAUNCH FEATURE

  This applies only when:
    a) SuperMandi's annual turnover exceeds ₹10 crore, AND
    b) Annual purchases from any single supplier exceed ₹50 lakh

  For initial launch with kirana pilot stores, volumes are
  unlikely to trigger 194Q. Implementation is deferred until
  payout volume exceeds the threshold.

  When triggered, required changes:
    - Add tds_deductions table (supplier_id, fy, amount, challan_ref)
    - Add TDS calculation to payout-service
    - Add TDS certificate generation (Form 16A)
    - Dashboard for finance team to track TDS obligations
    - Integration with TIN-NSDL for e-filing

================================================================
  END OF TDS DEDUCTION GUIDE
================================================================
GUIDE
