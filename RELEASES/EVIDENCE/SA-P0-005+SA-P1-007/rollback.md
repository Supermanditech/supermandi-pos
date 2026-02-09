# SA-P0-005 + SA-P1-007: Rollback Plan

## Rollback Strategy

### Option 1: Revert merge commit (preferred)

```bash
git revert <merge-commit-sha> --no-edit
git push
```

This reverts all 6 files. The migration (123_sa_p0_005_feature_flag_seeds.sql) is additive-only
(INSERT ON CONFLICT DO NOTHING), so the seeded rows remain harmlessly in the database.

### Option 2: Restore flags to defaults (no code revert)

If features are misbehaving due to flag state (not code), restore all flags to enabled:

```sql
-- Restore all 7 canonical global flags to enabled (default state)
UPDATE platform.feature_flags
SET enabled = true, updated_at = NOW()
WHERE scope_type = 'global'
  AND flag_key IN (
    'buyEnabled', 'reorderEnabled', 'voiceEnabled',
    'bnplEnabled', 'creditEnabled', 'categoryBrowsingEnabled', 'scanLookupV2'
  );

-- Remove ALL per-store overrides (revert to global-only)
DELETE FROM platform.feature_flags
WHERE scope_type = 'store'
  AND flag_key IN (
    'buyEnabled', 'reorderEnabled', 'voiceEnabled',
    'bnplEnabled', 'creditEnabled', 'categoryBrowsingEnabled', 'scanLookupV2'
  );
```

### Option 3: Emergency kill all features (if needed)

```sql
-- Kill all 7 canonical features globally
UPDATE platform.feature_flags
SET enabled = false, updated_at = NOW()
WHERE scope_type = 'global'
  AND flag_key IN (
    'buyEnabled', 'reorderEnabled', 'voiceEnabled',
    'bnplEnabled', 'creditEnabled', 'categoryBrowsingEnabled', 'scanLookupV2'
  );
```

## Impact Assessment

- **Migration 123**: Additive-only (INSERT ON CONFLICT DO NOTHING). Safe to leave in place.
- **ui-status response**: Two new fields added (`voiceEnabled`, `categoryBrowsingEnabled`). POS app ignores unknown fields. No breakage on revert (fields disappear, POS uses hardcoded defaults).
- **Admin API**: 6 new endpoints under `/admin/feature-flags` and `/admin/stores/:id/feature-flags`. Removing them returns 404 — SuperAdmin UI shows errors but no data loss.
- **SuperAdmin UI**: Kill switch panel, per-store flags, bulk toolbar. On revert, these sections vanish. No data dependency.

## Recovery Time

- Option 1 (revert): < 5 minutes (git revert + push + CI + deploy)
- Option 2 (SQL restore): < 1 minute (run SQL, POS picks up on next poll)
- Option 3 (emergency kill): < 1 minute (run SQL)
