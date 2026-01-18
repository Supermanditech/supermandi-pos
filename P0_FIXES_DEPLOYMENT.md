# P0 Fixes Deployment - Retailer Portal

## Summary of Fixes

### Fix 1: JWT Issuer Mismatch ("Invalid token" error)
**File:** `backend/services/api-gateway/src/middleware/jwtAuth.ts`
- Gateway now uses configurable `JWT_ISSUER` env var (default: `supermandi-auth`)
- Matches auth-service issuer, resolving "Invalid token" errors

### Fix 2: Schema Corrections (Products/Ledger)
**File:** `backend/services/platform-service/src/routes/retailerPortal.ts`
- Fixed `inventory.inventory` → `inventory.stock_balances`
- Fixed ledger columns: `quantity` → `delta_qty`, `movement_type` → `transaction_type`
- Added `stock_before`, `stock_after` columns

---

## Deployment Instructions (Run on GCP VM)

### Option A: Full Rebuild (Recommended)

```bash
# SSH into VM
gcloud compute ssh supermandi-vm --zone=asia-south1-a

# Navigate to backend
cd ~/supermandi-backend

# Pull latest changes
git pull origin main

# Run deployment script
chmod +x deploy-p0-fixes.sh
./deploy-p0-fixes.sh
```

### Option B: Quick Container Restart

If you already have the latest code on the VM:

```bash
# SSH into VM
cd ~/supermandi-backend

# Rebuild just the affected services
cd services/api-gateway && pnpm build && cd ../..
cd services/platform-service && pnpm build && cd ../..

# Restart via docker-compose
docker-compose -f docker-compose.prod.yml up -d --build api-gateway platform-service

# Or manual restart
docker stop supermandi-api-gateway supermandi-platform-service
docker rm supermandi-api-gateway supermandi-platform-service

# Start with correct env vars
docker run -d --name supermandi-api-gateway \
  --network supermandi-network \
  -p 3000:3000 \
  -e NODE_ENV=production \
  -e JWT_ISSUER=supermandi-auth \
  -e JWT_SECRET="$JWT_SECRET" \
  supermandi-api-gateway:latest

docker run -d --name supermandi-platform-service \
  --network supermandi-network \
  -e NODE_ENV=production \
  supermandi-platform-service:latest
```

### Option C: Hot-patch JS files (Fastest)

Copy the compiled JS directly into running containers:

```bash
# Copy gateway middleware
docker cp services/api-gateway/dist/middleware/jwtAuth.js \
  supermandi-api-gateway:/app/dist/middleware/jwtAuth.js

# Copy platform service routes
docker cp services/platform-service/dist/routes/retailerPortal.js \
  supermandi-platform-service:/app/dist/routes/retailerPortal.js

# Restart containers
docker restart supermandi-api-gateway supermandi-platform-service
```

---

## Verification Steps

### 1. Check Container Health
```bash
docker ps --format "table {{.Names}}\t{{.Status}}" | grep -E "(gateway|platform)"
```

### 2. Test JWT Auth (should not return "Invalid token")
```bash
# Get a token via Firebase login (or dev-bypass in non-prod)
curl -X POST https://supermandi.in/api/v1/retailer-admin/auth/firebase-login \
  -H "Content-Type: application/json" \
  -d '{"idToken": "YOUR_FIREBASE_TOKEN", "storeCode": "DEMO001"}'

# Test protected endpoint with token
curl https://supermandi.in/api/v1/retailer-admin/store \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

### 3. Test Product Creation
```bash
curl -X POST https://supermandi.in/api/v1/retailer-admin/products \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Product",
    "sellPrice": 100,
    "purchasePrice": 80,
    "openingStock": 50
  }'
```

### 4. Check Ledger Entry Created
```bash
curl "https://supermandi.in/api/v1/retailer-admin/inventory/ledger" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

---

## Troubleshooting

### "Invalid token" still appearing
```bash
# Check gateway JWT issuer config
docker exec supermandi-api-gateway env | grep JWT

# Should show: JWT_ISSUER=supermandi-auth
# If not, restart with correct env var
```

### Products not showing
```bash
# Check platform service logs
docker logs supermandi-platform-service --tail 50

# Look for SQL errors related to:
# - inventory.stock_balances
# - inventory.inventory_ledger
```

### Container won't start
```bash
# Check for port conflicts
docker ps -a | grep -E "(3000|3002)"

# Check logs for errors
docker logs supermandi-api-gateway 2>&1 | tail -30
docker logs supermandi-platform-service 2>&1 | tail -30
```
