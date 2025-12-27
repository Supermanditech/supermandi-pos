# SuperMandi POS — Pilot APK Status (Frontend + Backend)

This file is the single “source of truth” summary of what has been implemented so far for **pilot APK testing** (Redmi 13C + handheld POS device) and how to run it.

> Scope note: Per instruction, **no auth refactors**, **no offline reconciliation**, **no HTTPS**, and **no changes to receipt numbering/stock logic/DB migration strategy** beyond what is already implemented.

---

## 1) Backend — Implemented

### 1.1 Server
- Express server + health check: [`backend/src/app.ts`](backend/src/app.ts:1)
- Server binding to LAN (`0.0.0.0`) so devices can reach it: [`backend/src/server.ts`](backend/src/server.ts:1)

### 1.2 Database (Prisma + SQLite)
- Prisma schema/models: [`backend/prisma/schema.prisma`](backend/prisma/schema.prisma:1)
- Local dev DB: SQLite (`DATABASE_URL="file:./dev.db"`)
- Migrations are generated via Prisma migrate.

### 1.3 Auth
- JWT auth middleware: [`requireAuth()`](backend/src/middleware/auth.ts:14)
- Auth endpoints: register/login/me in [`backend/src/routes/auth.ts`](backend/src/routes/auth.ts:1)

### 1.4 API Endpoints
- Products CRUD/search: [`backend/src/routes/products.ts`](backend/src/routes/products.ts:1)
- Transactions list/create (with stock decrement + totals): [`backend/src/routes/transactions.ts`](backend/src/routes/transactions.ts:1)
- Users me endpoint: [`backend/src/routes/users.ts`](backend/src/routes/users.ts:1)
- Route mounting: [`backend/src/routes/index.ts`](backend/src/routes/index.ts:1)

### 1.5 Environment
- Backend env template: [`backend/.env.example`](backend/.env.example:1)

---

## 2) Frontend — Implemented

### 2.1 API service layer
- Base URL config (env-only): [`API_BASE_URL`](src/config/api.ts:1)
- HTTP client with auth token injection: [`apiClient`](src/services/api/apiClient.ts:43)
- Token storage (AsyncStorage): [`getAuthToken()`](src/services/api/storage.ts:5)

### 2.2 Session bootstrap (pilot only)
- Auto-register/login device user (pilot convenience): [`ensureSession()`](src/services/sessionService.ts:9)
- Called during app init: [`src/screens/SplashScreen.tsx`](src/screens/SplashScreen.tsx:1)

### 2.3 Products sync (backend → cache → fallback)
- Products store loads from backend then caches to AsyncStorage: [`useProductsStore.loadProducts()`](src/stores/productsStore.ts:33)

### 2.4 Checkout → backend transaction (with offline queue)
- Checkout tries `POST /api/transactions`, queues on failure: [`handleCompletePayment()`](src/screens/PaymentScreen.tsx:69)
- Offline queue + auto-sync on connectivity restore: [`startAutoSync()`](src/services/syncService.ts:61)

### 2.5 Money handling (minor units)
- Helpers: [`formatMoney()`](src/utils/money.ts:7)
- Sell scan UI updated to use minor-units formatting: [`src/screens/SellScanScreen.tsx`](src/screens/SellScanScreen.tsx:92)
- Payment UI updated to use minor-units formatting: [`src/screens/PaymentScreen.tsx`](src/screens/PaymentScreen.tsx:121)

### 2.6 Navigation
- App routes are mounted in [`App.tsx`](App.tsx:1)
- Success screen used for pilot: [`src/screens/SuccessPrintScreenV2.tsx`](src/screens/SuccessPrintScreenV2.tsx:1)

---

## 3) Pilot Hard Blockers — Fixed

### 3.1 Android HTTP / cleartext networking (DEV/TEST)
- Enabled `usesCleartextTraffic: true` for dev/test APK to allow HTTP calls: [`app.json`](app.json:1)

### 3.2 LAN reachability
- Backend binds to `0.0.0.0`: [`backend/src/server.ts`](backend/src/server.ts:1)
- LAN IP detected on this PC: `192.168.31.66`

### 3.3 Environment safety (no hardcoded URLs)
- Backend URL is **env-only** and required: [`src/config/api.ts`](src/config/api.ts:1)
- Frontend env template in root: [`/.env.example`](.env.example:1)

### 3.4 Expo prebuild Jimp/MIME failure (Android)

Symptom:

```
Error: [android.dangerous]: withAndroidDangerousBaseMod: Could not find MIME for Buffer <null>
```

Status:

- **Resolved** (prebuild completes without Jimp/MIME errors)
- Verified `assets/icon.png`, `assets/splash.png`, `assets/adaptive-icon.png` are valid PNGs (non-zero size + correct PNG signature + decodable by `jimp-compact`).

Additional Android build reliability fix:

- Added a small Expo config plugin that **auto-generates** `android/local.properties` during prebuild so Gradle can always find the Android SDK after `--clean`.
  - Plugin: [`plugins/withAndroidLocalProperties.js`](plugins/withAndroidLocalProperties.js:1)
  - Registered in Expo config: [`app.json`](app.json:1)

---

## 4) How to Run for Pilot Device Testing

### 4.1 Start backend
1) Install deps:
   - `cd backend && npm install`
2) Ensure database is migrated:
   - `cd backend && npx prisma migrate dev`
3) Start server:
   - `cd backend && npm run dev`

### 4.2 Verify backend from phone browser (same Wi‑Fi)
- Open:
  - `http://192.168.31.66:3001/health`

If this does not load, Windows Firewall is blocking inbound TCP 3001. Allow inbound traffic on port 3001 (admin permission required).

### 4.3 Start Expo with correct API URL
Windows cmd.exe:

```bat
set EXPO_PUBLIC_API_URL=http://192.168.31.66:3001
npm start
```

Alternatively, copy [`/.env.example`](.env.example:1) to `/.env`.

### 4.4 Build + install on a physical Android device (Redmi 13C)

From repo root (`C:\supermandi pos 11`):

1) (Optional but recommended after config changes) regenerate Android native folder:

```bat
rd /s /q android
npx expo prebuild --platform android --clean
```

2) Confirm device is connected:

```bat
adb devices
```

3) Build + install debug APK:

```bat
npx expo run:android
```

Notes:

- First run may download/install missing Android components (e.g. NDK) via the Android SDK manager.
- `android/local.properties` is automatically generated during prebuild by [`withAndroidLocalProperties`](plugins/withAndroidLocalProperties.js:1), so you should not see:
  - `SDK location not found ... android/local.properties`

---

## 5) “Do Not Do Now” (Post-pilot)

The following are intentionally **deferred**:
- No login/auth refactors beyond current pilot bootstrap.
- No offline reconciliation logic.
- No HTTPS certificates.
- No changes to receipt numbering, stock logic, or DB migration strategy.

---

## 6) Primary Documentation Files

- Main project docs: [`README.md`](README.md:1)
- Backend env template: [`backend/.env.example`](backend/.env.example:1)
- Frontend env template: [`/.env.example`](.env.example:1)

