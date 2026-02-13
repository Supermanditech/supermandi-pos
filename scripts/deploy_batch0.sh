#!/bin/bash
# BATCH 0 Deployment Script
# Run this on the VM after SSH: gcloud compute ssh --zone "asia-south1-a" "supermandi-backend-vm" --project "supermandi-backend"

set -e

echo "=============================================="
echo "SUPERMANDI - BATCH 0 DEPLOYMENT"
echo "Infrastructure & Foundation"
echo "=============================================="
echo "Date: $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

cd /opt/supermandi

# 1. BACKUP DATABASE
echo "=== Step 1: Backup Database ==="
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U supermandi supermandi > backup_batch0_$(date +%Y%m%d_%H%M%S).sql
echo "Database backed up"

# 2. Pull latest code
echo ""
echo "=== Step 2: Pull Latest Code ==="
git pull origin main
echo "Code updated"

# 3. Run migrations
echo ""
echo "=== Step 3: Run Migrations ==="
echo "Running migrations: 094, 095, 096 (CORE-001), 097, 098 (CORE-002)"
docker compose -f docker-compose.prod.yml exec -T main-backend node scripts/migrate-prod.js
echo "Migrations complete"

# 4. Rebuild backend services
echo ""
echo "=== Step 4: Rebuild Backend Services ==="
docker compose -f docker-compose.prod.yml up -d --build main-backend api-gateway
echo "Backend services rebuilt"

# 5. Rebuild retailer-admin
echo ""
echo "=== Step 5: Rebuild Retailer Admin Portal ==="
cd /opt/supermandi/retailer-admin
npm ci
VITE_API_BASE_URL=https://supermandi.tech/api \
VITE_GIT_SHA=$(git rev-parse --short HEAD) \
VITE_BUILD_TIME=$(date -Iseconds) \
npm run build
cp -r dist/* /var/www/retailer-admin/
echo "Retailer admin rebuilt"

# 6. Rebuild supplier-portal
echo ""
echo "=== Step 6: Rebuild Supplier Portal ==="
cd /opt/supermandi/supplier-portal
npm ci
NEXT_PUBLIC_API_BASE_URL=https://supermandi.tech/api npm run build
echo "Supplier portal rebuilt"

# 7. Verify services
echo ""
echo "=== Step 7: Verify Services ==="
cd /opt/supermandi
docker compose -f docker-compose.prod.yml ps

# 8. Run smoke test
echo ""
echo "=== Step 8: Smoke Test ==="
chmod +x scripts/go_live_smoke.sh
./scripts/go_live_smoke.sh https://supermandi.tech || true

echo ""
echo "=============================================="
echo "BATCH 0 DEPLOYMENT COMPLETE"
echo "=============================================="
echo ""
echo "Next Steps:"
echo "1. Run the smoke test: ./scripts/go_live_smoke.sh"
echo "2. Test as real user per INDEX.md testing protocol"
echo "3. Verify status transitions work for stores/suppliers"
