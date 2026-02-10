# RESUME ANCHOR

Date: 02/10/2026 21:00:00

## Current State

HEAD: bd90493 | Tag: sa-p0-006-2026-02-10_IST | Branch: main (clean)

### Merged SuperAdmin Tickets (8/33)
| # | Ticket | PR | Merge SHA |
|---|--------|----|-----------|
| 1 | SA-P0-005 — Feature kill switch | #9 | 0b8fac7 |
| 2 | SA-P0-006 — Refund & sale reversal | #11 | f2bfe25 |
| 3 | SA-P1-001 — Staff identity/RBAC | #5 | 9fcf73f |
| 4 | SA-P1-004 — GRN quantity validation | #6 | 6dd82d9 |
| 5 | SA-P1-005 — Supplier suspension | #7 | 477682d |
| 6 | SA-P1-006 — Payment method control | #8 | 861d009 |
| 7 | SA-P1-007 — Per-store feature flags | #9 | 0b8fac7 |
| 8 | SA-P1-008 — Bank detail re-verification | #10 | 8446cd4 |

### Phasing Decision (Operator, 2026-02-10)

**CRITICAL GO-LIVE — 17 tickets to implement:**
1. SA-P0-001 — Store suspension & reactivation
2. SA-P0-004 — Stock-in supplier info (optional)
3. SA-P0-007 — System maintenance mode
4. SA-P1-009 — Store health dashboard
5. SA-P1-012 — Offline sale re-validation
6. SA-P1-014 — Store settings visibility
7. SA-P1-015 — Reorder policy supervision
8. SA-P2-001 — Force device re-enrollment
9. SA-P2-002 — Remote config push notification
10. SA-P2-003 — Minimum app version enforcement
11. SA-P2-004 — Compliance status aggregation
12. SA-P2-005 — Force POS sync trigger
13. SA-P2-006 — Product category manual override
14. SA-P2-007 — BNPL limit adjustment UI
15. SA-P2-008 — Retailer bulk import notification
16. SA-P2-009 — Device hardware whitelist
17. SA-P2-010 — Retailer user force password reset

**DEFERRED — 8 tickets (post go-live):**
- SA-P0-002 — Discount limits & approval gate
- SA-P0-003 — Price bounds enforcement
- SA-P1-002 — Spending limits (Retailer Dashboard)
- SA-P1-003 — Due limits (Retailer Dashboard)
- SA-P1-010 — Anomaly detection & alerting
- SA-P1-011 — Stock adjustment audit logging (Retailer Dashboard)
- SA-P1-013 — Device token revocation UI
- SA-P2-011 — Persistent rate limiting

### Next Action
- Await operator instruction on which ticket to start
- Suggested order: SA-P0-001 → SA-P0-007 → SA-P0-004 (P0s first)
- Rule: One ticket per branch, one PR per ticket
