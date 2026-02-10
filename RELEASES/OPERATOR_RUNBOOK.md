# Operator Runbook — SuperMandi Deployment

> **SUPERSEDED (2026-02-10)**
>
> This file is from the **pre-Cloud Run VM era** and is NO LONGER the source of truth.
> It remains for historical reference only. **Do NOT follow these steps.**
>
> **Authoritative replacements:**
> - **Operator deploy process**: `MASTER_PLAN.md` Part 2 (Operator Rules) + First Deploy Runbook
> - **Gate commands**: `MASTER_PLAN.md` Part 7 (Gate Commands)
> - **Deploy scripts**: `deploy-cloud-run.sh` + `promote-to-prod.sh` (NOT `deploy-production.sh`)
> - **Session modes**: `MASTER_PLAN.md` Part 1 (Mode A / Mode B)
> - **Status lifecycle**: `MASTER_PLAN.md` Part 7 (PENDING → WRITTEN → GATED → TESTED → EVIDENCED → LIVE)
> - **Staging-first flow**: `RELEASE_POLICY.md` (11-step flow)
>
> **Key differences from this old runbook:**
> - Claude runs all automated gates (not Operator)
> - Staging deploy is MANDATORY before production (this file skips staging)
> - Mode A: Claude starts independently, no operator paste needed
> - Cloud Run replaces VM/nginx/PM2

---

**--- HISTORICAL CONTENT BELOW (DO NOT FOLLOW) ---**

---

---

## Pre-Session Checklist

### Step 1: Confirm Ledger State
```powershell
cd C:\supermandi-pos
git pull origin main
git rev-parse HEAD
git log -1 --oneline
git status
```

**Decision:**
- If `git status` is **dirty** → STOP. Fix uncommitted changes first.
- If `git status` is **clean** → Proceed. The SHA from `git rev-parse HEAD` is your **RC_SHA**.

### Step 2: Update Ledger with RC_SHA
Open `RELEASES/BATCH_LEDGER.md` and update the current batch:

```markdown
| **RC_SHA** | <paste full SHA here> |
| **RC_Status** | CANDIDATE |
| **Local Gates** | PENDING |
| **Browser Acceptance** | PENDING |
```

**STOP POINT:** Do not proceed until RC_SHA is saved in ledger.

---

## Gate Validation

### Step 3: Run Local Gates
```powershell
# Typecheck all projects
pnpm -r typecheck

# Run production smoke tests
cd e2e-tests
node .\node_modules\@playwright\test\cli.js test --grep "@prod"
cd ..
```

**Acceptance Criteria:**
| Gate | Required Result |
|------|-----------------|
| `pnpm -r typecheck` | Exit 0 (no errors) |
| `@prod` Playwright | **0 failures** |

**Update Ledger:**
```markdown
| **Local Gates** | PASS (typecheck ✅, @prod ✅ 0 failures) |
```

**If ANY gate fails:**
- Set `RC_Status: BLOCKED`
- Paste error logs
- Fix forward (do not deploy)

---

## Browser Acceptance Testing

### Step 4: Incognito Browser Tests (Human Operator)
Open Chrome Incognito and verify:

| Test | URL | Expected |
|------|-----|----------|
| Landing | https://supermandi.tech/ | Loads (no forced redirect) |
| Retailer Login | /retailer/login | Form visible |
| Retailer Register | /retailer/register | Form visible |
| Retailer Flow | Register → Continue | Moves to Document Upload |
| Supplier Login | /supplier/login | Form visible |
| Supplier Register | /supplier/register | Form visible |
| Supplier Flow | Register → Continue | Moves to Document Upload |
| Admin | /admin/ | Loads (if in scope) |

**Update Ledger:**
```markdown
| **Browser Acceptance** | PASS |
```

**If ANY test fails:**
- Set `RC_Status: BLOCKED`
- Document which test failed
- Fix forward (do not deploy)

---

## Deploy Authorization

### Step 5: Ready for Deploy Check
**ALL must be TRUE:**
- [ ] Ledger has RC_SHA recorded
- [ ] Local Gates = PASS
- [ ] Browser Acceptance = PASS

**If all pass, Claude will say:**
> ✅ "RC is READY_FOR_DEPLOY. Deploy ONE TIME using RC_SHA from ledger."

---

## Deployment

### Step 6: Execute Deploy (ONE TIME)
```bash
./scripts/deploy-production.sh --sha <RC_SHA>
```

**Important:** Deploy only ONCE. If it fails, investigate before retrying.

---

## Post-Deploy Verification

### Step 7: Verify Production
Run 7-endpoint checks:
```bash
curl -I https://supermandi.tech/
curl -I https://supermandi.tech/retailer/
curl -I https://supermandi.tech/retailer/login
curl -I https://supermandi.tech/supplier/
curl -I https://supermandi.tech/supplier/login/
curl -I https://supermandi.tech/admin/
curl -I https://supermandi.tech/api/v1/health
```

All must return **200 OK**.

### Step 8: Final Incognito Verification
Repeat browser acceptance tests on production.

### Step 9: Update Ledger with Deploy Proof
```markdown
| **LIVE_SHA** | <RC_SHA> |
| **RC_Status** | DEPLOYED |
| **Deployed At (IST)** | YYYY-MM-DD HH:MM |
```

Paste URL verification proof in Deploy Evidence section.

---

## Safety Rules

1. **Every step is a numbered checklist**
2. **Do NOT proceed until operator pastes outputs**
3. **If anything is unclear → STOP, BLOCKED, fix forward**
4. **One SHA per deploy — never deploy uncommitted code**
5. **Evidence goes in `RELEASES/EVIDENCE/<BATCH-ID>/`**

---

## Quick Reference

| Status | Meaning |
|--------|---------|
| `CANDIDATE` | RC identified, awaiting gates |
| `BLOCKED` | Gate or acceptance failed |
| `READY_FOR_DEPLOY` | All checks passed, awaiting deploy |
| `DEPLOYED` | Live in production, verified |
| `ROLLED_BACK` | Reverted to previous SHA |
