# SuperMandi POS Release Checklist

## MANDATORY: Complete ALL checks before building APK or deploying

---

## Pre-Release Checklist

### 1. Code Quality Checks
- [ ] TypeScript compiles without errors: `npx tsc --noEmit`
- [ ] No console.log statements in production code (except intentional debug)
- [ ] All imports are used (no unused imports)
- [ ] No hardcoded device-specific values (screen sizes, etc.)

### 2. UI/Layout Verification (Test on ANY 3 different screen sizes)
- [ ] Sell Cart opens **fully expanded** showing discount + total + checkout button
- [ ] Trash/delete button is **clearly visible** (red background, 18px+ icon)
- [ ] Quantity +/- buttons are **clearly visible** (bordered, 30px+ touch target)
- [ ] Back navigation button is **clearly visible** in cart header
- [ ] "Menu" text is visible in tab bar
- [ ] All text is readable (no truncation cutting off important info)
- [ ] Touch targets are minimum 44x44px for accessibility

### 3. Scan Flow Verification
- [ ] Single scan adds item correctly
- [ ] Rapid/continuous scanning is debounced (no spam adding)
- [ ] New products trigger stock onboarding modal
- [ ] Products without sell price trigger onboarding modal
- [ ] Duplicate scan within 1 second shows "Wait before re-scanning" toast

### 4. Cart Functionality
- [ ] Add item to cart works
- [ ] Remove item from cart works
- [ ] Quantity increment/decrement works
- [ ] Item discount applies correctly
- [ ] Cart discount applies correctly
- [ ] Total calculation is accurate
- [ ] Checkout navigation works

### 5. Device-Agnostic Design Principles
- [ ] No hardcoded pixel values for layout breakpoints
- [ ] Use percentage-based or flex layouts
- [ ] Safe area insets are respected
- [ ] Orientation changes handled (if applicable)
- [ ] Font scaling respected

### 6. Backend Integration
- [ ] API calls work correctly
- [ ] Offline mode gracefully handled
- [ ] Error messages are user-friendly
- [ ] Network timeout handling works

---

## Release Process

### Step 1: Pre-Commit
```bash
npm run pre-commit-check
```
Must pass before committing.

### Step 2: Commit with Tag
```bash
git add .
git commit -m "type(scope): description"
git tag -a pos-FEATURE-YYYY-MM-DD-HHmmIST -m "Description"
git push origin main --tags
```

### Step 3: Build APK
```bash
npm run build:release
```
This runs all checks before building.

### Step 4: Test APK on Devices
- [ ] Install on Device 1 (any handheld POS)
- [ ] Install on Device 2 (any mobile phone)
- [ ] Install on Device 3 (different screen size)
- [ ] All checklist items verified on each device

### Step 5: Deploy to VM
```bash
npm run deploy:vm
```
Only runs if checklist file is marked complete.

---

## Checklist Status File

Before deployment, update `.release-status.json`:
```json
{
  "version": "1.0.x",
  "commit": "abc1234",
  "tag": "pos-xxx-2026-01-11-xxxx",
  "checklist_completed": true,
  "tested_devices": [
    "Sunmi V2",
    "Redmi Note",
    "iMin Swift 2"
  ],
  "tester": "Name",
  "date": "2026-01-11"
}
```

---

## Common Regression Points (ALWAYS VERIFY)

| Component | What to Check | Why It Breaks |
|-----------|--------------|---------------|
| Cart Sheet | Opens fully expanded | Screen size thresholds |
| Qty Buttons | Visible borders | Low contrast colors |
| Delete Button | Red, visible | Icon too small/faint |
| Back Button | Visible in header | Missing or too small |
| Menu Text | Always shows | Screen width threshold |
| Scan Debounce | 1000ms+ guard | Rapid scan spam |
| Stock Onboarding | Triggers for new items | Missing sell price check |

---

## Emergency Rollback

If critical bug found after deployment:
```bash
# Find previous stable tag
git tag --list --sort=-creatordate | head -5

# Checkout and rebuild
git checkout <previous-tag>
npm run build:release

# Reinstall on devices
adb install -r android/app/build/outputs/apk/release/app-release.apk
```

---

**IMPORTANT**: No APK release without completing this checklist!
