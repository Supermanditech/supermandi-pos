# Live Ticket Intake (GCP Staging Only)

## Required Identity

- `ticketId`: LIVE.RETAILER.SPA_SHELL.001
- `screenId`: RETAILER.SPA_BOOTSTRAP
- `surface`: retailer_web
- `title`: Retailer SPA shell is only 576 bytes — verify all assets load correctly
- `severity`: P3

## Required Live Evidence (Section 2G)

- Staging URL or flow: https://staging.supermandi.tech/retailer/
- Observation timestamp (UTC/IST): 2026-02-21T01:28:00Z / 06:58 IST
- Runtime evidence:
  - HTTP response/status: HTTP 200, 576 bytes, text/html
  - API payload/log snippet:
    ```html
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <link rel="icon" type="image/svg+xml" href="/retailer/favicon.svg" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>SuperMandi - Retailer Portal</title>
        <script type="module" crossorigin src="/retailer/assets/index-tmeX4xLO.js"></script>
        <link rel="stylesheet" crossorigin href="/retailer/assets/index-BlX2Covt.css" />
      </head>
      <body><div id="root"></div></body>
    </html>
    ```
  - Screenshot/video path: N/A
- Active Cloud Run revision ID(s):
  - retailer-admin-00056-msv

## Micro Check Results (per issue context)

- UI: NEEDS OPERATOR — 576-byte HTML is the Vite SPA shell (expected), but JS/CSS assets need browser verification
- UX: NEEDS OPERATOR
- wiring: NEEDS OPERATOR — can only verify wiring in browser with JS execution
- navigation: PASS (SPA fallback working, all /retailer/* routes serve same shell)
- API contract: N/A
- backend behavior: N/A
- DB/migration impact: N/A
- GCP staging parity: PASS (correct title, correct base path /retailer/, correct asset paths)

## Repro Steps

1. `curl -s https://staging.supermandi.tech/retailer/` — observe 576-byte HTML shell
2. Verify JS asset: `curl -sI https://staging.supermandi.tech/retailer/assets/index-tmeX4xLO.js` — check 200 response
3. Verify CSS asset: `curl -sI https://staging.supermandi.tech/retailer/assets/index-BlX2Covt.css` — check 200 response
4. Open in browser to verify SPA renders correctly

## Service Mapping

- Primary service: retailer-admin
- Secondary services: None
- Expected base path: /retailer/

## Blockers / Dependencies

- Internal: None (likely working correctly — just needs browser verification)
- External: None
- Ops: Final signoff only after Claude provides browser/automation verification evidence

## Notes

- Why this is production-impacting: If JS/CSS assets don't load, the entire retailer portal shows a blank page
- Rollback-safe fix hint: Check nginx asset serving; compare with previous working build
