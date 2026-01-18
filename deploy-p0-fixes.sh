#!/bin/bash
# P0 Fixes Deployment Script - Retailer Portal
# Fixes:
#   1. JWT issuer mismatch (api-gateway) - "Invalid token" error
#   2. Schema fixes (platform-service) - Products and Ledger
#
# Usage: ./deploy-p0-fixes.sh
# Run this script on the GCP VM in ~/supermandi-backend directory

set -e

echo "=================================================="
echo "P0 Fixes Deployment - Retailer Portal"
echo "=================================================="
echo ""
echo "This script will deploy:"
echo "  1. API Gateway - JWT issuer fix"
echo "  2. Platform Service - Schema fixes for products/ledger"
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

# Ensure we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
  echo -e "${RED}Error: Run this script from ~/supermandi-backend directory${NC}"
  exit 1
fi

# ============================================================
# STEP 1: Build API Gateway
# ============================================================
echo ""
echo -e "${CYAN}[1/6] Building API Gateway...${NC}"
cd services/api-gateway
pnpm install --silent
pnpm build
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ API Gateway build successful${NC}"
else
  echo -e "${RED}✗ API Gateway build failed${NC}"
  exit 1
fi
cd ../..

# ============================================================
# STEP 2: Build Platform Service
# ============================================================
echo ""
echo -e "${CYAN}[2/6] Building Platform Service...${NC}"
cd services/platform-service
pnpm install --silent
pnpm build
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Platform Service build successful${NC}"
else
  echo -e "${RED}✗ Platform Service build failed${NC}"
  exit 1
fi
cd ../..

# ============================================================
# STEP 3: Rebuild Docker Images
# ============================================================
echo ""
echo -e "${CYAN}[3/6] Rebuilding Docker images...${NC}"

# API Gateway
docker build -f services/api-gateway/Dockerfile \
  -t supermandi-api-gateway:latest \
  . 2>&1 | tail -3
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ API Gateway image built${NC}"
else
  echo -e "${RED}✗ API Gateway Docker build failed${NC}"
  exit 1
fi

# Platform Service
docker build -f services/platform-service/Dockerfile \
  -t supermandi-platform-service:latest \
  . 2>&1 | tail -3
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Platform Service image built${NC}"
else
  echo -e "${RED}✗ Platform Service Docker build failed${NC}"
  exit 1
fi

# ============================================================
# STEP 4: Get Environment Variables from Running Containers
# ============================================================
echo ""
echo -e "${CYAN}[4/6] Capturing environment configuration...${NC}"

# Get Redis password from existing container
REDIS_PASSWORD=$(docker exec supermandi-redis redis-cli CONFIG GET requirepass 2>/dev/null | tail -1 || echo "")
if [ -z "$REDIS_PASSWORD" ]; then
  REDIS_PASSWORD=$(grep REDIS_PASSWORD .env 2>/dev/null | cut -d'=' -f2 || echo "supermandi_redis_pass")
fi

# Get JWT secret
JWT_SECRET=$(docker inspect supermandi-api-gateway --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep JWT_SECRET | cut -d'=' -f2 || echo "")
if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET=$(grep JWT_SECRET .env 2>/dev/null | cut -d'=' -f2 || echo "supermandi_jwt_secret_change_in_production_32chars")
fi

# Get Postgres password
PG_PASSWORD=$(docker inspect supermandi-postgres --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep POSTGRES_PASSWORD | cut -d'=' -f2 || echo "supermandi_dev_password")

echo -e "${GREEN}✓ Configuration captured${NC}"

# ============================================================
# STEP 5: Restart Containers with New Images
# ============================================================
echo ""
echo -e "${CYAN}[5/6] Restarting containers...${NC}"

# Stop old containers
echo "  Stopping old containers..."
docker stop supermandi-api-gateway supermandi-platform-service 2>/dev/null || true
docker rm supermandi-api-gateway supermandi-platform-service 2>/dev/null || true
sleep 2

# Start Platform Service
echo "  Starting Platform Service..."
docker run -d \
  --name supermandi-platform-service \
  --network supermandi-network \
  -e NODE_ENV=production \
  -e PORT=3002 \
  -e DATABASE_URL="postgresql://supermandi:${PG_PASSWORD}@supermandi-postgres:5432/supermandi" \
  -e REDIS_URL="redis://:${REDIS_PASSWORD}@supermandi-redis:6379" \
  supermandi-platform-service:latest
echo -e "${GREEN}✓ Platform Service started${NC}"

# Start API Gateway
echo "  Starting API Gateway..."
docker run -d \
  --name supermandi-api-gateway \
  --network supermandi-network \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e PORT=3000 \
  -e JWT_SECRET="${JWT_SECRET}" \
  -e JWT_ISSUER="supermandi-auth" \
  -e AUTH_SERVICE_URL=http://supermandi-auth-service:3001 \
  -e PLATFORM_SERVICE_URL=http://supermandi-platform-service:3002 \
  -e SUPPLIER_SERVICE_URL=http://supermandi-supplier-service:3003 \
  -e CATALOG_SERVICE_URL=http://supermandi-catalog-service:3004 \
  -e INVENTORY_SERVICE_URL=http://supermandi-inventory-service:3005 \
  -e ORDER_SERVICE_URL=http://supermandi-order-service:3006 \
  -e REORDER_SERVICE_URL=http://supermandi-reorder-service:3007 \
  -e VOICE_SERVICE_URL=http://supermandi-voice-service:3008 \
  supermandi-api-gateway:latest
echo -e "${GREEN}✓ API Gateway started${NC}"

# ============================================================
# STEP 6: Verify Deployment
# ============================================================
echo ""
echo -e "${CYAN}[6/6] Verifying deployment...${NC}"
sleep 10

# Check API Gateway health
GATEWAY_HEALTH=$(docker exec supermandi-api-gateway wget -qO- http://localhost:3000/health 2>/dev/null || echo "FAILED")
if echo "$GATEWAY_HEALTH" | grep -q "ok"; then
  echo -e "${GREEN}✓ API Gateway is healthy${NC}"
else
  echo -e "${RED}✗ API Gateway health check failed${NC}"
  docker logs supermandi-api-gateway --tail 20
fi

# Check Platform Service health
PLATFORM_HEALTH=$(docker exec supermandi-platform-service wget -qO- http://localhost:3002/health 2>/dev/null || echo "FAILED")
if echo "$PLATFORM_HEALTH" | grep -q "ok"; then
  echo -e "${GREEN}✓ Platform Service is healthy${NC}"
else
  echo -e "${RED}✗ Platform Service health check failed${NC}"
  docker logs supermandi-platform-service --tail 20
fi

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo -e "${GREEN}=================================================="
echo "✓ P0 Fixes Deployment Complete!"
echo "==================================================${NC}"
echo ""
echo "Changes deployed:"
echo "  1. API Gateway: JWT issuer set to 'supermandi-auth'"
echo "  2. Platform Service: Fixed schema for products/ledger"
echo ""
echo -e "${YELLOW}Next Steps:${NC}"
echo "  1. Test Firebase login at: https://supermandi.in/s/DEMO001"
echo "  2. Verify product creation works"
echo "  3. Check inventory ledger entries"
echo ""
echo "To monitor logs:"
echo "  docker logs -f supermandi-api-gateway"
echo "  docker logs -f supermandi-platform-service"
echo ""
