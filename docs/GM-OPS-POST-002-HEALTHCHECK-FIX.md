# GM-OPS-POST-002: Unhealthy Container Healthcheck Fix

**Severity:** LOW (does not block go-live)
**Status:** DOCUMENTED - Requires redeploy

---

## Issue Summary

| Container | Status | Root Cause |
|-----------|--------|------------|
| supermandi-supplier-service | unhealthy | Healthcheck port mismatch (checks 3003, service runs on 3002) |
| supermandi-catalog-service | unhealthy | Redis connection issue (missing password in REDIS_URL) |

**Note:** Both containers are running with 0 restarts. The "unhealthy" status is due to healthcheck misconfiguration, not service failures.

---

## Fix 1: Supplier Service Healthcheck Port

**Problem:** Service runs on port 3002, healthcheck checks port 3003

**Current (incorrect):**
```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3003/health"]
```

**Fix Required:** Update service to use correct port OR update healthcheck
```yaml
healthcheck:
  test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3002/health"]
```

**Files to Update:**
- `backend/docker-compose.prod.yml` line 270
- OR `backend/services/supplier-service/Dockerfile`

---

## Fix 2: Catalog Service Redis Connection

**Problem:** REDIS_URL missing password authentication

**Current (on running container):**
```
REDIS_URL=redis://supermandi-redis:6379
```

**Required (matches main-backend):**
```
REDIS_URL=redis://:supermandi@supermandi-redis:6379
```

**Files to Update:**
- Check how catalog-service constructs Redis URL
- Ensure REDIS_PASSWORD env var is used

---

## Verification After Fix

```bash
# Wait 2-3 minutes for healthcheck cycles
docker ps --format "{{.Names}} {{.Status}}" | grep -E "(supplier|catalog)"

# Expected output:
# supermandi-supplier-service Up X minutes (healthy)
# supermandi-catalog-service Up X minutes (healthy)
```

---

## Impact Assessment

| Aspect | Impact |
|--------|--------|
| Go-Live Blocking | NO |
| Functionality Impact | NO (services are running) |
| Monitoring Impact | YES (false unhealthy alerts) |
| Priority | Post-go-live cleanup |

---

## Deployment Steps

1. Update docker-compose.prod.yml with fixes
2. Run: `docker-compose -f docker-compose.prod.yml up -d supplier-service catalog-service`
3. Wait 3 minutes for healthchecks
4. Verify: `docker ps | grep -E "(supplier|catalog)"`
