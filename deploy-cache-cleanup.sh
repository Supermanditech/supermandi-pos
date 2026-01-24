#!/bin/bash
# CACHE-000 Deployment Script
# Deploys cache cleanup changes across:
#   1. Main Backend (no-cache middleware)
#   2. Retailer Dashboard (fetch no-store + React Query truth-first)
#   3. SuperAdmin Dashboard (fetch no-store on all API calls)
#
# Usage: Run on GCP VM (34.14.220.171) in ~/supermandi-backend directory
#   ./deploy-cache-cleanup.sh

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

echo "=================================================="
echo "CACHE-000: Cache Cleanup Deployment"
echo "=================================================="
echo ""
echo "Deploying:"
echo "  1. Backend: no-cache middleware for API responses"
echo "  2. Retailer Dashboard: fetch no-store + React Query staleTime=0"
echo "  3. SuperAdmin Dashboard: fetch no-store on all API calls"
echo ""

# Ensure we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
  echo -e "${RED}Error: Run this script from ~/supermandi-backend directory${NC}"
  exit 1
fi

# ============================================================
# STEP 1: Rebuild Main Backend Docker Image
# ============================================================
echo ""
echo -e "${CYAN}[1/5] Rebuilding Main Backend image...${NC}"

docker build -f Dockerfile.main \
  -t supermandi-main-backend:latest \
  . 2>&1 | tail -5
if [ $? -eq 0 ]; then
  echo -e "${GREEN}  Main Backend image built${NC}"
else
  echo -e "${RED}  Main Backend Docker build failed${NC}"
  exit 1
fi

# ============================================================
# STEP 2: Rebuild Retailer Dashboard
# ============================================================
echo ""
echo -e "${CYAN}[2/5] Building Retailer Dashboard...${NC}"

if [ -d "retailer-admin" ]; then
  cd retailer-admin
  npm install --silent 2>/dev/null || pnpm install --silent 2>/dev/null
  npm run build 2>&1 | tail -3
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}  Retailer Dashboard built${NC}"
  else
    echo -e "${RED}  Retailer Dashboard build failed${NC}"
    exit 1
  fi
  cd ..
else
  echo -e "${YELLOW}  retailer-admin/ not found, skipping${NC}"
fi

# ============================================================
# STEP 3: Rebuild SuperAdmin Dashboard
# ============================================================
echo ""
echo -e "${CYAN}[3/5] Building SuperAdmin Dashboard...${NC}"

if [ -d "supermandi-superadmin" ]; then
  cd supermandi-superadmin
  npm install --silent 2>/dev/null || pnpm install --silent 2>/dev/null
  npm run build 2>&1 | tail -3
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}  SuperAdmin Dashboard built${NC}"
  else
    echo -e "${RED}  SuperAdmin Dashboard build failed${NC}"
    exit 1
  fi
  cd ..
else
  echo -e "${YELLOW}  supermandi-superadmin/ not found, skipping${NC}"
fi

# ============================================================
# STEP 4: Restart Main Backend Container
# ============================================================
echo ""
echo -e "${CYAN}[4/5] Restarting Main Backend container...${NC}"

# Get environment from running container
PG_PASSWORD=$(docker inspect supermandi-postgres --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep POSTGRES_PASSWORD | cut -d'=' -f2 || grep POSTGRES_PASSWORD .env 2>/dev/null | cut -d'=' -f2 || echo "supermandi_dev_password")
REDIS_PASSWORD=$(grep REDIS_PASSWORD .env 2>/dev/null | cut -d'=' -f2 || echo "")
JWT_SECRET=$(docker inspect supermandi-main-backend --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep JWT_SECRET | cut -d'=' -f2 || grep JWT_SECRET .env 2>/dev/null | cut -d'=' -f2 || echo "")

# Stop and remove old container
docker stop supermandi-main-backend 2>/dev/null || true
docker rm supermandi-main-backend 2>/dev/null || true
sleep 2

# Start new container
docker run -d \
  --name supermandi-main-backend \
  --network supermandi-network \
  -p 3010:3010 \
  -e NODE_ENV=production \
  -e PORT=3010 \
  -e DATABASE_URL="postgresql://supermandi:${PG_PASSWORD}@supermandi-postgres:5432/supermandi" \
  -e REDIS_URL="redis://:${REDIS_PASSWORD}@supermandi-redis:6379" \
  -e JWT_SECRET="${JWT_SECRET}" \
  supermandi-main-backend:latest

echo -e "${GREEN}  Main Backend restarted${NC}"

# ============================================================
# STEP 5: Verify Deployment
# ============================================================
echo ""
echo -e "${CYAN}[5/5] Verifying deployment...${NC}"
sleep 8

# Check Main Backend health
BACKEND_HEALTH=$(docker exec supermandi-main-backend wget -qO- http://localhost:3010/health 2>/dev/null || echo "FAILED")
if echo "$BACKEND_HEALTH" | grep -q "ok"; then
  echo -e "${GREEN}  Main Backend is healthy${NC}"
else
  echo -e "${RED}  Main Backend health check failed${NC}"
  docker logs supermandi-main-backend --tail 20
fi

# Verify no-cache headers
echo ""
echo -e "${CYAN}Verifying Cache-Control headers...${NC}"
HEADERS=$(curl -sI http://localhost:3010/api/v1/pos/ui-status 2>/dev/null | grep -i "cache-control" || echo "")
if echo "$HEADERS" | grep -qi "no-store"; then
  echo -e "${GREEN}  Cache-Control: no-store is set on API responses${NC}"
else
  echo -e "${YELLOW}  Warning: Could not verify Cache-Control header (endpoint may require auth)${NC}"
fi

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo -e "${GREEN}=================================================="
echo "CACHE-000 Deployment Complete!"
echo "==================================================${NC}"
echo ""
echo "Changes deployed:"
echo "  1. Backend: Cache-Control: no-store on all /api/* routes"
echo "  2. Retailer Dashboard: React Query staleTime=0, fetch no-store"
echo "  3. SuperAdmin Dashboard: fetch no-store on all API calls"
echo ""
echo -e "${YELLOW}POS App (mobile):${NC}"
echo "  - Stock cache TTL reduced to 60s (from 6h)"
echo "  - API client uses cache: no-store"
echo "  - App refreshes products on foreground resume"
echo "  - Test via Expo Go on Redmi device"
echo ""
echo -e "${YELLOW}QA Verification:${NC}"
echo "  1. Update product name in Dashboard -> check POS reflects immediately"
echo "  2. Update price -> POS shows updated price"
echo "  3. Stock-in from dashboard -> POS shows updated stock"
echo "  4. Approve supplier in SuperAdmin -> lists update immediately"
echo "  5. Hard refresh browser -> fetches latest data"
echo "  6. Kill + reopen POS app -> no stale product list"
echo ""
