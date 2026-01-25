# AUD-VM-999 Go-Live Fix Status

**Date:** 2026-01-26
**Commit:** ed63407 (wip/trace-2026-01-15)
**VM:** 34.14.220.171

## Executive Summary

All **7 FAIL tickets** from AUD-VM-999 have been analyzed and addressed:

| Ticket | Status | Action |
|--------|--------|--------|
| AUD-VM-011 | RESOLVED | Migrations fixed in prior iterations |
| AUD-VM-031 | RESOLVED | Code already has storeProductId support (ITER3-001) |
| AUD-VM-033 | **NEW FIX** | Commit ed63407 bridges dual inventory systems |
| AUD-VM-042 | RESOLVED | Sales endpoint bridges catalog to variants |
| AUD-VM-043 | RESOLVED | Stock-In uses correct schema/columns |
| AUD-VM-051 | BY DESIGN | Telemetry events are fire-and-forget |
| AUD-VM-052 | RESOLVED | Sync endpoint uses `processed_events` for dedup |

## Critical Fix: AUD-VM-033 (Commit ed63407)

### Problem
Sales endpoint returned `insufficient_stock` even when products had stock in `catalog.store_products.current_stock` because `ensureStoreInventoryAvailability` only checked the legacy `store_inventory` table.

### Solution
Modified `ensureStoreInventoryAvailability()` in `inventoryLedgerService.ts` to:
1. First check legacy `store_inventory.available_qty`
2. Also check `catalog.store_products.current_stock` + `inventory.stock_balances.current_qty`
3. Use MAX of both for availability (bridges both inventory systems)

### File Changed
```
backend/src/services/inventoryLedgerService.ts
```

## Deployment Instructions

SSH to VM and run:

```bash
# 1. Navigate to repo
cd /home/supermandi/supermandi-pos

# 2. Pull latest changes
git fetch origin
git checkout wip/trace-2026-01-15
git pull origin wip/trace-2026-01-15

# 3. Verify commit
git log -1 --oneline
# Should show: ed63407 fix(AUD-VM-033): Bridge dual inventory systems

# 4. Build backend
cd backend
npm run build

# 5. Restart container
docker restart supermandi-main-backend

# 6. Verify health
sleep 5
docker ps --filter "name=supermandi-main-backend"
docker logs --tail 30 supermandi-main-backend
```

## Verification Tests (Post-Deploy)

### Test 1: Products List
```bash
curl -s "http://localhost:3000/api/v1/pos/store-products/list?limit=3" \
  -H "x-device-token: tok_glt4vk4ermcmke1x6jj"
# Should return products with storeProductId, currentStock
```

### Test 2: Sales with storeProductId
```bash
curl -s -X POST "http://localhost:3000/api/v1/pos/sales" \
  -H "x-device-token: tok_glt4vk4ermcmke1x6jj" \
  -H "Content-Type: application/json" \
  -d '{"items":[{"storeProductId":"5257189d-5278-4032-8b84-e97c420fc68f","quantity":1,"priceMinor":1000}]}'
# Should NOT return "insufficient_stock" for products with stock
```

### Test 3: Stock-In
```bash
curl -s "http://localhost:3000/api/v1/pos/stock-in?limit=3" \
  -H "x-device-token: tok_glt4vk4ermcmke1x6jj"
# Should return entries (confirms stock-in endpoint works)
```

### Test 4: Price Update with storeProductId
```bash
curl -s -X PATCH "http://localhost:3000/api/v1/pos/store-products/price" \
  -H "x-device-token: tok_glt4vk4ermcmke1x6jj" \
  -H "Content-Type: application/json" \
  -d '{"storeProductId":"5257189d-5278-4032-8b84-e97c420fc68f","sellPrice":37500}'
# Should return success with updated product
```

## Pre-Deploy VM Test Results (2026-01-26)

| Endpoint | Status | Notes |
|----------|--------|-------|
| `/api/v1/pos/store-products/list` | **PASS** | Returns 33 products |
| `/api/v1/pos/stock-in` | **PASS** | Returns 4 entries |
| `/api/v1/pos/sales` (storeProductId) | **FAIL** | insufficient_stock (FIX NEEDED) |
| `/api/v1/pos/store-products/price` (storeProductId) | **FAIL** | Code not deployed |

## Post-Deploy Expected Results

| Endpoint | Expected Status |
|----------|-----------------|
| `/api/v1/pos/sales` (storeProductId) | **PASS** - Uses catalog stock |
| `/api/v1/pos/store-products/price` (storeProductId) | **PASS** - ITER3-001 in code |
| `/api/v1/pos/store-products/stock` (storeProductId) | **PASS** - ITER3-001 in code |

## Rollback

If issues occur:
```bash
# Rollback to previous commit
cd /home/supermandi/supermandi-pos
git checkout HEAD~1
cd backend
npm run build
docker restart supermandi-main-backend
```

## Go-Live Verdict

**READY FOR DEPLOY** - All code fixes are committed and pushed. Requires VM deployment to activate.

After deployment and verification:
- [ ] Sales with catalog products work
- [ ] Price updates accept storeProductId
- [ ] Stock updates accept storeProductId
- [ ] Stock-in continues working
- [ ] No new errors in docker logs

Mark as **GO-LIVE COMPLETE** after all checks pass.
