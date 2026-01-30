# VM Secrets Setup Guide
## GO-LIVE-101: Production Environment Variables

This document explains how to securely configure production secrets on the VM.

## Principle: Secrets NEVER in Git

- Git repository contains only `.example` templates with placeholder values
- Real secrets exist only on the production VM in `/home/claude/.env.production`
- Docker/services read from environment variables at runtime

## Setup Steps

### 1. SSH to Production VM

```bash
ssh claude@34.14.220.171
```

### 2. Create Secure Environment File

```bash
# Create secrets directory (if not exists)
mkdir -p /home/claude/secrets

# Create production environment file
cat > /home/claude/secrets/.env.production << 'EOF'
# =============================================================================
# SuperMandi Production Secrets - GO-LIVE-101
# This file contains ALL production secrets. NEVER commit to git.
# =============================================================================

# Database
POSTGRES_USER=supermandi
POSTGRES_PASSWORD=<GENERATE_SECURE_PASSWORD>
POSTGRES_DB=supermandi

# Redis
REDIS_PASSWORD=<GENERATE_SECURE_PASSWORD>

# JWT
JWT_SECRET=<GENERATE_32+_CHAR_RANDOM_STRING>

# Admin Token (for SuperAdmin portal)
ADMIN_TOKEN=<GENERATE_SECURE_TOKEN>

# Firebase (backend verification)
FIREBASE_ENABLED=true
FIREBASE_PROJECT_ID=supermandi-pos
# Mount service account JSON file

# OpenAI (voice services)
OPENAI_API_KEY=sk-<YOUR_OPENAI_KEY>

# Resend (email service)
RESEND_API_KEY=re_<YOUR_RESEND_KEY>

# Razorpay (payments)
RAZORPAY_KEY_ID=<YOUR_KEY_ID>
RAZORPAY_KEY_SECRET=<YOUR_KEY_SECRET>
EOF

# Secure the file
chmod 600 /home/claude/secrets/.env.production
```

### 3. Generate Secure Passwords

```bash
# Generate random passwords
openssl rand -base64 32  # For POSTGRES_PASSWORD
openssl rand -base64 32  # For REDIS_PASSWORD
openssl rand -base64 48  # For JWT_SECRET
openssl rand -hex 32     # For ADMIN_TOKEN
```

### 4. Deploy with Secrets

```bash
cd /home/claude/supermandi-pos

# Load secrets and start services
docker compose --env-file /home/claude/secrets/.env.production \
  -f docker-compose.prod.yml up -d --build
```

### 5. Frontend Environment (Build-time)

For frontend apps (retailer-admin, supplier-portal, superadmin):

```bash
# Create frontend env on VM (for build)
cat > /home/claude/supermandi-pos/retailer-admin/.env.production << 'EOF'
VITE_API_BASE_URL=https://supermandi.tech
VITE_FIREBASE_API_KEY=<YOUR_FIREBASE_API_KEY>
VITE_FIREBASE_AUTH_DOMAIN=supermandi-pos.firebaseapp.com
VITE_FIREBASE_PROJECT_ID=supermandi-pos
VITE_FIREBASE_STORAGE_BUCKET=supermandi-pos.firebasestorage.app
VITE_FIREBASE_MESSAGING_SENDER_ID=<YOUR_SENDER_ID>
VITE_FIREBASE_APP_ID=<YOUR_APP_ID>
EOF

# Build with production env
cd retailer-admin && npm run build
```

## Verification

```bash
# Verify secrets file permissions
ls -la /home/claude/secrets/.env.production
# Should show: -rw------- (600)

# Verify secrets NOT in git
cd /home/claude/supermandi-pos
git status | grep -E "\.env\.production|secrets"
# Should show nothing (not tracked)

# Verify services running
docker compose -f docker-compose.prod.yml ps
```

## Rotation Procedure

1. Generate new secret value
2. Update `/home/claude/secrets/.env.production`
3. Restart affected service: `docker compose restart <service>`
4. Verify service healthy

## Emergency: Secret Exposed

If a secret is accidentally committed:

1. **Rotate immediately** - generate new secret
2. **Revoke old secret** - in Firebase/OpenAI/etc console
3. **Remove from git history** (if needed):
   ```bash
   git filter-branch --force --index-filter \
     "git rm --cached --ignore-unmatch <file>" HEAD
   ```
4. **Force push** (coordinate with team)

---
*Document created: GO-LIVE-101 - Secrets Protection*
