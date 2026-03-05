# Claude Next Action - Implement Now, Live Test Tomorrow

- Generated at (UTC): 2026-03-06T00:40:00Z
- Operator plan: complete implementation and deployment/build tonight; run live testing tomorrow.

## Current Issue Dashboard (authoritative for this wave)
1. Total tracked: `ISSUE-001..ISSUE-034`
2. Pending implementation: `21`
3. Already resolved/systemic-fixed: `13`
4. CTO original findings pending: `12 of 13` (all except ISSUE-006)

## Hard Constraints
1. No EAS cloud builds in this wave (`HL-009`) due queue delay.
2. If POS code changes are included, use local Android build path only.
3. Keep strict git discipline:
   - one ticket or tight micro-batch per commit
   - no mixed unrelated edits
   - state updates in separate commit from code fixes
4. `RELEASES/LIVE_TESTING_ISSUES.md` remains append-only.

## Priority Implementation Queue (execute in this order)
1. ISSUE-001 (CRITICAL): SuperAdmin OTP allowlist enforcement (+ fail-closed behavior).
2. ISSUE-011 (CRITICAL): POS staging URL/build target correctness (code/config side now; local APK build after merge).
3. ISSUE-008 (+ ISSUE-009) (HIGH): body payload hardening for bodyless POST (and related API wiring).
4. ISSUE-002 (HIGH): registration OTP bypass fix + migration path.
5. ISSUE-003 (HIGH): stale DRAFT auto-expiry / conflict handling.
6. ISSUE-012 (+ ISSUE-013) (HIGH): EnrollDevice back/cancel and progress feedback.
7. ISSUE-005 (HIGH): Firebase rate-limit UX handling.
8. ISSUE-004, ISSUE-010, then remaining MEDIUM/LOW set (`017,018,019,020,021,022,024,025,026,027,029,030,031,032,007`).

## End-to-End Execution Steps (Do Now)
1. Sync latest `main` and confirm clean tracked tree before each wave commit.
2. Create implementation branch for tonight’s wave from latest `main`.
3. Snapshot current tracker state in `RELEASES/LIVE_TESTING_ISSUES.md` (no rewrites).
4. Implement queue items in strict order.
5. After each ticket/micro-batch:
   - run targeted tests for impacted surface
   - run `pnpm -r typecheck`
   - run `npm run ui:audit`
6. After high-priority wave complete:
   - run `npm --prefix backend run test:unit -- --runInBand`
   - run staging smoke checks via Playwright
7. Merge/push with traceable commit mapping (issue -> commit).
8. Deploy to GCP staging via CI.
9. Verify deployed SHA and staging health endpoints.
10. If POS-impacting issues changed code/config:
    - build local APK (no EAS cloud build)
    - install on Redmi
    - verify build stamp / API target on device
11. Update `CLAUDE_CURRENT_STATE.json` with:
    - completed issues
    - deployed SHA
    - local APK build fingerprint (if built)
    - remaining blockers for tomorrow
12. Stop only after implementation/deploy/build handoff is complete for tomorrow live testing.

## Tomorrow Live Testing Start Condition
Live testing starts tomorrow only when all are true:
1. Deployment SHA is confirmed on staging.
2. Required gates are PASS.
3. POS local APK installed if POS-related fixes were included.
4. Machine state is updated to `READY_FOR_LOCKED_LIVE_TESTING`.

