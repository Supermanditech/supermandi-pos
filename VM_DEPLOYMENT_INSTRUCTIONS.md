# Google VM Deployment Instructions

**Date**: 2026-01-11 02:10 IST
**Commit**: 3b632caf63f2f0cc2391690c4680d5af9ba4b030
**Tag**: pos-retailer-variants-fix-2026-01-11-0153IST

---

## Changes Deployed

### 1. **CRITICAL: Retailer Variants Auto-Link Fix**
   - **File**: `backend/src/services/inventoryService.ts` (lines 390-446)
   - **Issue**: Products with stock not appearing in sell screen (item 1006)
   - **Fix**: Changed INNER JOIN to LEFT JOIN + auto-creates missing retailer_variants links
   - **Impact**: Self-healing system, works across all 10,000 stores

### 2. **Two-Phase Commit Payment Flow**
   - **File**: `backend/src/routes/v1/pos/sales.ts`
   - **Issue**: Stock deducted even when payment fails
   - **Fix**: Sales created in PENDING status, stock only deducted on payment confirmation
   - **New Endpoints**:
     - `POST /api/v1/pos/sales/:saleId/confirm` - Confirm payment and deduct stock
     - `POST /api/v1/pos/sales/:saleId/cancel` - Cancel pending sale

### 3. **Cart & Event System Fixes**
   - Fixed cart quantity updates (cartStore.ts)
   - Fixed event logger initialization (eventLogger.ts)
   - Fixed UUID generation (uuid.ts)
   - Fixed payment screen state management (PaymentScreen.tsx)
   - Fixed status bar event propagation (PosStatusBar.tsx, PosRootLayout.tsx)

### 4. **Database Migrations**
   - Added missing indexes: `backend/migrations/2026-01-10_add_missing_indexes.sql`

---

## Deployment Steps

### SSH into Google VM

```bash
ssh your-vm-user@your-vm-ip
```

### Navigate to Backend Directory

```bash
cd ~/supermandi-backend
```

### Pull Latest Changes

```bash
git fetch --all --tags
git pull origin main
```

### Verify Commit

```bash
git log -1 --oneline
# Should show: 3b632ca fix(pos): retailer_variants auto-link + two-phase payment + cart fixes (2026-01-11)

git describe --tags
# Should show: pos-retailer-variants-fix-2026-01-11-0153IST
```

### Install Dependencies (if package.json changed)

```bash
npm install
```

### Restart Backend Services

```bash
pm2 restart all
```

### Verify Services Running

```bash
pm2 list
pm2 logs backend --lines 50
```

---

## Post-Deployment Monitoring

### Monitor Auto-Fix Messages

```bash
pm2 logs backend | grep "AUTOFIXED"
```

**Expected output** (if missing links are detected):
```
[AUTOFIXED] Created 5 missing retailer_variants links for store store-3
[AUTOFIXED] Created 12 missing retailer_variants links for store store-7
```

### Verify API Endpoints

```bash
# Test products endpoint
curl -H "Authorization: Bearer YOUR_DEVICE_TOKEN" \
  http://localhost:3000/api/v2/products

# Should return products for the store
```

### Database Migration (if needed)

```bash
# Run missing indexes migration
cd ~/supermandi-backend
psql -U postgres -d supermandi < migrations/2026-01-10_add_missing_indexes.sql
```

---

## Testing Checklist

- [ ] Store-3 can see item 1006 in sell screen
- [ ] All products with stock are visible
- [ ] Payment flow creates PENDING sales
- [ ] Stock only deducted after payment confirmation
- [ ] Payment failures don't cause stock loss
- [ ] AUTOFIXED messages appear in logs (if missing links exist)
- [ ] No errors in pm2 logs

---

## Rollback (if needed)

If issues occur, rollback to previous tag:

```bash
cd ~/supermandi-backend
git checkout pos-bugfix-2026-01-10-1644IST
npm install
pm2 restart all
```

---

## Support

If issues persist:
1. Check backend logs: `pm2 logs backend --lines 100`
2. Check database connectivity: `psql -U postgres -d supermandi -c "SELECT NOW();"`
3. Verify environment variables: `cat .env`
4. Check port availability: `netstat -tulpn | grep 3000`

---

**Deployment Ready**: ✅ YES
**Tested Locally**: ✅ YES
**APK Built**: ✅ YES (v1.0.1, installed on Redmi device)
**Changes Pushed**: ✅ YES (GitHub main branch)
