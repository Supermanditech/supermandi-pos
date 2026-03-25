#!/usr/bin/env bash
# GCP-STG-0621: POS Crash Reporting SDK Documentation
# Documents Sentry/Crashlytics setup steps for the React Native POS app.
# This is a POST-LAUNCH enhancement — not required for initial go-live.
set -euo pipefail

cat <<'DOCS'
=============================================================
  POS Crash Reporting SDK — Setup Guide
=============================================================

STATUS: Post-launch enhancement (not required for initial deploy)

1. INSTALL SENTRY FOR REACT NATIVE
   npm install @sentry/react-native
   # or
   npx expo install @sentry/react-native

2. ENVIRONMENT VARIABLE
   Add to .env and deploy secrets:
     SENTRY_DSN=https://<key>@o<org>.ingest.sentry.io/<project>

   For GCP Cloud Run / Expo builds, set via:
     - eas.json: { "build": { "production": { "env": { "SENTRY_DSN": "..." } } } }
     - For local dev: .env file (already in .gitignore)

3. INITIALIZATION CODE (add to App.tsx or app entry)
   -------------------------------------------------------
   import * as Sentry from '@sentry/react-native';

   Sentry.init({
     dsn: process.env.SENTRY_DSN || process.env.EXPO_PUBLIC_SENTRY_DSN,
     environment: __DEV__ ? 'development' : 'production',
     tracesSampleRate: 0.2,   // 20% of transactions for performance
     enableAutoSessionTracking: true,
     attachStacktrace: true,
   });
   -------------------------------------------------------

4. WRAP ROOT COMPONENT
   export default Sentry.wrap(App);

5. OPTIONAL: CRASHLYTICS (Firebase alternative)
   npm install @react-native-firebase/app @react-native-firebase/crashlytics
   # Requires google-services.json (Android) / GoogleService-Info.plist (iOS)
   # Already configured if Firebase is set up for push notifications.

6. SOURCE MAPS (for readable stack traces)
   npx sentry-cli releases files <release> upload-sourcemaps \
     --dist <dist> ./dist/bundles/

7. TESTING
   # Trigger a test crash:
   Sentry.nativeCrash();           # Native crash
   throw new Error('Test crash');   # JS crash

NOTES:
- Sentry free tier: 5K errors/month — sufficient for initial rollout
- Crashlytics is free and unlimited but Firebase-only
- Recommendation: Use Sentry for JS errors + Crashlytics for native crashes
- Both can coexist without conflict
=============================================================
DOCS

echo "ℹ️  This is a documentation script — no changes made."
echo "   Implement these steps post-launch when crash volume warrants it."
