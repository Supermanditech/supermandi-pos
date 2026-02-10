# DEPLOY-OPS: Unified RATE_LIMIT_MULTIPLIER

**Tag:** `deploy-ops-rate-limiter-2026-02-10_1800IST`
**Merge commit:** `42694b0`
**PR:** [#13](https://github.com/Supermanditech/supermandi-pos/pull/13)
**Base:** `770af18` (main)

## What Changed

| File | Change |
|------|--------|
| `backend/src/middleware/posRateLimiter.ts` | `RATE_LIMIT_MULTIPLIER` env var in factory — scales all 8 POS rate limiters |
| `backend/src/routes/v1/pos/enroll.ts` | Enrollment burst (3/min) + sustained (10/15min) × multiplier |
| `backend/src/routes/v1/index.ts` | Admin API limiter (200/15min) × multiplier |
| `scripts/docker-compose.local-prod.yml` | `RATE_LIMIT_MULTIPLIER: "100"` for local-prod E2E |
| `scripts/test-sa-p0-001.ps1` | NEW — 6-gate local-prod verification script |

## Design

Single env var `RATE_LIMIT_MULTIPLIER` (default `1`) scales ALL rate limiters:
- **Production:** not set → default `1` → rate limits unchanged
- **Local-prod / Staging:** set to `100` → 100x all limits → no 429s during rapid E2E runs

Applies to:
- 8 POS rate limiters (`createPosRateLimiter` factory): sales, approvals, store updates, admin store ops, device enrollment, token revocation, financial ops, auth
- Enrollment burst/sustained (`express-rate-limit` in `enroll.ts`)
- Admin API general limiter (`express-rate-limit` in `index.ts`)

## Verification Evidence

### CI (PR #13)
| Gate | Result | Time |
|------|--------|------|
| TypeScript Check | PASS | 42s |
| ESLint Check | PASS | 44s |
| Build & Verify Portals | PASS | 41s |
| Unit & Integration Tests | PASS | 1m3s |
| Local Smoke Test | PASS | 40s |
| All Gates Passed | PASS | 3s |

### Local-Prod (Docker cold-start)
| Gate | Result |
|------|--------|
| Git Baseline | `770af18` main, clean tree |
| Typecheck (22 projects) | PASS |
| Docker (17 containers, NODE_ENV=production, PG 16.11) | ALL HEALTHY |
| Health Checks (6 endpoints) | 6/6 → 200 OK |
| E2E (store-suspension 10 tests) | 17/17 runs PASS, 0 flakes |

## Rollback
```bash
git revert 42694b0
```

## Staging — BLOCKED (infra, not code)

**Status:** BLOCKED as of 2026-02-10 18:15 IST

**Blocker:** CD workflow (`deploy.yml`) fails at `google-github-actions/auth@v2` because
GitHub repo secrets for GCP Workload Identity Federation are not configured.

**Missing secrets:**
- `GCP_WIF_PROVIDER` — `projects/<PROJECT_NUMBER>/locations/global/workloadIdentityPools/github-pool/providers/github-provider`
- `GCP_SA_EMAIL` — `github-actions@supermandi-pos.iam.gserviceaccount.com`

**Unblock steps (requires `gcloud` CLI + GCP project owner):**
```bash
# 1. Run WIF setup (one-time)
./scripts/gcp/setup-wif.sh

# 2. Add secrets in GitHub: Settings → Secrets and variables → Actions
#    GCP_WIF_PROVIDER = <output from step 1>
#    GCP_SA_EMAIL = github-actions@supermandi-pos.iam.gserviceaccount.com

# 3. Re-trigger CD deploy from the tag-pinned commit
gh workflow run deploy.yml --field sha=42694b0
```

**After unblock:**
- [ ] Deploy this tag to staging
- [ ] Verify rate limits work correctly (no 429 in normal use)
- [ ] Re-run E2E spec against staging (`API_BASE_URL=<staging-url>`)
- [ ] Promote to production
