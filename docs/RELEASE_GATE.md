# SuperMandi POS Release Gate

## Purpose
This document defines the mandatory checklist that MUST pass before any APK build. The goal is to guarantee the APK is built from the exact code containing ALL implemented tickets with proof.

## Golden Rule
**STOP THE RELEASE IF ANY STEP FAILS. NO EXCEPTIONS.**

---

## Pre-Release Checklist

### 1. Git Status Check
- [ ] Working tree is clean (`git status` shows no changes)
- [ ] On correct release branch (main or release/*)
- [ ] No uncommitted changes
- [ ] No untracked files that should be committed

**Command:** `pnpm release:gate --check git`

### 2. Branch & Tag Verification
- [ ] Current branch matches expected release branch
- [ ] All feature branches merged
- [ ] Tag exists or will be created
- [ ] Tag follows semver (v3.0.X)

**Command:** `pnpm release:gate --check branch`

### 3. Backend URL Configuration
- [ ] `src/config/api.ts` has correct API_BASE_URL
- [ ] No localhost/development URLs in production config
- [ ] Environment-specific URLs validated
- [ ] `.env.production` (if exists) has correct values

**Command:** `pnpm release:gate --check urls`

### 4. Feature Flags Sync
- [ ] REORDER tab visibility matches flag state
- [ ] All feature flags documented in `src/config/featureFlags.ts`
- [ ] Menu sections gated correctly
- [ ] No orphan feature flag references

**Command:** `pnpm release:gate --check flags`

### 5. Screen Visibility Audit
- [ ] All registered screens are reachable from navigation
- [ ] No orphan/dead screens
- [ ] QA showcase screens correctly gated (DEV only)
- [ ] Navigation graph is consistent

**Command:** `pnpm ui:audit`

### 6. Translation Audit
- [ ] All i18n keys in en.json exist in hi.json
- [ ] No missing translations (100% parity)
- [ ] No overlapping/truncated text (pseudo-loc test)
- [ ] Ellipses removed from Hindi where appropriate

**Command:** `pnpm i18n:audit`

### 7. Search Boundary Audit (SELL vs BUY)
- [ ] SELL search uses `store_products` table ONLY
- [ ] BUY search uses `supplier_product_map` + linked suppliers ONLY
- [ ] BUY flow NEVER writes to `store_products`
- [ ] No cross-contamination between contexts

**Command:** `pnpm release:gate --check boundaries`

### 8. Ticket Completion Proof
- [ ] All tickets in `docs/TICKETS_DONE.json` verified
- [ ] Required files exist for each ticket
- [ ] Required endpoints exist for each ticket
- [ ] Code markers present for each ticket

**Command:** `pnpm ticket:proof`

### 9. Build Readiness
- [ ] TypeScript compiles without errors (`pnpm typecheck`)
- [ ] No console.log statements in production code
- [ ] Version number updated in app.json/package.json
- [ ] Build dependencies installed

**Command:** `pnpm release:gate --check build`

---

## Release Process

### Step 1: Run Full Gate Check
```bash
pnpm release:gate
```

This runs ALL checks above. If ANY fail, the release is blocked.

### Step 2: Create Release Tag
```bash
pnpm release:tag v3.0.XX "Release description"
```

This:
- Verifies git is clean
- Creates `RELEASES/v3.0.XX.md` with release notes
- Creates `RELEASE_TAG.txt` with tag + commit SHA
- Commits the release files
- Creates and pushes the git tag
- Prints "BUILD FROM THIS TAG ONLY"

### Step 3: Build APK from Tag
```bash
git checkout v3.0.XX
pnpm release:gate  # Must pass again on tag
cd android && ./gradlew assembleRelease
```

**CRITICAL:** Never build from main directly. Always checkout the tag first.

---

## Failure Handling

### If Git Check Fails
1. Commit or stash changes
2. Resolve any merge conflicts
3. Re-run gate check

### If URL Check Fails
1. Update `src/config/api.ts` with production URLs
2. Commit the change
3. Re-run gate check

### If Feature Flag Check Fails
1. Review `src/config/featureFlags.ts`
2. Ensure UI matches flag state
3. Re-run gate check

### If Translation Audit Fails
1. Run `pnpm i18n:audit --fix` to see missing keys
2. Add missing translations to `hi.json`
3. Re-run gate check

### If Ticket Proof Fails
1. Review `docs/TICKETS_DONE.json`
2. Check if ticket implementation is complete
3. If incomplete, create entry in `docs/RELEASE-BLOCKERS.md`
4. Either complete the ticket or remove from done list
5. Re-run gate check

### If Boundary Check Fails
1. Review the flagged code
2. Ensure SELL/BUY separation is maintained
3. Re-run gate check

---

## Release Artifacts

Each release creates:
- `RELEASES/<tag>.md` - Release notes
- `RELEASE_TAG.txt` - Current tag + commit
- Git tag pointing to release commit

---

## Build Tag Display

The app MUST display the build tag in:
- Menu → About → Version info
- Settings (if available)
- Crash reports

This ensures we can always identify which exact build is running.

---

## Emergency Release

For hotfixes only:
1. Create hotfix branch from release tag
2. Apply minimal fix
3. Run `pnpm release:gate`
4. Create new patch tag (v3.0.XX-hotfix.1)
5. Build from hotfix tag

---

## Audit History

Each release gate run creates a log entry in `logs/release-gate-YYYY-MM-DD.log`.
Keep these for debugging failed releases.

---

## Contact

If release gate fails and you cannot resolve:
1. Do NOT bypass the gate
2. Document the blocker in `docs/RELEASE-BLOCKERS.md`
3. Escalate to tech lead
