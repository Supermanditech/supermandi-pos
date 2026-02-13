# Q5: What Can Go Wrong Between Git and GCP

> **Answer to:** "While this 3000 tickets what may go wrong in between git and gcp while achieving production grade development?"

---

## Layer 1: Git (Code) Failures

| # | Failure | How It Happens | Guardrail |
|---|---------|---------------|-----------|
| G1 | Merge conflict breaks main | Two PRs touch same file, auto-merge corrupts | CI gates catch: typecheck + tests fail on main |
| G2 | Regression from ticket X breaks feature Y | Fix in service A breaks API contract for service B | Cross-platform E2E tests (Playwright 16 specs) |
| G3 | Forgotten file not committed | `.gitignore` too aggressive, or `git add` misses file | CI build fails (missing import) |
| G4 | Secret committed to repo | Hardcoded password in code | `.gitignore` + CI secret scan + PR review |
| G5 | Wrong branch merged | Feature branch merged before base is ready | One ticket = one branch = one PR (CLAUDE_STATE.md G.1) |
| G6 | Migration ordering broken | Two tickets add migrations with conflicting sequence numbers | Sequential ticket execution (never parallel schema changes) |
| G7 | State file drift | CLAUDE_CURRENT_STATE.json not updated after merge | Post-merge update protocol (E4) |

---

## Layer 2: CI (Build + Test) Failures

| # | Failure | How It Happens | Guardrail |
|---|---------|---------------|-----------|
| C1 | Docker build fails | Missing dependency, wrong Node version, bad COPY path | CI gates run `docker build` on every PR |
| C2 | Tests pass locally but fail in CI | Different Node version, missing env var, timezone | CI is truth — local results are advisory only |
| C3 | AR push fails | Auth expired, quota hit, network timeout | deploy.yml retries + WIF auto-refresh |
| C4 | CI gates pass but deploy fails | Tests don't cover the deploy path | Smoke test job in deploy.yml (health + version check) |
| C5 | Flaky test blocks merge | Intermittent timeout in integration test | Retry logic in CI + test isolation |
| C6 | Build time grows unbounded | 6 Docker images × growing codebase | Layer caching, multi-stage builds |
| C7 | GitHub Actions quota exhausted | Too many runs (uptime probe was doing 288/day) | Cron disabled until needed, concurrency groups |

---

## Layer 3: GCP (Deploy + Runtime) Failures

| # | Failure | How It Happens | Guardrail |
|---|---------|---------------|-----------|
| D1 | Migration fails on Cloud SQL | Schema conflict, data constraint violation, timeout | `migrate-prod.js --dry-run` before real run |
| D2 | Cloud Run cold start timeout | Service takes >60s to boot with all migrations | `min-instances=1` in production |
| D3 | Secret Manager version mismatch | Secret updated but Cloud Run revision uses old version | `--set-secrets=SECRET:latest` always pulls current |
| D4 | VPC connector exhaustion | Too many concurrent connections to Cloud SQL | Connection pooling in backend, max-instances cap |
| D5 | Image digest mismatch | CI builds image, but deploy pulls different tag | deploy.yml verifies digest before deploy |
| D6 | Rollback needed but data migrated forward | New migration added columns, rollback to old code fails | Migration backward compatibility rule |
| D7 | Service-to-service auth failure | api-gateway can't reach main-backend | `ADMIN_SERVICE_URL` set from deploy output |
| D8 | Memory/CPU limit hit | 512Mi not enough for large requests | Cloud Run metrics → adjust limits |
| D9 | SSL cert expiration | Managed cert not renewed | Cloud Run auto-manages certs |
| D10 | Region outage (asia-south1) | GCP region failure | Accept risk for MVP (multi-region is post-launch) |

---

## Layer 4: Cross-Cutting Failures

| # | Failure | How It Happens | Guardrail |
|---|---------|---------------|-----------|
| X1 | 45-54 commit gap creates cascading issues | Bulk deploy of many changes at once | Deploy once, verify with smoke tests, test per-portal |
| X2 | Operator reports issue, Claude fixes wrong thing | Miscommunication, Claude loses context | CLAUDE_CURRENT_STATE.json tracks exact state |
| X3 | Fix for ticket A reverts fix for ticket B | Overlapping file changes | Pre-merge diff review + full test re-run |
| X4 | Staging works but production breaks | Different secrets, different DB state | Build once deploy everywhere (same image digest) |
| X5 | DNS not pointing to new services | A records still point to dead VM | DNS cleanup (operator completed) |
| X6 | Firebase auth mismatch | Frontend built with wrong Firebase config | Build-time args from GitHub secrets |

---

## Risk Severity Matrix

```
CRITICAL (blocks everything):
  D1 (migration failure)     → rollback + fix + redeploy
  G6 (migration ordering)    → never run parallel schema tickets
  X1 (bulk deploy cascade)   → smoke test immediately after deploy

HIGH (blocks one platform):
  D7 (service-to-service)    → verify ADMIN_SERVICE_URL in deploy output
  C4 (deploy succeeds but broken) → smoke test catches this
  G2 (cross-service regression) → Playwright E2E catches this

MEDIUM (degraded experience):
  D2 (cold start)            → acceptable for staging, fix for prod
  D4 (connection exhaustion) → monitor Cloud SQL connections
  D8 (resource limits)       → Cloud Run metrics

LOW (inconvenience):
  C6 (slow builds)           → optimize later
  G7 (state drift)           → update protocol handles this
```

---

## The 3 Most Likely Failures on First Deploy

1. **D1: Migration fails** — 57 migrations running for first time on Cloud SQL. Mitigated by: dry-run first, Cloud SQL backup before run.
2. **D7: api-gateway can't reach main-backend** — New deploy order (main-backend first, capture URL, pass to api-gateway). Mitigated by: deploy.yml captures URL via `$GITHUB_OUTPUT`.
3. **X1: Bulk changes cause unexpected interaction** — 76 PRs deploying at once. Mitigated by: post-deploy smoke test + operator portal-by-portal verification.
