# SuperMandi POS Quick Release Guide

## One-Time Setup (Run once per machine)

```bash
# Install git hooks
git config core.hooksPath .githooks

# Make hook executable (Linux/Mac)
chmod +x .githooks/pre-commit
```

---

## Standard Release Process

### 1. Make Changes
Edit code as needed.

### 2. Test Locally
```bash
npm run typecheck          # Check TypeScript
npm run pre-commit-check   # Run all checks
```

### 3. Commit
```bash
git add .
git commit -m "type(scope): description"
```
Pre-commit hook runs automatically.

### 4. Build Release APK
```bash
npm run build:release
```
This prompts for checklist verification.

### 5. Install on Devices
```bash
# Single device
adb install -r android/app/build/outputs/apk/release/app-release.apk

# Multiple devices
adb -s DEVICE1_SERIAL install -r android/app/build/outputs/apk/release/app-release.apk
adb -s DEVICE2_SERIAL install -r android/app/build/outputs/apk/release/app-release.apk
```

### 6. Test on Devices
Verify ALL items in RELEASE_CHECKLIST.md on each device.

### 7. Tag and Push
```bash
git tag -a pos-FEATURE-YYYY-MM-DD-HHmmIST -m "Description"
git push origin main --tags
```

### 8. Deploy to VM
```bash
npm run deploy:vm
```

---

## Quick Commands Reference

| Command | Purpose |
|---------|---------|
| `npm run typecheck` | Check TypeScript errors |
| `npm run pre-commit-check` | Run all validation checks |
| `npm run build:release` | Build APK with checklist |
| `npm run deploy:vm` | Deploy to Google VM |
| `npm run install:devices` | Install APK on connected device |

---

## Device Installation

```bash
# List connected devices
adb devices

# Install on specific device
adb -s SERIAL install -r android/app/build/outputs/apk/release/app-release.apk

# Launch app
adb -s SERIAL shell monkey -p com.supermanditech.supermandipos -c android.intent.category.LAUNCHER 1
```

---

## Troubleshooting

### Build fails with TypeScript errors
```bash
npm run typecheck
# Fix reported errors
```

### APK not installing
```bash
# Uninstall old version first
adb -s SERIAL uninstall com.supermanditech.supermandipos
# Then install
adb -s SERIAL install android/app/build/outputs/apk/release/app-release.apk
```

### VM deployment fails
```bash
# Check SSH connection
ssh supermandi-vm "echo 'Connected'"

# Manual deployment
ssh supermandi-vm "cd ~/supermandi-pos && git pull origin main && pm2 restart all"
```

---

## Critical Checks (NEVER SKIP)

1. Cart opens **fully expanded** on ALL devices
2. All buttons visible (trash, +/-, back, Menu)
3. Scan debouncing works (no rapid-fire additions)
4. Stock onboarding triggers for new/priceless items

---

## Files Reference

| File | Purpose |
|------|---------|
| `RELEASE_CHECKLIST.md` | Full checklist for releases |
| `.release-status.json` | Current release status |
| `scripts/pre-commit-check.js` | Pre-commit validation |
| `scripts/build-release.js` | Build with checks |
| `scripts/deploy-vm.js` | VM deployment |
| `.githooks/pre-commit` | Git hook |
