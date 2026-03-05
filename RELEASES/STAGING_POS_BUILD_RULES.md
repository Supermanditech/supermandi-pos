# Staging POS Build Rules

> Created: 2026-03-05 | Root cause: POS APK built with wrong EAS profile, pointing to production URL with no backend deployed.

## 1. Build Profile Selection

| Environment | EAS Profile | API URL | Use Case |
|------------|------------|---------|----------|
| Development | `development` | `https://staging.supermandi.tech` | Local dev with dev client |
| Preview | `preview` | `https://staging.supermandi.tech` | Internal testing builds |
| Staging APK | `staging-apk` | `https://staging.supermandi.tech` | Operator device testing |
| Production APK | `production-apk` | `https://supermandi.tech` | Play Store / direct APK |
| Production AAB | `production` | `https://supermandi.tech` | Play Store upload (AAB) |

**Rule: For any staging/testing build, ALWAYS use `staging-apk` profile.**

```bash
# CORRECT: Staging test build
eas build --profile staging-apk --platform android

# WRONG: This uses production URL (no backend on supermandi.tech)
eas build --profile production-apk --platform android
```

## 2. Pre-Build Checklist

- [ ] `git status` — working tree clean for tracked files
- [ ] `npm run typecheck` — zero errors
- [ ] `npm run ui:audit` — zero orphaned screens
- [ ] Verify `eas.json` profile has correct `EXPO_PUBLIC_API_URL`
- [ ] No `.env` local overrides that could leak into build

## 3. Post-Build Verification

After APK is built and before distribution:

```bash
# Check build stamp (will be visible on EnrollDevice screen in release mode)
# Build: <SHA> · Deployed: <timestamp>
```

- [ ] Verify build SHA matches expected commit
- [ ] Verify API URL stamp shows correct domain (staging or production)
- [ ] Verify package name: `com.supermanditech.supermandipos`
- [ ] Verify versionCode incremented from previous build

## 4. APK Distribution

- Use Firebase App Distribution or direct APK share
- Release notes MUST include:
  - Git SHA
  - API target domain
  - Build profile used
  - Build timestamp

## 5. Environment/Secret Parity Checks

Before distributing a staging APK, verify staging GCP has:

- [ ] All 6 Cloud Run services healthy (`/api/v1/health` → 200)
- [ ] CORS allows staging origins
- [ ] Database migrations up to date
- [ ] Required secrets present in Secret Manager:
  - `database-url`, `postgres-password`, `jwt-secret`
  - `admin-token` (for superadmin auth — required for ADMIN_EMAIL_ALLOWLIST)
  - `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`
  - `smtp-password` (for email OTP)

## 6. Smoke Gates (Post-Install on Device)

After installing APK on test device:

| Gate | Expected | Action if Failed |
|------|----------|-----------------|
| App launches | Splash → EnrollDevice screen | Check crash logs (logcat) |
| Build stamp visible | SHA + timestamp on EnrollDevice footer | Wrong build installed |
| Enter enrollment code | "Connecting..." → success or clear error | Check API URL target |
| Network error shows message | "Could not connect to server" with details | URL mismatch or backend down |
| Cancel button works | Stops activation, returns to form | Code regression |

## 7. Rollback Criteria

Rollback (revert to previous APK) if:
- App crashes on launch (no splash screen)
- Enrollment always fails with network error (URL mismatch)
- API responses return unexpected status codes (backend version mismatch)
- Device token not persisted (re-enrollment required on every app restart)

## 8. Forbidden Actions

- **NEVER** build staging test APK with `production-apk` or `production` profile
- **NEVER** distribute a staging APK without verifying the API URL stamp
- **NEVER** use `production` EAS profile for internal testing
- **NEVER** modify `app.json` `extra.API_URL` to staging — use `eas.json` env overrides instead
- **NEVER** commit `.env.local` or team-specific LAN IPs to the repository

## 9. Build Command Quick Reference

```bash
# Staging APK for device testing
eas build --profile staging-apk --platform android

# Production APK for direct distribution
eas build --profile production-apk --platform android

# Production AAB for Play Store
eas build --profile production --platform android

# Check current EAS profiles
cat eas.json | jq '.build | keys'
```
