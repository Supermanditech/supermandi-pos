#!/bin/bash
# VM Deployment Script for GO-LIVE Fixes
# Date: 2026-01-16
# Fixes: DEV-072 (UUID validation + barcode resolution in sales, productId lookup in policies)

set -e

echo "=== SuperMandi VM Patch Deployment ==="
echo "Date: $(date)"
echo ""

# Step 1: Check which containers are running
echo "Step 1: Checking running containers..."
docker ps --format "table {{.Names}}\t{{.Image}}\t{{.Status}}"
echo ""

# Step 2: Find the main backend container (handles sales)
# Look for container that has the sales.js route
echo "Step 2: Finding main backend container..."
MAIN_CONTAINER=$(docker ps --format '{{.Names}}' | grep -E 'main|enroll|api' | head -1)
if [ -z "$MAIN_CONTAINER" ]; then
    echo "ERROR: Could not find main backend container"
    echo "Available containers:"
    docker ps --format '{{.Names}}'
    exit 1
fi
echo "Found: $MAIN_CONTAINER"
echo ""

# Step 3: Backup existing files
echo "Step 3: Backing up existing files..."
docker exec $MAIN_CONTAINER cp /app/dist/routes/v1/pos/sales.js /app/dist/routes/v1/pos/sales.js.bak 2>/dev/null || echo "No existing sales.js to backup"
echo "Backup complete"
echo ""

# Step 4: Copy patched sales.js to container
echo "Step 4: Deploying patched sales.js..."
docker cp ~/vm-patches/sales.js $MAIN_CONTAINER:/app/dist/routes/v1/pos/sales.js
echo "Done"
echo ""

# Step 5: Find reorder-service container
echo "Step 5: Finding reorder-service container..."
REORDER_CONTAINER=$(docker ps --format '{{.Names}}' | grep -i reorder | head -1)
if [ -n "$REORDER_CONTAINER" ]; then
    echo "Found: $REORDER_CONTAINER"

    # Backup and deploy policies.js
    docker exec $REORDER_CONTAINER cp /app/dist/routes/policies.js /app/dist/routes/policies.js.bak 2>/dev/null || echo "No existing policies.js to backup"
    docker cp ~/vm-patches/policies.js $REORDER_CONTAINER:/app/dist/routes/policies.js
    echo "Deployed patched policies.js"
else
    echo "WARNING: Could not find reorder-service container"
fi
echo ""

# Step 6: Restart containers to apply changes
echo "Step 6: Restarting containers..."
docker restart $MAIN_CONTAINER
[ -n "$REORDER_CONTAINER" ] && docker restart $REORDER_CONTAINER
echo "Containers restarted"
echo ""

# Step 7: Verify containers are healthy
echo "Step 7: Verifying containers are running..."
sleep 5
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "$MAIN_CONTAINER|$REORDER_CONTAINER"
echo ""

echo "=== Deployment Complete ==="
echo ""
echo "Test endpoints:"
echo "  POST /api/v1/pos/sales (with barcode as productId)"
echo "  PATCH /api/v1/reorder/stores/{storeId}/reorder/policies/{productId}"
