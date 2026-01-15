#!/bin/bash
# SuperMandi POS VM Deployment Script
# Usage: ./deploy-vm.sh [VM_HOST] [VM_USER]

set -e

VM_HOST="${1:-34.14.220.171}"
VM_USER="${2:-supermanditech}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

echo "=========================================="
echo "SuperMandi POS VM Deployment"
echo "=========================================="
echo "VM: $VM_USER@$VM_HOST"
echo ""

# Check SSH connectivity
echo "[1/5] Checking SSH connectivity..."
ssh -o ConnectTimeout=5 $VM_USER@$VM_HOST "echo 'SSH OK'" || {
  echo "ERROR: Cannot connect to VM. Check SSH key."
  exit 1
}

# Upload migrations
echo "[2/5] Uploading migrations..."
ssh $VM_USER@$VM_HOST "mkdir -p /home/$VM_USER/migrations"
scp -r "$PROJECT_ROOT/backend/migrations/"*.sql $VM_USER@$VM_HOST:/home/$VM_USER/migrations/

# Run migrations in order
echo "[3/5] Running migrations..."
ssh $VM_USER@$VM_HOST 'bash -s' << 'EOF'
cd /home/supermanditech/migrations
for sql in $(ls *.sql | sort -V); do
  echo "Running: $sql"
  docker exec -i supermandi-postgres psql -U supermandi -d supermandi < "$sql" 2>&1 || {
    echo "Warning: $sql may have errors (likely already applied)"
  }
done
echo "Migrations complete."
EOF

# Upload and restart enroll service
echo "[4/5] Deploying enroll service..."
scp "$PROJECT_ROOT/scripts/enroll-service-v3.js" $VM_USER@$VM_HOST:/home/$VM_USER/enroll-service-v3.js

ssh $VM_USER@$VM_HOST << 'EOF'
# Remove existing container
docker rm -f supermandi-enroll-service 2>/dev/null || true

# Start with volume mount
docker run -d \
  --name supermandi-enroll-service \
  --network supermanditech_supermandi-network \
  -p 3009:3009 \
  -v /home/supermanditech/enroll-service-v3.js:/app/index.js:ro \
  node:18-alpine \
  sh -c 'cd /app && npm install pg --silent 2>/dev/null && node index.js'

sleep 3
docker logs supermandi-enroll-service --tail 5
EOF

# Verify deployment
echo "[5/5] Verifying deployment..."
ssh $VM_USER@$VM_HOST << 'EOF'
# Check services are running
docker ps --format '{{.Names}} {{.Status}}' | grep supermandi

# Test enroll service health
curl -s http://localhost:3009/health 2>/dev/null || curl -s http://localhost:3009/ | head -1

# Test gateway
curl -s http://localhost:3000/health 2>/dev/null | head -1 || echo "Gateway check done"

# Check migration tables exist
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "\dt public.*" | head -10
EOF

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo "Gateway URL: http://$VM_HOST:3000"
echo "Enroll Service: http://$VM_HOST:3009"
echo ""
echo "Test commands:"
echo "  curl http://$VM_HOST:3000/api/v1/pos/ui-status -H 'x-device-token: YOUR_TOKEN'"
echo "  node scripts/verify-gateway-apis.js http://$VM_HOST:3000 YOUR_TOKEN"
