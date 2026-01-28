# GL-CRIT Gap Fixes - Deployment Checklist

**Date:** 2026-01-29
**Scope:** ~30 GL-CRIT tickets identified as gaps in audit items 1-105

---

## Pre-Deployment Checklist

- [ ] Backup production database
- [ ] Verify DATABASE_URL is set
- [ ] Ensure no active transactions/sales in progress

---

## 1. Backend Deployment

### Database Migrations (CRITICAL - Run First)

```bash
# SSH into production VM
ssh claude@34.14.220.171

# Navigate to backend
cd /opt/supermandi/backend

# Pull latest code
git pull origin main

# Run migrations
npm run migrate
# OR use the deployment script
./scripts/deploy_backend.sh
```

**Migrations included:**
- `068_gl_crit_0008_foreign_keys.sql` - Foreign key constraints for data integrity
- `069_gl_crit_0010_soft_delete.sql` - Soft delete columns for stores, users, products

### Backend Service Restart

```bash
pm2 restart supermandi-backend --update-env
pm2 logs supermandi-backend --lines 50
```

---

## 2. Docker Network Update (GL-CRIT-0050)

The docker-compose.prod.yml now includes network isolation. To apply:

```bash
cd /opt/supermandi/backend

# Stop and recreate with new networks
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d

# Verify networks created
docker network ls | grep supermandi
```

**Expected networks:**
- `supermandi-network` (main bridge)
- `db-network` (internal, isolated for DB)
- `internal-network` (internal, service-to-service)

---

## 3. POS App Changes

Changes are in the React Native codebase. New APK build required:

```bash
cd /opt/supermandi/pos-app
npm install
npx expo build:android  # or eas build
```

**Files Changed:**
- `src/components/ui/LoadingState.tsx` (NEW) - Unified loading states
- `src/config/storageKeys.ts` (NEW) - Centralized storage keys
- `src/utils/errorHandler.ts` - Added retry UX
- `src/services/stockService.ts` - Added timeout handling
- `src/services/api/posApi.ts` - Better UPI offline error
- `src/i18n/locales/en.json` - Additional translations
- `src/i18n/locales/hi.json` - Hindi translations

---

## 4. Retailer Admin Changes

```bash
cd /opt/supermandi/retailer-admin

# Pull and rebuild
git pull origin main
npm install
npm run build

# Deploy to web server
# (nginx/caddy serving static files)
```

**Files Changed:**
- `src/lib/hooks.ts` (NEW) - Escape key handler, accessibility hooks
- `src/pages/InventoryPage.tsx` - Contextual empty states
- `src/pages/DashboardPage.tsx` - Added escape key handler
- `src/pages/admin/ProductQueuePage.tsx` - Added escape key handler

---

## 5. Environment Variables

Ensure `.env` has the following (GL-CRIT-0019, 0026, 0051):

```bash
# Firebase (retailer OTP auth)
FIREBASE_ENABLED=true
FIREBASE_PROJECT_ID=<your-project-id>
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/supermandi/firebase-service-account.json

# Voice service
OPENAI_API_KEY=<your-api-key>

# Security
ADMIN_TOKEN=<secure-random-token>
FORCE_HTTPS=true
TRUST_PROXY=1

# Session timeout (retailer admin)
VITE_IDLE_TIMEOUT_MINUTES=30
```

---

## Post-Deployment Verification

### 1. Database Verification

```sql
-- Check foreign keys added (GL-CRIT-0008)
SELECT constraint_name
FROM information_schema.table_constraints
WHERE constraint_type = 'FOREIGN KEY'
  AND constraint_name LIKE 'fk_%'
ORDER BY constraint_name;

-- Check soft delete columns (GL-CRIT-0010)
SELECT column_name, table_name
FROM information_schema.columns
WHERE column_name = 'deleted_at';
```

### 2. Health Check

```bash
# API Gateway health
curl http://localhost:3000/health

# Main backend health
curl http://localhost:3010/health

# Check for errors in logs
pm2 logs supermandi-backend --err --lines 100
```

### 3. POS App Smoke Test

- [ ] Open POS app
- [ ] Verify loading states display correctly
- [ ] Test offline UPI payment (should show clear error message)
- [ ] Test network retry prompt on API failure

### 4. Retailer Admin Smoke Test

- [ ] Login to retailer admin
- [ ] Navigate to Inventory page
- [ ] Verify contextual empty states based on filter
- [ ] Open a modal and press Escape (should close)
- [ ] Verify idle timeout warning appears after 25 minutes

---

## Rollback Procedure

If issues arise:

```bash
# Revert to previous commit
git revert HEAD

# Rollback migrations (if needed)
# Note: Foreign key migrations are additive and safe
# Soft delete columns don't affect existing queries

# Restart services
pm2 restart all
```

---

## GL-CRIT Tickets Addressed

| Ticket | Area | Fix |
|--------|------|-----|
| GL-CRIT-0008 | Database | Foreign key constraints |
| GL-CRIT-0010 | Database | Soft delete columns |
| GL-CRIT-0015 | POS | Idempotent sale creation (documented) |
| GL-CRIT-0019 | Infra | Firebase API key security |
| GL-CRIT-0026 | Infra | HTTPS enforcement config |
| GL-CRIT-0041 | POS | UPI offline error message |
| GL-CRIT-0048 | Backend | Health endpoint split (already done) |
| GL-CRIT-0050 | Docker | Network isolation |
| GL-CRIT-0051 | Docker | Voice API key security |
| GL-CRIT-0073 | Retailer | Contextual empty states |
| GL-CRIT-0076 | Retailer | Configurable idle timeout |
| GL-CRIT-0077 | Retailer | Accessibility hooks |
| GL-CRIT-0078 | Retailer | Escape key for modals |
| GL-CRIT-0083-0085 | POS | Unified loading states |
| GL-CRIT-0087 | POS | Network retry UX |
| GL-CRIT-0088 | POS | Stock refresh timeout |
| GL-CRIT-0093 | POS | Centralized storage keys |
| GL-CRIT-0095 | POS | i18n translations |
| GL-CRIT-0102 | Retailer | Import validation errors |

---

## Sign-off

- [ ] Database migrations verified
- [ ] Backend services healthy
- [ ] Docker networks configured
- [ ] POS app tested
- [ ] Retailer admin tested
- [ ] No errors in logs

**Deployed by:** _______________
**Date:** _______________
