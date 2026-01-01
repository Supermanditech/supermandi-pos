Checkpoint Timestamp: 2026-01-01 05:41:00 +04:00
Workspace: c:\supermandi-pos
Branch: main

Git Status (uncommitted)
- Modified:
  - app.json
  - backend/src/db/ensureSchema.ts
  - backend/src/middleware/deviceToken.ts
  - backend/src/routes/v1/admin/ai.ts
  - backend/src/routes/v1/admin/devices.ts
  - backend/src/routes/v1/admin/stores.ts
  - backend/src/routes/v1/index.ts
  - backend/src/routes/v1/pos/enroll.ts
  - src/components/PosStatusBar.tsx
  - src/screens/EnrollDeviceScreen.tsx
  - src/screens/SellScanScreen.tsx
  - src/screens/SplashScreen.tsx
  - src/services/api/uiStatusApi.ts
  - src/services/deviceSession.ts
  - src/services/printerService.ts
  - src/utils/money.ts
  - supermandi-superadmin/src/App.css
  - supermandi-superadmin/src/App.tsx
  - supermandi-superadmin/src/api/devices.ts
  - supermandi-superadmin/src/api/stores.ts
- New (untracked):
  - backend/src/routes/v1/pos/devices.ts
  - plugins/withCleartextTraffic.js
  - src/components/ScanBar.tsx
  - src/services/deviceInfo.ts

Key Changes Summary
- POS API now HTTPS: app.json extra.API_URL points to https://34.14.150.183.nip.io (reverse proxy for backend).
- Added cleartext-traffic config plugin (plugins/withCleartextTraffic.js) for Android.
- Enroll device screen: improved error message with API URL details.
- Device session: fallback to AsyncStorage when SecureStore unavailable.
- Sell screen UI: scan bar text, status icons sizing, cart/discount/footer visibility only when items exist, pay button label updated.
- Printer status: default not connected.
- Money formatting: display with rupee symbol (not "INR").
- SuperAdmin UI: devices/stores API updates (details in modified files).

VM / Backend State
- VM: supermandi-backend-vm (GCP), external IP 34.14.150.183.
- Nginx reverse proxy configured for 34.14.150.183.nip.io -> http://127.0.0.1:3001.
- TLS: certbot issued cert for 34.14.150.183.nip.io.
- Health check: https://34.14.150.183.nip.io/health returns {"status":"ok"}.

Builds / OTA
- APK (HTTPS build): https://expo.dev/artifacts/eas/tR3sXobuTwbWt4Cikk7axd.apk
- APK (latest UI fixes): https://expo.dev/artifacts/eas/vfKW3TWRXgk6cFfz9ySAxk.apk
- OTA update pushed to default branch (Sell screen UI refinements), but device did not reflect OTA.

Next Steps (if needed)
- Install latest APK (vfKW3TWRXgk6cFfz9ySAxk.apk) on device and verify UI changes.
- If OTA still unreliable, add forced update check on app launch and rebuild APK.
