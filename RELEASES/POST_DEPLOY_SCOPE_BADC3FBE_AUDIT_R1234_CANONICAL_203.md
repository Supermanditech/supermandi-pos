# POST-DEPLOY IMPLEMENTATION SCOPE (LOCKED)

Scope ID: `POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203`

Baseline deployment:

- Staging deploy SHA: `badc3fbe`
- Deploy run: `22305359033`
- Baseline date: `2026-02-23`

## Authoritative File Set (quote these together)

1. Canonical machine list (authoritative IDs):
   - `RELEASES/AUDIT_R1234_FINAL_CANONICAL_DEDUPE_2026-02-23.json`
2. Human execution list (all canonical IDs):
   - `RELEASES/CLAUDE_NEXT_ACTION_AUDIT_R1234_FINAL_EXECUTION_2026-02-23.md`
3. Claude execution policy + activation rules:
   - `RELEASES/CLAUDE_NEXT_ACTION_STAGING_AUDIT_FIX_BATCH_2026-02-23.md`
4. Backlog draft mirror:
   - `RELEASES/STAGING_AUDIT_TICKET_DRAFT_2026-02-23.md`
5. Round-4 source report:
   - `RELEASES/DEEP_PRODUCTION_AUDIT_R4.md`
6. Round-4 extracted findings ledger:
   - `RELEASES/DEEP_PRODUCTION_AUDIT_R4_FINDINGS_LEDGER_2026-02-23.json`

## Locked Totals (for this scope)

- Final canonical tickets across rounds 1-4: `203`
- Severity: `P0=88`, `P1=100`, `P2=15`
- Round-4 row coverage must remain: `144/144 mapped`

## Completion Claim Rule (non-negotiable)

No agent may claim "all tickets completed" unless all checks below pass:

1. Canonical list check:
   - `canonicalTotal == 203`
2. Workflow ticket-file presence check:
   - `missingTicketFiles == 0`
3. Workflow status closure check:
   - `openTickets == 0` for scope IDs
4. Runtime validation policy:
   - P0/P1 tickets include post-fix staging runtime evidence

Use verifier:

```bash
pnpm workflow:scope:check:strict
```

Bootstrap canonical ticket files (if missing):

```bash
pnpm workflow:scope:bootstrap
pnpm workflow:scope:sync
```

If `--strict` exits non-zero, completion claim is invalid.

## Mandatory Reference String (use in every checkpoint)

`REF: POST_DEPLOY_SCOPE.BADC3FBE.AUDIT_R1234.CANONICAL_203`

## Runtime Delta Intake (post-canonical, same deploy baseline)

- Baseline deploy for this intake: `SHA badc3fbe`, run `22305359033`
- Delta tickets (must be executed before next deploy approval):
  - `LIVE.RETAILER.REGISTER.OTP_SUCCESS_ERROR_CONFLICT.001`
