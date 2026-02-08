# ROLLBACK & INCIDENT PLAYBOOK

> GO-LIVE-001 — Production Readiness & Freeze Anchor
> Created: 2026-02-08
> Status: ACTIVE

---

## 1. INSTANT ROLLBACK (< 5 minutes)

### Method A: Cloud Run Traffic Shift (Preferred — Zero Downtime)

```bash
# Shift 100% traffic to previous revision (instant)
gcloud run services update-traffic supermandi-api-gateway \
  --to-revisions=PREVIOUS_REVISION=100 --region=asia-south1

# Repeat for each backend service if needed:
for svc in auth-service catalog-service inventory-service order-service \
  payment-service platform-service reorder-service supplier-service voice-service; do
  gcloud run services update-traffic "supermandi-${svc}" \
    --to-revisions=PREVIOUS=100 --region=asia-south1
done

# Frontend portals (only if frontend issue):
for svc in retailer-admin supplier-portal superadmin landing; do
  gcloud run services update-traffic "supermandi-${svc}" \
    --to-revisions=PREVIOUS=100 --region=asia-south1
done
```

### Method B: Redeploy Known-Good SHA

```bash
# Use the promote script with the rollback SHA
./scripts/promote-to-prod.sh <ROLLBACK_SHA> --confirm
```

### Method C: Emergency — Full Stack Revert

```bash
# 1. Revert all backend services
./scripts/deploy-cloud-run.sh --env production --sha <ROLLBACK_SHA> --confirm

# 2. Verify health
curl -sf https://supermandi.tech/api/v1/health
curl -sf https://supermandi.tech/api/v1/version
```

---

## 2. HEALTH CHECK COMMANDS

```bash
# All-in-one health sweep
curl -sf https://supermandi.tech/api/v1/health    # Gateway health
curl -sf https://supermandi.tech/api/v1/version   # SHA verification
curl -sI https://supermandi.tech/                 # Landing (200)
curl -sI https://supermandi.tech/retailer/        # Retailer (200)
curl -sI https://supermandi.tech/supplier/        # Supplier (200)
curl -sI https://supermandi.tech/admin/           # SuperAdmin (200)
```

**Expected /health response:**
```json
{"status":"ok","service":"api-gateway","gitSha":"<SHA>","startTime":"...","env":"production"}
```

**Expected /version response:**
```json
{"sha":"<SHA>","service":"main-backend","built":"..."}
```

---

## 3. INCIDENT DECISION TREE

```
INCIDENT DETECTED
│
├─ Is payment/money affected?
│  YES → ROLLBACK IMMEDIATELY (Method A) → Page operator
│  NO  ↓
│
├─ Is it a single portal?
│  YES → Rollback ONLY that portal's Cloud Run revision
│  NO  ↓
│
├─ Is it backend (5xx, timeouts)?
│  YES → Check Cloud Logging → Rollback backend services (Method A)
│  NO  ↓
│
├─ Is it database?
│  YES → Check Cloud SQL status → Check VPC connector → DO NOT rollback app
│  NO  ↓
│
└─ Is it Redis/cache?
   YES → Check Memorystore → App degrades gracefully → Monitor
   NO  → Investigate logs → Decide rollback based on severity
```

---

## 4. COMMON INCIDENT SCENARIOS

### 4a. Database Connection Failure
```
Symptom: 500 errors, "connection refused" in logs
Check:
  gcloud sql instances describe supermandi-db --format="value(state)"
  gcloud compute networks vpc-access connectors describe supermandi-vpc --region=asia-south1
Fix: Usually transient. Wait 60s. If persistent → check Cloud SQL instance status.
DO NOT: Modify DATABASE_URL in production without operator approval.
```

### 4b. Redis Connection Failure
```
Symptom: Slow responses, session issues, cache misses
Check:
  gcloud redis instances describe supermandi-redis --region=asia-south1
Fix: App should degrade gracefully (cache miss → DB fallback). Monitor.
Escalate if: Sessions break (users logged out).
```

### 4c. Migration Failure on Deploy
```
Symptom: New revision crashes on startup, old revision still serving
Check: Cloud Run logs for migration error
Fix: DO NOT retry. Rollback to previous revision (Method A).
Then: Create ticket, fix migration, re-tag, re-deploy through staging.
```

### 4d. Frontend Portal 404/Blank Page
```
Symptom: Portal loads but shows blank or 404
Check: Is the correct basePath set? (supplier=/supplier, admin=/admin)
Fix: Rollback that specific portal's Cloud Run revision.
```

### 4e. POS App Cannot Connect
```
Symptom: POS shows "offline" or "connection error"
Check:
  curl -sf https://supermandi.tech/api/v1/health
  curl -sf https://supermandi.tech/api/v1/pos/store-products/search -H "Authorization: Bearer ..."
Fix: If gateway healthy → POS network issue. If gateway down → Rollback backend.
```

---

## 5. POST-DEPLOY MONITORING TIMELINE

| Time | Action | Pass Criteria |
|------|--------|---------------|
| T+0 | Health check all endpoints | All return 200 |
| T+2 | Verify /version SHA matches | SHA = deployed SHA |
| T+5 | Check Cloud Logging for 5xx | Zero 5xx errors |
| T+5 | Browser test: login each portal | All logins succeed |
| T+10 | Check Cloud Run revision status | All revisions READY |
| T+10 | POS app connectivity test | POS connects, can search |
| T+15 | Final health check | All still 200 |
| T+15 | Check error rate in logs | < 0.1% error rate |

**If ANY check fails → ROLLBACK first, investigate second.**

---

## 6. ESCALATION CONTACTS

| Severity | Response | Who |
|----------|----------|-----|
| P0 (money/data loss) | Rollback immediately, page operator | Operator (primary) |
| P1 (portal down) | Rollback affected service within 5 min | Operator |
| P2 (degraded) | Monitor, create ticket | Next business day |

---

## 7. NEVER DO IN PRODUCTION

- Modify database directly (use migrations only)
- Hot-patch running containers
- Deploy from HEAD (only from immutable tags)
- Skip staging verification
- Change env vars without documentation
- Force-push to main
- Delete Cloud Run revisions (they are your rollback path)
