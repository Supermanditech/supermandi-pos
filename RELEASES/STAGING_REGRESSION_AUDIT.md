# Staging Regression Audit: Deploy → Test → Fix → Redeploy Loop Analysis

> **Generated**: 2026-02-13 | **Audited by**: Claude (full pipeline + code review)
> **Scope**: deploy.yml → Docker images → Cloud Run → STAGING_VERIFY.ps1 → fix cycle
> **Goal**: Ensure staging testing is production-grade with zero regression loops

---

## Executive Summary

Found **12 regression loops** in the deploy-test-fix-redeploy cycle. Each loop represents a scenario where fixing a staging bug can introduce new bugs, or where a failure mode is silently swallowed, causing cascading issues.

| Severity | Count | Description |
|----------|-------|-------------|
| CRITICAL | 4 | Can cause data loss, silent deploy failures, or irrecoverable state |
| HIGH | 4 | Can cause staging testing to miss real bugs or create fix→break cycles |
| MEDIUM | 3 | Can cause confusion, wasted debugging time, or security gaps |
| LOW | 1 | Configuration hygiene |

---

## REGRESSION LOOP MATRIX

### LOOP 1: AUTO-MIGRATION WITHOUT BACKUP OR DRY-RUN [CRITICAL]

**The Problem:**
```
merge to main → CI passes → deploy.yml auto-triggers → docker-entrypoint.sh
runs `migrate-prod.js up` → ALL pending migrations auto-apply → NO UNDO
```

**Why This Is Regressive:**
- 133 migrations exist, ZERO `.down.sql` files
- docker-entrypoint.sh auto-runs migrations on every container start
- deploy.yml has NO Cloud SQL backup step before deploy
- No `migrate-prod.js dry-run` in the pipeline
- If a migration creates a table with wrong schema, drops a column, or corrupts data → no rollback path
- The only recovery is a manual Cloud SQL restore from the 03:00 UTC daily backup (up to 24h of data loss)

**Evidence:**
- `backend/scripts/docker-entrypoint.sh:30` — `node /app/scripts/migrate-prod.js up` (auto-run)
- `backend/migrations/` — 133 `.sql` files, 0 `.down.sql` files
- `backend/scripts/migrate-prod.js:35-37` — `rollbackMigration()` exists but needs `.down.sql` files that don't exist
- `.github/workflows/deploy.yml` — No `gcloud sql backups create` step

**Ticket: STAGE-001**

---

### LOOP 2: PARTIAL DEPLOY (NON-ATOMIC 6-SERVICE DEPLOY) [CRITICAL]

**The Problem:**
```
main-backend deploys (v2) → api-gateway fails → portals deploy (v2)
= main-backend on v2, api-gateway on v1, portals on v2
= API contract mismatch between gateway and backend
```

**Why This Is Regressive:**
- Services deploy sequentially: main-backend → api-gateway → 4 portals
- If api-gateway deploy fails, main-backend is already on the new SHA
- Portal deploy failures are SWALLOWED: `|| echo "WARN: $portal deploy failed"` (deploy.yml:367)
- No atomic rollback — you'd need to manually revert each service
- Different SHAs across services = unpredictable behavior

**Evidence:**
- `.github/workflows/deploy.yml:350-369` — Portal loop with `|| echo "WARN"`
- No `exit 1` on portal deploy failure
- No SHA consistency check after all deploys

**Ticket: STAGE-002**

---

### LOOP 3: SMOKE TEST IS NON-BLOCKING [CRITICAL]

**The Problem:**
```
deploy succeeds → smoke-test runs → /health returns 500 → pipeline shows "WARN"
→ operator doesn't notice → merges next commit → deploys AGAIN on broken state
```

**Why This Is Regressive:**
- deploy.yml smoke-test job checks /health and /version but only WARNs on failure
- No `exit 1` if health check fails (deploy.yml:405-407)
- No automated rollback on failed smoke test
- The pipeline "succeeds" even if staging is completely broken
- Next merge to main auto-deploys AGAIN on top of broken staging

**Evidence:**
- `.github/workflows/deploy.yml:404-407` — `echo "WARN: Health check returned $STATUS"` (no exit 1)
- `.github/workflows/deploy.yml:416-418` — `echo "WARN: SHA mismatch"` (no exit 1)

**Ticket: STAGE-003**

---

### LOOP 4: DUAL SCHEMA INITIALIZATION (ensureSchema + migrate-prod.js) [CRITICAL]

**The Problem:**
```
Container starts → docker-entrypoint.sh runs migrate-prod.js up (133 migrations)
→ then server.ts calls ensureCoreSchema() (500 lines of DDL)
→ both create/alter tables independently → conflicts possible
```

**Why This Is Regressive:**
- `migrate-prod.js` runs 133 sequential migration files (proper migration system)
- `ensureCoreSchema()` is a 500-line legacy DDL script that creates tables, renames columns, adds indexes
- These two systems can conflict: ensureSchema may CREATE a table that a migration expects to ALTER
- ensureSchema runs on EVERY server cold start (not just first deploy)
- On Cloud Run scale-up (0→3 instances), three instances run ensureSchema simultaneously
- Advisory locks use DIFFERENT IDs: migrate-prod uses 839271, ensureSchema uses 839201

**Evidence:**
- `backend/scripts/docker-entrypoint.sh:30,35` — migrate then start server
- `backend/src/server.ts:33` — `await ensureCoreSchema()`
- `backend/src/db/ensureSchema.ts` — 660 lines of DDL, lock ID 839201
- `backend/scripts/migrate-prod.js:49` — lock ID 839271

**Ticket: STAGE-004**

---

### LOOP 5: NODE_ENV=staging SKIPS ALL FAIL-FAST CHECKS [HIGH]

**The Problem:**
```
deploy.yml sets NODE_ENV=staging → api-gateway config.ts checks NODE_ENV==='production'
→ missing ADMIN_SERVICE_URL silently falls back to http://localhost:3010
→ all requests get "connection refused" at runtime → looks like a code bug
```

**Why This Is Regressive:**
- api-gateway config.ts (lines 40, 59): fail-fast only when `NODE_ENV === 'production'`
- deploy.yml sets `NODE_ENV=staging` for main-backend (line 284)
- All fail-fast checks for missing env vars are bypassed in staging
- If an env var is accidentally removed from deploy.yml, staging silently falls back to localhost defaults
- Operator wastes hours debugging "connection refused" thinking it's a code issue
- Test auth routes (`/api/test/mint-token`) are ENABLED on public staging URL

**Evidence:**
- `backend/services/api-gateway/src/config.ts:40-42` — production-only fail-fast
- `backend/services/api-gateway/src/routes/testAuth.ts:52-58` — production-only disable
- `.github/workflows/deploy.yml:283-284` — `NODE_ENV=staging`

**Ticket: STAGE-005**

---

### LOOP 6: STAGING_VERIFY.ps1 DOESN'T VERIFY MIGRATIONS [HIGH]

**The Problem:**
```
Deploy → 130 of 133 migrations apply, 3 fail silently → /health returns OK
→ STAGING_VERIFY.ps1 passes → features depending on those 3 migrations fail at runtime
→ operator thinks it's a code bug → creates fix → redeploys → same 3 migrations fail again
```

**Why This Is Regressive:**
- STAGING_VERIFY.ps1 Phase 5 says "DB connectivity verified via main-backend /health"
- But /health returns OK as long as the server starts — it doesn't check migration completeness
- No verification of migration count or schema integrity
- No comparison between expected (133 files) and applied (N in _migrations table)
- A partial migration failure creates a state where some features work and others don't

**Evidence:**
- `RELEASES/STAGING_VERIFY.ps1:167-172` — DB check is just "implied by health"
- `backend/src/app.ts:85-95` — /health returns `{status: "ok"}` regardless of migration state

**Ticket: STAGE-006**

---

### LOOP 7: NO AUTO-ROLLBACK ON DEPLOY FAILURE [HIGH]

**The Problem:**
```
Deploy v2 → health check fails → staging is broken → operator must manually
run `gcloud run services update-traffic --to-revisions=PREVIOUS=100` for EACH service
→ but which services? Which revisions? → operator guesses → partial rollback → more broken
```

**Why This Is Regressive:**
- Rollback is mentioned only in comments: `promote-to-prod.sh:207-209`
- No automated rollback script exists
- Rolling back 6 services manually is error-prone
- No record of "previous working revision" per service
- If main-backend is rolled back but api-gateway is not → SHA mismatch
- Migration rollback is impossible (no .down.sql files) — only Cloud SQL restore

**Evidence:**
- `scripts/promote-to-prod.sh:207-209` — Rollback is just a printed suggestion
- No `rollback-staging.sh` or `rollback-staging.ps1` script exists

**Ticket: STAGE-007**

---

### LOOP 8: FIREBASE SERVER-SIDE VERIFICATION WILL FAIL [HIGH]

**The Problem:**
```
Deploy → FIREBASE_ENABLED=true + FIREBASE_PROJECT_ID set
→ app.ts calls initializeFirebase() → uses Application Default Credentials
→ Cloud Run compute SA has no Firebase Admin permissions → OTP verification fails
→ Looks like a code bug → fix attempts don't help → it's a missing IAM binding
```

**Why This Is Regressive:**
- deploy.yml sets `FIREBASE_ENABLED=true` and `FIREBASE_PROJECT_ID=supermandi-pos`
- No `FIREBASE_SERVICE_ACCOUNT_PATH` is set (no key file mounted)
- Firebase Admin SDK falls back to Application Default Credentials (Cloud Run SA)
- Cloud Run default SA (`807429885586-compute@developer.gserviceaccount.com`) likely lacks `firebase.admin` or `firebaseauth.admin` roles
- Phone OTP verification via server-side Firebase will fail silently or throw
- app.ts:29-31 catches the error as a warning, so the server starts but OTP doesn't work

**Evidence:**
- `.github/workflows/deploy.yml:294-295` — FIREBASE_ENABLED=true, FIREBASE_PROJECT_ID set
- `.github/workflows/deploy.yml` — No FIREBASE_SERVICE_ACCOUNT_PATH set
- `backend/src/app.ts:22-34` — Firebase init with warn-only error handling
- `memory/GCP_STAGING_STATE.md:130` — SA roles listed, no Firebase roles

**Ticket: STAGE-008**

---

### LOOP 9: COMMITTED FIREBASE KEYS vs GITHUB SECRETS DRIFT [MEDIUM]

**The Problem:**
```
supplier-portal/.env.production committed to git with Firebase keys
→ deploy.yml injects DIFFERENT Firebase keys from GitHub Secrets
→ Next.js reads .env.production THEN overlays build args
→ Which values win? Build args should win, but if build fails...
→ Local builds use committed keys, CI uses secrets → different behavior
```

**Why This Is Regressive:**
- `supplier-portal/.env.production` is tracked by git (confirmed: `git ls-files` lists it)
- Contains real Firebase API key: `AIzaSyAF67YOn6DJC0UdHGMOYYeKLUem1EB68LM`
- deploy.yml also passes Firebase keys as `--build-arg NEXT_PUBLIC_FIREBASE_*`
- Next.js build reads .env.production, then build args override matching vars
- If someone updates GitHub Secrets but not the committed file → confusion
- If someone builds locally using the committed file → different Firebase project?

**Evidence:**
- `supplier-portal/.env.production:7-13` — Firebase keys committed to git
- `.github/workflows/deploy.yml:143-148` — Firebase keys from GitHub Secrets
- `.gitignore:82` — `**/.env.production` listed but supplier-portal/.env.production was added before this rule

**Ticket: STAGE-009**

---

### LOOP 10: PAYMENT_SERVICE_URL POINTS TO DEAD SERVICE [MEDIUM]

**The Problem:**
```
deploy.yml sets PAYMENT_SERVICE_URL=$MB_URL (same as main-backend URL)
→ api-gateway config routes /api/v1/payments/* to PAYMENT_SERVICE_URL with stripPrefix: true
→ Strips /api/v1/payments and forwards to main-backend root
→ main-backend doesn't expect traffic at its root path → 404 or wrong handler
```

**Why This Is Regressive:**
- api-gateway config.ts:368-373 routes `payments` to `getPaymentServiceUrl()` with `stripPrefix: true`
- deploy.yml:343 sets `PAYMENT_SERVICE_URL=$MB_URL` (main-backend's Cloud Run URL)
- With stripPrefix, request `/api/v1/payments/health` → main-backend receives `/health`
- But `/api/v1/payments/create` → main-backend receives `/create` → 404
- Payment logic is in main-backend at `/api/v1/pos/payments/*`, not at root
- The only working route would be `/api/v1/payments/health` → `/health` (gateway's own)

**Evidence:**
- `backend/services/api-gateway/src/config.ts:368-373` — stripPrefix: true for payments
- `.github/workflows/deploy.yml:343` — `PAYMENT_SERVICE_URL=$MB_URL`
- Comment in config.ts:352-366 acknowledges this is a future migration path

**Ticket: STAGE-010**

---

### LOOP 11: OPENAI_API_KEY MISSING FROM DEPLOY [MEDIUM]

**The Problem:**
```
main-backend voice routes registered → OPENAI_API_KEY not set → any voice API call → 500 error
→ Looks like backend bug → operator creates ticket → Claude debugs → finds missing env var
→ Can't fix without operator adding to deploy.yml + Secret Manager
```

**Why This Is Regressive:**
- Voice service at `/api/v1/voice/*` is routed through api-gateway to main-backend
- main-backend requires `OPENAI_API_KEY` for voice/AI features
- deploy.yml doesn't set OPENAI_API_KEY for main-backend
- Any staging test that hits voice endpoints → immediate 500
- Not a regression loop per se, but blocks testing of voice features

**Evidence:**
- `backend/services/api-gateway/src/config.ts:254-259` — voice routes to main-backend
- `.github/workflows/deploy.yml` — grep for OPENAI_API_KEY returns 0 results
- `backend/.env.example` — lists OPENAI_API_KEY as required

**Ticket: STAGE-011**

---

### LOOP 12: PORT FALLBACK MISMATCH [LOW]

**The Problem:**
- Dockerfile.main sets `ENV PORT=3010`
- server.ts uses `process.env.PORT || 3001` (fallback is 3001, not 3010)
- Cloud Run injects its own PORT (typically 8080)
- If Dockerfile ENV is removed and Cloud Run PORT injection fails → server on 3001, health check expects 3010

**Why This Is a Risk (Low):**
- Currently works because Dockerfile sets PORT=3010 and Cloud Run overrides it
- The 3001 fallback in server.ts is from the pre-Docker era
- Unlikely to cause issues in practice, but inconsistency invites future bugs

**Evidence:**
- `backend/Dockerfile.main:71` — `ENV PORT=3010`
- `backend/src/server.ts:8` — `const PORT = process.env.PORT || 3001`

**Ticket: STAGE-012**

---

## TICKET SUMMARY TABLE

| ID | Title | Severity | Type | Blocker? |
|----|-------|----------|------|----------|
| STAGE-001 | Add pre-deploy Cloud SQL backup + migration dry-run to deploy.yml | CRITICAL | Claude + Operator | YES — before first deploy |
| STAGE-002 | Make portal deploy failures fail the pipeline (remove `\|\| echo`) | CRITICAL | Claude | YES — before first deploy |
| STAGE-003 | Make smoke test failures fail the pipeline + auto-rollback | CRITICAL | Claude | YES — before first deploy |
| STAGE-004 | Remove ensureCoreSchema() — rely solely on migrate-prod.js | CRITICAL | Claude | NO — but do before 2nd deploy |
| STAGE-005 | Add NODE_ENV=staging to fail-fast checks (not just production) | HIGH | Claude | YES — before first deploy |
| STAGE-006 | Add migration count verification to STAGING_VERIFY.ps1 | HIGH | Claude | YES — before first deploy |
| STAGE-007 | Create staging rollback script (rollback-staging.ps1) | HIGH | Claude | YES — before first deploy |
| STAGE-008 | Configure Firebase Admin IAM for Cloud Run SA (or mount SA key) | HIGH | Operator | YES — before testing auth |
| STAGE-009 | Remove committed supplier-portal/.env.production from git | MEDIUM | Claude | NO |
| STAGE-010 | Fix PAYMENT_SERVICE_URL routing (remove stripPrefix or disable route) | MEDIUM | Claude | NO — payments not in scope |
| STAGE-011 | Add OPENAI_API_KEY to deploy.yml (or disable voice routes in staging) | MEDIUM | Claude + Operator | NO — voice not in scope |
| STAGE-012 | Align PORT fallback in server.ts with Dockerfile (3010 not 3001) | LOW | Claude | NO |

---

## EXECUTION ORDER (Dependency-Aware)

```
BEFORE FIRST DEPLOY (Blockers):
  STAGE-001 (backup + dry-run)  ─┐
  STAGE-002 (portal fail = fail) ├─ All must be merged before operator triggers deploy
  STAGE-003 (smoke = blocking)   │
  STAGE-005 (staging fail-fast)  │
  STAGE-006 (verify migrations)  │
  STAGE-007 (rollback script)   ─┘

OPERATOR PREREQUISITE:
  STAGE-008 (Firebase IAM)  ← operator action, blocks auth testing

AFTER FIRST DEPLOY (Non-blocking):
  STAGE-004 (remove ensureSchema)  ← needs careful migration audit first
  STAGE-009 (remove committed .env)
  STAGE-010 (fix payment route)
  STAGE-011 (OPENAI_API_KEY)
  STAGE-012 (PORT alignment)
```
