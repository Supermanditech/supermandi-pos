# CLAUDE NEXT ACTION: FIX-001 (Deploy-First)

## Effective Date
2026-02-20

## Mandatory Immediate Objective
Deploy the latest 10-day work to GCP staging with zero mixed-version drift across all surfaces:

- retailer web
- supplier web
- superadmin web
- POS app backend/API connectivity
- backend + API gateway
- DB migration/state parity

No new feature ticket coding is allowed until FIX-001 deployment evidence is complete.

## Execute Now (In Order)

1. Re-read:
   - `RELEASES/CLAUDE_MEMORY_SYNC_2026-02-20.md`
   - `workflow/state/staging_batch.json`
   - `workflow/tickets/FIX-001.json`
2. Run:
   - `pnpm workflow:validate`
   - `pnpm workflow:monitor`
3. Run deploy gate attempt:
   - `pnpm workflow:pre-staging:attempt`
4. If gate passes, trigger staging deploy pipeline for `main` and monitor to completion.
5. Publish evidence for completion:
   - commit SHA used
   - deploy run URL
   - migration execution summary
   - active revision IDs for all 6 services
   - active image digest/tag for all 6 services
   - traffic proof that target revision is active for all 6 services
   - `https://staging.supermandi.tech/api/health` response
   - operator handoff status (laptop + Redmi)

## Hard Stop Rule
If any of the above evidence is missing, FIX-001 remains `ready_for_operator_test` and no ticket may move to `in_progress`.
