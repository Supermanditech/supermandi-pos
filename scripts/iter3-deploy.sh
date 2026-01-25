#!/bin/bash
# ITER3 Deployment Script
# Run this script ON THE VM (ssh supermandi@34.14.220.171)
#
# Pre-requisites:
# 1. Git pull latest from wip/trace-2026-01-15
# 2. Docker containers running (supermandi-main-backend, supermandi-postgres, api-gateway)

set -e

echo "=========================================="
echo "ITER3 Go-Live Deployment"
echo "=========================================="

# Step 1: Pull latest code
echo "[1/6] Pulling latest code..."
cd /home/supermandi/supermandi-pos
git fetch origin
git checkout wip/trace-2026-01-15
git pull origin wip/trace-2026-01-15

# Step 2: Build backend
echo "[2/6] Building backend..."
cd backend
npm run build
cd ..

# Step 3: Run new migrations
echo "[3/6] Running migrations..."

# Migration 040: Payments table and sales status constraint
docker exec -i supermandi-postgres psql -U supermandi -d supermandi << 'SQL'
-- Migration 040: Payments table and sales status fix

BEGIN;

-- GAP-003: payments table
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id VARCHAR(100) NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  mode VARCHAR(20) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  amount_minor INTEGER NOT NULL CHECK (amount_minor >= 0),
  provider_ref VARCHAR(255),
  confirmed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_payment_mode CHECK (mode IN ('CASH', 'UPI', 'DUE')),
  CONSTRAINT chk_payment_status CHECK (status IN ('PENDING', 'PAID', 'FAILED'))
);
CREATE INDEX IF NOT EXISTS payments_sale_idx ON public.payments (sale_id);
CREATE INDEX IF NOT EXISTS payments_status_idx ON public.payments (status) WHERE status = 'PENDING';

-- GAP-004: Fix sales status constraint
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS chk_sale_status;
ALTER TABLE public.sales ADD CONSTRAINT chk_sale_status CHECK (
  status IN ('pending', 'PENDING', 'completed', 'PAID_CASH', 'PAID_UPI', 'DUE', 'cancelled', 'voided')
);

COMMIT;
SQL

# Migration 041: Schema drift fixes
docker exec -i supermandi-postgres psql -U supermandi -d supermandi << 'SQL'
-- Migration 041: Schema drift fixes

BEGIN;

-- GAP-006: Add source column to inventory_ledger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'inventory' AND table_name = 'inventory_ledger' AND column_name = 'source') THEN
    ALTER TABLE inventory.inventory_ledger ADD COLUMN source VARCHAR(50);
  END IF;
END $$;

-- GAP-007: Add missing columns to orders.purchase_orders
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'orders' AND table_name = 'purchase_orders' AND column_name = 'item_count') THEN
    ALTER TABLE orders.purchase_orders ADD COLUMN item_count INTEGER DEFAULT 0;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'orders' AND table_name = 'purchase_orders' AND column_name = 'tracking_number') THEN
    ALTER TABLE orders.purchase_orders ADD COLUMN tracking_number VARCHAR(100);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'orders' AND table_name = 'purchase_orders' AND column_name = 'carrier') THEN
    ALTER TABLE orders.purchase_orders ADD COLUMN carrier VARCHAR(100);
  END IF;
END $$;

-- GAP-009: Add item_name column to sale_items
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'sale_items' AND column_name = 'item_name') THEN
    ALTER TABLE public.sale_items ADD COLUMN item_name VARCHAR(500);
    UPDATE public.sale_items SET item_name = name WHERE item_name IS NULL;
  END IF;
END $$;

COMMIT;
SQL

echo "Migrations complete."

# Step 4: Restart main backend
echo "[4/6] Restarting main backend..."
docker stop supermandi-main-backend 2>/dev/null || true
docker rm supermandi-main-backend 2>/dev/null || true

docker run -d \
  --name supermandi-main-backend \
  --network backend_supermandi-network \
  -e NODE_ENV=production \
  -e DATABASE_URL="postgresql://supermandi:supermandi@postgres:5432/supermandi" \
  -e ADMIN_TOKEN="0d57d3b70e8cab31e2cc50faf363a5c0" \
  -p 3010:3010 \
  -v /home/supermandi/supermandi-pos/backend:/app:ro \
  -w /app \
  node:18-alpine \
  sh -c "npm install --production && node dist/src/server.js"

sleep 5

# Step 5: Verify services
echo "[5/6] Verifying services..."
docker ps --format '{{.Names}}\t{{.Status}}' | grep supermandi

echo ""
echo "Backend health:"
curl -s http://localhost:3010/health 2>/dev/null || echo "Backend starting..."

echo ""
echo "Gateway health:"
curl -s http://localhost:3000/health 2>/dev/null

# Step 6: Verify migrations
echo ""
echo "[6/6] Verifying migrations..."
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "\d+ public.payments" | head -20
docker exec supermandi-postgres psql -U supermandi -d supermandi -c "SELECT column_name FROM information_schema.columns WHERE table_schema='inventory' AND table_name='inventory_ledger' AND column_name='source';"

echo ""
echo "=========================================="
echo "ITER3 Deployment Complete!"
echo "=========================================="
echo ""
echo "Verification commands:"
echo "  curl http://34.14.220.171:3000/api/v1/pos/inventory/stock/PRODUCT_ID -H 'x-device-token: TOKEN'"
echo "  curl http://34.14.220.171:3000/api/v1/admin/stores -H 'x-admin-token: 0d57d3b70e8cab31e2cc50faf363a5c0'"
echo ""
