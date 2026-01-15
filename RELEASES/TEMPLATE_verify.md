# Release Verification Report

**Date:** YYYY-MM-DD
**Version:** vX.Y.Z
**Tag:** vX.Y.Z
**Git SHA:** (7-char)
**Release Manager:** @name

---

## Pre-Release Checklist

### 1. Build Info Verification
- [ ] `pnpm release:gate` passes all checks
- [ ] Fingerprint shows real SHA (not "unknown" or fallback ID)
- [ ] Branch is `main` or valid release branch
- [ ] Working tree is clean (no uncommitted changes)

```
Fingerprint: _______________
SHA:         _______________
Branch:      _______________
Build Time:  _______________
```

### 2. Environment Configuration
- [ ] API_URL points to production: `http://34.14.220.171:3000`
- [ ] No localhost/development URLs in config
- [ ] Feature flags set correctly for release

---

## Test Environments

### Demo Store Testing
| Test Case | Status | Notes |
|-----------|--------|-------|
| Enroll device with demo code | ⬜ | Code: ___ |
| Create sale (CASH) | ⬜ | |
| View bill in history | ⬜ | |
| Print bill | ⬜ | |
| Share bill (PDF) | ⬜ | |
| Share bill (WhatsApp) | ⬜ | |
| Barcode sheet generation | ⬜ | |
| Build info shows in Menu | ⬜ | |

### Pre-Live Store Testing (if applicable)
| Test Case | Status | Notes |
|-----------|--------|-------|
| Enroll with pre-live code | ⬜ | Code: ___ |
| Full sale flow | ⬜ | |
| UPI payment | ⬜ | |
| Stock deduction verified | ⬜ | |

---

## APK Verification (Production Build)

### Build Commands
```powershell
# Clean and build
cd android
./gradlew clean
./gradlew assembleRelease

# Or via Expo
npx expo prebuild --clean --platform android
cd android && ./gradlew assembleRelease
```

### APK Details
| Field | Value |
|-------|-------|
| APK Path | `android/app/build/outputs/apk/release/app-release.apk` |
| APK Size | ___ MB |
| Version Code | ___ |
| Version Name | ___ |

### APK Testing
| Test Case | Status | Notes |
|-----------|--------|-------|
| Install on test device | ⬜ | |
| Build info shows SHA/Branch | ⬜ | |
| Complete sale flow | ⬜ | |
| Offline mode (CASH/DUE) | ⬜ | |
| UPI blocked when offline | ⬜ | |

---

## Sign-Off

### Final Checklist
- [ ] All demo tests pass
- [ ] APK build info verified
- [ ] No "unknown" values in Build Info panel
- [ ] API connectivity confirmed
- [ ] Ready for distribution

### Approval
| Role | Name | Date | Signature |
|------|------|------|-----------|
| QA Lead | | | |
| Dev Lead | | | |
| Release Manager | | | |

---

## Deployment Notes

```
Additional notes or issues encountered during verification:

```

---

**Status:** ⬜ PENDING | ⬜ APPROVED | ⬜ REJECTED

*Generated from RELEASES/TEMPLATE_verify.md*
