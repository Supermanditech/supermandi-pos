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
 2. LOCAL GATES       Claude runs: typecheck + unit tests + build + contract + invariants
         │
 3. OPERATOR E2E      Claude provides PowerShell E2E script → operator runs in VS Code terminal
         │              → pastes results to Claude → Claude fixes ANY issues (even minor)
         │              → repeat steps 2-3 until ZERO issues
         │
 4. PUSH + CI         git push → CI builds images, runs gates, pushes to Artifact Registry
         │
 5. TAG RC            Claude creates: supermandi-YYYY-MM-DD-HHmm-BATCH-XXX
         │
 6. DEPLOY STAGING    ./scripts/deploy-cloud-run.sh --env staging --sha <RC_SHA>
         │
 7. STAGING SMOKE     Health check + /version on staging.supermandi.tech
         │
 8. STAGING E2E       Repeat step 3 against staging: Claude provides staging E2E script
         │              → operator runs → pastes results → if issues, fix + re-tag + re-deploy
         │
 9. STAGING VERIFY    Run BLACKBOX-POS-RUNBOOK journeys against staging (if POS in scope)
         │
10. OPERATOR SIGN-OFF Operator confirms staging is good, records in BATCH_LEDGER.md
         │
11. PROMOTE           ./scripts/promote-to-prod.sh <RC_SHA> --confirm
         │              *** Only after ALL portals (retailer/supplier/admin) + POS app complete ***
         │
12. POST-DEPLOY       Health check + /version + monitoring for 15 min (see ROLLBACK_PLAYBOOK.md)
         │
13. CLOSE BATCH       Update BATCH_LEDGER.md: status = LIVE, record LIVE_SHA
```

### PROMOTION PREREQUISITE

Steps 1–10 are the **iterative development & testing cycle** — they repeat per batch.

Step 11 (PROMOTE) is **gated on full project completion**:
- ALL portals operational (retailer, supplier, admin)
- POS app functional and tested
- All batches in MEGA-RC scope have passed steps 1–10

Until the full project is complete, the team stays in the steps 1–10 cycle.

---

## GATE DEFINITIONS

### Gate 1: Claude Automated Gates (Local)
```powershell
pnpm -r typecheck          # Type safety
pnpm test:ci               # Unit tests
pnpm -r build              # Production build
pnpm test:contract         # API contract validation (Zod/OpenAPI)
pnpm test:invariants       # Domain invariant verification
pnpm test:security         # Auth enforcement, RBAC, input validation
```
- **Pass**: All six exit code 0, zero errors
- **Fail**: Any error = BLOCKED (Claude fixes before proceeding)

### Gate 2: Operator E2E Review (Pre-CI)

Claude provides the exact PowerShell script; **operator runs it in VS Code terminal** and pastes full output back to Claude.

```powershell
# Claude provides this script to operator:
cd e2e-tests
node .\node_modules\@playwright\test\cli.js test --grep "@prod"
```
- **Process**: Claude provides script → operator runs → pastes results to Claude
- **Pass**: Zero failures in operator-pasted output
- **Fail**: ANY issue (even minor) = Claude fixes → re-run Gate 1 → repeat Gate 2 until clean
- **Rule**: Claude MUST NOT push to CI until operator E2E results show ZERO issues

### Gate 3: CI Pipeline
- Triggered on push to `main`
- Runs: typecheck, lint, build, unit tests, contract validation, invariant tests, security tests, migrate-zero, Docker image build
- **Pass**: All jobs green
- **Fail**: Any job red = BLOCKED (CI overrides local results)
- See CLAUDE_PRODUCTION_RULES.md Part N.1 for full CI job list

### Gate 4: Staging Smoke
```bash
curl -sf https://staging.supermandi.tech/api/v1/health
curl -sf https://staging.supermandi.tech/api/v1/version
```
- **Pass**: Health returns `{"status":"ok"}`, version shows RC_SHA
- **Fail**: Any non-200 or wrong SHA = BLOCKED

### Gate 5: Staging E2E (Operator)

Repeat of Gate 2 but against staging environment. Claude provides staging-targeted script.

```powershell
# Claude provides this script to operator:
cd e2e-tests
$env:STAGING="true"; node .\node_modules\@playwright\test\cli.js test --grep "@prod"
```
- **Process**: Same as Gate 2 — operator runs, pastes results, Claude fixes issues
- **Fail**: Any issue = Claude fixes → re-tag → re-deploy staging → repeat Gate 5

### Gate 6: Browser Acceptance (Operator)
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
- [ ] All 6 gates passed
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
| Typecheck / unit test / build errors | Claude fixes before proceeding |
| Operator E2E failures (local) | Claude fixes, re-run Gate 1 + Gate 2 until clean |
| CI red | Fix before proceeding (CI overrides local) |
| Staging smoke fails | Investigate, do not promote |
| Operator E2E failures (staging) | Claude fixes, re-tag, re-deploy staging, re-verify |
| Operator rejects browser test | Fix, re-deploy staging, re-verify |
| Lockfile drift | Resolve drift, re-run gates |
| Missing evidence | Collect evidence, update BATCH_LEDGER.md |
| Project incomplete | Do NOT promote — all portals + POS must be done |

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
| 2.0 | 2026-02-11 | DOC-022: 11→13 steps. Added Operator E2E (step 3) + Staging E2E (step 8) gates. Promotion gated on full project completion. Gates renumbered 1–6. | Claude |
| 2.1 | 2026-02-11 | DOC-023: Gate 1 expanded — added contract validation + domain invariant verification to Claude automated gates. Step 2 updated. | Claude |
| 2.2 | 2026-02-11 | DOC-024: Gate 1 added `test:security` (auth, RBAC, input validation). Gate 3 CI job list expanded with security tests. | Claude |
