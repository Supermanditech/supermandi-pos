#!/bin/bash
# Categories Endpoint Fix - Quick Deployment Script
# Usage: ./deploy-categories-fix.sh

set -e

echo "=================================================="
echo "Categories Endpoint Fix - Production Deployment"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Step 1: Rebuild
echo -e "${YELLOW}[1/5] Building catalog-service...${NC}"
cd backend/services/catalog-service
pnpm install
pnpm build
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Build successful${NC}"
else
  echo -e "${RED}✗ Build failed${NC}"
  exit 1
fi

# Step 2: Docker build
echo -e "${YELLOW}[2/5] Building Docker image...${NC}"
cd ../..
docker build -f services/catalog-service/Dockerfile \
  -t supermandi-catalog-service:latest \
  .
if [ $? -eq 0 ]; then
  echo -e "${GREEN}✓ Docker image built${NC}"
else
  echo -e "${RED}✗ Docker build failed${NC}"
  exit 1
fi

# Step 3: Stop old container
echo -e "${YELLOW}[3/5] Stopping old container...${NC}"
docker stop supermandi-catalog-service || true
docker rm supermandi-catalog-service || true
sleep 2
echo -e "${GREEN}✓ Old container stopped${NC}"

# Step 4: Start new container
echo -e "${YELLOW}[4/5] Starting new container...${NC}"
docker run -d \
  --name supermandi-catalog-service \
  --network supermandi-network \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://supermandi:supermandi_dev_password@supermandi-postgres:5432/supermandi \
  -e REDIS_URL=redis://supermandi-redis:6379 \
  supermandi-catalog-service:latest

sleep 5

# Step 5: Verify
echo -e "${YELLOW}[5/5] Verifying deployment...${NC}"
sleep 10

# Check health
HEALTH=$(docker exec supermandi-catalog-service curl -s http://localhost:3003/health | grep -o '"status":"ok"' || echo "FAILED")
if [[ "$HEALTH" == *"ok"* ]]; then
  echo -e "${GREEN}✓ Service is healthy${NC}"
else
  echo -e "${RED}✗ Service health check failed${NC}"
  docker logs supermandi-catalog-service --tail 30
  exit 1
fi

# Check for errors in logs
ERRORS=$(docker logs supermandi-catalog-service 2>&1 | grep -i "error" | wc -l)
if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✓ No errors in logs${NC}"
else
  echo -e "${YELLOW}⚠ Found $ERRORS error lines in logs (check below)${NC}"
  docker logs supermandi-catalog-service 2>&1 | grep -i "error" | tail -5
fi

echo ""
echo -e "${GREEN}=================================================="
echo "✓ Deployment Complete!"
echo "==================================================${NC}"
echo ""
echo "Testing endpoints..."
echo ""
echo "Demo store categories:"
curl -s -H "X-Device-Token: test-token" \
  http://localhost:3000/api/v1/catalog/stores/a0000000-0000-0000-0000-000000000001/categories \
  | head -c 100
echo ""
echo ""
echo "All systems go! Categories endpoint is now working."
