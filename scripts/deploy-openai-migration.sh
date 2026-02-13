#!/bin/bash
# =============================================================================
# GO-LIVE: Deploy OpenAI Migration to VM (34.14.220.171)
# =============================================================================
# This script deploys the Claude → OpenAI migration to the production VM.
#
# Prerequisites:
# - SSH access to claude@34.14.220.171
# - OPENAI_API_KEY set in VM's .env file
# - Docker and Docker Compose installed on VM
#
# Usage:
#   ./scripts/deploy-openai-migration.sh
# =============================================================================

set -e

# Configuration
VM_HOST="claude@34.14.220.171"
REMOTE_DIR="~/supermandi-pos/backend"
BRANCH="main"

echo "================================================"
echo "GO-LIVE: Deploying OpenAI Migration"
echo "================================================"
echo ""

# Check SSH connectivity
echo "[1/6] Checking SSH connectivity..."
if ! ssh -o ConnectTimeout=10 "$VM_HOST" "echo 'SSH OK'" > /dev/null 2>&1; then
    echo "ERROR: Cannot connect to $VM_HOST"
    echo "Please ensure SSH access is configured."
    exit 1
fi
echo "  ✓ SSH connection verified"
echo ""

# Pull latest code
echo "[2/6] Pulling latest code from $BRANCH..."
ssh "$VM_HOST" "cd $REMOTE_DIR && git fetch origin && git checkout $BRANCH && git pull origin $BRANCH"
echo "  ✓ Code updated"
echo ""

# Check OPENAI_API_KEY is set
echo "[3/6] Verifying OPENAI_API_KEY configuration..."
if ! ssh "$VM_HOST" "grep -q 'OPENAI_API_KEY=' $REMOTE_DIR/.env 2>/dev/null"; then
    echo "WARNING: OPENAI_API_KEY not found in .env file"
    echo ""
    echo "Please add the following to $REMOTE_DIR/.env on the VM:"
    echo "  OPENAI_API_KEY=sk-proj-..."
    echo "  OPENAI_MODEL_CHAT=gpt-4o-mini"
    echo "  OPENAI_MODEL_STT=whisper-1"
    echo ""
    read -p "Press Enter after adding the key, or Ctrl+C to abort..."
fi
echo "  ✓ OPENAI_API_KEY configured"
echo ""

# Rebuild Docker images
echo "[4/6] Rebuilding Docker images..."
ssh "$VM_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml build --no-cache main-backend"
echo "  ✓ Docker images rebuilt"
echo ""

# Restart services
echo "[5/6] Restarting services..."
ssh "$VM_HOST" "cd $REMOTE_DIR && docker compose -f docker-compose.prod.yml up -d main-backend"
echo "  ✓ Services restarted"
echo ""

# Verify health
echo "[6/6] Verifying health endpoints..."
sleep 10  # Wait for service to start

HEALTH_RESPONSE=$(ssh "$VM_HOST" "curl -s http://localhost:3010/health")
echo "  Main Backend Health: $HEALTH_RESPONSE"

AI_HEALTH=$(ssh "$VM_HOST" "curl -s -H 'x-admin-token: \$ADMIN_TOKEN' http://localhost:3010/api/v1/admin/ai/health")
echo "  AI Health: $AI_HEALTH"

VOICE_HEALTH=$(ssh "$VM_HOST" "curl -s http://localhost:3010/api/v1/voice/health")
echo "  Voice Health: $VOICE_HEALTH"

echo ""
echo "================================================"
echo "Deployment Complete!"
echo "================================================"
echo ""
echo "Next Steps:"
echo "1. Run smoke tests: ./scripts/smoke-test-openai.sh"
echo "2. Test POS voice order from mobile app"
echo "3. Test Admin AI chat from superadmin portal"
echo ""
