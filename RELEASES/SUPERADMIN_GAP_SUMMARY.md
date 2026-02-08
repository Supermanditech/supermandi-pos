# SUPERADMIN GAP SUMMARY

> Date: 2026-02-08
> Source: SUPERADMIN_CURRENT_STATE_AUDIT.md (94 actions audited, 30 gaps + 16 partial)
> Classification: P0 = go-live blocker, P1 = operational risk, P2 = efficiency/later

---

## P0 — GO-LIVE BLOCKERS (Must fix before staging/production)

These gaps mean Superadmin CANNOT stop or fix a problem at a live store.

| # | Gap | Affected App | Why It's P0 |
|---|-----|-------------|-------------|
| **G-01** | **No store suspension** (only DELETE exists, no SUSPEND→REACTIVATE) | SA/POS/Retailer | A fraudulent or non-compliant store cannot be temporarily halted. DELETE is permanent — no recovery path. |
| **G-02** | **No discount limits** (POS can apply 0-100% discount on any item/cart) | POS | A single cashier can zero out revenue for an entire shift. No cap, no approval, no alert. Financial loss is immediate and invisible. |
| **G-03** | **No product price bounds** (no min/max price validation anywhere) | POS/Retailer | Product can be sold at ₹0 or ₹999999. No guardrails on pricing. Margin destruction is undetectable by SA. |
| **G-04** | **No stock-in supplier verification** (POS records purchases from unverified walk-in suppliers) | POS | Fake purchase entries can inflate inventory and hide theft. No GSTIN, no supplier identity, no price validation. |
| **G-05** | **No emergency feature kill switch** (cannot instantly disable a feature across all stores) | SA | If a feature (e.g., voice, BNPL, buy) has a critical bug in production, SA cannot disable it system-wide. Must wait for app update. |
| **G-06** | **No refund/reversal capability** (no refund API exists in entire system) | SA/POS | Customer refunds are impossible. Incorrect sales cannot be reversed. Only workaround: new negative sale (which doesn't exist either). |
| **G-07** | **No maintenance mode** (cannot put system in maintenance state) | SA | During emergencies (DB migration, security incident), cannot gracefully disable access. Must rely on infrastructure-level shutdown. |

**P0 count: 7 gaps**

---

## P1 — OPERATIONAL RISK (Acceptable short-term with monitoring)

These gaps create risk at scale. Workarounds exist but are manual/fragile.

| # | Gap | Affected App | Why It's P1 | Workaround |
|---|-----|-------------|-------------|------------|
| **G-08** | **No POS staff identity/RBAC** (all actions attributed to device, not person) | POS | Cannot investigate fraud per-employee. At 10K stores with 3+ staff each, attribution is impossible. | Manual store-level supervision |
| **G-09** | **No staff-level audit trail** | POS | Related to G-08. Even if staff ID existed, events don't log "who". | Device-level logs only |
| **G-10** | **No purchase order spending limits** (POS can order unlimited from any supplier) | POS | Rogue store can place orders without budget. No daily/weekly/monthly cap. | Backend order reconciliation |
| **G-11** | **No customer due limits** (unlimited credit sales per customer/store) | POS | Dues can accumulate without bound. Store can extend unlimited credit. No aging alerts. | Analytics dashboard (manual review) |
| **G-12** | **No GRN quantity validation** (can receive MORE than ordered) | POS | Receiving 100 units on a 10-unit order goes undetected. Inflates inventory. | Manual audit |
| **G-13** | **No supplier suspension** (cannot suspend an already-active supplier) | SA | Can only reject pending suppliers. An active supplier caught in fraud cannot be frozen — must be manually re-set. | Manual DB intervention |
| **G-14** | **No payment method control per store** (cannot disable cash/UPI/due per store) | SA | Cannot enforce UPI-only for compliance, or disable dues for risky stores. | Manual instruction to store |
| **G-15** | **No per-store feature flags** (cannot enable/disable features per store) | SA | Feature flags are global. Cannot pilot features to specific stores, or disable for problematic ones. | scan_lookup_v2_enabled is per-store, but it's the only one |
| **G-16** | **No supplier bank detail re-verification** (supplier changes bank details without SA review) | Supplier | Supplier can redirect payouts to new bank account without SA approval. | Manual payout review |
| **G-17** | **No real-time store health dashboard** (no per-store online/offline/error indicator) | SA | SA cannot see which stores are offline, erroring, or have stale data. | Check devices page manually |
| **G-18** | **No anomaly detection/alerting** (no alerts for unusual activity) | SA | Sudden revenue drops, mass cancellations, unusual discounts go unnoticed until analytics review. | Manual analytics review |
| **G-19** | **No POS manual stock adjustment logging** (direct stock changes with no audit event) | POS | Inventory can be adjusted up/down with no record. Enables shrinkage cover-up. | Compare purchase vs sales vs stock |
| **G-20** | **Offline sales synced without re-validation** | POS | Sales created offline are accepted on sync without backend re-checking prices/discounts. | Backend trust model |
| **G-21** | **No device token revocation UI** (token_revoked_at exists in DB but no SA UI) | SA | Must directly modify DB to revoke a device token. No self-service for SA. | Block device (active=false) instead |
| **G-22** | **Store-level settings not visible to SA** (receipt footer, tax rate, operating hours) | Retailer/SA | SA cannot audit what settings a store has configured. | Ask retailer directly |
| **G-23** | **No reorder policy supervision** (POS changes min/max/supplier without approval) | POS | Reorder policies control automated purchasing. Changes are unsupervised. | Manual review |

**P1 count: 16 gaps**

---

## P2 — EFFICIENCY / LATER (Post go-live improvements)

These gaps reduce operational efficiency but don't create immediate risk.

| # | Gap | Affected App | Why It's P2 |
|---|-----|-------------|-------------|
| **G-24** | **No forced device re-enrollment** (must block + re-issue code) | SA | Inconvenient but functional. Block device, issue new code. |
| **G-25** | **No remote config push to POS** (must wait for next sync) | SA | POS picks up changes on next health check (~15 min). Acceptable latency. |
| **G-26** | **No minimum app version enforcement** | SA | Cannot force POS update. Must rely on app store distribution. |
| **G-27** | **No compliance status aggregation** (which stores have expired KYC) | SA | Manual document review works. Aggregation is efficiency improvement. |
| **G-28** | **No force sync trigger** (cannot force POS to sync) | SA | POS syncs automatically on connectivity. Manual trigger is nice-to-have. |
| **G-29** | **No product category manual override in SA** | SA | CAT-AUTO-001 handles auto-assignment. Manual override is edge case. |
| **G-30** | **No BNPL limit adjustment UI per store** | SA | Backend sets limits. UI convenience for adjustment. |
| **G-31** | **No retailer bulk import approval** (500 products with no SA review) | Retailer | Catalog pollution risk is low if store is already verified. |
| **G-32** | **No device hardware whitelist** (any HID device accepted) | POS | Scanner works by protocol, not identity. Serial validation adds friction. |
| **G-33** | **No force password reset for retailer users** | SA | Exists for suppliers. Adding for retailers is symmetric. |
| **G-34** | **No rate limit persistence** (in-memory, lost on restart) | Backend | Acceptable for initial deployment. Redis-backed rate limits for scale. |

**P2 count: 11 gaps**

---

## SUMMARY

| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | **7** | Go-live blockers — SA cannot stop/fix critical problems |
| **P1** | **16** | Operational risk — workarounds exist but fragile at scale |
| **P2** | **11** | Efficiency — post go-live improvements |
| **Total** | **34** | |

---

## RISK HEAT MAP

```
                        LOW FREQUENCY          HIGH FREQUENCY
                    ┌─────────────────────┬─────────────────────┐
  HIGH IMPACT       │  G-06 Refund        │  G-02 Discounts     │
  (financial loss)  │  G-07 Maintenance   │  G-03 Price bounds  │
                    │  G-13 Supplier susp │  G-04 Stock-in      │
                    │                     │  G-11 Due limits    │
                    ├─────────────────────┼─────────────────────┤
  MED IMPACT        │  G-05 Kill switch   │  G-08 Staff RBAC    │
  (operational)     │  G-16 Bank re-verif │  G-10 Spending caps  │
                    │  G-14 Payment ctrl  │  G-12 GRN quantity  │
                    │                     │  G-19 Stock adjust  │
                    ├─────────────────────┼─────────────────────┤
  LOW IMPACT        │  G-24 Re-enroll     │  G-15 Feature flags │
  (convenience)     │  G-26 App version   │  G-17 Health dash   │
                    │  G-32 HW whitelist  │  G-22 Settings view │
                    └─────────────────────┴─────────────────────┘
```

**See SUPERADMIN_IMPLEMENTATION_TICKETS.md for atomic tickets addressing each gap.**
