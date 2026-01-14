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

# Snapshot mode (commits all changes first, then runs)
pnpm dev:redmi:snapshot
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
| `pnpm dev:redmi:snapshot` | Snapshot + LAN | Commit all changes first, then test |
| `pnpm dev:redmi:snapshot:usb` | Snapshot + USB | Snapshot + USB mode |
| `pnpm dev:redmi:snapshot:teststore` | Snapshot + Test | Snapshot + Test store |

## Understanding Clean vs Dirty Testing

### The Problem
When your working tree has uncommitted changes, the HEAD SHA alone doesn't uniquely identify what code is running. Two developers on the same commit but with different local changes would see the same SHA but run different code.

### The Solution: Worktree Fingerprint

The script computes a **worktree fingerprint** that uniquely identifies the exact state of your code:

- **CLEAN tree**: Fingerprint = HEAD SHA (e.g., `d4ad618`)
- **DIRTY tree**: Fingerprint = `<SHA>-dirty-<hash>` (e.g., `d4ad618-dirty-a3f2b1c9`)

The `<hash>` portion is computed from:
1. All tracked file changes (`git diff` + `git diff --cached`)
2. List of untracked files (sorted alphabetically)

**Any change to your working tree produces a different fingerprint.**

### What You'll See

**On PowerShell (dirty tree):**
```
[2/6] Computing worktree fingerprint...
  Branch:      main
  HEAD SHA:    d4ad618
  Commit:      d4ad618 dev: add one-command Redmi workflow
  Status:      DIRTY
  Modified:    3 file(s)
  Untracked:   2 file(s)
  Fingerprint: d4ad618-dirty-a3f2b1c9

  WARNING: Working tree has uncommitted changes!
  Use 'pnpm dev:redmi:snapshot' to create a local commit first.
```

**On PowerShell (clean tree):**
```
[2/6] Computing worktree fingerprint...
  Branch:      main
  HEAD SHA:    d4ad618
  Commit:      d4ad618 dev: add one-command Redmi workflow
  Status:      CLEAN
  Fingerprint: d4ad618
```

**On Redmi (Menu > Build Info):**
```
BUILD INFO (DIRTY)
d4ad618-dirty-a3f2b1c9
Branch: main | SHA: d4ad618
3 modified, 2 untracked
Built: 2026-01-14 15:30:45 IST
API: http://34.14.220.171:3000
```

## Snapshot Mode: Guaranteed Reproducibility

If you need **absolute certainty** that Redmi is running exactly what you intend (including all uncommitted changes), use snapshot mode.

### How It Works

```powershell
pnpm dev:redmi:snapshot
```

This command:
1. **Checks if dirty**: If working tree has changes (staged, unstaged, or untracked)
2. **Creates local commit**: `git add -A && git commit -m "wip(redmi): snapshot <timestamp>"`
3. **Runs normal workflow**: Expo starts with clean tree, fingerprint = new commit SHA

### Important: Local Only!

The snapshot commit is **never pushed automatically**. It stays local until you decide what to do with it.

### Cleaning Up Snapshots

After testing, you have several options:

```powershell
# Option 1: Undo commit, keep changes staged
git reset --soft HEAD~1

# Option 2: Undo commit, unstage changes (back to original state)
git reset HEAD~1

# Option 3: Squash multiple snapshots into one commit
git rebase -i HEAD~N  # where N = number of commits to squash

# Option 4: Keep the snapshot commit and amend message later
git commit --amend -m "feat: actual feature description"
```

### When to Use Snapshot vs Regular

| Scenario | Use |
|----------|-----|
| Quick iteration, changes obvious | `pnpm dev:redmi` |
| Testing complex feature, want proof | `pnpm dev:redmi:snapshot` |
| Debugging "is it really my latest code?" | `pnpm dev:redmi:snapshot` |
| Demoing to someone else | `pnpm dev:redmi:snapshot` |
| CI/automated testing | Always use clean tree |

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

1. **Compare fingerprints**: Does Menu > Build Info fingerprint match PowerShell output?
2. **Force close Expo Go** (swipe away completely)
3. **Clear Expo Go cache**: Settings > Apps > Expo Go > Clear Cache
4. **Re-run the script**: `pnpm dev:redmi`
5. **Use snapshot mode**: `pnpm dev:redmi:snapshot` for absolute certainty

### Fingerprint mismatch after changes

If you made changes but fingerprint didn't update:
1. Metro is serving cached bundle
2. Force close Expo Go
3. Press `r` in Metro terminal to reload
4. Or restart with `pnpm dev:redmi`

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

1. **Checks prerequisites** (EXPO_TOKEN)
2. **Computes worktree fingerprint**:
   - Gets HEAD SHA
   - Checks for dirty status (modified + untracked)
   - If dirty: hashes diff + untracked files to create unique fingerprint
3. **Sets build info env vars**:
   - `EXPO_PUBLIC_GIT_SHA` - HEAD short SHA
   - `EXPO_PUBLIC_WORKTREE_FINGERPRINT` - unique identifier
   - `EXPO_PUBLIC_WORKTREE_DIRTY` - "1" or "0"
   - `EXPO_PUBLIC_MODIFIED_COUNT` - number of modified files
   - `EXPO_PUBLIC_UNTRACKED_COUNT` - number of untracked files
   - `EXPO_PUBLIC_BUILD_TIME` - IST timestamp
   - `EXPO_PUBLIC_GIT_BRANCH` - current branch
4. **Kills existing Metro processes** to ensure clean start
5. **Loads `.env.local`** if using `-TestStore` flag
6. **Configures ADB reverse** if using `-Usb` flag
7. **Starts Expo** with appropriate flags (`--lan`, `--localhost`, or `--tunnel`)

The app reads these env vars in `src/config/api.ts` and displays them in the UI.

## Files

| File | Purpose |
|------|---------|
| `tools/dev/redmi.ps1` | Main PowerShell script |
| `tools/dev/redmi-snapshot.ps1` | Snapshot + run script |
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
- **Snapshot commits are local** - never pushed automatically
