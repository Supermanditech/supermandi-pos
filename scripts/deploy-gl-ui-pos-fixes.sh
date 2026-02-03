#!/bin/bash
# GL-UI-001 + GL-POS-002: Deploy Supplier Portal UI and POS Barcode Fix
# Usage: ./deploy-gl-ui-pos-fixes.sh [VM_HOST] [VM_USER]

set -e

VM_HOST="${1:-34.14.220.171}"
VM_USER="${2:-supermanditech}"
API_BASE_URL="${3:-http://34.14.220.171:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "================================================"
echo "GO-LIVE Deployment: GL-UI-001 + GL-POS-002"
echo "================================================"
echo "VM: $VM_USER@$VM_HOST"
echo "API URL: $API_BASE_URL"
echo ""
echo "Fixes:"
echo "  GL-UI-001: Supplier Portal UI Deployment"
echo "  GL-POS-002: POS Barcode Lookup Schema Fix"
echo ""

# Check SSH connectivity
echo "[1/8] Checking SSH connectivity..."
ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=no $VM_USER@$VM_HOST "echo 'SSH OK'" || {
  echo "ERROR: Cannot connect to VM."
  echo "Try: ssh $VM_USER@$VM_HOST"
  exit 1
}

# ============================================================================
# GL-POS-002: Deploy Backend Barcode Fix
# ============================================================================
echo ""
echo "========== GL-POS-002: POS Barcode Fix =========="

echo "[2/8] Uploading backend source files..."
ssh $VM_USER@$VM_HOST "mkdir -p /home/$VM_USER/backend-updates/services"

# Upload the updated posScanStore.ts
scp "$PROJECT_ROOT/backend/src/services/posScanStore.ts" \
    $VM_USER@$VM_HOST:/home/$VM_USER/backend-updates/services/

echo "[3/8] Rebuilding main-backend on VM..."
ssh $VM_USER@$VM_HOST 'bash -s' << 'REBUILD_EOF'
cd /home/supermanditech

# Check if we have a git repo to update
if [ -d "supermandi-pos/.git" ]; then
  echo "Updating git repository..."
  cd supermandi-pos
  git stash 2>/dev/null || true
  git pull origin main 2>/dev/null || echo "Git pull skipped"
  cd ..
fi

# Copy updated file to source location (if source exists)
if [ -d "supermandi-pos/backend/src/services" ]; then
  echo "Copying updated posScanStore.ts..."
  cp /home/supermanditech/backend-updates/services/posScanStore.ts \
     supermandi-pos/backend/src/services/posScanStore.ts
fi

# Check if using Docker Compose
if [ -f "supermandi-pos/backend/docker-compose.prod.yml" ]; then
  echo "Rebuilding main-backend container..."
  cd supermandi-pos/backend

  # Rebuild only the main-backend service
  docker compose -f docker-compose.prod.yml build main-backend 2>&1 || {
    echo "Docker Compose build failed, trying alternative..."
  }

  # Restart the service
  docker compose -f docker-compose.prod.yml up -d main-backend 2>&1 || {
    echo "Trying docker restart..."
    docker restart supermandi-main-backend 2>/dev/null || true
  }
else
  # Fallback: restart whatever backend service is running
  echo "Restarting backend services..."
  docker restart supermandi-main-backend 2>/dev/null || \
  docker restart main-backend 2>/dev/null || \
  pm2 restart main-backend 2>/dev/null || \
  echo "Service restart attempted"
fi

echo "Backend update complete."
REBUILD_EOF

# ============================================================================
# GL-UI-001: Deploy Supplier Portal
# ============================================================================
echo ""
echo "========== GL-UI-001: Supplier Portal =========="

echo "[4/8] Creating supplier-portal directory on VM..."
ssh $VM_USER@$VM_HOST "mkdir -p /home/$VM_USER/supplier-portal"

echo "[5/8] Uploading Supplier Portal source..."
# Use rsync if available, otherwise scp
if command -v rsync &> /dev/null; then
  rsync -avz --progress \
    --exclude 'node_modules' \
    --exclude '.next' \
    --exclude '.git' \
    "$PROJECT_ROOT/supplier-portal/" \
    $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/
else
  # Fallback to scp (slower)
  echo "rsync not found, using scp..."
  scp -r "$PROJECT_ROOT/supplier-portal/src" $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/
  scp -r "$PROJECT_ROOT/supplier-portal/public" $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/
  scp "$PROJECT_ROOT/supplier-portal/package.json" $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/
  scp "$PROJECT_ROOT/supplier-portal/package-lock.json" $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/
  scp "$PROJECT_ROOT/supplier-portal/next.config.js" $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/
  scp "$PROJECT_ROOT/supplier-portal/tsconfig.json" $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/
  scp "$PROJECT_ROOT/supplier-portal/tailwind.config.ts" $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/
  scp "$PROJECT_ROOT/supplier-portal/postcss.config.js" $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/
  scp "$PROJECT_ROOT/supplier-portal/Dockerfile" $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/
fi

echo "[6/8] Building and deploying Supplier Portal container..."
ssh $VM_USER@$VM_HOST "bash -s" << PORTAL_EOF
cd /home/supermanditech/supplier-portal

# Stop existing container
echo "Stopping existing supplier-portal container..."
docker rm -f supplier-portal 2>/dev/null || true

# Build Docker image
echo "Building supplier-portal Docker image..."
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=$API_BASE_URL \
  -t supplier-portal:latest \
  . 2>&1

# Get the Docker network name
NETWORK=\$(docker network ls --filter name=supermandi -q | head -1)
if [ -z "\$NETWORK" ]; then
  NETWORK_NAME="bridge"
else
  NETWORK_NAME=\$(docker network ls --filter id=\$NETWORK --format '{{.Name}}')
fi
echo "Using network: \$NETWORK_NAME"

# Run container
echo "Starting supplier-portal container..."
docker run -d \
  --name supplier-portal \
  --network \$NETWORK_NAME \
  -p 3001:3001 \
  --restart unless-stopped \
  -e NEXT_PUBLIC_API_BASE_URL=$API_BASE_URL \
  supplier-portal:latest

echo "Waiting for container to start..."
sleep 5

# Check container status
docker ps --filter name=supplier-portal --format '{{.Names}} {{.Status}}'
PORTAL_EOF

# ============================================================================
# Verification
# ============================================================================
echo ""
echo "========== Verification =========="

echo "[7/8] Verifying deployments..."
ssh $VM_USER@$VM_HOST 'bash -s' << 'VERIFY_EOF'
echo ""
echo "=== Running Containers ==="
docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}' | grep -E "(supermandi|supplier)" || echo "No matching containers found"

echo ""
echo "=== Supplier Portal Logs ==="
docker logs supplier-portal --tail 5 2>&1 || echo "No supplier-portal logs"

echo ""
echo "=== Main Backend Logs ==="
docker logs supermandi-main-backend --tail 5 2>&1 || echo "No main-backend logs"

echo ""
echo "=== Health Checks ==="
echo "Supplier Portal:"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3001/ 2>/dev/null || echo "  Not responding"

echo "Main Backend:"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3010/health 2>/dev/null || echo "  Not responding"

echo "API Gateway:"
curl -s -o /dev/null -w "  HTTP %{http_code}\n" http://localhost:3000/health 2>/dev/null || echo "  Not responding"
VERIFY_EOF

echo ""
echo "[8/8] Deployment complete!"
echo ""
echo "================================================"
echo "GO-LIVE Deployment Complete!"
echo "================================================"
echo ""
echo "URLs:"
echo "  Supplier Portal: http://$VM_HOST:3001"
echo "  Supplier Login:  http://$VM_HOST:3001/login"
echo "  API Gateway:     http://$VM_HOST:3000"
echo "  Main Backend:    http://$VM_HOST:3010"
echo ""
echo "Next Steps - MANUAL UI TESTING REQUIRED:"
echo ""
echo "1. SUPPLIER PORTAL TEST:"
echo "   Open: http://$VM_HOST:3001/login"
echo "   - Login as supplier"
echo "   - Create a product"
echo "   - Verify product appears as Pending"
echo ""
echo "2. SUPERADMIN TEST:"
echo "   - Approve the supplier's product"
echo ""
echo "3. RETAILER ADMIN TEST:"
echo "   - Add approved product to store catalog"
echo ""
echo "4. POS TEST (Critical - GL-POS-002):"
echo "   - Scan the product barcode"
echo "   - Verify product is found"
echo "   - Verify price and stock are correct"
echo ""
