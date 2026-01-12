# Expo Go vs APK Build - Critical Differences

This guide documents all known differences between Expo Go development and standalone APK builds.

**Run before every APK build:** `npm run apk:check`

---

## 1. Icon/Font Loading (CRITICAL)

### Problem
Icons appear in Expo Go but show as **empty boxes** in APK.

### Why
- Expo Go pre-loads all vector icon fonts
- APK builds do NOT include fonts unless explicitly loaded

### Solution
```typescript
// In App.tsx
import * as Font from "expo-font";
import { MaterialCommunityIcons } from "@expo/vector-icons";

// Load fonts BEFORE rendering
await Font.loadAsync(MaterialCommunityIcons.font);
```

### Affected Libraries
- `MaterialCommunityIcons`
- `Ionicons`
- `FontAwesome`
- `Feather`
- `AntDesign`
- Any `@expo/vector-icons` icons

---

## 2. Custom Fonts

### Problem
Custom fonts work in Expo Go but don't load in APK.

### Solution
```typescript
import * as Font from 'expo-font';

await Font.loadAsync({
  'CustomFont-Regular': require('./assets/fonts/CustomFont-Regular.ttf'),
});
```

---

## 3. Environment Variables

### Problem
`process.env` values differ between Expo Go and APK.

### Why
- Expo Go reads from `.env` at runtime
- APK bakes values at build time

### Solution
Use `app.json` extra field for production values:
```json
{
  "expo": {
    "extra": {
      "API_URL": "https://production-server.com"
    }
  }
}
```

Access via:
```typescript
import Constants from 'expo-constants';
const API_URL = Constants.expoConfig?.extra?.API_URL;
```

---

## 4. Network Requests (HTTP)

### Problem
HTTP requests work in Expo Go but fail in APK with "CLEARTEXT not permitted".

### Why
Android 9+ blocks HTTP by default in release builds.

### Solution
Add cleartext traffic plugin in `app.json`:
```json
{
  "plugins": [
    "./plugins/withCleartextTraffic"
  ]
}
```

Or use HTTPS for all API calls.

---

## 5. Expo Updates

### Problem
APK shows "Remote update request not successful" error.

### Why
Expo Go handles updates, but standalone APK tries to fetch from EAS.

### Solution
Disable updates in `app.json`:
```json
{
  "expo": {
    "updates": {
      "enabled": false,
      "checkAutomatically": "NEVER",
      "fallbackToCacheTimeout": 0
    }
  }
}
```

---

## 6. Native Modules

### Problem
Native features work in Expo Go but crash in APK.

### Why
Expo Go includes all native modules; APK only includes what's linked.

### Solution
1. Ensure all native packages are in `package.json`
2. Run `npx expo prebuild --clean` before building
3. Check `app.json` plugins array

---

## 7. Assets (Images, etc.)

### Problem
Images load in Expo Go but not in APK.

### Why
Metro bundler handles assets differently in development.

### Solution
Use `expo-asset` to preload critical assets:
```typescript
import { Asset } from 'expo-asset';

await Asset.loadAsync([
  require('./assets/logo.png'),
]);
```

---

## 8. Splash Screen

### Problem
Splash screen shows in Expo Go but not in APK (or shows wrong one).

### Solution
Configure in `app.json`:
```json
{
  "expo": {
    "splash": {
      "image": "./assets/splash.png",
      "resizeMode": "contain",
      "backgroundColor": "#ffffff"
    }
  }
}
```

---

## 9. App Icon

### Problem
App icon missing or wrong in APK.

### Solution
Configure in `app.json`:
```json
{
  "expo": {
    "icon": "./assets/icon.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#ffffff"
      }
    }
  }
}
```

---

## 10. Deep Linking

### Problem
Deep links work in Expo Go but not in APK.

### Solution
Configure scheme in `app.json`:
```json
{
  "expo": {
    "scheme": "myapp"
  }
}
```

---

## 11. Permissions

### Problem
Camera/Location/etc. work in Expo Go but fail in APK.

### Why
Expo Go has all permissions; APK only has declared permissions.

### Solution
Add permissions plugin:
```json
{
  "plugins": [
    [
      "expo-camera",
      {
        "cameraPermission": "Allow camera access for scanning"
      }
    ]
  ]
}
```

---

## 12. Debugging

### Problem
`console.log` shows in Expo Go but not visible in APK.

### Solution
Use remote debugging or logcat:
```bash
adb logcat *:S ReactNative:V ReactNativeJS:V
```

---

## Pre-Build Checklist

Before every APK build, verify:

- [ ] `npm run apk:check` passes
- [ ] All icon fonts loaded in App.tsx
- [ ] API_URL points to production server (not localhost)
- [ ] Expo updates disabled
- [ ] TypeScript compiles (`npm run typecheck`)
- [ ] Custom plugins exist
- [ ] Test on at least 2 device types

---

## Build Commands

```bash
# 1. Run APK readiness check
npm run apk:check

# 2. Clean prebuild
npx expo prebuild -p android --clean

# 3. Build release APK
cd android && ./gradlew assembleRelease

# 4. Install on device
adb install -r android/app/build/outputs/apk/release/app-release.apk
```
