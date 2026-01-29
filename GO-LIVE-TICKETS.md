# SuperMandi Go-Live Development Tickets

**Domain**: supermandi.tech
**VM IP**: 34.14.220.171
**Date**: 2026-01-29
**Status**: Pre-Go-Live

---

## Architecture

```
supermandi.tech (Landing Page)
├── /supplier → Supplier Portal
├── /retailer → Retailer Portal
└── /admin → Admin Portal

api.supermandi.tech → Backend API Gateway
```

---

## PHASE 1: Infrastructure & Domain

### TICKET-001: Configure DNS Records
**Priority**: CRITICAL | **Owner**: DevOps

**Tasks**:
- [ ] Login to Hostinger hPanel
- [ ] Add A Record: `@` → `34.14.220.171`
- [ ] Add A Record: `api` → `34.14.220.171`
- [ ] Add A Record: `www` → `34.14.220.171`
- [ ] Wait for DNS propagation
- [ ] Verify: `nslookup supermandi.tech`

---

### TICKET-002: Generate SSL Certificates
**Priority**: CRITICAL | **Owner**: DevOps

**Tasks**:
- [ ] SSH to VM: `ssh supermanditech@34.14.220.171`
- [ ] Install certbot (if not present)
- [ ] Generate certificates:
  ```bash
  sudo certbot certonly --nginx \
    -d supermandi.tech \
    -d www.supermandi.tech \
    -d api.supermandi.tech
  ```
- [ ] Verify at `/etc/letsencrypt/live/supermandi.tech/`
- [ ] Test auto-renewal: `sudo certbot renew --dry-run`

---

### TICKET-003: Configure Nginx
**Priority**: CRITICAL | **Owner**: DevOps

**Tasks**:
- [ ] Create nginx config for supermandi.tech:
  ```nginx
  # HTTP → HTTPS redirect
  server {
      listen 80;
      server_name supermandi.tech www.supermandi.tech api.supermandi.tech;
      return 301 https://$host$request_uri;
  }

  # Main site
  server {
      listen 443 ssl http2;
      server_name supermandi.tech www.supermandi.tech;

      ssl_certificate /etc/letsencrypt/live/supermandi.tech/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/supermandi.tech/privkey.pem;

      root /var/www/supermandi;
      index index.html;

      location /supplier { alias /var/www/supplier-portal; try_files $uri $uri/ /supplier/index.html; }
      location /retailer { alias /var/www/retailer-admin; try_files $uri $uri/ /retailer/index.html; }
      location /admin { alias /var/www/supermandi-superadmin; try_files $uri $uri/ /admin/index.html; }
      location / { try_files $uri $uri/ /index.html; }
  }

  # API
  server {
      listen 443 ssl http2;
      server_name api.supermandi.tech;

      ssl_certificate /etc/letsencrypt/live/supermandi.tech/fullchain.pem;
      ssl_certificate_key /etc/letsencrypt/live/supermandi.tech/privkey.pem;

      location / {
          proxy_pass http://api-gateway:3000;
          proxy_http_version 1.1;
          proxy_set_header Upgrade $http_upgrade;
          proxy_set_header Connection 'upgrade';
          proxy_set_header Host $host;
          proxy_set_header X-Real-IP $remote_addr;
      }
  }
  ```
- [ ] Test config: `sudo nginx -t`
- [ ] Reload: `sudo nginx -s reload`

---

### TICKET-004: Deploy Landing Page
**Priority**: CRITICAL | **Owner**: Frontend

**Tasks**:
- [ ] Create directory: `sudo mkdir -p /var/www/supermandi`
- [ ] Copy landing page:
  ```bash
  scp supermandi-landing/index.html supermanditech@34.14.220.171:/var/www/supermandi/
  ```
- [ ] Set permissions: `sudo chown -R www-data:www-data /var/www/supermandi`
- [ ] Verify: https://supermandi.tech

**Acceptance**: Landing page loads with Supplier, Retailer, Admin buttons

---

### TICKET-005: Secure Production Credentials
**Priority**: CRITICAL | **Owner**: DevOps/Security

**Tasks**:
- [ ] Generate new PostgreSQL password (32+ chars)
- [ ] Generate new Redis password (32+ chars)
- [ ] Generate new JWT_SECRET (64+ chars)
- [ ] Generate new ADMIN_TOKEN (32+ chars)
- [ ] Update `.env.prod` on VM
- [ ] Update Docker secrets
- [ ] Test database connection
- [ ] Remove hardcoded dev credentials

---

### TICKET-006: Configure Firebase Production
**Priority**: HIGH | **Owner**: Backend

**Tasks**:
- [ ] Firebase Console → Authorized domains → Add:
  - `supermandi.tech`
  - `www.supermandi.tech`
- [ ] Generate service account key
- [ ] Upload to VM: `/etc/supermandi/firebase-service-account.json`
- [ ] Update `.env.prod`:
  ```env
  FIREBASE_ENABLED=true
  FIREBASE_SERVICE_ACCOUNT_PATH=/etc/supermandi/firebase-service-account.json
  FIREBASE_PROJECT_ID=supermandi-pos
  ```
- [ ] Test OTP flow

---

## PHASE 2: Backend & API

### TICKET-007: Deploy Backend Services
**Priority**: CRITICAL | **Owner**: Backend

**Tasks**:
- [ ] Update `.env.prod`:
  ```env
  NODE_ENV=production
  API_URL=https://api.supermandi.tech
  CORS_ORIGINS=https://supermandi.tech,https://www.supermandi.tech
  ```
- [ ] Build Docker images:
  ```bash
  docker-compose -f docker-compose.prod.yml build
  ```
- [ ] Start services:
  ```bash
  docker-compose -f docker-compose.prod.yml up -d
  ```
- [ ] Verify health: `curl https://api.supermandi.tech/health`

---

### TICKET-008: Run Database Migrations
**Priority**: CRITICAL | **Owner**: Backend

**Tasks**:
- [ ] Backup existing data (if any)
- [ ] Run migrations: `npm run migrate:prod`
- [ ] Verify all tables created
- [ ] Verify indexes created
- [ ] Seed required lookup data

---

### TICKET-009: API Gateway Testing
**Priority**: HIGH | **Owner**: QA

**Test Cases**:
- [ ] Health check: `GET /health` → 200
- [ ] Admin routes: `/api/v1/admin/*`
- [ ] Auth routes: `/api/v1/auth/*`
- [ ] POS routes: `/api/v1/pos/*`
- [ ] Supplier routes: `/api/v1/supplier/*`
- [ ] Retailer routes: `/api/v1/retailer-admin/*`
- [ ] Voice routes: `/api/v1/voice/*`
- [ ] CORS headers working
- [ ] Rate limiting active

---

## PHASE 3: Admin Portal

### TICKET-010: Build Admin Portal for Production
**Priority**: HIGH | **Owner**: Frontend

**Tasks**:
- [ ] Update `supermandi-superadmin/vite.config.ts`:
  ```ts
  export default defineConfig({
    base: '/admin/',
  })
  ```
- [ ] Update `.env.production`:
  ```env
  VITE_API_URL=https://api.supermandi.tech
  VITE_ADMIN_TOKEN=<new-secure-token>
  ```
- [ ] Build: `cd supermandi-superadmin && npm run build`
- [ ] Deploy:
  ```bash
  scp -r dist/* supermanditech@34.14.220.171:/var/www/supermandi-superadmin/
  ```
- [ ] Verify: https://supermandi.tech/admin

---

### TICKET-011: Admin Portal Testing
**Priority**: HIGH | **Owner**: QA

**Test Cases**:
- [ ] Admin login with token
- [ ] View stores list
- [ ] Create new store
- [ ] Edit store details
- [ ] Generate store activation code
- [ ] View enrolled devices
- [ ] Revoke device
- [ ] View analytics dashboard
- [ ] Export reports

---

## PHASE 4: Retailer Portal

### TICKET-012: Build Retailer Portal for Production
**Priority**: HIGH | **Owner**: Frontend

**Tasks**:
- [ ] Update `retailer-admin/vite.config.ts`:
  ```ts
  export default defineConfig({
    base: '/retailer/',
  })
  ```
- [ ] Update `.env.production`:
  ```env
  VITE_API_URL=https://api.supermandi.tech
  VITE_FIREBASE_API_KEY=<key>
  VITE_FIREBASE_AUTH_DOMAIN=supermandi-pos.firebaseapp.com
  VITE_FIREBASE_PROJECT_ID=supermandi-pos
  ```
- [ ] Build: `cd retailer-admin && npm run build`
- [ ] Deploy:
  ```bash
  scp -r dist/* supermanditech@34.14.220.171:/var/www/retailer-admin/
  ```
- [ ] Verify: https://supermandi.tech/retailer

---

### TICKET-013: Retailer Portal - OTP Auth Testing
**Priority**: CRITICAL | **Owner**: QA

**Test Cases**:
- [ ] Enter phone number
- [ ] Receive OTP SMS
- [ ] Enter correct OTP → login success
- [ ] Enter wrong OTP → error message
- [ ] Resend OTP
- [ ] Session persistence on refresh
- [ ] Logout

---

### TICKET-014: Retailer Portal - Features Testing
**Priority**: HIGH | **Owner**: QA

**Test Cases**:
- [ ] View inventory list
- [ ] Search products
- [ ] Filter by category
- [ ] Edit stock quantity
- [ ] View stock history
- [ ] View categories
- [ ] Create/edit category
- [ ] View suppliers
- [ ] View sales reports
- [ ] Export data

---

## PHASE 5: Supplier Portal

### TICKET-015: Build Supplier Portal for Production
**Priority**: HIGH | **Owner**: Frontend

**Tasks**:
- [ ] Update `supplier-portal/next.config.js`:
  ```js
  module.exports = {
    basePath: '/supplier',
    assetPrefix: '/supplier/',
  }
  ```
- [ ] Update `.env.production`:
  ```env
  NEXT_PUBLIC_API_URL=https://api.supermandi.tech
  ```
- [ ] Build: `cd supplier-portal && npm run build`
- [ ] Export: `npm run export` (if static)
- [ ] Deploy:
  ```bash
  scp -r out/* supermanditech@34.14.220.171:/var/www/supplier-portal/
  ```
- [ ] Verify: https://supermandi.tech/supplier

---

### TICKET-016: Supplier Portal - Auth Testing
**Priority**: HIGH | **Owner**: QA

**Test Cases**:
- [ ] Login page loads
- [ ] Login with credentials
- [ ] Invalid credentials error
- [ ] Forgot password flow
- [ ] Password reset
- [ ] Session management
- [ ] Logout

---

### TICKET-017: Supplier Portal - Features Testing
**Priority**: HIGH | **Owner**: QA

**Test Cases**:
- [ ] View product catalog
- [ ] Add new product
- [ ] Edit product details
- [ ] Upload product image
- [ ] View incoming orders
- [ ] Accept/reject order
- [ ] Update order status
- [ ] View payout summary
- [ ] View reports

---

## PHASE 6: Mobile App (POS)

### TICKET-018: Configure Expo App for Production
**Priority**: CRITICAL | **Owner**: Mobile

**Tasks**:
- [ ] Update `.env`:
  ```env
  EXPO_PUBLIC_API_URL=https://api.supermandi.tech
  ```
- [ ] Verify all API calls use env variable
- [ ] Test on physical device
- [ ] Build release APK:
  ```bash
  npm run build:release
  ```
- [ ] Sign APK with release keystore
- [ ] Test signed APK

---

### TICKET-019: POS Device Enrollment Testing
**Priority**: CRITICAL | **Owner**: QA

**Test Cases**:
- [ ] Enter store code
- [ ] Enter activation PIN
- [ ] Enrollment success
- [ ] Download initial catalog
- [ ] Store info displayed
- [ ] Invalid code error
- [ ] Invalid PIN error
- [ ] Re-enrollment after reset

---

### TICKET-020: POS Sales Flow Testing
**Priority**: CRITICAL | **Owner**: QA

**Test Cases**:
- [ ] Scan barcode → add product
- [ ] Search product by name
- [ ] Voice order input
- [ ] Adjust quantity
- [ ] Remove item
- [ ] Apply discount
- [ ] Calculate total
- [ ] Select payment (Cash/UPI/Card)
- [ ] Complete sale
- [ ] Sync transaction to backend
- [ ] Verify inventory deducted

---

### TICKET-021: POS Offline Mode Testing
**Priority**: HIGH | **Owner**: QA

**Test Cases**:
- [ ] Disable network
- [ ] Create sale transaction
- [ ] Verify queued locally
- [ ] Re-enable network
- [ ] Verify sync to backend
- [ ] No duplicate transactions
- [ ] No data loss

---

## PHASE 7: Monitoring & Operations

### TICKET-022: Set Up Health Monitoring
**Priority**: HIGH | **Owner**: DevOps

**Tasks**:
- [ ] Set up UptimeRobot (or similar):
  - Monitor: https://supermandi.tech
  - Monitor: https://api.supermandi.tech/health
- [ ] Configure alerting (email/Slack)
- [ ] Set up error tracking (Sentry)
- [ ] Configure log aggregation

---

### TICKET-023: Configure Automated Backups
**Priority**: HIGH | **Owner**: DevOps

**Tasks**:
- [ ] Create PostgreSQL backup script
- [ ] Schedule daily cron job
- [ ] Store backups in Google Cloud Storage
- [ ] Set 30-day retention policy
- [ ] Test backup restoration
- [ ] Document restore procedure

---

### TICKET-024: Create Production Runbook
**Priority**: MEDIUM | **Owner**: DevOps

**Documentation**:
- [ ] Architecture diagram
- [ ] Service endpoints
- [ ] Restart procedures
- [ ] Rollback procedures
- [ ] Troubleshooting guide
- [ ] Emergency contacts

---

## PHASE 8: Go-Live Checklist

### TICKET-025: Pre-Launch Verification
**Priority**: CRITICAL | **Owner**: All

**Checklist**:
- [ ] DNS resolving correctly
- [ ] SSL certificates valid
- [ ] Landing page accessible
- [ ] Admin portal working
- [ ] Retailer portal working
- [ ] Supplier portal working
- [ ] API health check passing
- [ ] POS app connecting
- [ ] OTP SMS delivering
- [ ] Database backups running
- [ ] Monitoring alerts active
- [ ] All credentials rotated
- [ ] No dev/test data in production

---

## Summary

| Phase | Tickets | Priority |
|-------|---------|----------|
| Infrastructure & Domain | 001-006 | CRITICAL |
| Backend & API | 007-009 | CRITICAL |
| Admin Portal | 010-011 | HIGH |
| Retailer Portal | 012-014 | HIGH |
| Supplier Portal | 015-017 | HIGH |
| Mobile App (POS) | 018-021 | CRITICAL |
| Monitoring & Operations | 022-024 | HIGH |
| Go-Live Checklist | 025 | CRITICAL |

**Total Tickets**: 25

---

## Execution Order

```
Week 1: Infrastructure
├── TICKET-001: DNS Setup
├── TICKET-002: SSL Certificates
├── TICKET-003: Nginx Config
├── TICKET-004: Deploy Landing Page
├── TICKET-005: Secure Credentials
└── TICKET-006: Firebase Setup

Week 1-2: Backend
├── TICKET-007: Deploy Backend
├── TICKET-008: Database Migrations
└── TICKET-009: API Testing

Week 2: Portals
├── TICKET-010: Build Admin Portal
├── TICKET-011: Test Admin Portal
├── TICKET-012: Build Retailer Portal
├── TICKET-013: Test Retailer Auth
├── TICKET-014: Test Retailer Features
├── TICKET-015: Build Supplier Portal
├── TICKET-016: Test Supplier Auth
└── TICKET-017: Test Supplier Features

Week 2-3: Mobile
├── TICKET-018: Configure Expo
├── TICKET-019: Test Enrollment
├── TICKET-020: Test Sales Flow
└── TICKET-021: Test Offline Mode

Week 3: Operations
├── TICKET-022: Health Monitoring
├── TICKET-023: Automated Backups
└── TICKET-024: Runbook

Go-Live:
└── TICKET-025: Pre-Launch Verification
```

---

## URLs After Go-Live

| URL | Purpose |
|-----|---------|
| https://supermandi.tech | Landing page |
| https://supermandi.tech/supplier | Supplier Portal |
| https://supermandi.tech/retailer | Retailer Portal |
| https://supermandi.tech/admin | Admin Portal |
| https://api.supermandi.tech | Backend API |
