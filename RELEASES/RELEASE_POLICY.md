# Release Policy

> **Staging-First Release Train — No exceptions.**
> This codifies the release flow from code-complete to production.
> Last Updated: 2026-02-10

---

## CORE PRINCIPLE

```
ONE BUILD → STAGING → VERIFY → PROMOTE → PRODUCTION
```

- The Docker image is built **once** in CI.
- The **same image SHA** deploys to staging and production.
- **No rebuild** between staging and production.
- **No direct-to-production deploys** — ever.

---

## RELEASE FLOW

```
 1. CODE COMPLETE     Claude declares batch done, all tickets have evidence
         │
 2. LOCAL GATES       pnpm -r typecheck (0 errors) + @prod E2E (0 failures)
         │
 3. PUSH + CI         git push → CI builds images, runs gates, pushes to Artifact Registry
         │
 4. TAG RC            Claude creates: supermandi-YYYY-MM-DD-HHmm-BATCH-XXX
         │
 5. DEPLOY STAGING    ./scripts/deploy-cloud-run.sh --env staging --sha <RC_SHA>
         │
 6. STAGING SMOKE     Health check + /version + browser tests on staging.supermandi.tech
         │
 7. STAGING VERIFY    Run BLACKBOX-POS-RUNBOOK journeys against staging (if POS in scope)
         │
 8. OPERATOR SIGN-OFF Operator confirms staging is good, records in BATCH_LEDGER.md
         │
 9. PROMOTE           ./scripts/promote-to-prod.sh <RC_SHA> --confirm
         │
10. POST-DEPLOY       Health check + /version + monitoring for 15 min (see ROLLBACK_PLAYBOOK.md)
         │
11. CLOSE BATCH       Update BATCH_LEDGER.md: status = LIVE, record LIVE_SHA
```

---

## GATE DEFINITIONS

### Gate 1: Typecheck
```powershell
pnpm -r typecheck
```
- **Pass**: Exit code 0, zero errors
- **Fail**: Any error = BLOCKED

### Gate 2: E2E Production Tests
```powershell
cd e2e-tests
node .\node_modules\@playwright\test\cli.js test --grep "@prod"
```
- **Pass**: Zero failures
- **Fail**: Any failure = BLOCKED

### Gate 3: CI Pipeline
- Triggered on push to `main`
- Runs: typecheck, lint, build, test, Docker image build
- **Pass**: All jobs green
- **Fail**: Any job red = BLOCKED (CI overrides local results)

### Gate 4: Staging Smoke
```bash
curl -sf https://staging.supermandi.tech/api/v1/health
curl -sf https://staging.supermandi.tech/api/v1/version
```
- **Pass**: Health returns `{"status":"ok"}`, version shows RC_SHA
- **Fail**: Any non-200 or wrong SHA = BLOCKED

### Gate 5: Browser Acceptance (Operator)
Per MASTER_PLAN.md Part 2 testing matrix:
| Portal | URL | Check |
|--------|-----|-------|
| Retailer | staging.supermandi.tech/retailer/ | Login + critical flow |
| Supplier | staging.supermandi.tech/supplier/ | Login + critical flow |
| SuperAdmin | staging.supermandi.tech/admin/ | Login + critical flow |
| POS | Connect to staging API | Sell flow |

---

## TAG FORMAT

```
supermandi-YYYY-MM-DD-HHmm-BATCH-XXX
```

Example: `supermandi-2026-02-10-1430-BATCH-022`

**Rules**:
- Tags are immutable — never delete or move a tag
- One tag per RC attempt
- If RC fails verification, fix → re-tag with new timestamp (do not reuse old tag)

---

## HOTFIX POLICY

Hotfixes follow the same flow with tighter scope:

```
1. Create HOTFIX-XXX ticket in MASTER_PLAN.md
2. Fix on main (atomic commit)
3. Run all gates
4. Tag: supermandi-YYYY-MM-DD-HHmm-HOTFIX-XXX
5. Deploy to staging → verify → promote
```

**No shortcuts.** A hotfix still goes through staging.

The only exception: If production is down (P0), rollback first (see ROLLBACK_PLAYBOOK.md), then follow hotfix flow.

---

## FREEZE RULES

### Pre-Deploy Freeze
Once a batch is tagged as RC:
- No new commits to main (unless fixing a gate failure)
- Gate failure fix = new commit + new tag + restart verification

### Post-Deploy Freeze
After production deploy:
- Monitor for 15 minutes (see ROLLBACK_PLAYBOOK.md monitoring timeline)
- No new deploys during monitoring window
- If issues detected during monitoring → rollback, do not hot-patch

---

## PROMOTION COMMAND

```bash
# Only after staging verification + operator sign-off
./scripts/promote-to-prod.sh <RC_SHA> --confirm
```

**Pre-conditions** (all must be true):
- [ ] RC_SHA matches staging-verified SHA
- [ ] All 5 gates passed
- [ ] Operator signed off in BATCH_LEDGER.md
- [ ] Rollback command documented and ready

---

## ROLLBACK

See [ROLLBACK_PLAYBOOK.md](ROLLBACK_PLAYBOOK.md) for full procedures.

Quick reference:
```bash
# Instant rollback (< 5 min) — shift traffic to previous revision
gcloud run services update-traffic supermandi-api-gateway \
  --to-revisions=PREVIOUS_REVISION=100 --region=asia-south1
```

---

## WHAT BLOCKS A RELEASE

| Condition | Action |
|-----------|--------|
| Typecheck errors | Fix before proceeding |
| E2E failures | Fix before proceeding |
| CI red | Fix before proceeding (CI overrides local) |
| Staging smoke fails | Investigate, do not promote |
| Operator rejects browser test | Fix, re-deploy staging, re-verify |
| Lockfile drift | Resolve drift, re-run gates |
| Missing evidence | Collect evidence, update BATCH_LEDGER.md |

---

## CURRENT STATUS

| Item | Status | Owner | Note |
|------|--------|-------|------|
| GCP Infrastructure Setup | IN PROGRESS | Operator | 9 items in Operator Action Tracker (MASTER_PLAN.md Part 4) |
| SA-GOLIVE Tickets | IN PROGRESS | Claude | 2/17 done, Mode A (independent) |
| Staging Deploy (BATCH-010) | PENDING | Both | Waiting for SA-GOLIVE + GCP setup |

**Session Mode**: A (Pre-Staging) — Claude works independently, no deploy risk.

---

## RELATIONSHIP TO OTHER DOCS

| Document | Role in Release |
|----------|-----------------|
| **MASTER_PLAN.md** | Batch definitions, ticket scope, current status |
| **ZERO_REGRESSION_RULES.md** | Immutability rules, testing gates, forbidden actions |
| **CLAUDE_PRODUCTION_RULES.md** | Code quality standard during development |
| **OPERATOR_RUNBOOK.md** | ~~SUPERSEDED~~ — see MASTER_PLAN.md Part 2 + RELEASE_POLICY.md |
| **ROLLBACK_PLAYBOOK.md** | Incident response, rollback procedures |
| **RELEASE_POLICY.md** (this) | End-to-end release flow, gates, freeze rules |
| **BATCH_LEDGER.md** | Per-batch status tracking and evidence links |

---

## REVISION HISTORY

| Version | Date | Change | Author |
|---------|------|--------|--------|
| 1.0 | 2026-02-10 | Initial creation from PDF strategy doc | Claude |
| 1.1 | 2026-02-10 | DOC-020: RC tag ownership assigned to Claude, "CURRENTLY BLOCKED" → "CURRENT STATUS" | Claude |
| 1.2 | 2026-02-10 | DOC-021: Step 11 `status = DEPLOYED` → `status = LIVE` (matching MASTER_PLAN lifecycle) | Claude |
