# MICRO-BATCH-12 — FIX-TO-GREEN

| Field | Value |
|-------|-------|
| **Parent SHA** | `dfbabc0` (MICRO-BATCH-11) |
| **Batch** | MICRO-BATCH-12: Infrastructure Hardening |
| **Issues Covered** | ISSUE-MICRO-033, 034, 035, 036, 037, 038, 039, 078 |
| **Severity** | P1: 7, P2: 1 |

---

## Files Changed

| File | What |
|------|------|
| `backend/services/api-gateway/src/index.ts` | Explicit helmet() config — HSTS 1yr, frameguard deny (033) |
| `scripts/docker-compose.local-prod.yml` | Parameterize secrets + add resource limits (034, 035) |
| `supermandi-landing/index.html` | OG meta tags + localhost-only comment (036, 039) |
| `backend/Dockerfile.main` | Add non-root user `nodejs:1001` (037) |
| `.github/workflows/deploy.yml` | Digest verification step before staging deploy (038) |
| `.github/workflows/ci-gates.yml` | pnpm store cache in all 3 CI jobs (078) |

---

## Per-Issue Fix Summary

### ISSUE-MICRO-033 (P1): Missing security headers — HSTS, X-Frame-Options
- **Axis:** C (Auth)
- **Root Cause:** `app.use(helmet())` with no arguments uses defaults: HSTS maxAge 180 days, frameguard SAMEORIGIN. These are weaker than recommended production values. contentSecurityPolicy and crossOriginEmbedderPolicy defaults can also break cross-origin asset loading.
- **File:Line:** `backend/services/api-gateway/src/index.ts:96-97`
- **Fix Applied:** Explicitly configured helmet with: (1) `hsts.maxAge: 31536000` (1 year, up from 180 days). (2) `frameguard: { action: 'deny' }` (was SAMEORIGIN). (3) `contentSecurityPolicy: false` (requires per-portal tuning, deferred). (4) `crossOriginEmbedderPolicy: false` (cross-origin fonts/images).
- **Why This Is Safe:** Same middleware, stronger configuration. All other helmet defaults (hidePoweredBy, noSniff, xssFilter, etc.) remain enabled. The frameguard change from SAMEORIGIN to DENY is stricter (no iframe embedding at all) — correct for an API gateway that serves no iframes. CSP disabled explicitly rather than silently failing.

### ISSUE-MICRO-034 (P1): Hardcoded secrets in docker-compose
- **Axis:** C (Auth)
- **Root Cause:** `ADMIN_TOKEN`, `JWT_SECRET`, `DB_PASSWORD`, `RAZORPAY_*` values hardcoded in plain text in the compose file. While these are local-dev values, the file is committed to git and could leak if copy-pasted to production.
- **File:Line:** `scripts/docker-compose.local-prod.yml:43,78,175`
- **Fix Applied:** All secrets now use `${VAR:-default}` pattern: `POSTGRES_PASSWORD`, `DB_PASSWORD`, `ADMIN_TOKEN`, `JWT_SECRET`, `DATABASE_URL`, `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_ACCOUNT_NUMBER`. Defaults preserved for zero-config local dev. Override via `scripts/.env` or shell environment.
- **Why This Is Safe:** `${VAR:-default}` is native Docker Compose syntax. When env vars are not set, the default values are used — identical behavior to before. Existing local-dev workflows are unaffected. Production uses GCP Secret Manager (already configured in deploy.yml).

### ISSUE-MICRO-035 (P1): Containers missing resource limits
- **Axis:** E (Scale)
- **Root Cause:** No `deploy.resources.limits` on any service. A runaway container (memory leak, CPU spin) could starve other services and crash the host.
- **File:Line:** `scripts/docker-compose.local-prod.yml:all services`
- **Fix Applied:** Added `deploy.resources.limits` to all 16 services: postgres (1 CPU, 1GB), main-backend (1 CPU, 512MB), redis/microservices (0.5 CPU, 256MB), static frontends (0.25 CPU, 128MB), supplier-portal (0.5 CPU, 256MB — Next.js SSR).
- **Why This Is Safe:** Resource limits are enforced by Docker runtime. If a container hits its limit, it's throttled (CPU) or OOM-killed (memory) — better than crashing the host. The limits are generous enough for local-dev workloads. Production limits are set independently in deploy.yml (`--memory=512Mi --cpu=1`).

### ISSUE-MICRO-036 (P1): Hardcoded localhost portal URLs in landing page
- **Axis:** F (Obs)
- **Root Cause:** The `<script>` block at lines 453-472 contains hardcoded `localhost:8081/8082/8083` port mappings for local-dev portal URL rewriting.
- **File:Line:** `supermandi-landing/index.html:453-472`
- **Fix Applied:** Added documentation comment explaining the safety: the script checks `location.hostname` and only activates when running on `localhost` or `127.0.0.1`. In production, the script is a complete no-op — all nav links use relative paths (`/supplier/login`, `/retailer/login`, `/admin/`).
- **Why This Is Safe:** The nav links in the HTML are already relative paths (correct for production where all portals share one domain via reverse proxy). The script is a local-dev helper with an explicit hostname guard. Adding documentation clarifies this for future audits.

### ISSUE-MICRO-037 (P1): Main backend Dockerfile runs as root
- **Axis:** C (Auth)
- **Root Cause:** The runner stage has no `USER` directive — the Node.js process runs as root inside the container. If the application is compromised, the attacker has root access to the container filesystem.
- **File:Line:** `backend/Dockerfile.main:35-69`
- **Fix Applied:** Added after all COPY/RUN commands: (1) `addgroup -g 1001 -S nodejs` + `adduser -S nodejs -u 1001` — creates non-root user. (2) `chown -R nodejs:nodejs /app` — transfers ownership of app directory. (3) `USER nodejs` — switches to non-root user for CMD.
- **Why This Is Safe:** The entrypoint (`docker-entrypoint.sh`) runs migrations (SQL via network, no filesystem writes) then `exec node dist/server.js`. Both operations only need read access to the app directory + network access to PostgreSQL. The `chown` ensures the `nodejs` user owns all app files. This follows Node.js Docker best practices (node:20-alpine already includes a `node` user, but we create `nodejs` with explicit GID/UID for consistency).

### ISSUE-MICRO-038 (P1): Missing artifact digest verification in deploy workflow
- **Axis:** F (Obs)
- **Root Cause:** The deploy-staging job deploys images by tag (`IMAGE:SHA`) without verifying that the images actually exist in Artifact Registry. If the build-push job partially failed or a tag was overwritten, the deploy could use wrong or missing images.
- **File:Line:** `.github/workflows/deploy.yml:212`
- **Fix Applied:** Added "Verify image digests in Artifact Registry" step before any deploy commands. This step queries AR for each of the 14 images using `gcloud artifacts docker images describe`, verifies they exist, and logs their SHA256 digests. If any image is missing, the job fails with `BLOCKED` before deploying.
- **Why This Is Safe:** Verification is read-only — it only queries AR, doesn't modify anything. If verification passes, the existing deploy commands run unchanged. If verification fails, the deploy is blocked (fail-fast). The `needs: build-push` dependency already ensures images should exist, but this adds defense-in-depth.

### ISSUE-MICRO-039 (P1): Missing OG meta tags on landing page
- **Axis:** A (UI)
- **Root Cause:** The landing page `<head>` has `<title>` and `<meta name="description">` but no Open Graph tags. When shared on social media (Twitter, LinkedIn, WhatsApp), the link preview shows no title, description, or image.
- **File:Line:** `supermandi-landing/index.html:1-15`
- **Fix Applied:** Added `og:title`, `og:description`, `og:type`, and `og:url` meta tags after the existing description tag. Values match the existing title and description.
- **Why This Is Safe:** Additive HTML change — adds `<meta property="og:*">` tags in the `<head>`. No JavaScript, no layout change, no functional change. Standard Open Graph protocol supported by all social platforms.

### ISSUE-MICRO-078 (P2): pnpm cache not configured in CI workflow
- **Axis:** F (Obs)
- **Root Cause:** The CI workflow uses `pnpm/action-setup@v2` to install pnpm but doesn't cache the pnpm store. Every CI run downloads all backend dependencies from the registry, adding 30-60 seconds to each job.
- **File:Line:** `.github/workflows/ci-gates.yml:54-56`
- **Fix Applied:** Added pnpm store caching to all 3 CI jobs (typecheck, lint, test): (1) `pnpm store path` step to get the platform-specific store directory. (2) `actions/cache@v4` with key based on `backend/pnpm-lock.yaml` hash. Cache is shared across jobs via the same key prefix.
- **Why This Is Safe:** `actions/cache@v4` is a standard GitHub Actions cache mechanism. The cache key includes the lockfile hash — any dependency change invalidates the cache. The `restore-keys` fallback allows partial cache hits. No change to build behavior — only performance improvement.

---

## Gates Run

| Gate | Result |
|------|--------|
| `pnpm -r typecheck` | **0 errors across all 22 projects** |
| API contract changes | **None** |
| New dependencies | **None** |
| Schema changes | **None** |
| New files | **None** |

---

## Blackbox Tests (Operator-Run)

### Test 1: Non-root user in backend container (ISSUE-MICRO-037)
- **Step:** Rebuild main-backend Docker image → run → exec `whoami` inside the container.
- **Expected:** `docker exec main-backend whoami` returns `nodejs` (not `root`). Container starts normally, migrations run, server starts.
- **PASS/FAIL:** ___

### Test 2: Security headers on API response (ISSUE-MICRO-033)
- **Step:** `curl -I http://localhost:8080/health` after starting local-prod stack.
- **Expected:** Response includes `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`. No `X-Powered-By` header.
- **PASS/FAIL:** ___

### Test 3: No plaintext secrets in compose (ISSUE-MICRO-034)
- **Step:** `grep -E "ADMIN_TOKEN:|JWT_SECRET:|DB_PASSWORD:|RAZORPAY_" scripts/docker-compose.local-prod.yml`
- **Expected:** All lines use `${VAR:-default}` pattern. No bare plaintext values.
- **PASS/FAIL:** ___

### Test 4: Resource limits applied (ISSUE-MICRO-035)
- **Step:** `docker compose -f scripts/docker-compose.local-prod.yml config | grep -A2 "limits"` or inspect running containers.
- **Expected:** Each service has `cpus` and `memory` limits. No service exceeds its allocated resources.
- **PASS/FAIL:** ___

### Test 5: Landing page URLs (ISSUE-MICRO-036)
- **Step:** Open `http://localhost:8084` in browser → View Source → check nav links.
- **Expected:** Nav links are relative paths (`/supplier/login`, `/retailer/login`, `/admin/`). The localhost rewrite script is guarded by hostname check. On production domain, links remain relative.
- **PASS/FAIL:** ___

### Test 6: OG meta tags (ISSUE-MICRO-039)
- **Step:** View source of landing page → search for `og:`.
- **Expected:** `og:title`, `og:description`, `og:type`, `og:url` present in `<head>`.
- **PASS/FAIL:** ___

### Test 7: Full Docker stack health (critical)
- **Step:** `docker compose -f scripts/docker-compose.local-prod.yml up -d --build` → wait → `docker compose ps`.
- **Expected:** All 17 containers healthy. Health endpoints return 200. No crashes from resource limits or non-root user.
- **PASS/FAIL:** ___

---

## VERDICT: PENDING OPERATOR SIGN-OFF
