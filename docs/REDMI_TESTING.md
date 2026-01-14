# Redmi Expo Go Testing Workflow

This document explains how to run the SuperMandi POS app on Redmi (or any Android phone) using Expo Go, with guaranteed "latest code" verification.

## Quick Start

```powershell
# LAN mode (default - phone and laptop on same WiFi)
pnpm dev:redmi

# USB mode (when WiFi fails - uses ADB reverse)
pnpm dev:redmi:usb

# Test Store mode (with test credentials)
pnpm dev:redmi:teststore
```

## Prerequisites

### 1. Expo Token
Get a Personal Access Token from [Expo](https://expo.dev/settings/access-tokens) and set it:

```powershell
# Set for current PowerShell session
$env:EXPO_TOKEN = "your-token-here"

# Or add to PowerShell profile for persistence
notepad $PROFILE
# Add: $env:EXPO_TOKEN = "your-token-here"
```

### 2. Expo Go App
Install [Expo Go](https://expo.dev/go) on your Redmi from Play Store.

### 3. Same Network (for LAN mode)
Ensure laptop and phone are on the same WiFi network.

### 4. USB Debugging (for USB mode)
1. Enable Developer Options on Redmi (tap Build Number 7 times)
2. Enable USB Debugging in Developer Options
3. Connect via USB and accept the debugging prompt

## Commands Reference

| Command | Mode | Use When |
|---------|------|----------|
| `pnpm dev:redmi` | LAN | Default, both devices on same WiFi |
| `pnpm dev:redmi:usb` | USB | WiFi blocked, firewall issues, VPN |
| `pnpm dev:redmi:tunnel` | Tunnel | Different networks, remote testing |
| `pnpm dev:redmi:teststore` | LAN + Test | Testing with test store credentials |
| `pnpm dev:redmi:teststore:usb` | USB + Test | USB mode with test credentials |

## Verifying You Have Latest Code

The script sets build info that displays in the app:

1. **On PowerShell**: Script prints Git SHA and build time
2. **On Redmi**: Go to Menu screen (bottom) to see "Build Info (DEV)" section

```
BUILD INFO (verify in app):
  Git SHA:    ae82062
  Build time: 2026-01-14 15:30:45 IST
```

If the SHA/time in the app doesn't match what the script printed, the app is running old code. See [Troubleshooting](#troubleshooting).

## Test Store Mode

### Setup

1. Copy `.env.local.example` to `.env.local`:
   ```powershell
   copy .env.local.example .env.local
   ```

2. Edit `.env.local` with your test store credentials:
   ```
   EXPO_PUBLIC_TEST_PHONE=9876543210
   EXPO_PUBLIC_TEST_PIN=1234
   EXPO_PUBLIC_TEST_STORE_NAME=TEST STORE
   ```

3. Run with test store flag:
   ```powershell
   pnpm dev:redmi:teststore
   ```

### Alternative: Set in PowerShell

```powershell
$env:EXPO_PUBLIC_TEST_PHONE = "9876543210"
$env:EXPO_PUBLIC_TEST_PIN = "1234"
pnpm dev:redmi:teststore
```

### Using Test Credentials

1. On EnrollDeviceScreen, you'll see a "DEV MODE" section
2. Tap "View Test Credentials" to see the loaded phone/PIN
3. Use these credentials when logging into the test store

## Troubleshooting

### "Wrong code running" / Old build showing

1. **Force close Expo Go** (swipe away completely)
2. **Clear Expo Go cache**: Settings > Apps > Expo Go > Clear Cache
3. **Re-run the script**: `pnpm dev:redmi`
4. **Verify SHA matches** in Menu > Build Info

### "Unable to connect" / QR code not working

1. **Check firewall**: Windows Firewall may block port 8081
   - Allow Node.js through firewall, or
   - Use USB mode: `pnpm dev:redmi:usb`

2. **VPN interference**: Disable VPN temporarily

3. **Port conflict**: Another process using 8081
   ```powershell
   # Find what's using port 8081
   netstat -ano | findstr 8081
   # Kill the process
   taskkill /PID <pid> /F
   ```

4. **Try different port**: Edit script to use 8082

### USB mode: "No device connected"

1. Enable USB Debugging on phone
2. Accept USB debugging prompt when connecting
3. Run `adb devices` to verify connection
4. If "unauthorized", disconnect and reconnect, accept prompt

```powershell
# Check ADB connection
adb devices

# Should show:
# List of devices attached
# <device-id>    device
```

### "Tunnel mode slow"

Tunnel mode routes through ngrok servers and can be slow. Use LAN or USB mode when possible.

### API URL issues

Check which API you're hitting:

1. In Menu screen, "Build Info" shows current API URL
2. In EnrollDeviceScreen, "DEV MODE" section shows API

If wrong API, check:
- `.env.local` settings
- PowerShell env vars: `echo $env:EXPO_PUBLIC_API_URL`

## How It Works

The `tools/dev/redmi.ps1` script:

1. **Kills existing Metro processes** to ensure clean start
2. **Sets build info env vars** (`EXPO_PUBLIC_GIT_SHA`, `EXPO_PUBLIC_BUILD_TIME`)
3. **Loads `.env.local`** if using `-TestStore` flag
4. **Configures ADB reverse** if using `-Usb` flag
5. **Starts Expo** with appropriate flags (`--lan`, `--localhost`, or `--tunnel`)

The app reads these env vars in `src/config/api.ts` and displays them in the UI.

## Files

| File | Purpose |
|------|---------|
| `tools/dev/redmi.ps1` | Main PowerShell script |
| `.env.local` | Local env vars (gitignored) |
| `.env.local.example` | Template for .env.local |
| `src/config/api.ts` | Reads env vars, exports BUILD_INFO |
| `src/screens/MenuScreen.tsx` | Displays build info (DEV only) |
| `src/screens/EnrollDeviceScreen.tsx` | DEV shortcuts for test credentials |

## Security Notes

- **Never commit `.env.local`** - it contains credentials
- **Test credentials are DEV-only** - wrapped in `__DEV__` checks
- **BUILD_INFO is DEV-only** - production builds won't show it
- **EXPO_TOKEN** is secret - never commit or share
