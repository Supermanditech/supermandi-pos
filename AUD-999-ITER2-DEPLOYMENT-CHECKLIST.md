# AUD-999 Iteration 2 - Deployment & Verification Checklist

**Date:** 2026-01-26
**Branch:** wip/trace-2026-01-15
**VM Gateway:** http://34.14.220.171:3000

---

## Pre-Deployment Checklist

- [x] All code changes committed
- [x] TypeScript compilation passes (`npx tsc --noEmit`)
- [x] Migration file created: `044_iter2_production_hardening.sql`

---

## Files Changed

### New Files
| File | Description |
|------|-------------|
| `migrations/044_iter2_production_hardening.sql` | Schema changes for all findings |
| `src/middleware/notFoundHandler.ts` | FINDING-004: Consistent 404 JSON response |
| `scripts/deploy-iter2-fixes.sh` | Deployment script for VM |

### Modified Files
| File | Findings Addressed |
|------|-------------------|
| `src/services/ai/askSuperMandiAI.ts` | FINDING-020: Claude API instead of OpenAI |
| `src/routes/v1/admin/ai.ts` | FINDING-020: Health check for ANTHROPIC_API_KEY |
| `src/routes/v1/pos/enroll.ts` | FINDING-026, 027, 028: Token expiry, max devices, notifications |
| `src/middleware/deviceToken.ts` | FINDING-026: Token expiry check + auto-refresh |
| `src/app.ts` | FINDING-004: 404 handler middleware |

---

## Deployment Steps

### 1. SSH to VM
```bash
ssh user@34.14.220.171
```

### 2. Run Deployment Script
```bash
cd /opt/supermandi/backend
chmod +x scripts/deploy-iter2-fixes.sh
./scripts/deploy-iter2-fixes.sh
```

### 3. Set Environment Variable (Manual)
```bash
# Add to /opt/supermandi/backend/.env
ANTHROPIC_API_KEY=<your-api-key-here>
```

### 4. Restart Service
```bash
pm2 restart api-gateway
# or
systemctl restart supermandi-backend
```

---

## Post-Deployment Verification

### Health Checks
```bash
# Gateway health
curl -s http://34.14.220.171:3000/health

# AI health (should show provider: "claude")
curl -s -H "x-admin-token: 0d57d3b70e8cab31e2cc50faf363a5c0" \
  http://34.14.220.171:3000/api/v1/admin/ai/health
```

### FINDING-004: 404 Response Format
```bash
# Should return JSON: {"error":{"code":"NOT_FOUND","message":"..."}}
curl -s http://34.14.220.171:3000/api/v1/nonexistent

# Compare with POS route (should also be JSON now)
curl -s http://34.14.220.171:3000/api/v1/pos/nonexistent
```

### FINDING-002: Reorder/Orders Schema
```bash
# Should return success with auth error (tables exist)
curl -s http://34.14.220.171:3000/api/v1/reorder/stores/test/reorder/settings
# Expected: {"success":false,"error":"Unauthorized: Store not identified"}

# With valid auth header should return settings or empty defaults
curl -s -H "x-actor-id: a0000000-0000-0000-0000-000000000001" \
  http://34.14.220.171:3000/api/v1/reorder/stores/a0000000-0000-0000-0000-000000000001/reorder/settings
```

### FINDING-020: Claude AI
```bash
# Test AI endpoint (requires ANTHROPIC_API_KEY set)
curl -s -X POST \
  -H "x-admin-token: 0d57d3b70e8cab31e2cc50faf363a5c0" \
  -H "Content-Type: application/json" \
  -d '{"question":"What were the total sales today?"}' \
  http://34.14.220.171:3000/api/v1/admin/ai
```

### FINDING-022: Customer Entity
```bash
# Verify customers table exists
psql -d supermandi -c "SELECT * FROM public.customers LIMIT 1;"
```

### FINDING-026/027/028: Device Enrollment
```bash
# Verify new columns exist
psql -d supermandi -c "SELECT id, token_expires_at, last_active_at FROM pos_devices LIMIT 5;"

# Verify store max_devices
psql -d supermandi -c "SELECT id, name, max_devices FROM platform.stores LIMIT 5;"

# Verify enrollment events table
psql -d supermandi -c "SELECT * FROM device_enrollment_events ORDER BY created_at DESC LIMIT 5;"
```

---

## Rollback Plan

If deployment fails:

```bash
# 1. Revert code
cd /opt/supermandi/backend
git checkout HEAD~1

# 2. Rebuild
npm run build

# 3. Restart
pm2 restart api-gateway

# 4. Migration rollback (manual - schema changes are additive)
# No destructive changes, new tables/columns can remain
```

---

## Summary of Fixes

| Finding | Status | Description |
|---------|--------|-------------|
| FINDING-002 | ✅ | Reorder/orders schema tables created |
| FINDING-004 | ✅ | 404 response format standardized to JSON |
| FINDING-011 | ✅ | Idempotency via sync event deduplication |
| FINDING-014 | ✅ | Event failure tracking table added |
| FINDING-015 | ✅ | PURCHASE_CREATED kept for backward compat |
| FINDING-020 | ✅ | Claude API replaces OpenAI |
| FINDING-022 | ✅ | Customers table for credit tracking |
| FINDING-023 | ✅ | Warning trigger for NULL sale_id |
| FINDING-026 | ✅ | Token expiry (90 days) + auto-refresh |
| FINDING-027 | ✅ | Configurable max_devices per store |
| FINDING-028 | ✅ | Enrollment event logging for superadmin |

---

**Deployment Author:** Claude Opus 4.6
**Verification Timestamp:** 2026-01-26
