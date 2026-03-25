#!/usr/bin/env bash
# ────────────────────────────────────────────────────────────────
# GCP-STG-0649 — Source Map Upload Documentation
# ────────────────────────────────────────────────────────────────
# Documents how to upload source maps to Sentry or Cloud Error
# Reporting after each release build. Depends on GCP-STG-0621
# (crash reporting SDK integration).
#
# Usage:  bash scripts/docs/sourcemap-upload.sh
# ────────────────────────────────────────────────────────────────
set -euo pipefail

cat << 'DOCS'
================================================================
  SOURCE MAP UPLOAD — SuperMandi POS & Web Portals
================================================================

DEPENDENCY: GCP-STG-0621 (Crash Reporting SDK)
  Source map upload requires the crash reporting SDK to be
  integrated first. The SDK provides the DSN and project
  configuration needed for source map association.

1. SENTRY CLI SETUP
---------------------

  Install sentry-cli:
    npm install -g @sentry/cli
    # or in CI: npx @sentry/cli

  Authenticate:
    export SENTRY_AUTH_TOKEN="<from Sentry settings>"
    export SENTRY_ORG="supermandi"
    export SENTRY_PROJECT="supermandi-pos"

  Verify:
    sentry-cli info

2. REACT NATIVE (POS APP) — Source Map Upload
-----------------------------------------------

  After building the Android release APK:

  # Step 1: Generate the source map bundle
  npx react-native bundle \
    --platform android \
    --dev false \
    --entry-file index.js \
    --bundle-output android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle \
    --sourcemap-output android/app/build/generated/sourcemaps/react/release/index.android.bundle.map

  # Step 2: Create a Sentry release
  VERSION=$(node -e "console.log(require('./package.json').version)")
  BUILD=$(grep versionCode android/app/build.gradle | head -1 | grep -oE '[0-9]+')
  RELEASE="com.supermandi.pos@${VERSION}+${BUILD}"

  sentry-cli releases new "$RELEASE"

  # Step 3: Upload source maps
  sentry-cli releases files "$RELEASE" upload-sourcemaps \
    --strip-prefix /workspace/ \
    --rewrite \
    android/app/build/generated/assets/createBundleReleaseJsAndAssets/index.android.bundle \
    android/app/build/generated/sourcemaps/react/release/index.android.bundle.map

  # Step 4: Finalize release
  sentry-cli releases finalize "$RELEASE"

  # Step 5: Associate commits (optional but recommended)
  sentry-cli releases set-commits "$RELEASE" --auto

3. WEB PORTALS — Source Map Upload
-------------------------------------

  For Vite-based portals (retailer-admin, supermandi-superadmin):

  # Ensure source maps are generated in vite.config.ts:
  #   build: { sourcemap: true }  (or 'hidden' for production)

  # After build:
  sentry-cli releases files "$RELEASE" upload-sourcemaps \
    --url-prefix "~/retailer/" \
    --rewrite \
    retailer-admin/dist/

  # For supplier-portal (Next.js):
  sentry-cli releases files "$RELEASE" upload-sourcemaps \
    --url-prefix "~/_next/" \
    --rewrite \
    supplier-portal/.next/static/

4. CI INTEGRATION (GitHub Actions)
-------------------------------------

  Add to .github/workflows/cd.yml after build step:

  - name: Upload Source Maps to Sentry
    env:
      SENTRY_AUTH_TOKEN: ${{ secrets.SENTRY_AUTH_TOKEN }}
      SENTRY_ORG: supermandi
    run: |
      npm install -g @sentry/cli

      # Determine version from package.json
      VERSION=$(node -e "console.log(require('./package.json').version)")
      SHA=$(git rev-parse --short HEAD)
      RELEASE="${VERSION}-${SHA}"

      sentry-cli releases new "$RELEASE"

      # Upload POS source maps (if APK was built)
      if [ -d "android/app/build" ]; then
        sentry-cli releases files "$RELEASE" upload-sourcemaps \
          --project supermandi-pos \
          android/app/build/generated/sourcemaps/
      fi

      # Upload retailer-admin source maps
      if [ -d "retailer-admin/dist" ]; then
        sentry-cli releases files "$RELEASE" upload-sourcemaps \
          --project supermandi-retailer \
          --url-prefix "~/retailer/" \
          retailer-admin/dist/
      fi

      # Upload superadmin source maps
      if [ -d "supermandi-superadmin/dist" ]; then
        sentry-cli releases files "$RELEASE" upload-sourcemaps \
          --project supermandi-superadmin \
          --url-prefix "~/admin/" \
          supermandi-superadmin/dist/
      fi

      sentry-cli releases finalize "$RELEASE"
      sentry-cli releases set-commits "$RELEASE" --auto

5. CLOUD ERROR REPORTING (Alternative to Sentry)
---------------------------------------------------

  If using GCP Cloud Error Reporting instead of Sentry:

  Source maps are NOT directly uploaded to Cloud Error Reporting.
  Instead, configure the error reporting client to include source
  map references:

  # In the app's error handler:
  const { ErrorReporting } = require('@google-cloud/error-reporting');
  const errors = new ErrorReporting({
    projectId: 'supermandi-backend',
    reportMode: 'always',
    serviceContext: {
      service: 'pos-app',
      version: process.env.APP_VERSION,
    },
  });

  For Cloud Run services, source maps should be:
  1. Included in the Docker image (in a /sourcemaps directory)
  2. Referenced by the error reporting middleware
  3. NOT served to end users (use 'hidden' source maps)

6. VERIFICATION
-----------------

  After uploading, verify in Sentry:
  1. Go to Sentry > Releases > [version]
  2. Check "Artifacts" tab — source maps should be listed
  3. Trigger a test error in the app
  4. Verify the stack trace shows original source code (not minified)

  Common issues:
  - URL prefix mismatch: ensure --url-prefix matches actual served paths
  - Missing source maps: ensure build.sourcemap = true in config
  - Auth token expired: rotate in Sentry > Settings > Auth Tokens

================================================================
  END OF SOURCE MAP UPLOAD DOCS
================================================================
DOCS
