# Supplier Theme + Hydration: Enforced Ticket Contracts (Machine State)

These are now tracked as real workflow tickets and must be executed one-by-one under WIP=1.

## 1) LIVE.SUPPLIER.AUTH.BUILDSTAMP_HYDRATION_MISMATCH.001 (P1)
- Problem: Recoverable hydration error on supplier auth (BuildStamp SSR/client mismatch).
- Contract:
  1. Remove SSR/client text drift for BuildStamp.
  2. No hydration mismatch warnings on auth routes.
  3. Validate login/register/forgot/reset auth pages.

## 2) LIVE.THEME.TOGGLE.OPENCLAW_STYLE_SECRET_ENTRY.001 (P2)
- Problem: Theme control is not product-grade and not aligned to requested subtle UX.
- Contract:
  1. Add compact, subtle, top-right circular icon toggle (sun/moon), similar to OpenClaw reference.
  2. Must be keyboard-accessible with proper aria label.
  3. Persist preference across refresh/navigation.
  4. Avoid intrusive controls/panels.

## 3) LIVE.THEME.TOKENS.CROSS_SURFACE_APPLICATION.001 (P1)
- Problem: Theme selector changes state but visible pages do not fully restyle.
- Contract:
  1. Bind real tokens to background, surfaces, text, inputs, links, borders, focus states, and logo/icon contrast.
  2. Apply across pre-login and post-login surfaces (supplier, retailer, superadmin, landing, POS shell where applicable).
  3. Ensure no unreadable contrast states and no flash-to-wrong-theme transitions.

## Current Queue Snapshot
- Existing pending unmapped tickets: LIVE.TICKETIZATION.UNMAPPED.030 to .038
- Added now: 3 tickets above
- Deploy remains blocked until implementation queue reaches zero and operator approves GO_DEPLOY.
