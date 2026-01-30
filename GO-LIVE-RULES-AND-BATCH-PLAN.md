# SuperMandi GO-LIVE Execution Plan
## 10,000 Stores Production Readiness

**Owner:** Claude
**Environment:** Google VM (prod-like)
**Rule:** Demo store = Live store (NO exceptions)

---

## 0) SSH / VM Access (KEEP HANDY)

```bash
# Primary SSH
ssh claude@34.14.220.171

# GCloud SSH
gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"

# Metadata IP (inside VM)
curl -s -H "Metadata-Flavor: Google" http://metadata.google.internal/computeMetadata/v1/instance/network-interfaces/0/access-configs/0/external-ip
```

---

## 1) Non-Negotiable GO-LIVE Rules

- NO "minor", NO "later", NO "future phase"
- EVERY issue is CRITICAL for go-live
- Ticket must be end-to-end: UI → API → DB → VM deploy → Real user test
- Assume 10,000 concurrent stores
- Assume zero manual ops steps
- Assume failures = business loss
- Do not close ticket until verified on VM in real flows

---

## 2) Ticket Format (MANDATORY)

Each ticket must include:
1. **Ticket ID:** GO-LIVE-###
2. **Issue summary** (1 line)
3. **Where it occurs:** App / Screen / Route / API / DB / VM service
4. **Why this blocks go-live** (1–3 bullets)
5. **Root cause** (what is missing/broken)
6. **Exact fix required:** UI / API / DB / Ledger / Deployment
7. **Acceptance criteria** (PASS/FAIL only)
8. **VM verification steps** (commands + expected output)
9. **Real user test steps** (role-based flows)

---

## 3) Batch Mapping (102 Tickets → 11 Batches)

### Batch 0: Baseline & Observability (8 tickets)
**Theme:** Health checks, logging, monitoring foundation

| Ticket | Summary |
|--------|---------|
| GO-LIVE-079 | No centralized logging - Docker logs only |
| GO-LIVE-080 | No APM/metrics monitoring |
| GO-LIVE-081 | Health checks don't verify database connectivity |
| GO-LIVE-008 | Health endpoint path inconsistency |
| GO-LIVE-055 | Inconsistent error response format (500 errors) |
| GO-LIVE-056 | No request timeout handling |
| GO-LIVE-091 | No database backup strategy |
| GO-LIVE-078 | Let's Encrypt certificate path hardcoded |

---

### Batch 1: Auth / Tokens / Store Isolation (12 tickets)
**Theme:** Security foundation - authentication, authorization, multi-tenant isolation

| Ticket | Summary |
|--------|---------|
| GO-LIVE-001 | No logout functionality in SuperAdmin |
| GO-LIVE-002 | Static admin token with no expiry/rotation |
| GO-LIVE-003 | No rate limiting on admin token attempts |
| GO-LIVE-045 | Firebase token verified client-side only |
| GO-LIVE-046 | Retailer-admin routes trust gateway header without validation |
| GO-LIVE-047 | Admin endpoints have no store ownership verification |
| GO-LIVE-048 | Supplier routes don't verify ownership |
| GO-LIVE-082 | No Row Level Security (RLS) policies |
| GO-LIVE-083 | Catalog endpoint may return cross-store products |
| GO-LIVE-084 | Supplier JWT tokens can't be revoked |
| GO-LIVE-085 | Password reset tokens stored in plaintext |
| GO-LIVE-086 | Weak password reset code (6-digit) |

---

### Batch 2: API Gateway & Security (10 tickets)
**Theme:** Gateway routing, CORS, rate limiting, validation

| Ticket | Summary |
|--------|---------|
| GO-LIVE-072 | Admin token hardcoded in .env in source control |
| GO-LIVE-073 | Wildcard CORS on API Gateway |
| GO-LIVE-074 | Firebase credentials in repository |
| GO-LIVE-075 | ALLOW_BYPASS_FOR_TESTING can default to true |
| GO-LIVE-052 | Device label check endpoint has no rate limiting |
| GO-LIVE-053 | Analytics endpoint has no rate limiting |
| GO-LIVE-054 | Supplier password change has no rate limiting |
| GO-LIVE-049 | CSV import has no file size limits |
| GO-LIVE-050 | Inconsistent max price limits across endpoints |
| GO-LIVE-051 | Email validation only checks for "@" |

---

### Batch 3: POS Scan & Product Resolution (8 tickets)
**Theme:** Barcode scanning, product lookup, cart operations

| Ticket | Summary |
|--------|---------|
| GO-LIVE-039 | Price not cached for offline-only scanned products |
| GO-LIVE-040 | No overall scan rate limiting |
| GO-LIVE-041 | Barcode format not validated |
| GO-LIVE-044 | No max cart item limit |
| GO-LIVE-043 | Stock not revalidated at payment time |
| GO-LIVE-042 | No stock reservation system - race condition |
| GO-LIVE-100 | Stock cache TTL 5 min with no manual refresh |
| GO-LIVE-094 | No stock balance recompute function |

---

### Batch 4: POS Sell Flow & Payments (9 tickets)
**Theme:** Payment processing, checkout, receipts

| Ticket | Summary |
|--------|---------|
| GO-LIVE-036 | No payment verification after network drop |
| GO-LIVE-037 | UPI confirmation lacks idempotency |
| GO-LIVE-038 | Split payment polling not exponential |
| GO-LIVE-032 | No max retry for failed sync events |
| GO-LIVE-033 | Offline inventory deduction not guaranteed |
| GO-LIVE-034 | Offline sales don't decrement stock cache |
| GO-LIVE-035 | No exponential backoff on sync retry |
| GO-LIVE-069 | Payment completion doesn't update sales.payment_status |
| GO-LIVE-070 | DUE payment creates no AR tracking |

---

### Batch 5: Inventory, Stock & Ledger (10 tickets)
**Theme:** Inventory management, stock movements, ledger consistency

| Ticket | Summary |
|--------|---------|
| GO-LIVE-065 | No sale-to-ledger reference link |
| GO-LIVE-066 | Cancelled sales don't reverse ledger entries |
| GO-LIVE-067 | sale_return ledger type never used |
| GO-LIVE-068 | No general ledger (GL) accounts |
| GO-LIVE-071 | No physical count mechanism |
| GO-LIVE-095 | No inventory valuation method (FIFO/LIFO) |
| GO-LIVE-022 | No manual stock adjustment feature |
| GO-LIVE-017 | Ledger pagination hardcoded to 100 rows |
| GO-LIVE-060 | sales.payment_status missing index |
| GO-LIVE-061 | stock_balances.current_qty missing index |

---

### Batch 6: Database Schema & Integrity (10 tickets)
**Theme:** Foreign keys, constraints, indexes, schema consistency

| Ticket | Summary |
|--------|---------|
| GO-LIVE-057 | inventory_ledger.store_id has no FK |
| GO-LIVE-058 | sales.store_id has no FK |
| GO-LIVE-059 | store_products.store_id no FK |
| GO-LIVE-062 | store_products.is_active missing index |
| GO-LIVE-063 | Duplicate tables: reorder_policies vs product_policies |
| GO-LIVE-064 | sales.id is VARCHAR but should be UUID |
| GO-LIVE-089 | Event outbox missing sequence_number |
| GO-LIVE-090 | Event inbox missing idempotency_key |
| GO-LIVE-093 | Large tables not partitioned |
| GO-LIVE-096 | No IP/session tracking in audit logs |

---

### Batch 7: Retailer Web Dashboard (10 tickets)
**Theme:** Retailer portal validation, forms, error handling

| Ticket | Summary |
|--------|---------|
| GO-LIVE-013 | Missing GSTIN/PAN/FSSAI validation |
| GO-LIVE-014 | UPI VPA regex too permissive |
| GO-LIVE-015 | No validation opening stock non-negative |
| GO-LIVE-016 | Receipt footer no max length |
| GO-LIVE-018 | CSV import shows count not row errors |
| GO-LIVE-019 | Category rename field name mismatch |
| GO-LIVE-020 | response.json() can throw on 500 |
| GO-LIVE-021 | No retry button on ledger load failure |
| GO-LIVE-087 | No RBAC - all users equal |
| GO-LIVE-088 | Permissions in JWT not enforced |

---

### Batch 8: Supplier Web Dashboard (9 tickets)
**Theme:** Supplier portal forms, validation, order management

| Ticket | Summary |
|--------|---------|
| GO-LIVE-023 | Floating point precision error in prices |
| GO-LIVE-024 | File size validation says 5MB but checks 10MB |
| GO-LIVE-025 | Email field editable but won't save |
| GO-LIVE-026 | Product resubmit missing fields |
| GO-LIVE-027 | Order item status API may not exist |
| GO-LIVE-028 | Status counts use inaccurate pagination fallback |
| GO-LIVE-029 | Shipment tracking missing date fields |
| GO-LIVE-030 | No order communication channel |
| GO-LIVE-031 | Cannot see which orders contributed to payout |

---

### Batch 9: SuperAdmin Portal (8 tickets)
**Theme:** Admin portal validation, audit, features

| Ticket | Summary |
|--------|---------|
| GO-LIVE-004 | Store name no min/max validation |
| GO-LIVE-005 | Email/phone validation missing regex |
| GO-LIVE-006 | Supplier rejection reason inconsistent |
| GO-LIVE-007 | Analytics date range no validation |
| GO-LIVE-009 | Supplier approval missing audit log |
| GO-LIVE-010 | Analytics data uses any type |
| GO-LIVE-011 | Audit logs UI missing |
| GO-LIVE-012 | QR code no regenerate button |

---

### Batch 10: Deployment & Infrastructure (8 tickets)
**Theme:** Docker, scaling, SSL, production hardening

| Ticket | Summary |
|--------|---------|
| GO-LIVE-076 | Database pool max=20 too low |
| GO-LIVE-077 | Single Redis instance - no HA |
| GO-LIVE-092 | No disaster recovery plan |
| GO-LIVE-097 | No GST input credit tracking |
| GO-LIVE-098 | No API response caching |
| GO-LIVE-099 | No service worker in web apps |
| GO-LIVE-102 | (Reserved for final issues) |
| FINAL | Go-live checklist completion |

---

## 4) Definition of DONE (Per Ticket)

A ticket is DONE only if:
- [ ] Code implemented + reviewed
- [ ] DB migrations applied safely (idempotent)
- [ ] Deployed to VM (prod-like)
- [ ] Verified via VM commands + logs
- [ ] Verified via REAL USER flows in all affected apps
- [ ] PASS/FAIL acceptance criteria is **PASS**

---

## 5) Deployment Playbook

### Pre-deploy checklist
```bash
# Check running containers
docker ps

# Capture baseline logs
docker logs --tail 50 supermandi-backend

# Verify health endpoints
curl -s http://localhost:3000/health
curl -s http://localhost:3010/health
```

### Deploy steps
```bash
# 1. SSH into VM
ssh claude@34.14.220.171

# 2. Navigate to project
cd /home/claude/supermandi-pos

# 3. Pull latest
git pull origin main

# 4. Build and restart
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d

# 5. Run migrations (if any)
docker exec supermandi-backend npm run migrate

# 6. Record deployed commit
git rev-parse HEAD
date
```

### Post-deploy verification
```bash
# Health checks
curl -s http://localhost:3000/health | jq
curl -s http://localhost:3010/health | jq

# Check for errors in logs
docker logs --tail 100 supermandi-backend 2>&1 | grep -i error

# Verify key routes
curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/v1/health
```

---

## 6) Real User Test Matrix

### After EACH Batch, test as real user:

#### SuperAdmin Web (https://supermandi.tech/admin/)
- [ ] Login with admin token
- [ ] Navigate all tabs
- [ ] Create/modify store (if batch touches it)
- [ ] Verify changes propagate to POS

#### Retailer Web (https://supermandi.tech/retailer/)
- [ ] Login with phone OTP
- [ ] View dashboard
- [ ] Test affected flows (inventory, products, settings)

#### Supplier Web (https://supermandi.tech/supplier/)
- [ ] Login with credentials
- [ ] Test product management
- [ ] Test order flows if touched

#### POS App
- [ ] Enroll device (if applicable)
- [ ] Scan barcode → resolve → add to cart
- [ ] Complete sell flow
- [ ] Verify ledger/stock correctness
- [ ] Test offline scenarios if touched

---

## 7) Batch Report Format

```markdown
## Batch [X] Report: [Theme]

### Tickets Completed
- GO-LIVE-XXX: [Summary] - PASS/FAIL
- GO-LIVE-XXX: [Summary] - PASS/FAIL

### Deployment Evidence
- Commit SHA: [hash]
- Deploy time: [timestamp]
- Migrations: [list or "none"]
- Containers restarted: [list]

### VM Verification
```
[paste command outputs]
```

### Real User Test Results
| App | Test | Result |
|-----|------|--------|
| SuperAdmin | Login | PASS/FAIL |
| Retailer | Dashboard | PASS/FAIL |
| Supplier | Products | PASS/FAIL |
| POS | Sell flow | PASS/FAIL |

### Regressions Found
- [None or list new tickets]

### Batch Status: PASS/FAIL
```

---

## 8) Execution Status

| Batch | Theme | Tickets | Status |
|-------|-------|---------|--------|
| 0 | Baseline & Observability | 8 | PENDING |
| 1 | Auth / Tokens / Store Isolation | 12 | PENDING |
| 2 | API Gateway & Security | 10 | PENDING |
| 3 | POS Scan & Product Resolution | 8 | PENDING |
| 4 | POS Sell Flow & Payments | 9 | PENDING |
| 5 | Inventory, Stock & Ledger | 10 | PENDING |
| 6 | Database Schema & Integrity | 10 | PENDING |
| 7 | Retailer Web Dashboard | 10 | PENDING |
| 8 | Supplier Web Dashboard | 9 | PENDING |
| 9 | SuperAdmin Portal | 8 | PENDING |
| 10 | Deployment & Infrastructure | 8 | PENDING |
| **TOTAL** | | **102** | |

---

## 9) Current Focus

**NOW:** Batch 0 - Baseline & Observability

Starting implementation immediately.
