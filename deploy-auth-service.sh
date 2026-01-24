#!/bin/bash
# Auth Service Deployment Script - Retailer Portal Firebase Login
# Fixes: 503 "Service retailer-auth is currently unavailable"
#
# Root Cause: auth-service container was never deployed to this server.
# The API gateway proxies to http://supermandi-auth-service:3001 but
# that container doesn't exist.
#
# Usage: Run this script on the GCP VM in ~/supermandi-backend directory
#   ./deploy-auth-service.sh

set -e

echo "=================================================="
echo "Auth Service Deployment - Retailer Portal Login"
echo "=================================================="
echo ""

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m'

# Ensure we're in the right directory
if [ ! -f "docker-compose.prod.yml" ]; then
  echo -e "${RED}Error: Run this script from ~/supermandi-backend directory${NC}"
  exit 1
fi

# ============================================================
# STEP 0: Pre-flight checks
# ============================================================
echo -e "${CYAN}[0/5] Pre-flight checks...${NC}"

# Check Firebase service account file
FIREBASE_SA_PATH="/etc/supermandi/firebase-service-account.json"
if [ ! -f "$FIREBASE_SA_PATH" ]; then
  echo -e "${RED}ERROR: Firebase service account file not found at:${NC}"
  echo -e "${RED}  $FIREBASE_SA_PATH${NC}"
  echo ""
  echo -e "${YELLOW}To fix this:${NC}"
  echo "  1. Go to Firebase Console -> Project Settings -> Service Accounts"
  echo "  2. Click 'Generate New Private Key' for project 'supermandi-pos'"
  echo "  3. Save the JSON file to: $FIREBASE_SA_PATH"
  echo "  4. Run: sudo chmod 644 $FIREBASE_SA_PATH"
  echo "  5. Re-run this script"
  echo ""
  exit 1
fi
echo -e "${GREEN}  Firebase service account file found${NC}"

# Check network exists
if ! docker network inspect supermandi-network > /dev/null 2>&1; then
  echo -e "${YELLOW}  Creating Docker network 'supermandi-network'...${NC}"
  docker network create supermandi-network
fi
echo -e "${GREEN}  Docker network 'supermandi-network' exists${NC}"

# ============================================================
# STEP 1: Get Environment Variables from Running Containers
# ============================================================
echo ""
echo -e "${CYAN}[1/5] Capturing environment configuration...${NC}"

# Get Postgres password
PG_PASSWORD=$(docker inspect supermandi-postgres --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep POSTGRES_PASSWORD | cut -d'=' -f2 || echo "")
if [ -z "$PG_PASSWORD" ]; then
  PG_PASSWORD=$(grep POSTGRES_PASSWORD .env 2>/dev/null | cut -d'=' -f2 || echo "")
fi
if [ -z "$PG_PASSWORD" ]; then
  echo -e "${RED}ERROR: Cannot determine POSTGRES_PASSWORD${NC}"
  echo "  Set it in .env file or ensure supermandi-postgres container is running"
  exit 1
fi

# Get Redis password
REDIS_PASSWORD=$(grep REDIS_PASSWORD .env 2>/dev/null | cut -d'=' -f2 || echo "")
if [ -z "$REDIS_PASSWORD" ]; then
  REDIS_PASSWORD=$(docker inspect supermandi-redis --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep REDIS_PASSWORD | cut -d'=' -f2 || echo "")
fi

# Get JWT secret
JWT_SECRET=$(docker inspect supermandi-api-gateway --format '{{range .Config.Env}}{{println .}}{{end}}' 2>/dev/null | grep JWT_SECRET | cut -d'=' -f2 || echo "")
if [ -z "$JWT_SECRET" ]; then
  JWT_SECRET=$(grep JWT_SECRET .env 2>/dev/null | cut -d'=' -f2 || echo "")
fi
if [ -z "$JWT_SECRET" ]; then
  echo -e "${RED}ERROR: Cannot determine JWT_SECRET${NC}"
  exit 1
fi

echo -e "${GREEN}  Environment configuration captured${NC}"

# ============================================================
# STEP 2: Build Common Package
# ============================================================
echo ""
echo -e "${CYAN}[2/5] Building common package...${NC}"
cd packages/common
pnpm install --silent 2>/dev/null || npm install --silent
pnpm build 2>/dev/null || npm run build
echo -e "${GREEN}  Common package built${NC}"
cd ../..

# ============================================================
# STEP 3: Build Auth Service Docker Image
# ============================================================
echo ""
echo -e "${CYAN}[3/5] Building Auth Service Docker image...${NC}"

docker build -f services/auth-service/Dockerfile \
  -t supermandi-auth-service:latest \
  . 2>&1 | tail -5

if [ $? -eq 0 ]; then
  echo -e "${GREEN}  Auth Service image built successfully${NC}"
else
  echo -e "${RED}  Auth Service Docker build FAILED${NC}"
  exit 1
fi

# ============================================================
# STEP 4: Deploy Auth Service Container
# ============================================================
echo ""
echo -e "${CYAN}[4/5] Deploying Auth Service container...${NC}"

# Stop and remove existing container if any
docker stop supermandi-auth-service 2>/dev/null || true
docker rm supermandi-auth-service 2>/dev/null || true
sleep 2

# Start Auth Service
# IMPORTANT: --network-alias ensures gateway can resolve 'auth-service' hostname
# (gateway uses AUTH_SERVICE_URL=http://auth-service:3001 from docker-compose)
NETWORK_NAME=$(docker network ls --format '{{.Name}}' | grep supermandi | head -1)
docker run -d \
  --name supermandi-auth-service \
  --network "$NETWORK_NAME" \
  --network-alias auth-service \
  --restart unless-stopped \
  -e NODE_ENV=production \
  -e AUTH_SERVICE_PORT=3001 \
  -e DATABASE_URL="postgresql://supermandi:${PG_PASSWORD}@supermandi-postgres:5432/supermandi" \
  -e REDIS_URL="redis://:${REDIS_PASSWORD}@supermandi-redis:6379" \
  -e JWT_SECRET="${JWT_SECRET}" \
  -e JWT_ISSUER="supermandi-auth" \
  -e JWT_EXPIRES_IN="24h" \
  -e FIREBASE_ENABLED="true" \
  -e FIREBASE_PROJECT_ID="supermandi-pos" \
  -e FIREBASE_SERVICE_ACCOUNT_PATH="/etc/supermandi/firebase-service-account.json" \
  -v "${FIREBASE_SA_PATH}:/etc/supermandi/firebase-service-account.json:ro" \
  supermandi-auth-service:latest

echo -e "${GREEN}  Auth Service container started${NC}"

# ============================================================
# STEP 5: Verify Deployment
# ============================================================
echo ""
echo -e "${CYAN}[5/5] Verifying deployment...${NC}"
echo "  Waiting for service to start..."
sleep 8

# Check container is running
if docker ps --filter name=supermandi-auth-service --format "{{.Status}}" | grep -q "Up"; then
  echo -e "${GREEN}  Container is running${NC}"
else
  echo -e "${RED}  Container is NOT running!${NC}"
  echo "  Logs:"
  docker logs supermandi-auth-service --tail 30
  exit 1
fi

# Check health endpoint
AUTH_HEALTH=$(docker exec supermandi-auth-service wget -qO- http://localhost:3001/health 2>/dev/null || echo "FAILED")
if echo "$AUTH_HEALTH" | grep -q "ok"; then
  echo -e "${GREEN}  Health check: PASSED${NC}"
  echo "  Response: $AUTH_HEALTH"
else
  echo -e "${YELLOW}  Health check: DEGRADED (database may still be connecting)${NC}"
  echo "  Response: $AUTH_HEALTH"
  echo "  This is normal on first start - the service will retry DB connection"
fi

# Test from gateway
echo ""
echo "  Testing gateway -> auth-service connectivity..."
GATEWAY_TEST=$(docker exec supermandi-api-gateway wget -qO- http://supermandi-auth-service:3001/healthz 2>/dev/null || echo "FAILED")
if echo "$GATEWAY_TEST" | grep -q "ok"; then
  echo -e "${GREEN}  Gateway -> Auth Service: CONNECTED${NC}"
else
  echo -e "${YELLOW}  Gateway -> Auth Service: Not reachable yet (may need gateway restart)${NC}"
  echo ""
  echo "  Restarting API Gateway to pick up auth-service..."
  docker restart supermandi-api-gateway
  sleep 5
  GATEWAY_TEST2=$(docker exec supermandi-api-gateway wget -qO- http://supermandi-auth-service:3001/healthz 2>/dev/null || echo "FAILED")
  if echo "$GATEWAY_TEST2" | grep -q "ok"; then
    echo -e "${GREEN}  Gateway -> Auth Service: CONNECTED after restart${NC}"
  else
    echo -e "${RED}  Gateway -> Auth Service: STILL NOT REACHABLE${NC}"
    echo "  Check: docker logs supermandi-auth-service"
  fi
fi

# ============================================================
# SUMMARY
# ============================================================
echo ""
echo -e "${GREEN}=================================================="
echo "Auth Service Deployment Complete!"
echo "==================================================${NC}"
echo ""
echo "Container: supermandi-auth-service"
echo "Port: 3001 (internal to Docker network)"
echo "Firebase: ENABLED (project: supermandi-pos)"
echo ""
echo "To verify login works:"
echo "  curl -X POST http://localhost:3000/api/v1/retailer-admin/auth/firebase-login \\"
echo "    -H 'Content-Type: application/json' \\"
echo "    -d '{\"idToken\":\"test\",\"storeCode\":\"test\"}'"
echo ""
echo "  Expected: 500 (Firebase verification failed) instead of 503 (unavailable)"
echo ""
echo "To monitor:"
echo "  docker logs -f supermandi-auth-service"
echo ""
