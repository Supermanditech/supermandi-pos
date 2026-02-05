#!/usr/bin/env bash
# LOCAL-PROD-201: Run full stack from SHA-tagged Docker images (Cloud Run parity)
# Usage: ./scripts/run-local-prod-images.sh --sha <git-sha>
#
# Starts all services using docker compose with the same images
# that would be deployed to Cloud Run / Artifact Registry.
# Requires: ./scripts/build-all-images.sh --sha <sha> to have been run first.

set -euo pipefail

SHA=""
DETACH=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --sha) SHA="$2"; shift 2 ;;
    -d|--detach) DETACH="-d"; shift ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

if [ -z "$SHA" ]; then
  echo "Usage: ./scripts/run-local-prod-images.sh --sha <git-sha> [-d]"
  exit 1
fi

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
REGISTRY="${REGISTRY:-supermandi}"
COMPOSE_FILE="$REPO_ROOT/scripts/docker-compose.local-prod.yml"

# Verify images exist
echo "Verifying SHA-tagged images exist..."
MISSING=0
for svc in api-gateway auth-service catalog-service inventory-service order-service \
           payment-service platform-service reorder-service supplier-service voice-service \
           retailer-admin supplier-portal superadmin landing; do
  if ! docker image inspect "${REGISTRY}/${svc}:${SHA}" > /dev/null 2>&1; then
    echo "  MISSING: ${REGISTRY}/${svc}:${SHA}"
    MISSING=$((MISSING + 1))
  fi
done

if [ $MISSING -gt 0 ]; then
  echo ""
  echo "ERROR: $MISSING images missing. Run first:"
  echo "  ./scripts/build-all-images.sh --sha $SHA"
  exit 1
fi

echo "All 14 images found for SHA: $SHA"

# Generate compose file
echo "Generating docker-compose for SHA: $SHA ..."
cat > "$COMPOSE_FILE" <<YAML
# LOCAL-PROD-201: Auto-generated — do not edit
# SHA: ${SHA}
# Run: docker compose -f scripts/docker-compose.local-prod.yml up
version: "3.8"

services:
  postgres:
    image: postgres:15-alpine
    environment:
      POSTGRES_DB: supermandi
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
    ports: ["5432:5432"]
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U postgres"]
      interval: 5s
      timeout: 3s
      retries: 5

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 3s
      retries: 5

  api-gateway:
    image: ${REGISTRY}/api-gateway:${SHA}
    ports: ["8080:3000"]
    environment:
      PORT: "3000"
      NODE_ENV: production
      ADMIN_SERVICE_URL: http://main-backend:3010
      PAYMENT_SERVICE_URL: http://payment-service:3011
      ADMIN_TOKEN: local-test-token
      JWT_SECRET: local-test-jwt-secret
    depends_on:
      main-backend:
        condition: service_healthy

  main-backend:
    image: ${REGISTRY}/api-gateway:${SHA}
    command: ["node", "dist/index.js"]
    ports: ["3010:3010"]
    environment:
      PORT: "3010"
      NODE_ENV: production
      DB_HOST: postgres
      DB_PORT: "5432"
      DB_NAME: supermandi
      DB_USER: postgres
      DB_PASSWORD: postgres
      REDIS_URL: redis://redis:6379
      ADMIN_TOKEN: local-test-token
      JWT_SECRET: local-test-jwt-secret
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "--no-verbose", "--tries=1", "--spider", "http://localhost:3010/health"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 15s

  auth-service:
    image: ${REGISTRY}/auth-service:${SHA}
    environment:
      PORT: "3001"
      NODE_ENV: production
      DB_HOST: postgres
      DB_NAME: supermandi
      DB_USER: postgres
      DB_PASSWORD: postgres
      JWT_SECRET: local-test-jwt-secret
    depends_on:
      postgres:
        condition: service_healthy

  catalog-service:
    image: ${REGISTRY}/catalog-service:${SHA}
    environment:
      PORT: "3003"
      NODE_ENV: production
      DB_HOST: postgres
      DB_NAME: supermandi
      DB_USER: postgres
      DB_PASSWORD: postgres
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  inventory-service:
    image: ${REGISTRY}/inventory-service:${SHA}
    environment:
      PORT: "3004"
      NODE_ENV: production
      DB_HOST: postgres
      DB_NAME: supermandi
      DB_USER: postgres
      DB_PASSWORD: postgres
    depends_on:
      postgres:
        condition: service_healthy

  order-service:
    image: ${REGISTRY}/order-service:${SHA}
    environment:
      PORT: "3005"
      NODE_ENV: production
      DB_HOST: postgres
      DB_NAME: supermandi
      DB_USER: postgres
      DB_PASSWORD: postgres
      INVENTORY_SERVICE_URL: http://inventory-service:3004
    depends_on:
      postgres:
        condition: service_healthy

  payment-service:
    image: ${REGISTRY}/payment-service:${SHA}
    environment:
      PORT: "3011"
      NODE_ENV: production
      DATABASE_URL: postgresql://postgres:postgres@postgres:5432/supermandi
    depends_on:
      postgres:
        condition: service_healthy

  platform-service:
    image: ${REGISTRY}/platform-service:${SHA}
    environment:
      PORT: "3008"
      NODE_ENV: production
      DB_HOST: postgres
      DB_NAME: supermandi
      DB_USER: postgres
      DB_PASSWORD: postgres
      INVENTORY_SERVICE_URL: http://inventory-service:3004
    depends_on:
      postgres:
        condition: service_healthy

  reorder-service:
    image: ${REGISTRY}/reorder-service:${SHA}
    environment:
      PORT: "3006"
      NODE_ENV: production
      DB_HOST: postgres
      DB_NAME: supermandi
      DB_USER: postgres
      DB_PASSWORD: postgres
      REDIS_URL: redis://redis:6379
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  supplier-service:
    image: ${REGISTRY}/supplier-service:${SHA}
    environment:
      PORT: "3002"
      NODE_ENV: production
      DB_HOST: postgres
      DB_NAME: supermandi
      DB_USER: postgres
      DB_PASSWORD: postgres
      JWT_SECRET: local-test-jwt-secret
    depends_on:
      postgres:
        condition: service_healthy

  voice-service:
    image: ${REGISTRY}/voice-service:${SHA}
    environment:
      PORT: "3009"
      NODE_ENV: production
      ANTHROPIC_API_KEY: \${ANTHROPIC_API_KEY:-sk-test}
    depends_on:
      postgres:
        condition: service_healthy

  retailer-admin:
    image: ${REGISTRY}/retailer-admin:${SHA}
    ports: ["8081:80"]

  supplier-portal:
    image: ${REGISTRY}/supplier-portal:${SHA}
    ports: ["8082:3001"]

  superadmin:
    image: ${REGISTRY}/superadmin:${SHA}
    ports: ["8083:80"]

  landing:
    image: ${REGISTRY}/landing:${SHA}
    ports: ["8084:80"]
YAML

echo ""
echo "Starting local-prod stack (SHA: $SHA)..."
echo "  API Gateway: http://localhost:8080"
echo "  Retailer:    http://localhost:8081"
echo "  Supplier:    http://localhost:8082"
echo "  SuperAdmin:  http://localhost:8083"
echo "  Landing:     http://localhost:8084"
echo ""

docker compose -f "$COMPOSE_FILE" up $DETACH
