# Locked Asset Sync (Play Store + Staging + Facebook)

Canonical locked files:

1. `supermandi-landing/playstore-assets/developer-icon-512.png`
2. `supermandi-landing/playstore-assets/developer-header-4096x2304.jpg`
3. `supermandi-landing/playstore-assets/preview-local.html`

Do not publish `-final-v*` filenames to operators. Keep only canonical names in final references.

## Play Store Requirements

1. Developer icon: `512x512` PNG/JPEG, `< 1 MB`
2. Header image: `4096x2304` PNG/JPEG, `< 1 MB`

## Where Staging Uses These

1. Source folder: `supermandi-landing/`
2. Deployment pipeline: `.github/workflows/deploy.yml`
3. Service receiving update: `landing` Cloud Run service

## Mandatory Update Steps

1. Overwrite canonical files only:
   - `developer-icon-512.png`
   - `developer-header-4096x2304.jpg`
2. Keep preview in sync:
   - `preview-local.html` must reference canonical filenames.
3. Verify dimensions and size before deploy.
4. Trigger staging deploy for `landing` via standard CI/CD flow.
5. Capture evidence:
   - deploy run URL/ref
   - timestamp
   - staging URL check (landing page loads updated asset)

## Facebook / OpenGraph Sync

1. Keep social preview image synced:
   - `supermandi-landing/og-image.png` (recommended `1200x630`)
2. Ensure OG meta tags point to `https://supermandi.tech/og-image.png`:
   - `supermandi-landing/index.html`
   - `supermandi-landing/pos.html`
3. After deploy, refresh cache in Facebook Sharing Debugger:
   - https://developers.facebook.com/tools/debug/

