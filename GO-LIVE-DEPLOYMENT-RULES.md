# SuperMandi Go-Live Deployment Rules & Batches

**Domain**: supermandi.tech
**VM IP**: 34.14.220.171
**Date**: 2026-01-29

---

## Deployment Philosophy

```
Every ticket must pass through:

  ┌─────────────────────────────────────────────────────────────┐
  │  DEVELOP → REVIEW → TEST → STAGE → DEPLOY → VERIFY → DONE  │
  └─────────────────────────────────────────────────────────────┘

Claude tests as real user before marking DONE.
```

---

## Deployment Batches

```
BATCH 1: Foundation          [Infrastructure]
BATCH 2: Core Services       [Backend + Database]
BATCH 3: Landing + Admin     [Frontend - Admin]
BATCH 4: Retailer Portal     [Frontend - Retailer]
BATCH 5: Supplier Portal     [Frontend - Supplier]
BATCH 6: Mobile App          [POS Device]
BATCH 7: Operations          [Monitoring + Backups]
BATCH 8: Go-Live             [Final Verification]
```

---

# BATCH 1: FOUNDATION

## Purpose
Set up infrastructure before any application deployment.

---

### TICKET-001: Configure DNS Records

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Infrastructure** | Hostinger DNS panel access required |
| **Records** | A records for @, www, api pointing to VM |
| **Propagation** | Wait up to 48 hours for global propagation |
| **Verification** | Must resolve from multiple locations |

#### Tasks
```
□ Login to Hostinger hPanel
□ Navigate to DNS/Nameservers
□ Add A Record: @ → 34.14.220.171
□ Add A Record: www → 34.14.220.171
□ Add A Record: api → 34.14.220.171
□ Save changes
□ Wait for propagation (check every 30 mins)
```

#### Claude Test (as real user)
```bash
# Test 1: Verify DNS resolution
nslookup supermandi.tech
# Expected: 34.14.220.171

# Test 2: Verify www
nslookup www.supermandi.tech
# Expected: 34.14.220.171

# Test 3: Verify api subdomain
nslookup api.supermandi.tech
# Expected: 34.14.220.171

# Test 4: Verify from different DNS
nslookup supermandi.tech 8.8.8.8
# Expected: 34.14.220.171
```

#### Acceptance Criteria
- [ ] All 3 domains resolve to VM IP
- [ ] Resolution works from Google DNS (8.8.8.8)
- [ ] No NXDOMAIN errors

#### Rollback
```
If failed: Revert DNS records in Hostinger panel
```

---

### TICKET-002: Generate SSL Certificates

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Prerequisite** | TICKET-001 must be DONE |
| **Tool** | Certbot with nginx plugin |
| **Domains** | Single cert for all 3 domains |
| **Renewal** | Auto-renewal must be configured |

#### Tasks
```
□ SSH to VM
□ Install certbot: sudo apt install certbot python3-certbot-nginx
□ Stop nginx temporarily: sudo systemctl stop nginx
□ Generate cert:
  sudo certbot certonly --standalone \
    -d supermandi.tech \
    -d www.supermandi.tech \
    -d api.supermandi.tech
□ Verify cert files exist
□ Test auto-renewal
□ Start nginx: sudo systemctl start nginx
```

#### Claude Test (as real user)
```bash
# Test 1: Verify cert files
ls -la /etc/letsencrypt/live/supermandi.tech/
# Expected: fullchain.pem, privkey.pem, cert.pem, chain.pem

# Test 2: Check cert validity
sudo openssl x509 -in /etc/letsencrypt/live/supermandi.tech/fullchain.pem -text -noout | grep -A2 "Validity"
# Expected: Valid dates shown

# Test 3: Test renewal
sudo certbot renew --dry-run
# Expected: "Congratulations, all renewals succeeded"

# Test 4: Check all domains in cert
sudo openssl x509 -in /etc/letsencrypt/live/supermandi.tech/fullchain.pem -text -noout | grep DNS
# Expected: DNS:supermandi.tech, DNS:www.supermandi.tech, DNS:api.supermandi.tech
```

#### Acceptance Criteria
- [ ] Certificate files exist
- [ ] Certificate valid for 90 days
- [ ] All 3 domains in certificate
- [ ] Auto-renewal test passes

#### Rollback
```
If failed: sudo certbot delete --cert-name supermandi.tech
```

---

### TICKET-003: Configure Nginx

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Prerequisite** | TICKET-002 must be DONE |
| **Config Location** | /etc/nginx/sites-available/supermandi.tech |
| **SSL** | TLS 1.2+ only, strong ciphers |
| **Security Headers** | HSTS, X-Frame-Options, CSP |
| **Proxy** | WebSocket support for real-time features |

#### Tasks
```
□ Create nginx config file
□ Enable site: ln -s /etc/nginx/sites-available/supermandi.tech /etc/nginx/sites-enabled/
□ Test config: sudo nginx -t
□ Reload: sudo nginx -s reload
□ Verify HTTPS redirect
□ Verify all paths
```

#### Nginx Config
```nginx
# /etc/nginx/sites-available/supermandi.tech

# Rate limiting
limit_req_zone $binary_remote_addr zone=general:10m rate=30r/m;
limit_req_zone $binary_remote_addr zone=auth:10m rate=5r/m;

# HTTP → HTTPS redirect
server {
    listen 80;
    listen [::]:80;
    server_name supermandi.tech www.supermandi.tech api.supermandi.tech;
    return 301 https://$host$request_uri;
}

# Main Website
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name supermandi.tech www.supermandi.tech;

    # SSL
    ssl_certificate /etc/letsencrypt/live/supermandi.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/supermandi.tech/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_prefer_server_ciphers on;
    ssl_ciphers ECDHE-ECDSA-AES128-GCM-SHA256:ECDHE-RSA-AES128-GCM-SHA256;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header X-XSS-Protection "1; mode=block" always;

    # Root
    root /var/www/supermandi;
    index index.html;

    # Landing Page
    location / {
        try_files $uri $uri/ /index.html;
    }

    # Admin Portal
    location /admin {
        alias /var/www/supermandi-superadmin;
        try_files $uri $uri/ /admin/index.html;
    }

    # Retailer Portal
    location /retailer {
        alias /var/www/retailer-admin;
        try_files $uri $uri/ /retailer/index.html;
    }

    # Supplier Portal
    location /supplier {
        alias /var/www/supplier-portal;
        try_files $uri $uri/ /supplier/index.html;
    }

    # Gzip
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml;
}

# API Gateway
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name api.supermandi.tech;

    # SSL
    ssl_certificate /etc/letsencrypt/live/supermandi.tech/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/supermandi.tech/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Security Headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Content-Type-Options "nosniff" always;

    # Auth endpoints - strict rate limit
    location /api/v1/auth {
        limit_req zone=auth burst=5 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }

    # All other API routes
    location / {
        limit_req zone=general burst=20 nodelay;
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
    }
}
```

#### Claude Test (as real user)
```bash
# Test 1: Config syntax
sudo nginx -t
# Expected: "syntax is ok", "test is successful"

# Test 2: HTTP redirect
curl -I http://supermandi.tech
# Expected: 301 redirect to https

# Test 3: HTTPS working
curl -I https://supermandi.tech
# Expected: 200 OK (or 404 if no content yet)

# Test 4: Security headers
curl -I https://supermandi.tech | grep -E "(Strict-Transport|X-Frame|X-Content)"
# Expected: All 3 headers present

# Test 5: API proxy (after backend deployed)
curl https://api.supermandi.tech/health
# Expected: {"status":"ok"}
```

#### Acceptance Criteria
- [ ] Nginx config valid
- [ ] HTTP redirects to HTTPS
- [ ] Security headers present
- [ ] All location blocks configured

#### Rollback
```
sudo rm /etc/nginx/sites-enabled/supermandi.tech
sudo nginx -s reload
```

---

### TICKET-004: Deploy Landing Page

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Prerequisite** | TICKET-003 must be DONE |
| **UI** | Vercel-style, minimal, B&W |
| **UX** | 3 login buttons in nav (Supplier, Retailer, Admin) |
| **Performance** | < 1s load time |
| **Mobile** | Fully responsive |

#### Tasks
```
□ Create directory: sudo mkdir -p /var/www/supermandi
□ Copy landing page from local
□ Set ownership: sudo chown -R www-data:www-data /var/www/supermandi
□ Set permissions: sudo chmod -R 755 /var/www/supermandi
□ Verify in browser
```

#### Deployment Commands
```bash
# From local machine
scp supermandi-landing/index.html supermanditech@34.14.220.171:/tmp/

# On VM
sudo mkdir -p /var/www/supermandi
sudo mv /tmp/index.html /var/www/supermandi/
sudo chown -R www-data:www-data /var/www/supermandi
```

#### Claude Test (as real user)
```
□ Open https://supermandi.tech in browser
□ Verify: Logo "supermandi" visible top-left
□ Verify: "Supplier" button in nav
□ Verify: "Retailer" button in nav
□ Verify: "Admin" button in nav (outlined style)
□ Verify: Hero text "The infrastructure retail runs on."
□ Verify: Footer with "supermandi.tech"
□ Click Supplier → goes to /supplier
□ Click Retailer → goes to /retailer
□ Click Admin → goes to /admin
□ Test on mobile (responsive check)
□ Check page load time < 1s
```

#### Acceptance Criteria
- [ ] Page loads at https://supermandi.tech
- [ ] All 3 login buttons visible and clickable
- [ ] Mobile responsive
- [ ] Load time < 1 second
- [ ] No console errors

#### Rollback
```
sudo rm /var/www/supermandi/index.html
```

---

### TICKET-005: Secure Production Credentials

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Security** | No default passwords in production |
| **Complexity** | Min 32 chars for passwords, 64 for JWT |
| **Storage** | .env.prod file with restricted permissions |
| **Rotation** | Document all rotated credentials |

#### Tasks
```
□ Generate PostgreSQL password (32+ chars)
□ Generate Redis password (32+ chars)
□ Generate JWT_SECRET (64+ chars)
□ Generate ADMIN_TOKEN (32+ chars)
□ Update .env.prod on VM
□ Restart services
□ Verify connections
```

#### Credential Generation
```bash
# Generate secure passwords
openssl rand -base64 32  # For DB/Redis passwords
openssl rand -base64 48  # For JWT_SECRET
openssl rand -hex 16     # For ADMIN_TOKEN
```

#### .env.prod Template
```env
NODE_ENV=production

# Database
DATABASE_URL=postgresql://supermandi:<NEW_DB_PASSWORD>@localhost:5432/supermandi
POSTGRES_PASSWORD=<NEW_DB_PASSWORD>

# Redis
REDIS_URL=redis://:<NEW_REDIS_PASSWORD>@localhost:6379
REDIS_PASSWORD=<NEW_REDIS_PASSWORD>

# Auth
JWT_SECRET=<NEW_64_CHAR_SECRET>
JWT_ISSUER=supermandi-auth
JWT_ACCESS_TTL=24h
JWT_REFRESH_TTL=7d

# Admin
ADMIN_TOKEN=<NEW_32_CHAR_TOKEN>

# API
API_URL=https://api.supermandi.tech
CORS_ORIGINS=https://supermandi.tech,https://www.supermandi.tech

# Firebase
FIREBASE_ENABLED=true
FIREBASE_SERVICE_ACCOUNT_PATH=/etc/supermandi/firebase-service-account.json
FIREBASE_PROJECT_ID=supermandi-pos

# OpenAI (Voice)
OPENAI_API_KEY=<EXISTING_KEY>
```

#### Claude Test (as real user)
```bash
# Test 1: Verify no default passwords
grep -E "(supermandi_dev|password123|changeme)" .env.prod
# Expected: No matches

# Test 2: Verify password length
cat .env.prod | grep PASSWORD | awk -F= '{print length($2)}'
# Expected: All > 32

# Test 3: Test DB connection
psql $DATABASE_URL -c "SELECT 1"
# Expected: Connection successful

# Test 4: Test Redis connection
redis-cli -a $REDIS_PASSWORD ping
# Expected: PONG

# Test 5: Verify file permissions
ls -la .env.prod
# Expected: -rw------- (600)
```

#### Acceptance Criteria
- [ ] All passwords > 32 characters
- [ ] JWT_SECRET > 64 characters
- [ ] No default/dev passwords
- [ ] Database connection works
- [ ] Redis connection works
- [ ] File permissions 600

#### Rollback
```
Keep backup of old .env.prod before changes
```

---

### TICKET-006: Configure Firebase Production

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Prerequisite** | Firebase project exists |
| **Auth** | Phone authentication enabled |
| **Domains** | Production domains authorized |
| **Service Account** | Secure storage on VM |

#### Tasks
```
□ Firebase Console → Authentication → Settings
□ Add authorized domains
□ Generate service account key
□ Upload to VM
□ Set file permissions
□ Update .env.prod
□ Test OTP flow
```

#### Firebase Console Steps
```
1. Go to: https://console.firebase.google.com
2. Select project: supermandi-pos
3. Authentication → Settings → Authorized domains
4. Add:
   - supermandi.tech
   - www.supermandi.tech
5. Project Settings → Service accounts
6. Generate new private key
7. Download JSON file
```

#### VM Setup
```bash
# Create secure directory
sudo mkdir -p /etc/supermandi
sudo chmod 700 /etc/supermandi

# Upload service account
scp firebase-service-account.json supermanditech@34.14.220.171:/tmp/
sudo mv /tmp/firebase-service-account.json /etc/supermandi/
sudo chmod 600 /etc/supermandi/firebase-service-account.json
sudo chown root:root /etc/supermandi/firebase-service-account.json
```

#### Claude Test (as real user)
```bash
# Test 1: Verify file exists
sudo ls -la /etc/supermandi/firebase-service-account.json
# Expected: File exists with 600 permissions

# Test 2: Verify JSON valid
sudo cat /etc/supermandi/firebase-service-account.json | jq .project_id
# Expected: "supermandi-pos"

# Test 3: Verify domains in Firebase Console
# Manual check in Firebase Console

# Test 4: Test OTP (after app deployed)
# Send OTP to test phone number
# Verify SMS received
```

#### Acceptance Criteria
- [ ] Service account file on VM
- [ ] File permissions 600
- [ ] Domains added to Firebase
- [ ] OTP SMS sends successfully

#### Rollback
```
sudo rm /etc/supermandi/firebase-service-account.json
```

---

# BATCH 2: CORE SERVICES

## Purpose
Deploy backend services and database.

## Prerequisites
- BATCH 1 complete
- All TICKET-001 to TICKET-006 DONE

---

### TICKET-007: Deploy Backend Services

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Prerequisite** | BATCH 1 complete |
| **Docker** | Use docker-compose.prod.yml |
| **Health** | All services must pass health checks |
| **Logs** | Verify no errors in startup logs |

#### Tasks
```
□ Pull latest code on VM
□ Update .env.prod
□ Build Docker images
□ Start services
□ Verify health endpoints
□ Check logs for errors
```

#### Deployment Commands
```bash
# On VM
cd /home/supermanditech/supermandi-pos/backend

# Pull latest
git pull origin main

# Build images
docker-compose -f docker-compose.prod.yml build

# Start services
docker-compose -f docker-compose.prod.yml up -d

# Check status
docker-compose -f docker-compose.prod.yml ps

# View logs
docker-compose -f docker-compose.prod.yml logs -f --tail=100
```

#### Claude Test (as real user)
```bash
# Test 1: All containers running
docker-compose -f docker-compose.prod.yml ps
# Expected: All services "Up" status

# Test 2: API Gateway health
curl http://localhost:3000/health
# Expected: {"status":"ok"}

# Test 3: Main backend health
curl http://localhost:3010/health
# Expected: {"status":"ok"}

# Test 4: External API health
curl https://api.supermandi.tech/health
# Expected: {"status":"ok"}

# Test 5: No errors in logs
docker-compose -f docker-compose.prod.yml logs | grep -i error
# Expected: No critical errors

# Test 6: Database connected
docker-compose -f docker-compose.prod.yml exec main-backend npm run db:check
# Expected: Connection successful
```

#### Acceptance Criteria
- [ ] All Docker containers running
- [ ] Health check returns 200
- [ ] No errors in startup logs
- [ ] External API accessible
- [ ] Database connected

#### Rollback
```bash
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --scale main-backend=0
# Restore previous image version
```

---

### TICKET-008: Run Database Migrations

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Prerequisite** | TICKET-007 services running |
| **Backup** | Backup before migration |
| **Order** | Migrations run in sequence |
| **Verify** | All tables and indexes created |

#### Tasks
```
□ Backup existing database
□ Run migrations
□ Verify tables created
□ Verify indexes created
□ Verify seed data
```

#### Commands
```bash
# Backup first
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U supermandi supermandi > backup_$(date +%Y%m%d).sql

# Run migrations
docker-compose -f docker-compose.prod.yml exec main-backend npm run migrate:prod

# Or run migration script directly
node scripts/migrate-prod.js
```

#### Claude Test (as real user)
```bash
# Test 1: Verify all tables exist
docker-compose -f docker-compose.prod.yml exec postgres psql -U supermandi -d supermandi -c "\dt *.*"
# Expected: All schema tables listed

# Test 2: Verify key tables
docker-compose -f docker-compose.prod.yml exec postgres psql -U supermandi -d supermandi -c "
SELECT table_schema, table_name FROM information_schema.tables
WHERE table_schema IN ('platform', 'auth', 'catalog', 'inventory', 'orders')
ORDER BY table_schema, table_name;"
# Expected: platform.stores, platform.devices, auth.users, catalog.products, etc.

# Test 3: Verify indexes
docker-compose -f docker-compose.prod.yml exec postgres psql -U supermandi -d supermandi -c "
SELECT indexname FROM pg_indexes WHERE schemaname NOT IN ('pg_catalog');"
# Expected: Multiple indexes listed

# Test 4: Verify can insert/select
docker-compose -f docker-compose.prod.yml exec postgres psql -U supermandi -d supermandi -c "
SELECT COUNT(*) FROM platform.stores;"
# Expected: Returns count (may be 0)
```

#### Acceptance Criteria
- [ ] All migrations completed
- [ ] All tables created
- [ ] All indexes created
- [ ] No migration errors
- [ ] Backup exists

#### Rollback
```bash
# Restore from backup
docker-compose -f docker-compose.prod.yml exec -T postgres psql -U supermandi supermandi < backup_YYYYMMDD.sql
```

---

### TICKET-009: API Gateway Testing

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Prerequisite** | TICKET-007, TICKET-008 complete |
| **Coverage** | Test all route groups |
| **Auth** | Test with and without tokens |
| **Errors** | Proper error responses |

#### API Routes to Test

| Route Group | Endpoint | Auth Required |
|-------------|----------|---------------|
| Health | GET /health | No |
| Auth | POST /api/v1/auth/* | No |
| Admin | GET /api/v1/admin/* | Admin Token |
| POS | POST /api/v1/pos/* | Device JWT |
| Retailer | GET /api/v1/retailer-admin/* | User JWT |
| Supplier | GET /api/v1/supplier/* | User JWT |
| Voice | POST /api/v1/voice/* | Device JWT |

#### Claude Test (as real user)
```bash
# Test 1: Health check
curl -s https://api.supermandi.tech/health | jq
# Expected: {"status":"ok","timestamp":"..."}

# Test 2: Auth endpoint (no auth required)
curl -s -X POST https://api.supermandi.tech/api/v1/auth/request-otp \
  -H "Content-Type: application/json" \
  -d '{"phone":"+919999999999"}' | jq
# Expected: {"success":true} or validation error

# Test 3: Admin endpoint without token
curl -s https://api.supermandi.tech/api/v1/admin/stores | jq
# Expected: 401 Unauthorized

# Test 4: Admin endpoint with token
curl -s https://api.supermandi.tech/api/v1/admin/stores \
  -H "x-admin-token: <ADMIN_TOKEN>" | jq
# Expected: {"stores":[...]}

# Test 5: CORS headers
curl -s -I -X OPTIONS https://api.supermandi.tech/api/v1/auth/login \
  -H "Origin: https://supermandi.tech" \
  -H "Access-Control-Request-Method: POST"
# Expected: Access-Control-Allow-Origin: https://supermandi.tech

# Test 6: Rate limiting
for i in {1..10}; do curl -s -o /dev/null -w "%{http_code}\n" https://api.supermandi.tech/api/v1/auth/request-otp -X POST; done
# Expected: Eventually returns 429

# Test 7: Invalid route
curl -s https://api.supermandi.tech/api/v1/invalid | jq
# Expected: 404 Not Found
```

#### Acceptance Criteria
- [ ] Health endpoint returns 200
- [ ] Auth endpoints accessible
- [ ] Admin endpoints require token
- [ ] CORS headers correct
- [ ] Rate limiting working
- [ ] Proper error responses

#### Rollback
```
N/A - Testing only
```

---

# BATCH 3: LANDING + ADMIN

## Purpose
Deploy Admin Portal with landing page already live.

## Prerequisites
- BATCH 1, BATCH 2 complete

---

### TICKET-010: Build Admin Portal for Production

#### Rules

| Layer | Requirement |
|-------|-------------|
| **UI** | Consistent with landing page style |
| **UX** | Token-based authentication |
| **API** | All calls to api.supermandi.tech |
| **Build** | Vite production build |
| **Base Path** | /admin/ |

#### Tasks
```
□ Update vite.config.ts with base path
□ Update .env.production
□ Install dependencies
□ Build production bundle
□ Deploy to VM
□ Verify in browser
```

#### Local Build
```bash
cd supermandi-superadmin

# Update vite.config.ts
# base: '/admin/'

# Create .env.production
cat > .env.production << EOF
VITE_API_URL=https://api.supermandi.tech
VITE_ADMIN_TOKEN=<ADMIN_TOKEN>
EOF

# Install & build
npm install
npm run build

# Verify build
ls -la dist/
```

#### Deploy to VM
```bash
# Create directory on VM
ssh supermanditech@34.14.220.171 "sudo mkdir -p /var/www/supermandi-superadmin"

# Copy build files
scp -r dist/* supermanditech@34.14.220.171:/tmp/superadmin/
ssh supermanditech@34.14.220.171 "sudo mv /tmp/superadmin/* /var/www/supermandi-superadmin/"
ssh supermanditech@34.14.220.171 "sudo chown -R www-data:www-data /var/www/supermandi-superadmin"
```

#### Claude Test (as real user)
```
□ Open https://supermandi.tech/admin
□ Verify: Login page loads
□ Verify: No console errors
□ Verify: Assets load (CSS, JS)
□ Enter admin token
□ Click Login
□ Verify: Dashboard loads
□ Verify: API calls go to api.supermandi.tech
□ Verify: Stores list loads
□ Test navigation between pages
□ Test logout
```

#### Acceptance Criteria
- [ ] Admin portal loads at /admin
- [ ] Authentication works
- [ ] API calls successful
- [ ] No 404 for assets
- [ ] No console errors

#### Rollback
```bash
sudo rm -rf /var/www/supermandi-superadmin/*
```

---

### TICKET-011: Admin Portal Testing

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Coverage** | All CRUD operations |
| **Data** | Test with real data |
| **Edge Cases** | Empty states, errors |
| **Performance** | < 2s page loads |

#### Claude Test (as real user)

**Authentication**
```
□ Enter wrong token → Error message shown
□ Enter correct token → Login successful
□ Refresh page → Stay logged in
□ Click logout → Redirect to login
```

**Store Management**
```
□ View stores list → Table loads
□ Empty state → "No stores" message
□ Click "Add Store" → Form opens
□ Fill form, submit → Store created
□ Search stores → Filters work
□ Click store row → Details page
□ Edit store → Changes saved
□ Generate store code → Code displayed
□ Deactivate store → Status changes
```

**Device Management**
```
□ View devices list → Table loads
□ Filter by store → Devices filtered
□ View device details → Info displayed
□ Revoke device → Confirmation dialog
□ Confirm revoke → Device removed
```

**Analytics**
```
□ View dashboard → Charts load
□ Select date range → Data updates
□ Export data → CSV downloads
```

#### Acceptance Criteria
- [ ] All CRUD operations work
- [ ] Error handling works
- [ ] Empty states handled
- [ ] Export functionality works
- [ ] Performance acceptable

---

# BATCH 4: RETAILER PORTAL

## Purpose
Deploy Retailer Portal with OTP authentication.

## Prerequisites
- BATCH 1, 2, 3 complete
- Firebase configured (TICKET-006)

---

### TICKET-012: Build Retailer Portal for Production

#### Rules

| Layer | Requirement |
|-------|-------------|
| **UI** | Consistent design system |
| **UX** | Phone OTP authentication |
| **API** | All calls to api.supermandi.tech |
| **Firebase** | Production credentials |
| **Base Path** | /retailer/ |

#### Tasks
```
□ Update vite.config.ts with base path
□ Update .env.production with Firebase config
□ Install dependencies
□ Build production bundle
□ Deploy to VM
□ Verify in browser
```

#### .env.production
```env
VITE_API_URL=https://api.supermandi.tech
VITE_FIREBASE_API_KEY=<key>
VITE_FIREBASE_AUTH_DOMAIN=supermandi-pos.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=supermandi-pos
VITE_FIREBASE_STORAGE_BUCKET=supermandi-pos.appspot.com
VITE_FIREBASE_MESSAGING_SENDER_ID=<id>
VITE_FIREBASE_APP_ID=<app_id>
```

#### Deploy Commands
```bash
cd retailer-admin
npm install
npm run build
scp -r dist/* supermanditech@34.14.220.171:/tmp/retailer/
ssh supermanditech@34.14.220.171 "sudo mkdir -p /var/www/retailer-admin && sudo mv /tmp/retailer/* /var/www/retailer-admin/ && sudo chown -R www-data:www-data /var/www/retailer-admin"
```

#### Claude Test (as real user)
```
□ Open https://supermandi.tech/retailer
□ Verify: Login page loads
□ Verify: Phone input field visible
□ Verify: Firebase initialized (no console errors)
□ Enter phone number
□ Click "Send OTP"
□ Verify: OTP sent (check phone)
□ Enter OTP
□ Verify: Login successful
□ Verify: Dashboard loads
```

#### Acceptance Criteria
- [ ] Portal loads at /retailer
- [ ] Firebase initialized
- [ ] OTP sends to phone
- [ ] Login completes
- [ ] No console errors

---

### TICKET-013: Retailer Portal - OTP Auth Testing

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Firebase** | Real phone verification |
| **Rate Limit** | Max 5 OTP requests per hour |
| **Session** | JWT stored securely |
| **Timeout** | OTP expires in 5 minutes |

#### Claude Test (as real user)
```
□ Enter invalid phone format → Validation error
□ Enter valid phone → OTP sent
□ Check phone → SMS received within 30s
□ Enter wrong OTP → Error message
□ Enter correct OTP → Login success
□ Refresh page → Session persists
□ Wait 24h (or clear storage) → Session expired
□ Request OTP again → Works
□ Request OTP 6 times → Rate limited
□ Click Logout → Session cleared
□ Try protected route → Redirects to login
```

#### Acceptance Criteria
- [ ] OTP delivered to real phones
- [ ] Wrong OTP shows error
- [ ] Session persists on refresh
- [ ] Logout clears session
- [ ] Rate limiting works

---

### TICKET-014: Retailer Portal - Features Testing

#### Claude Test (as real user)

**Inventory**
```
□ View inventory list → Products display
□ Search by name → Results filter
□ Search by barcode → Product found
□ Filter by category → Products filter
□ Click product → Details modal
□ Edit quantity → Saves successfully
□ View stock history → Ledger entries show
```

**Categories**
```
□ View categories → List displays
□ Add category → Created successfully
□ Edit category → Changes saved
□ Delete empty category → Deleted
□ Delete category with products → Error/warning
```

**Suppliers**
```
□ View suppliers → List displays
□ View supplier details → Info shown
□ View supplier products → Products listed
```

**Reports**
```
□ View sales summary → Today's data
□ Select date range → Data updates
□ View by product → Product breakdown
□ View by category → Category breakdown
□ Export CSV → File downloads
```

#### Acceptance Criteria
- [ ] Inventory management works
- [ ] Category management works
- [ ] Supplier view works
- [ ] Reports generate correctly
- [ ] Export functionality works

---

# BATCH 5: SUPPLIER PORTAL

## Purpose
Deploy Supplier Portal.

## Prerequisites
- BATCH 1, 2, 3, 4 complete

---

### TICKET-015: Build Supplier Portal for Production

#### Rules

| Layer | Requirement |
|-------|-------------|
| **Framework** | Next.js |
| **Build** | Static export or SSR |
| **Base Path** | /supplier |
| **Auth** | Email/password |

#### Tasks
```
□ Update next.config.js with basePath
□ Update .env.production
□ Build production bundle
□ Export static (if applicable)
□ Deploy to VM
□ Verify in browser
```

#### next.config.js
```js
module.exports = {
  basePath: '/supplier',
  assetPrefix: '/supplier/',
  output: 'export', // For static export
}
```

#### Deploy Commands
```bash
cd supplier-portal
npm install
npm run build
npm run export  # If static
scp -r out/* supermanditech@34.14.220.171:/tmp/supplier/
ssh supermanditech@34.14.220.171 "sudo mkdir -p /var/www/supplier-portal && sudo mv /tmp/supplier/* /var/www/supplier-portal/ && sudo chown -R www-data:www-data /var/www/supplier-portal"
```

#### Claude Test (as real user)
```
□ Open https://supermandi.tech/supplier
□ Verify: Login page loads
□ Verify: Assets load correctly
□ Verify: No console errors
□ Enter credentials
□ Verify: Login works
□ Verify: Dashboard loads
```

#### Acceptance Criteria
- [ ] Portal loads at /supplier
- [ ] Assets load correctly
- [ ] Authentication works
- [ ] No console errors

---

### TICKET-016: Supplier Portal - Auth Testing

#### Claude Test (as real user)
```
□ Enter invalid email format → Validation error
□ Enter wrong password → Error message
□ Enter correct credentials → Login success
□ Refresh page → Session persists
□ Click forgot password → Reset flow
□ Receive reset email → Link works
□ Reset password → Can login with new password
□ Click Logout → Session cleared
```

#### Acceptance Criteria
- [ ] Login works
- [ ] Validation works
- [ ] Password reset works
- [ ] Session management works

---

### TICKET-017: Supplier Portal - Features Testing

#### Claude Test (as real user)

**Product Catalog**
```
□ View products → List displays
□ Add product → Form opens
□ Fill details, submit → Product created
□ Upload image → Image uploads
□ Edit product → Changes saved
□ Search products → Results filter
```

**Orders**
```
□ View incoming orders → List displays
□ Filter by status → Orders filter
□ View order details → Items shown
□ Accept order → Status changes
□ Reject order → Reason required
□ Update shipping → Status updates
```

**Payouts**
```
□ View payout summary → Amount shown
□ View payout history → Records display
□ Add bank details → Saved
□ Request payout → Request submitted
```

#### Acceptance Criteria
- [ ] Product management works
- [ ] Order management works
- [ ] Payout features work

---

# BATCH 6: MOBILE APP

## Purpose
Deploy POS mobile app.

## Prerequisites
- BATCH 1, 2 complete (API working)

---

### TICKET-018: Configure Expo App for Production

#### Rules

| Layer | Requirement |
|-------|-------------|
| **API** | Points to api.supermandi.tech |
| **Build** | Release APK signed |
| **Offline** | Works without network |
| **Sync** | Queues transactions offline |

#### Tasks
```
□ Update .env with production API
□ Test on device with production API
□ Build release APK
□ Sign with release keystore
□ Test signed APK
```

#### .env
```env
EXPO_PUBLIC_API_URL=https://api.supermandi.tech
```

#### Build Commands
```bash
# Clean build
rm -rf node_modules/.cache
npm install

# Build release APK
npx expo run:android --variant release

# Or use EAS Build
eas build --platform android --profile production
```

#### Claude Test (as real user)
```
□ Install APK on device
□ Open app
□ Verify: Splash screen shows
□ Verify: Enrollment screen loads
□ Verify: API URL is production (check network tab)
□ Enter store code
□ Verify: Connects to production API
```

#### Acceptance Criteria
- [ ] APK installs
- [ ] App opens without crash
- [ ] Connects to production API
- [ ] No dev mode indicators

---

### TICKET-019: POS Device Enrollment Testing

#### Claude Test (as real user)
```
□ Open app (fresh install)
□ Verify: Enrollment screen shown
□ Enter invalid store code → Error message
□ Enter valid store code → PIN prompt
□ Enter wrong PIN → Error message
□ Enter correct PIN → Enrollment success
□ Verify: Store name displayed
□ Verify: Initial sync starts
□ Verify: Products download
□ Verify: Categories download
□ Close app, reopen → Still enrolled
□ Factory reset test → Can re-enroll
```

#### Acceptance Criteria
- [ ] Store code validation works
- [ ] PIN validation works
- [ ] Initial sync completes
- [ ] Enrollment persists
- [ ] Re-enrollment works

---

### TICKET-020: POS Sales Flow Testing

#### Claude Test (as real user)
```
□ Open sell screen
□ Scan barcode → Product added
□ Scan unknown barcode → Error/add new prompt
□ Search by name → Results show
□ Select product → Added to cart
□ Voice input "2 kg sugar" → Product added
□ Tap +/- buttons → Quantity changes
□ Swipe to remove → Item removed
□ Verify total calculation → Correct
□ Select Cash payment → Complete sale
□ Select UPI payment → Complete sale
□ Verify receipt → Details correct
□ Check inventory → Stock reduced
□ Check backend → Transaction synced
```

#### Acceptance Criteria
- [ ] Barcode scanning works
- [ ] Product search works
- [ ] Voice input works
- [ ] Cart operations work
- [ ] Payment flows work
- [ ] Inventory updates
- [ ] Backend sync works

---

### TICKET-021: POS Offline Mode Testing

#### Claude Test (as real user)
```
□ Enable airplane mode
□ Create sale transaction
□ Verify: Sale completes locally
□ Verify: "Pending sync" indicator
□ Create 5 more sales
□ Disable airplane mode
□ Verify: Sync starts automatically
□ Verify: All transactions uploaded
□ Verify: No duplicates in backend
□ Check inventory in backend → Correctly reduced
```

#### Acceptance Criteria
- [ ] Sales work offline
- [ ] Transactions queue locally
- [ ] Auto-sync on reconnect
- [ ] No data loss
- [ ] No duplicates

---

# BATCH 7: OPERATIONS

## Purpose
Set up monitoring and backups.

## Prerequisites
- All apps deployed

---

### TICKET-022: Set Up Health Monitoring

#### Tasks
```
□ Create UptimeRobot account
□ Add monitors:
  - https://supermandi.tech (HTTP 200)
  - https://api.supermandi.tech/health (HTTP 200)
  - https://supermandi.tech/admin (HTTP 200)
  - https://supermandi.tech/retailer (HTTP 200)
  - https://supermandi.tech/supplier (HTTP 200)
□ Set check interval: 5 minutes
□ Configure alerts: Email + Slack
□ Set up Sentry for error tracking
□ Configure log aggregation
```

#### Claude Test
```
□ Take down API temporarily
□ Verify: Alert received within 10 minutes
□ Restore API
□ Verify: Recovery alert received
□ Trigger JS error in portal
□ Verify: Error logged in Sentry
```

#### Acceptance Criteria
- [ ] All endpoints monitored
- [ ] Alerts configured
- [ ] Error tracking working

---

### TICKET-023: Configure Automated Backups

#### Backup Script
```bash
#!/bin/bash
# /opt/supermandi/backup.sh

DATE=$(date +%Y%m%d_%H%M%S)
BACKUP_DIR=/opt/supermandi/backups
GCS_BUCKET=gs://supermandi-backups

# Create backup
docker-compose -f /home/supermanditech/supermandi-pos/backend/docker-compose.prod.yml \
  exec -T postgres pg_dump -U supermandi supermandi > $BACKUP_DIR/db_$DATE.sql

# Compress
gzip $BACKUP_DIR/db_$DATE.sql

# Upload to GCS
gsutil cp $BACKUP_DIR/db_$DATE.sql.gz $GCS_BUCKET/

# Delete local backups older than 7 days
find $BACKUP_DIR -name "*.sql.gz" -mtime +7 -delete

# Delete GCS backups older than 30 days
gsutil ls $GCS_BUCKET/ | while read file; do
  # Check file age and delete if > 30 days
done
```

#### Cron Setup
```bash
# Run daily at 2 AM
0 2 * * * /opt/supermandi/backup.sh >> /var/log/supermandi-backup.log 2>&1
```

#### Claude Test
```
□ Run backup manually
□ Verify: SQL file created
□ Verify: Uploaded to GCS
□ Test restore:
  - Download backup
  - Restore to test DB
  - Verify data integrity
```

#### Acceptance Criteria
- [ ] Daily backups running
- [ ] Stored in cloud
- [ ] Restore tested
- [ ] 30-day retention

---

### TICKET-024: Create Production Runbook

#### Document Contents
```markdown
# SuperMandi Production Runbook

## Architecture
[Diagram]

## Services
| Service | Port | Health Endpoint |
|---------|------|-----------------|
| API Gateway | 3000 | /health |
| Main Backend | 3010 | /health |
| PostgreSQL | 5432 | - |
| Redis | 6379 | - |

## Common Tasks

### Restart Services
docker-compose -f docker-compose.prod.yml restart

### View Logs
docker-compose -f docker-compose.prod.yml logs -f service-name

### Database Access
docker-compose exec postgres psql -U supermandi

## Troubleshooting

### API Not Responding
1. Check nginx: sudo nginx -t
2. Check containers: docker-compose ps
3. Check logs: docker-compose logs api-gateway

### Database Connection Failed
1. Check postgres running: docker-compose ps postgres
2. Check credentials: cat .env.prod | grep DATABASE
3. Test connection: psql $DATABASE_URL

## Emergency Contacts
- DevOps: +91-XXX
- Backend: +91-XXX
```

#### Acceptance Criteria
- [ ] Document complete
- [ ] Team reviewed
- [ ] Stored in accessible location

---

# BATCH 8: GO-LIVE

## Purpose
Final verification before public launch.

---

### TICKET-025: Pre-Launch Verification

#### Complete Checklist

**Infrastructure**
```
□ DNS resolves correctly
□ SSL certificates valid (check expiry)
□ Nginx running without errors
□ All Docker containers healthy
```

**Landing Page**
```
□ https://supermandi.tech loads
□ Supplier button → /supplier
□ Retailer button → /retailer
□ Admin button → /admin
□ Mobile responsive
```

**Admin Portal**
```
□ https://supermandi.tech/admin loads
□ Login with token works
□ Can view stores
□ Can create store
□ Can generate store code
```

**Retailer Portal**
```
□ https://supermandi.tech/retailer loads
□ OTP sends to phone
□ Login works
□ Inventory visible
□ Can edit stock
```

**Supplier Portal**
```
□ https://supermandi.tech/supplier loads
□ Login works
□ Products visible
□ Orders visible
```

**API**
```
□ https://api.supermandi.tech/health returns 200
□ CORS working
□ Rate limiting active
□ All route groups responding
```

**Mobile App**
```
□ APK installs
□ Enrollment works
□ Sales flow works
□ Offline mode works
□ Sync works
```

**Security**
```
□ No default passwords
□ All tokens rotated
□ HTTPS enforced
□ Security headers present
```

**Operations**
```
□ Monitoring active
□ Backups running
□ Alerts configured
□ Runbook available
```

#### Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| DevOps | | | |
| Backend | | | |
| Frontend | | | |
| QA | | | |
| Product | | | |

---

## Summary

| Batch | Tickets | Description |
|-------|---------|-------------|
| 1 | 001-006 | Foundation (DNS, SSL, Nginx, Credentials) |
| 2 | 007-009 | Core Services (Backend, DB, API) |
| 3 | 010-011 | Admin Portal |
| 4 | 012-014 | Retailer Portal |
| 5 | 015-017 | Supplier Portal |
| 6 | 018-021 | Mobile App |
| 7 | 022-024 | Operations |
| 8 | 025 | Go-Live Verification |

**Total: 25 Tickets across 8 Batches**

---

## Deployment Commands Quick Reference

```bash
# BATCH 1: Foundation
# DNS - Manual in Hostinger
# SSL
sudo certbot certonly --standalone -d supermandi.tech -d www.supermandi.tech -d api.supermandi.tech
# Nginx
sudo nginx -t && sudo nginx -s reload
# Landing
scp supermandi-landing/index.html supermanditech@34.14.220.171:/var/www/supermandi/

# BATCH 2: Backend
cd backend
docker-compose -f docker-compose.prod.yml build
docker-compose -f docker-compose.prod.yml up -d
docker-compose -f docker-compose.prod.yml exec main-backend npm run migrate:prod

# BATCH 3: Admin
cd supermandi-superadmin && npm run build
scp -r dist/* supermanditech@34.14.220.171:/var/www/supermandi-superadmin/

# BATCH 4: Retailer
cd retailer-admin && npm run build
scp -r dist/* supermanditech@34.14.220.171:/var/www/retailer-admin/

# BATCH 5: Supplier
cd supplier-portal && npm run build && npm run export
scp -r out/* supermanditech@34.14.220.171:/var/www/supplier-portal/

# BATCH 6: Mobile
npx expo run:android --variant release

# Verify all
curl https://supermandi.tech
curl https://api.supermandi.tech/health
```
