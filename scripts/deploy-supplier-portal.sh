#!/bin/bash
# GL-UI-001: Deploy Supplier Portal UI on VM
# Usage: ./deploy-supplier-portal.sh [VM_HOST] [VM_USER] [API_BASE_URL]

set -e

VM_HOST="${1:-34.14.220.171}"
VM_USER="${2:-supermanditech}"
API_BASE_URL="${3:-http://34.14.220.171:3000}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
SUPPLIER_PORTAL_DIR="$PROJECT_ROOT/supplier-portal"

echo "=========================================="
echo "Supplier Portal Deployment (GL-UI-001)"
echo "=========================================="
echo "VM: $VM_USER@$VM_HOST"
echo "API URL: $API_BASE_URL"
echo ""

# Verify supplier-portal directory exists
if [ ! -d "$SUPPLIER_PORTAL_DIR" ]; then
  echo "ERROR: supplier-portal directory not found at $SUPPLIER_PORTAL_DIR"
  exit 1
fi

# Check SSH connectivity
echo "[1/6] Checking SSH connectivity..."
ssh -o ConnectTimeout=5 $VM_USER@$VM_HOST "echo 'SSH OK'" || {
  echo "ERROR: Cannot connect to VM. Check SSH key."
  exit 1
}

# Create deployment directory on VM
echo "[2/6] Creating deployment directory on VM..."
ssh $VM_USER@$VM_HOST "mkdir -p /home/$VM_USER/supplier-portal"

# Upload source files (excluding node_modules and .next)
echo "[3/6] Uploading source files..."
rsync -avz --progress \
  --exclude 'node_modules' \
  --exclude '.next' \
  --exclude '.git' \
  "$SUPPLIER_PORTAL_DIR/" \
  $VM_USER@$VM_HOST:/home/$VM_USER/supplier-portal/

# Build and deploy on VM
echo "[4/6] Building and deploying container..."
ssh $VM_USER@$VM_HOST << EOF
cd /home/supermanditech/supplier-portal

# Stop and remove existing container
docker rm -f supplier-portal 2>/dev/null || true

# Build image with API URL baked in
docker build \
  --build-arg NEXT_PUBLIC_API_BASE_URL=$API_BASE_URL \
  -t supplier-portal:latest \
  .

# Run container
docker run -d \
  --name supplier-portal \
  --network supermanditech_supermandi-network \
  -p 3001:3001 \
  --restart unless-stopped \
  supplier-portal:latest

echo "Waiting for container to start..."
sleep 5
EOF

# Verify deployment
echo "[5/6] Verifying deployment..."
ssh $VM_USER@$VM_HOST << 'EOF'
# Check container is running
echo "Container status:"
docker ps --filter name=supplier-portal --format '{{.Names}} {{.Status}}'

# Check logs for errors
echo ""
echo "Recent logs:"
docker logs supplier-portal --tail 10 2>&1

# Test portal is responding
echo ""
echo "Testing portal..."
curl -s -o /dev/null -w "HTTP Status: %{http_code}\n" http://localhost:3001/ || echo "Warning: Portal may still be starting"
EOF

# Output access info
echo ""
echo "[6/6] Deployment complete!"
echo ""
echo "=========================================="
echo "Supplier Portal Deployed Successfully!"
echo "=========================================="
echo ""
echo "Portal URL: http://$VM_HOST:3001"
echo "Login Page: http://$VM_HOST:3001/login"
echo ""
echo "Verification commands:"
echo "  curl http://$VM_HOST:3001/"
echo "  docker logs supplier-portal -f"
echo ""
echo "Acceptance Criteria Check:"
echo "  1. Open http://$VM_HOST:3001/login in browser"
echo "  2. Login with supplier credentials"
echo "  3. Create a product via UI"
echo "  4. Verify product appears in pending state"
echo ""
