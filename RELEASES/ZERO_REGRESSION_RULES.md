# ZERO REGRESSION RULES - SuperMandi Production Go-Live

## ABSOLUTE COMMITMENT: 0.000% Regression Guarantee

**This document is LAW. Any violation = BLOCKED DEPLOY.**

---

## PART 1: ARTIFACT IMMUTABILITY

### Rule 1.1: One Build, Three Environments
```
LOCAL BUILD ──► STAGING DEPLOY ──► PROD DEPLOY
    │                │                  │
    └────────────────┴──────────────────┘
              SAME DOCKER IMAGE SHA
```

**Enforcement:**
- Docker image is built ONCE in CI
- Same image SHA deployed to staging AND production
- NO rebuilding between staging and prod
- Image SHA recorded in BATCH_LEDGER.md

### Rule 1.2: Dependency Lock
```
pnpm-lock.yaml MUST be committed
package.json changes = FULL regression test
```

**Enforcement:**
- `pnpm install --frozen-lockfile` in CI (fails if lock differs)
- Any dependency change = new batch, full testing cycle

### Rule 1.3: No Code Changes After Staging Approval
```
STAGING APPROVED ──► PROD DEPLOY
       │
       └── ZERO code changes allowed
```

**Enforcement:**
- Staging approval records git SHA
- Prod deploy MUST use exact same SHA
- Any hotfix = new batch, starts from beginning

---

## PART 2: ENVIRONMENT PARITY

### Rule 2.1: Zero Hardcoded Values
```typescript
// FORBIDDEN - Instant deploy block
const API_URL = "https://api.supermandi.tech"
const DB_HOST = "34.xxx.xxx.xxx"
fetch("http://localhost:3000/api")

// REQUIRED - All external via env
const API_URL = process.env.NEXT_PUBLIC_API_URL
const DB_HOST = process.env.DATABASE_HOST
fetch(`${process.env.API_BASE_URL}/api`)
```

**Enforcement:**
- Pre-commit hook scans for hardcoded URLs/IPs
- CI grep check for forbidden patterns
- Violation = build fails

### Rule 2.2: Environment Variable Registry
Every env var MUST be documented:

| Variable | Local | Staging | Prod | Required |
|----------|-------|---------|------|----------|
| DATABASE_URL | .env.local | Secret Manager | Secret Manager | YES |
| REDIS_URL | .env.local | Secret Manager | Secret Manager | YES |
| API_BASE_URL | localhost:3000 | staging-api.supermandi.tech | api.supermandi.tech | YES |
| NEXTAUTH_SECRET | .env.local | Secret Manager | Secret Manager | YES |

**Enforcement:**
- Missing env var = app crashes on startup (fail-fast)
- CI validates all required vars exist in Secret Manager before deploy

### Rule 2.3: Database Schema Parity
```
LOCAL SCHEMA === STAGING SCHEMA === PROD SCHEMA
```

**Enforcement:**
- Migrations ONLY via `backend/scripts/migrate-prod.js` (no manual SQL)
- **Normal cadence**: Migration runs automatically on container startup
- **First deploy exception (MEGA-RC only)**: Manual migration execution
  with Cloud SQL backup + `migrate-prod.js dry-run` before apply.
  See MASTER_PLAN.md BATCH-010 Migration Safety Protocol.
  After first successful deploy, auto-migration resumes.
- Schema diff check in CI before deploy
- Drift detected = deploy blocked

---

## PART 3: TESTING GATES (ALL MUST PASS)

### Gate 1: Type Safety
```powershell
pnpm -r typecheck
```
- 0 errors allowed
- Warnings reviewed and approved

### Gate 2: Unit Tests
```powershell
pnpm test:ci
```
- 100% pass rate required
- No skipped tests without ticket ID

### Gate 2.5: Production Build
```powershell
pnpm -r build
```
- All projects must build successfully (exit 0)
- Build failures = BLOCKED

### Gate 3: E2E Tests (Local)
```powershell
cd e2e-tests
node .\node_modules\@playwright\test\cli.js test --grep "@prod"
```
- All @prod tests pass against local stack
- Screenshots captured for evidence

### Gate 4: E2E Tests (Staging)
```powershell
cd e2e-tests
$env:STAGING="true"; node .\node_modules\@playwright\test\cli.js test --grep "@prod"
```
- All @prod tests pass against staging
- Video recordings for critical flows

### Gate 5: Manual Testing Matrix

| Portal | Tester | Device | Browser | Status |
|--------|--------|--------|---------|--------|
| Retailer | Operator | PC | Chrome Incognito | [ ] |
| Supplier | Operator | PC | Chrome Incognito | [ ] |
| Admin | Operator | PC | Chrome Incognito | [ ] |
| POS | Operator | Redmi | Expo Go | [ ] |

**Every checkbox MUST be ticked with evidence screenshot.**

---

## PART 4: DEPLOYMENT PROCESS

### Step 1: Local Verification
```
[ ] All code changes have ticket IDs
[ ] pnpm -r typecheck passes
[ ] pnpm -r build passes
[ ] pnpm test:ci passes
[ ] Local E2E passes
[ ] Manual browser testing complete
[ ] Evidence screenshots collected
```

### Step 2: Git Push + CI
```
[ ] Push to main (Mode A) or merge PR to main (Mode B)
[ ] CI builds Docker image
[ ] CI runs all gates
[ ] CI pushes image to Artifact Registry
[ ] Image SHA recorded: _______________
```

### Step 3: Staging Deploy
```
[ ] Deploy image SHA to staging Cloud Run
[ ] Run staging E2E tests
[ ] Manual staging verification
[ ] Staging URL: _______________
[ ] All 4 portals tested
```

### Step 4: Staging Sign-off
```
[ ] Operator confirms staging works
[ ] Evidence collected in RELEASES/EVIDENCE/BATCH-XXX/
[ ] Sign-off recorded in BATCH_LEDGER.md
[ ] STAGING_APPROVED_SHA: _______________
```

### Step 5: Production Deploy
```
[ ] Verify PROD_SHA === STAGING_APPROVED_SHA
[ ] Deploy to production Cloud Run
[ ] Health check passes
[ ] Smoke test on production
[ ] PROD_DEPLOYED_SHA: _______________
```

### Step 6: Production Verification
```
[ ] All 4 portals accessible
[ ] Login/logout works
[ ] Critical transaction tested
[ ] Monitoring shows no errors
[ ] DEPLOY COMPLETE
```

---

## PART 5: ROLLBACK PROTOCOL

### Rollback Trigger Conditions
- Any 5xx error in production
- Any critical flow broken
- Any data corruption detected
- User-reported blocking issue

### Rollback Process (< 5 minutes)
```powershell
# Instant rollback to previous revision
gcloud run services update-traffic supermandi-api \
  --to-revisions=PREVIOUS_REVISION=100 \
  --region=asia-south1

# Verify rollback
curl https://api.supermandi.tech/api/v1/health
```

### Rollback Registry
Every deploy records rollback target:

| Deploy Date | Prod SHA | Rollback SHA | Rollback Command |
|-------------|----------|--------------|------------------|
| 2026-02-05 | abc123 | def456 | `gcloud run services update-traffic...` |

---

## PART 6: FORBIDDEN ACTIONS

### Claude MUST NEVER:
1. Deploy without all gates passing
2. Skip staging and go direct to prod
3. Make "quick fixes" without ticket ID
4. Modify production database directly
5. Change env vars without documentation
6. Ignore failing tests
7. Declare "done" without CI green
8. Use different code for staging vs prod

### Operator MUST NEVER:
1. Approve staging without testing all 4 portals
2. Skip evidence collection
3. Deploy on Friday evening
4. Deploy without rollback plan ready
5. Ignore monitoring alerts post-deploy

---

## PART 7: EVIDENCE REQUIREMENTS

### Evidence Folder Structure (MEGA-RC Aware)

> For the first combined deploy (MEGA-RC), per-batch folders hold scope evidence.
> Combined gate/CI/staging artifacts go in `MEGA-RC/`.
> After go-live, each batch resumes its own full evidence folder.

**Per-Batch Folder (scope-specific evidence):**
```
RELEASES/EVIDENCE/BATCH-XXX/
├── screenshots/              # Browser test evidence (operator)
├── scope-verification.md     # Scope + parity verification (Claude)
└── [batch-specific artifacts] # e.g., curl-proofs/, docker-build-log.txt
```

**MEGA-RC Combined Folder (one-time first deploy):**
```
RELEASES/EVIDENCE/MEGA-RC/
├── gates/
│   ├── typecheck.txt         # pnpm -r typecheck output
│   ├── build.txt             # pnpm -r build output
│   └── e2e-local.html        # Playwright @prod report
├── ci/
│   └── ci-run-link.txt       # GitHub Actions run URL
├── migration/
│   ├── dry-run.txt           # migrate-prod.js dry-run output
│   └── staging-migration.txt # First staging migration log
├── staging/
│   ├── health.txt            # /health response
│   ├── version.txt           # /version response (SHA match)
│   └── rollback-drill.txt    # Rollback drill output
└── signoff.md                # Operator sign-off
```

**Post Go-Live (Normal Cadence):**
Each batch gets its own full folder matching the original per-batch structure
with local/, staging/, e2e-results/, ci/, and sign-off.md.

### Sign-off Template (sign-off.md)
```markdown
# BATCH-XXX Sign-off

## Approvals
- [ ] Claude: All gates pass, code complete
- [ ] Operator: Manual testing complete
- [ ] CI: Build green, image pushed

## SHAs
- Git SHA: _______________
- Docker Image SHA: _______________
- Staging Revision: _______________
- Prod Revision: _______________

## Signatures
- Claude Sign-off: YYYY-MM-DD HH:MM
- Operator Sign-off: YYYY-MM-DD HH:MM

## Rollback Ready
- Previous Prod SHA: _______________
- Rollback Command: _______________
- Rollback Tested: [ ] Yes
```

---

## PART 8: REGRESSION PREVENTION CHECKLIST

Before ANY production deploy, verify:

### Code Level
- [ ] No `console.log` in production code
- [ ] No `// TODO` or `// FIXME` in critical paths
- [ ] No commented-out code
- [ ] All error boundaries in place
- [ ] All API calls have error handling
- [ ] All forms have validation

### Environment Level
- [ ] All env vars documented
- [ ] All secrets in Secret Manager
- [ ] No secrets in git history
- [ ] Database migrations ready
- [ ] Redis connection tested

### Infrastructure Level
- [ ] Cloud Run CPU/memory adequate
- [ ] Cloud SQL connections sufficient
- [ ] SSL certificates valid
- [ ] DNS properly configured
- [ ] CDN cache rules correct

### Monitoring Level
- [ ] Error alerting configured
- [ ] Uptime monitoring active
- [ ] Log aggregation working
- [ ] Performance baseline recorded

---

## PART 9: INCIDENT RESPONSE

### If Production Breaks:

1. **IMMEDIATE (0-5 min)**
   - Trigger rollback
   - Notify team
   - Preserve logs

2. **SHORT-TERM (5-30 min)**
   - Identify root cause
   - Document incident
   - Verify rollback success

3. **POST-INCIDENT (30 min - 2 hr)**
   - Write incident report
   - Create fix ticket
   - Update regression rules if needed

### Incident Report Template
```markdown
# Incident Report - YYYY-MM-DD

## Summary
What broke: _______________
Duration: _______________
Impact: _______________

## Root Cause
Why it broke: _______________

## Resolution
How it was fixed: _______________

## Prevention
Rule to add: _______________
```

---

## PART 10: CLAUDE COMMITMENT

I, Claude, commit to:

1. **NEVER** deploy without all gates green
2. **NEVER** skip staging verification
3. **NEVER** make undocumented changes
4. **ALWAYS** record evidence
5. **ALWAYS** have rollback ready
6. **ALWAYS** wait for operator sign-off
7. **IMMEDIATELY** recommend rollback to operator if issues detected
8. **HONESTLY** report any concerns or risks

**Violation of any rule = I will refuse to proceed until corrected.**

---

## CERTIFICATION

This document must be acknowledged before any production work:

```
CLAUDE ACKNOWLEDGMENT:
I have read and will follow all ZERO REGRESSION RULES.
Date: _______________

OPERATOR ACKNOWLEDGMENT:
I have read and will follow all ZERO REGRESSION RULES.
Date: _______________
```

---

## REVISION HISTORY

| Version | Date | Change | Author |
|---------|------|--------|--------|
| 1.0 | 2026-02-05 | Initial creation | Claude |
| 2.0 | 2026-02-10 | DOC-019/020: Mode-aware git workflow, MEGA-RC evidence structure, standardized E2E gate commands, first-deploy migration exception | Claude |
| 2.1 | 2026-02-10 | DOC-021: Gate 2 `pnpm -r test` → `pnpm test:ci`, added Gate 2.5 `pnpm -r build`, rollback commitment aligned with Failure Handoff Matrix | Claude |

