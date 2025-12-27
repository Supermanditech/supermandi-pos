# Launcher Icon Setup (Expo + Android)

This project treats Expo config + Expo assets as the **single source of truth** for the Android launcher icon.

## Required files (non-negotiable)

These files must exist at repo root under [`assets/`](assets:1):

- [`assets/icon.png`](assets/icon.png:1) — **1024×1024**, square
- [`assets/adaptive-icon.png`](assets/adaptive-icon.png:1) — **1024×1024**, square

Rules:

- Do **not** use UI screenshots or UI folders as launcher icons.
- Do **not** keep duplicate icon files (only the two files above).

## Expo config (single source of truth)

[`app.json`](app.json:1) must contain **only** the following icon configuration (no other icon fields elsewhere):

```json
{
  "expo": {
    "name": "SuperMandi POS",
    "slug": "supermandi-pos",
    "icon": "./assets/icon.png",
    "android": {
      "adaptiveIcon": {
        "foregroundImage": "./assets/adaptive-icon.png",
        "backgroundColor": "#0B5ED7"
      }
    }
  }
}
```

## Why clean prebuild is mandatory

Android launcher icons are generated into `android/app/src/main/res/mipmap-*` during prebuild.

If you change icon assets but do not regenerate native resources cleanly, Android can keep stale `mipmap` outputs and you’ll see:

- default Android/Expo icon fallback
- old icon after uninstall/reinstall
- inconsistent icon between builds/devices

## Mandatory build rule (cache elimination)

Before **any** Android build, always run:

```bash
npx expo prebuild -p android --clean
```

Then build/install:

```bash
npx expo run:android
```

## Android native enforcement (what to check)

After prebuild, confirm Android is pointing at the generated mipmap icons:

- [`android/app/src/main/AndroidManifest.xml`](android/app/src/main/AndroidManifest.xml:1)
  - `android:icon` must be `@mipmap/ic_launcher`
  - `android:roundIcon` must be `@mipmap/ic_launcher_round`

Do **not** point launcher icons at `@drawable/*`.

## Safe process to update the icon in future

1) Replace ONLY:
   - [`assets/icon.png`](assets/icon.png:1)
   - [`assets/adaptive-icon.png`](assets/adaptive-icon.png:1)

2) Keep them **1024×1024** and valid PNGs.

3) Run:

```bash
npx expo prebuild -p android --clean
npx expo run:android
```

4) Verify on a physical device launcher:

- icon shows the correct “SuperMandi POS” artwork
- icon persists after uninstall/reinstall

No manual Android Studio edits are required or allowed for this workflow.

