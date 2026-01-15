# VM Deployment Playbook: Demo Multi-Use Enrollment + Go-Live

> Generated: 2026-01-15
> VM-001: Copy/paste runnable deployment checklist
> VM IP: `34.14.220.171`

---

## QUICK FIX: One-Liner to Fix SM-DEMO01/02 (Run on VM)

```bash
# SSH into VM first, then run:
docker exec -i postgres psql -U postgres -d supermandi -c "
  UPDATE pos_device_enrollments
  SET max_uses=9999, used_device_id=NULL, revoked_at=NULL,
      expires_at=GREATEST(expires_at, NOW() + INTERVAL '1 year')
  WHERE code IN ('SM-DEMO01','SM-DEMO02');
"

# Restart services
docker-compose restart backend-api
docker-compose restart gateway
```

### Verify Fix Worked

```bash
# Check DB values (must show max_uses=9999, used_device_id=NULL)
docker exec -i postgres psql -U postgres -d supermandi -c "
  SELECT code, max_uses, uses_count, used_device_id
  FROM pos_device_enrollments
  WHERE code IN ('SM-DEMO01','SM-DEMO02');
"

# Test enrollment (both must return HTTP 200)
curl -s -w "\nHTTP: %{http_code}\n" -X POST "http://34.14.220.171:3000/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d '{"code":"SM-DEMO02","deviceMeta":{"label":"Test1","deviceType":"RETAILER_PHONE","deviceFingerprint":"fp_test_1"}}'

curl -s -w "\nHTTP: %{http_code}\n" -X POST "http://34.14.220.171:3000/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d '{"code":"SM-DEMO02","deviceMeta":{"label":"Test2","deviceType":"RETAILER_PHONE","deviceFingerprint":"fp_test_2"}}'

# EXPECTED: Both return HTTP 200 (NOT 400 or 409)
```

---

## Pre-Flight Discovery

```bash
# SSH into VM
ssh user@34.14.220.171

# Check current state
docker ps --format "table {{.Names}}\t{{.Status}}\t{{.Ports}}"

# Which container serves /api/v1/pos/enroll?
# Usually backend-api on port 3000
docker ps | grep -E "backend|api"

# Check backend env (DB connection)
docker exec backend-api env | grep -E "DATABASE|DB_"

# Check backend logs
docker logs backend-api --tail 50

# Check current backend version
docker exec backend-api cat /app/package.json | grep version

# Check DB connectivity
docker exec -i postgres psql -U postgres -d supermandi -c "SELECT 1 as ok;"
```

---

## Option A: Update via Git Pull

```bash
# Navigate to project
cd /opt/supermandi

# Pull latest
git fetch origin
git checkout main
git pull origin main

# Rebuild backend
docker-compose build backend-api

# Apply migrations (see next section)
```

---

## Option B: Update via Docker Images

```bash
# Pull latest images
docker pull ghcr.io/supermandi/backend:latest
docker pull ghcr.io/supermandi/gateway:latest

# Tag for docker-compose
docker tag ghcr.io/supermandi/backend:latest supermandi-backend:latest

# Apply migrations (see next section)
```

---

## Apply Migrations

### List Migration Files
```bash
# Local migrations directory
ls -la backend/migrations/*.sql | tail -10
```

### Apply Migrations 016 + 017 (CRITICAL for demo multi-use)
```bash
# ============================================
# Migration 016: Add tracking columns
# ============================================
docker cp backend/migrations/016_add_enrollment_tracking_columns.sql postgres:/tmp/
docker exec -i postgres psql -U postgres -d supermandi -f /tmp/016_add_enrollment_tracking_columns.sql

# Expected output:
# BEGIN
# ALTER TABLE (several)
# CREATE INDEX (several)
# UPDATE X
# COMMIT

# ============================================
# Migration 017: Fix legacy demo codes (CRITICAL)
# ============================================
docker cp backend/migrations/017_fix_legacy_demo_codes.sql postgres:/tmp/
docker exec -i postgres psql -U postgres -d supermandi -f /tmp/017_fix_legacy_demo_codes.sql

# Expected output:
# BEGIN
# UPDATE X
# NOTICE:  === Migration 017 Results ===
# NOTICE:  Demo enrollments (multi-use): X
# NOTICE:  Production enrollments (single-use): Y
# NOTICE:  SM-DEMO codes: SM-DEMO01: max_uses=9999, used_device_id=NULL; SM-DEMO02: max_uses=9999, used_device_id=NULL
# COMMIT
```

### Verify SM-DEMO01/02 are fixed
```bash
docker exec -i postgres psql -U postgres -d supermandi -c "
  SELECT code, max_uses, uses_count, used_device_id, expires_at > NOW() as not_expired
  FROM pos_device_enrollments
  WHERE code IN ('SM-DEMO01', 'SM-DEMO02');
"

# EXPECTED:
#    code    | max_uses | uses_count | used_device_id | not_expired
# -----------+----------+------------+----------------+-------------
#  SM-DEMO01 |     9999 |          X | NULL           | t
#  SM-DEMO02 |     9999 |          X | NULL           | t

# CRITICAL: max_uses MUST be 9999 and used_device_id MUST be NULL
```

### Apply All Pending Migrations (Alternative)
```bash
# If using migration runner
docker-compose exec backend-api npm run migrate:up
```

---

## Restart Services (Order Matters)

```bash
# 1. Restart backend first
docker-compose restart backend-api
sleep 5

# 2. Verify backend health
curl -s http://localhost:3000/health | jq .
# Expected: { "status": "ok", ... }

# 3. Restart gateway (if separate)
docker-compose restart gateway
sleep 3

# 4. Verify gateway
curl -s http://localhost:8080/health | jq .
```

---

## Database Verification

### Check Migration Applied
```bash
docker exec -i postgres psql -U postgres -d supermandi -c "
  SELECT column_name, data_type, column_default
  FROM information_schema.columns
  WHERE table_name = 'pos_device_enrollments'
    AND column_name IN ('max_uses', 'uses_count')
  ORDER BY column_name;
"

# Expected:
#  column_name | data_type | column_default
# -------------+-----------+----------------
#  max_uses    | integer   | 1
#  uses_count  | integer   | 0
```

### Check Demo Enrollments Updated
```bash
docker exec -i postgres psql -U postgres -d supermandi -c "
  SELECT
    e.code,
    e.max_uses,
    e.uses_count,
    s.store_code,
    s.is_demo,
    e.expires_at > NOW() as not_expired
  FROM pos_device_enrollments e
  JOIN stores s ON e.store_id = s.id
  WHERE e.code LIKE 'SM-DEMO%'
     OR s.is_demo = TRUE
     OR LOWER(COALESCE(s.store_code, '')) LIKE '%demo%'
  ORDER BY e.code;
"

# Expected: max_uses = 9999 for all demo enrollments
```

### Check Enrollment Counts by Type
```bash
docker exec -i postgres psql -U postgres -d supermandi -c "
  SELECT
    CASE
      WHEN s.is_demo OR LOWER(COALESCE(s.store_code, '')) LIKE '%demo%'
      THEN 'DEMO'
      ELSE 'PROD'
    END as store_type,
    COUNT(*) as total_enrollments,
    SUM(CASE WHEN e.max_uses >= 9999 THEN 1 ELSE 0 END) as multi_use,
    SUM(CASE WHEN e.max_uses = 1 THEN 1 ELSE 0 END) as single_use
  FROM pos_device_enrollments e
  JOIN stores s ON e.store_id = s.id
  GROUP BY 1
  ORDER BY 1;
"

# Expected:
#  store_type | total_enrollments | multi_use | single_use
# ------------+-------------------+-----------+------------
#  DEMO       | X                 | X         | 0
#  PROD       | Y                 | 0         | Y
```

---

## Curl Smoke Tests

### Set Environment Variables
```bash
# Admin token (replace with actual)
export ADMIN_TOKEN="your-admin-token-here"

# API base URL (VM IP)
export API_URL="http://34.14.220.171:3000"
```

---

### CRITICAL TEST: SM-DEMO01/02 Multi-Use (Run This First!)

```bash
# =====================================================================
# TEST A: Enroll first device with SM-DEMO01 (should succeed)
# =====================================================================
echo "=== Test A: First device with SM-DEMO01 ==="
curl -s -w "\nHTTP: %{http_code}\n" -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SM-DEMO01",
    "deviceMeta": {
      "label": "VM-Demo-Test-A",
      "deviceType": "RETAILER_PHONE",
      "deviceFingerprint": "fp_vm_demo_test_a_'$(date +%s)'"
    }
  }' | jq '{deviceId, storeName, storeCode, error}'

# EXPECTED: HTTP 200 with deviceId (NOT 400 or 409)

# =====================================================================
# TEST B: Enroll SECOND device with SAME SM-DEMO01 (MUST also succeed)
# =====================================================================
echo "=== Test B: Second device with SM-DEMO01 (MUST succeed) ==="
curl -s -w "\nHTTP: %{http_code}\n" -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SM-DEMO01",
    "deviceMeta": {
      "label": "VM-Demo-Test-B",
      "deviceType": "RETAILER_PHONE",
      "deviceFingerprint": "fp_vm_demo_test_b_'$(date +%s)'"
    }
  }' | jq '{deviceId, storeName, storeCode, error}'

# EXPECTED: HTTP 200 (NOT 409 "already used")
# This is the CRITICAL test - if this fails, migration 017 wasn't applied

# =====================================================================
# TEST C: Same test with SM-DEMO02
# =====================================================================
echo "=== Test C: SM-DEMO02 multi-use ==="
curl -s -w "\nHTTP: %{http_code}\n" -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SM-DEMO02",
    "deviceMeta": {
      "label": "VM-Demo-Test-C",
      "deviceType": "RETAILER_PHONE",
      "deviceFingerprint": "fp_vm_demo_test_c_'$(date +%s)'"
    }
  }' | jq '{deviceId, storeName, storeCode, error}'

# EXPECTED: HTTP 200
```

**If any test above returns 400/409 "already used":**
1. Check migration 017 was applied: `SELECT max_uses, used_device_id FROM pos_device_enrollments WHERE code = 'SM-DEMO01'`
2. `max_uses` must be `9999` and `used_device_id` must be `NULL`
3. Re-run migration 017 if needed

### Check Backend Logs (Prove Code is Deployed)

```bash
# Watch backend logs while running enrollment test
docker logs -f backend-api --tail 50 2>&1 | grep -E "\[Enroll\]"

# In another terminal, run:
curl -s -X POST "http://34.14.220.171:3000/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d '{"code":"SM-DEMO02","deviceMeta":{"label":"LogTest","deviceType":"RETAILER_PHONE","deviceFingerprint":"fp_log_test"}}'

# EXPECTED log lines (if code is updated):
# [Enroll] Demo bypass: code=SM-DEMO02 store=... uses=X/9999 expired=false
# [Enroll] Device <uuid> enrolled with code SM-DEMO02 (uses: X/9999)

# If you see "REJECT 409" log, the DB wasn't fixed (max_uses still 1 or used_device_id set)
```

---

### Test 1: Get Demo Store ID
```bash
DEMO_STORE_ID=$(curl -s "$API_URL/api/v1/admin/stores" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  jq -r '.stores[] | select(.storeCode | test("demo|qa|test"; "i")) | .id' | head -1)

echo "Demo store ID: $DEMO_STORE_ID"

# If no demo store exists, create one:
# curl -X POST "$API_URL/api/v1/admin/stores" \
#   -H "Authorization: Bearer $ADMIN_TOKEN" \
#   -H "Content-Type: application/json" \
#   -d '{"storeName": "Demo Store QA", "is_demo": true}'
```

### Test 2: Create Demo Enrollment Code
```bash
DEMO_ENROLL=$(curl -s -X POST "$API_URL/api/v1/admin/stores/$DEMO_STORE_ID/device-enrollments" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")

echo "$DEMO_ENROLL" | jq '.'

DEMO_CODE=$(echo "$DEMO_ENROLL" | jq -r '.code')
MAX_USES=$(echo "$DEMO_ENROLL" | jq -r '.maxUses')
IS_DEMO=$(echo "$DEMO_ENROLL" | jq -r '.isDemo')

echo "---"
echo "Code: $DEMO_CODE"
echo "Max uses: $MAX_USES (EXPECT: 9999)"
echo "Is demo: $IS_DEMO (EXPECT: true)"
```

### Test 3: Demo Enrollment - First Device (Should Succeed)
```bash
ENROLL_1=$(curl -s -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$DEMO_CODE\",
    \"deviceMeta\": {
      \"label\": \"Demo-VM-Test-1\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_vm_demo_$(date +%s)_001\"
    }
  }")

echo "$ENROLL_1" | jq '.'

# EXPECTED: 200 OK with deviceId, storeName, storeCode
```

### Test 4: Demo Enrollment - Second Device (Should Succeed)
```bash
ENROLL_2=$(curl -s -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$DEMO_CODE\",
    \"deviceMeta\": {
      \"label\": \"Demo-VM-Test-2\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_vm_demo_$(date +%s)_002\"
    }
  }")

echo "$ENROLL_2" | jq '.'

# EXPECTED: 200 OK (NOT 409 error)
# This proves demo multi-use works
```

### Test 5: Get Production Store ID
```bash
PROD_STORE_ID=$(curl -s "$API_URL/api/v1/admin/stores" \
  -H "Authorization: Bearer $ADMIN_TOKEN" | \
  jq -r '.stores[] | select(.storeCode | test("demo|qa|test"; "i") | not) | .id' | head -1)

echo "Production store ID: $PROD_STORE_ID"

# If no production store exists, create one:
# curl -X POST "$API_URL/api/v1/admin/stores" \
#   -H "Authorization: Bearer $ADMIN_TOKEN" \
#   -H "Content-Type: application/json" \
#   -d '{"storeName": "Production Store Alpha"}'
```

### Test 6: Create Production Enrollment Code
```bash
PROD_ENROLL=$(curl -s -X POST "$API_URL/api/v1/admin/stores/$PROD_STORE_ID/device-enrollments" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -H "Content-Type: application/json")

echo "$PROD_ENROLL" | jq '.'

PROD_CODE=$(echo "$PROD_ENROLL" | jq -r '.code')
PROD_MAX=$(echo "$PROD_ENROLL" | jq -r '.maxUses')
PROD_DEMO=$(echo "$PROD_ENROLL" | jq -r '.isDemo')

echo "---"
echo "Code: $PROD_CODE"
echo "Max uses: $PROD_MAX (EXPECT: 1)"
echo "Is demo: $PROD_DEMO (EXPECT: false)"
```

### Test 7: Production Enrollment - First Device (Should Succeed)
```bash
PROD_1=$(curl -s -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$PROD_CODE\",
    \"deviceMeta\": {
      \"label\": \"Prod-VM-Test-1\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_vm_prod_$(date +%s)_001\"
    }
  }")

echo "$PROD_1" | jq '.'

# EXPECTED: 200 OK with deviceId, storeName, storeCode
DEVICE_TOKEN=$(echo "$PROD_1" | jq -r '.deviceToken')
```

### Test 8: Production Enrollment - Second Device (Should FAIL)
```bash
PROD_2=$(curl -s -w "\nHTTP_STATUS:%{http_code}" -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d "{
    \"code\": \"$PROD_CODE\",
    \"deviceMeta\": {
      \"label\": \"Prod-VM-Test-2\",
      \"deviceType\": \"RETAILER_PHONE\",
      \"deviceFingerprint\": \"fp_vm_prod_$(date +%s)_002\"
    }
  }")

echo "$PROD_2"

# EXPECTED: HTTP 409 with error.code = "ENROLLMENT_CODE_USED"
# This proves production single-use works
```

### Test 9: ui-status Returns storeName
```bash
curl -s "$API_URL/api/v1/pos/ui-status" \
  -H "X-Device-Token: $DEVICE_TOKEN" | \
  jq '{storeId, storeName, storeCode, storeActive}'

# EXPECTED: { storeId, storeName, storeCode, storeActive: true }
```

### Test 10: Verify SM-DEMO02 (Legacy Code)
```bash
curl -s -X POST "$API_URL/api/v1/pos/enroll" \
  -H "Content-Type: application/json" \
  -d '{
    "code": "SM-DEMO02",
    "deviceMeta": {
      "label": "Legacy-Demo-Test",
      "deviceType": "RETAILER_PHONE",
      "deviceFingerprint": "fp_legacy_demo_test_001"
    }
  }' | jq '.'

# EXPECTED: 200 OK (if SM-DEMO02 exists)
# Or 400 "code not found" (if doesn't exist - that's OK)
```

---

## Rollback Plan

### Revert Backend Image
```bash
# Stop current
docker-compose stop backend-api

# Pull previous version
docker pull ghcr.io/supermandi/backend:v3.0.10

# Update docker-compose.yml or tag
docker tag ghcr.io/supermandi/backend:v3.0.10 supermandi-backend:latest

# Start
docker-compose up -d backend-api

# Verify
curl -s http://localhost:3000/health | jq .
```

### Migration Rollback (If Needed)
```bash
# Migration 015 is data-only (updates max_uses)
# To revert, manually set back to 1:

docker exec -i postgres psql -U postgres -d supermandi -c "
  -- Only if rollback is truly needed
  UPDATE pos_device_enrollments
  SET max_uses = 1
  WHERE max_uses = 9999;
"

# NOTE: This is rarely needed - the migration is safe
```

---

## Quick Reference: Expected Values

| Scenario | max_uses | isDemo | Second Enroll |
|----------|----------|--------|---------------|
| Demo store new code | 9999 | true | Succeeds |
| Demo store SM-DEMO02 | 9999 | true | Succeeds |
| Production new code | 1 | false | 409 error |

---

## Checklist Summary

- [ ] SSH into VM
- [ ] Check current docker state
- [ ] Pull code (git) or images (docker)
- [ ] Apply migration 015_fix_demo_enrollments.sql
- [ ] Restart backend-api
- [ ] Restart gateway
- [ ] Verify health endpoints
- [ ] Run DB verification queries
- [ ] Run curl smoke tests (all 10)
- [ ] Confirm demo multi-use works
- [ ] Confirm production single-use enforced
- [ ] Document any issues in runbook
