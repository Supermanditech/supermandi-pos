#!/usr/bin/env bash
# GCP-STG-0623: Expo OTA Updates Documentation
# Documents how to configure Expo Updates for hot-fix capability.
set -euo pipefail

cat <<'DOCS'
=============================================================
  Expo OTA (Over-The-Air) Updates — Setup Guide
=============================================================

PURPOSE: Enable hot-fix delivery to POS devices without requiring
a full APK rebuild and Play Store/sideload update cycle.

1. INSTALL EXPO-UPDATES
   npx expo install expo-updates

2. APP.JSON CONFIGURATION
   Add to app.json (or app.config.js):
   {
     "expo": {
       "updates": {
         "enabled": true,
         "checkAutomatically": "ON_LOAD",
         "fallbackToCacheTimeout": 5000,
         "url": "https://u.expo.dev/<project-id>"
       },
       "runtimeVersion": {
         "policy": "sdkVersion"
       }
     }
   }

   NOTES:
   - checkAutomatically: "ON_LOAD" checks on every app open
   - fallbackToCacheTimeout: ms to wait before falling back to cached bundle
   - runtimeVersion policy: "sdkVersion" auto-increments with Expo SDK upgrades

3. CHANNEL-BASED DEPLOYMENT
   Channels separate staging from production updates:

   # Publish to staging channel
   eas update --branch staging --message "Fix: cart total rounding"

   # Publish to production channel
   eas update --branch production --message "Fix: cart total rounding"

   Configure channels in eas.json:
   {
     "build": {
       "staging": {
         "channel": "staging",
         "distribution": "internal"
       },
       "production": {
         "channel": "production",
         "distribution": "store"
       }
     }
   }

4. PUBLISHING AN OTA UPDATE
   # Stage the fix in code, then:
   eas update --branch staging --message "Hotfix: <description>"

   # After verifying on staging devices:
   eas update --branch production --message "Hotfix: <description>"

5. CHECKING FOR UPDATES PROGRAMMATICALLY
   import * as Updates from 'expo-updates';

   async function checkForUpdate() {
     const update = await Updates.checkForUpdateAsync();
     if (update.isAvailable) {
       await Updates.fetchUpdateAsync();
       await Updates.reloadAsync();  // Restart app with new bundle
     }
   }

6. LIMITATIONS
   - OTA can ONLY update JavaScript/TypeScript code and assets
   - Native module changes (new npm packages with native code) require full APK rebuild
   - Binary-incompatible changes require runtimeVersion bump
   - Maximum bundle size: 50MB (Expo default)
   - Updates are downloaded over the network — ensure POS has connectivity

7. ROLLBACK
   # List recent updates
   eas update:list --branch production

   # Roll back by republishing the previous good version
   eas update:republish --group <previous-update-group-id>

STATUS: Post-launch enhancement. Requires EAS project setup on expo.dev.
=============================================================
DOCS

echo "This is a documentation script — no changes made."
echo "Implement after initial APK release when hot-fix workflow is needed."
