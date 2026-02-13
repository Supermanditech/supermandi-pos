#!/bin/bash
# AUD-VM-033 Go-Live Deployment Script
# Run this script ON THE VM: ssh supermandi@34.14.220.171
#
# This deploys the inventory bridge fix (AUD-VM-033) that allows
# sales of catalog-digitised products.

set -e

echo "=========================================="
echo "AUD-VM-033: Go-Live Inventory Bridge Fix"
echo "=========================================="
echo ""
echo "Commit: ed63407"
echo "Fix: Bridge dual inventory systems for stock availability"
echo ""

# Step 1: Pull latest code
echo "[1/5] Pulling latest code..."
cd /home/supermandi/supermandi-pos || cd ~/supermandi-pos
git fetch origin
git checkout wip/trace-2026-01-15
git pull origin wip/trace-2026-01-15

# Verify commit
CURRENT_COMMIT=$(git rev-parse --short HEAD)
echo "Current commit: $CURRENT_COMMIT"
git log -1 --oneline

# Step 2: Build backend
echo ""
echo "[2/5] Building backend..."
cd backend
npm run build

# Step 3: Restart main-backend container
echo ""
echo "[3/5] Restarting main-backend container..."
cd ..
docker restart supermandi-main-backend

# Wait for startup
echo "Waiting for container to start..."
sleep 5

# Step 4: Verify container health
echo ""
echo "[4/5] Verifying container health..."
docker ps --filter "name=supermandi-main-backend" --format "table {{.Names}}\t{{.Status}}"

# Check recent logs for errors
echo ""
echo "Recent backend logs:"
docker logs --tail 20 supermandi-main-backend 2>&1 | grep -E "ERROR|started|listening" || true

# Step 5: Test the fix
echo ""
echo "[5/5] Testing the fix..."
echo ""

# Get a device token (assuming test token works)
DEVICE_TOKEN="tok_glt4vk4ermcmke1x6jj"
STORE_ID="a0000000-0000-0000-0000-000000000001"

# Test 1: Verify products list
echo "Test 1: Products list..."
curl -s "http://localhost:3000/api/v1/pos/store-products/list?limit=3" \
  -H "x-device-token: $DEVICE_TOKEN" | head -c 200
echo ""
echo ""

# Test 2: Try a sale with storeProductId
echo "Test 2: Testing sales with storeProductId..."
# Get first product ID
PRODUCT_ID=$(curl -s "http://localhost:3000/api/v1/pos/store-products/list?limit=1" \
  -H "x-device-token: $DEVICE_TOKEN" | grep -o '"storeProductId":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -n "$PRODUCT_ID" ]; then
  echo "Testing with product: $PRODUCT_ID"
  SALE_RESULT=$(curl -s -X POST "http://localhost:3000/api/v1/pos/sales" \
    -H "x-device-token: $DEVICE_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"items\":[{\"storeProductId\":\"$PRODUCT_ID\",\"quantity\":1,\"priceMinor\":1000}]}")
  echo "Sale result: $SALE_RESULT"

  # Check if it's no longer "insufficient_stock"
  if echo "$SALE_RESULT" | grep -q "insufficient_stock"; then
    echo ""
    echo "WARNING: Still getting insufficient_stock. Check inventory.stock_balances"
    echo "May need to seed stock_balances for catalog products."
  elif echo "$SALE_RESULT" | grep -q '"success":true\|saleId'; then
    echo ""
    echo "SUCCESS: Sale endpoint working correctly!"
  fi
else
  echo "No products found to test"
fi

echo ""
echo "=========================================="
echo "Deployment Complete!"
echo "=========================================="
echo ""
echo "Key fixes deployed:"
echo "- AUD-VM-033: Dual inventory system bridge"
echo "- AUD-VM-031: storeProductId support for price/stock"
echo "- AUD-VM-042: Sales with catalog products"
echo "- AUD-VM-043: Stock-in with correct schema references"
echo ""
echo "Next steps:"
echo "1. Verify sales work on POS app"
echo "2. Monitor docker logs: docker logs -f supermandi-main-backend"
echo "3. Check for errors in logs"
