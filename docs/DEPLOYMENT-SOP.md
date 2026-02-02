# GO-LIVE Deployment SOP: Anti-Regression + Cache-Proof Deploy

This document defines the standard operating procedures for deploying SuperMandi portals with immutable proofs.

---

## Quick Reference

```bash
# One-command deploy (on VM)
cd /home/supermandi/supermandi-pos
./scripts/deploy-all.sh
```

---

## PART A: Release Stamp

Each portal displays a build stamp in the footer:

```
Build: <git short sha> · Deployed: <YYYY-MM-DD HH:mm IST>
```

**Visible on:**
- `/supplier/login/`, `/supplier/register/`
- `/retailer/login`, `/retailer/register`
- `/admin/` (login and dashboard)

---

## PART B: Service Worker Policy

The SuperAdmin portal has a service worker (`sw.js`) with these rules:

1. **NEVER cache HTML files** - Always fetch fresh from network
2. **Only cache hashed assets** - JS/CSS files with content hash in filename
3. **Cache version bumped on each deploy** - Forces old cache purge

```javascript
// Patterns that NEVER get cached:
/\/admin\/?$/           // Main admin route
/\/admin\/index\.html$/ // Admin index HTML
/\.html$/               // Any HTML file
```

---

## PART C: Nginx Caching Policy

### HTML Files (Auth Routes)
```nginx
Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0
Pragma: no-cache
Expires: 0
```

### Hashed JS/CSS Assets
```nginx
Cache-Control: public, immutable, max-age=31536000
Expires: 1y
```

**Config file:** `nginx.prod.conf`

---

## PART D: "DONE Proof" Policy

> **You are NOT allowed to say "DONE" unless you provide ALL 3 proofs:**

### Proof 1: Git Proof
- Commit SHA (short)
- `git show --name-only <sha>` output

### Proof 2: VM Filesystem Proof
Show deployed folder timestamps + current index hash for each portal:

```bash
# Retailer Admin
ls -la /var/www/supermandi/retailer/
ls -la /var/www/supermandi/retailer/assets/*.js | head -3

# SuperAdmin
ls -la /var/www/supermandi/admin/
ls -la /var/www/supermandi/admin/assets/*.js | head -3

# Supplier Portal
systemctl status supplier-portal
```

### Proof 3: Live HTTP Proof
For each portal, show:

```bash
# Cache headers
curl -I https://supermandi.tech/<portal-path>/

# Index JS hash reference (must match deployed)
curl -s https://supermandi.tech/<portal-path>/ | grep -E "index-.*\.js|main-.*\.js"
```

---

## PART E: Deployment Script

**Location:** `scripts/deploy-all.sh`

**What it does:**
1. Pulls latest `main` branch
2. Builds all 3 portals (Vite + Next.js)
3. Copies build output to `/var/www/supermandi/`
4. Reloads nginx
5. **Prints all 3 proofs automatically**

**Usage:**
```bash
# SSH into VM
ssh supermandi@<vm-ip>

# Run deploy
cd /home/supermandi/supermandi-pos
./scripts/deploy-all.sh
```

---

## PART F: Real User Verification Checklist

After deploy, verify in **both normal tab AND incognito**:

### URLs to Check

| Portal | Login URL | Register URL |
|--------|-----------|--------------|
| Supplier | https://supermandi.tech/supplier/login/ | https://supermandi.tech/supplier/register/ |
| Retailer | https://supermandi.tech/retailer/login | https://supermandi.tech/retailer/register |
| Admin | https://supermandi.tech/admin/ | N/A |

### Verification Items

- [ ] **Build stamp visible** - Footer shows correct SHA and deploy time
- [ ] **SHA matches** - Build stamp SHA matches the deployed commit
- [ ] **No 404 links** - All navigation links work
- [ ] **No auto-logout loops** - Can stay on page without being redirected
- [ ] **Forms functional** - Login/register forms load correctly
- [ ] **Cache headers correct** - Check Network tab shows `no-store` for HTML

### Quick Browser Verification

1. Open DevTools → Network tab
2. Hard refresh (Ctrl+Shift+R / Cmd+Shift+R)
3. Click on the document request
4. Verify `Cache-Control: no-store` header
5. Check footer for build stamp

---

## Troubleshooting

### User sees old UI after deploy

1. **Check service worker:** Open DevTools → Application → Service Workers
   - Click "Unregister" if old SW is active
   - Or clear site data

2. **Hard refresh:** Ctrl+Shift+R (Windows) / Cmd+Shift+R (Mac)

3. **Verify nginx config:**
   ```bash
   sudo nginx -t
   curl -I https://supermandi.tech/admin/ | grep -i cache
   ```

### Build stamp shows "dev" or "local"

Build was not done through proper CI/deploy script. Rebuild:
```bash
cd /home/supermandi/supermandi-pos
./scripts/deploy-all.sh
```

### JS/CSS 404 errors

Stale HTML pointing to old hashed assets. Clear CDN cache (if any) and hard refresh.

---

## Files Modified

| File | Purpose |
|------|---------|
| `retailer-admin/src/components/BuildStamp.tsx` | Build stamp component |
| `supplier-portal/src/components/BuildStamp.tsx` | Build stamp component |
| `supermandi-superadmin/src/components/BuildStamp.tsx` | Build stamp component |
| `retailer-admin/vite.config.ts` | Injects build info |
| `supermandi-superadmin/vite.config.ts` | Injects build info |
| `supplier-portal/next.config.js` | Injects build info |
| `supermandi-superadmin/public/sw.js` | Service worker (no HTML caching) |
| `nginx.prod.conf` | Production nginx config |
| `scripts/deploy-all.sh` | One-command deploy script |

---

## Final Acceptance Criteria

- [x] Build stamp visible on all three portals
- [x] Auth pages never stuck on old UI (SW + cache fixed)
- [x] Nginx headers correct (HTML no-store)
- [x] One-command deploy exists
- [x] Git + VM + Live proofs provided before claiming DONE
