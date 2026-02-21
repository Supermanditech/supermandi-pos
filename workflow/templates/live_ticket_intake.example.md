# Live Ticket Intake (GCP Staging Only)

Use this template for each new micro ticket discovered during live staging testing.

## Required Identity

- `ticketId`:
- `screenId`:
- `surface`: `retailer_web|supplier_web|superadmin_web|pos|backend|shared`
- `title`:
- `severity`: `P0|P1|P2|P3`

## Required Live Evidence (Section 2G)

- Staging URL or flow:
- Must include at least one live URL under `https://staging.supermandi.tech/...` (no localhost, no local env, no non-staging host).
- Observation timestamp (UTC/IST):
- Runtime evidence:
  - HTTP response/status:
  - API payload/log snippet:
  - Screenshot/video path:
- Active Cloud Run revision ID(s):

## Micro Check Results (per issue context)

- UI:
- UX:
- wiring:
- navigation:
- API contract:
- backend behavior:
- DB/migration impact:
- GCP staging parity:

## Repro Steps

1.
2.
3.

## Service Mapping

- Primary service:
- Secondary services:
- Expected base path:

## Blockers / Dependencies

- Internal:
- External:
- Ops:

## Notes

- Why this is production-impacting:
- Rollback-safe fix hint:
