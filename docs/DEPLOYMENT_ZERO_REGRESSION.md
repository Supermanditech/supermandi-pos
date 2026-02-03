# SuperMandi Zero-Regression Deployment System

> **MANDATORY**: All deployments must pass through this system. No exceptions.

## Overview

This document describes the zero-regression deployment system for SuperMandi. The system ensures:

1. **No deployment without passing smoke gate** - All portals must return 200 OK with correct cache headers
2. **Atomic deployments** - Staging → swap prevents partial updates
3. **Tag-based releases only** - Production deploys only from annotated tags
4. **Instant rollback** - Previous releases are preserved for immediate rollback
5. **Post-reboot resilience** - Automated smoke checks after VM restarts

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     DEPLOYMENT PIPELINE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │   PR     │───▶│   CI     │───▶│  Merge   │───▶│   Tag    │  │
│  │ Created  │    │  Gates   │    │ to main  │    │ Release  │  │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘  │
│                       │                               │         │
│                       ▼                               ▼         │
│              ┌────────────────┐              ┌──────────────┐   │
│              │ typecheck      │              │ VM Deploy    │   │
│              │ lint           │              │ (tag only)   │   │
│              │ test           │              └──────────────┘   │
│              │ build verify   │                      │          │
│              └────────────────┘                      ▼          │
│                                              ┌──────────────┐   │
│                                              │ Smoke Gate   │   │
│                                              │ (mandatory)  │   │
│                                              └──────────────┘   │
│                                                      │          │
│                                          ┌───────────┴────────┐ │
│                                          ▼                    ▼ │
│                                    ┌──────────┐        ┌────────┐│
│                                    │  PASS    │        │  FAIL  ││
│                                    │ (deploy) │        │(abort) ││
│                                    └──────────┘        └────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Smoke Gate Checks

The smoke gate verifies all critical endpoints are healthy:

| Endpoint | Expected | Check |
|----------|----------|-------|
| `/health` | 200 OK | Status + `{"status":"ok"}` body |
| `/retailer/` | 200 OK | Status + `Cache-Control: no-store` |
| `/retailer/login` | 200 OK | Status + HTML content |
| `/admin/` | 200 OK | Status + `Cache-Control: no-store` |
| `/supplier/` | 200 OK | Status + `Cache-Control: no-store` |
| `/supplier/login` | 200 OK | Status + HTML content |

## Directory Structure on VM

```
/var/www/
├── .releases/                    # Timestamped release directories
│   ├── 20260203-143000/
│   │   ├── retailer/
│   │   └── admin/
│   └── 20260203-150000/
│       ├── retailer/
│       └── admin/
├── .staging/                     # Build staging area
├── retailer -> .releases/current/retailer  # Symlink
├── admin -> .releases/current/admin        # Symlink
└── supplier-portal/              # Next.js (PM2 managed)

/var/log/supermandi/
├── deploy-YYYYMMDD-HHMMSS.log   # Deployment logs
├── smoke-gate.log               # Smoke gate results
└── rollback.log                 # Rollback history

/home/supermanditech/supermandi-pos/
└── scripts/
    ├── deploy-atomic.sh         # Main deployment script
    ├── smoke-gate.sh            # Standalone smoke gate
    └── post-boot-check.sh       # Post-reboot verification
```

## Deployment Commands

### Standard Deployment (from tag)

```bash
# SSH to VM
ssh claude@34.14.220.171

# Deploy specific tag (REQUIRED for production)
./scripts/deploy-atomic.sh --tag v1.2.3

# Deploy latest main (dev/staging only)
./scripts/deploy-atomic.sh --tag main
```

### Rollback

```bash
# Rollback to previous release
./scripts/deploy-atomic.sh --rollback last

# Rollback to specific release
./scripts/deploy-atomic.sh --rollback 20260203-143000

# List available releases
./scripts/deploy-atomic.sh --list-releases
```

### Smoke Gate (standalone)

```bash
# Run smoke gate
./scripts/smoke-gate.sh

# JSON output (for CI)
./scripts/smoke-gate.sh --json

# Against specific domain
DOMAIN=staging.supermandi.tech ./scripts/smoke-gate.sh
```

## CI/CD Pipeline

### GitHub Actions (Required)

All PRs and merges to `main` run:

1. **typecheck** - TypeScript compilation
2. **lint** - ESLint checks
3. **test** - Unit tests
4. **build-verify** - Build all portals, verify `index.html` exists

If any check fails, merging is **blocked**.

### Pre-Merge Checklist

- [ ] All CI checks pass
- [ ] PR reviewed and approved
- [ ] No unresolved conflicts

### Creating a Release Tag

```bash
# Create annotated tag (required format)
git tag -a v1.2.3 -m "Release v1.2.3: <description>"
git push origin v1.2.3

# Or with date format
git tag -a release-2026-02-03_1430IST -m "Release: <description>"
git push origin release-2026-02-03_1430IST
```

## Deployment Log Format

Each deployment creates a log file:

```
═══════════════════════════════════════════════════════════════════
SUPERMANDI DEPLOYMENT LOG
═══════════════════════════════════════════════════════════════════
Deploy Time:  2026-02-03 14:30:00 IST
Tag/Branch:   v1.2.3
Commit SHA:   abc1234
Full SHA:     abc1234567890abcdef...
Commit Msg:   feat: add new feature

Portals Deployed:
  - /retailer/  -> /var/www/retailer/ (symlink -> .releases/20260203-143000)
  - /admin/     -> /var/www/admin/
  - /supplier/  -> PM2 (supplier-portal)

Pre-Deploy Gate:
  - nginx -t: OK
  - Existing files verified: OK

Smoke Gate:
  - Gateway /health:    200 OK ✓
  - /retailer/:         200 OK ✓
  - /admin/:            200 OK ✓
  - /supplier/:         200 OK ✓
  - Cache headers:      OK ✓

Result: PASSED
═══════════════════════════════════════════════════════════════════
```

## Rollback Procedure

1. **Automatic**: If smoke gate fails, deployment is aborted (no rollback needed)
2. **Manual**: Run `./scripts/deploy-atomic.sh --rollback last`
3. **Emergency**: Symlinks can be manually updated:
   ```bash
   cd /var/www
   rm retailer admin
   ln -s .releases/20260203-143000/retailer retailer
   ln -s .releases/20260203-143000/admin admin
   sudo systemctl reload nginx
   ```

## Post-Reboot Verification

A systemd timer runs smoke gate checks every 5 minutes for 30 minutes after boot:

```
/etc/systemd/system/supermandi-smoke-check.timer
/etc/systemd/system/supermandi-smoke-check.service
```

If checks fail, alerts are logged to `/var/log/supermandi/post-boot-check.log`.

## Troubleshooting

### Deployment Failed - Smoke Gate

1. Check which endpoint failed in the output
2. View logs:
   ```bash
   # Nginx error log
   sudo tail -50 /var/log/nginx/supermandi.error.log

   # Gateway logs
   docker logs supermandi-gateway --tail 50

   # Portal access log
   sudo tail -50 /var/log/nginx/supermandi.access.log
   ```

### Portal Returns 404

1. Verify symlink exists and points to correct release:
   ```bash
   ls -la /var/www/retailer
   ls -la /var/www/admin
   ```
2. Verify index.html exists in release directory
3. Check nginx config: `sudo nginx -T | grep -A20 "location /retailer"`

### Supplier Portal Down

1. Check PM2 status: `pm2 list`
2. View logs: `pm2 logs supplier-portal --lines 50`
3. Restart: `pm2 restart supplier-portal`

### Nginx Config Issues

```bash
# Test config
sudo nginx -t

# Show effective config
sudo nginx -T | less

# Reload after fixes
sudo systemctl reload nginx
```

## Non-Negotiable Rules

1. **NO manual file copying** - Always use `deploy-atomic.sh`
2. **NO production deploys from `main`** - Always use annotated tags
3. **NO partial updates** - All portals deploy together
4. **NO bypassing smoke gate** - Script exits on failure
5. **NO deleting release history** - Keep at least 5 previous releases

## Contact

For deployment issues, check:
1. This documentation
2. `/var/log/supermandi/` logs
3. GitHub Actions CI status
