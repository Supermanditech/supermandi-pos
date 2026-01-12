# CLAUDE WARNING - Copy this at start of every conversation

```
⚠️ SUPERMANDI POS PROJECT RULES ⚠️

CRITICAL BUILD SYSTEM:
1. ALL code changes MUST be committed to git before APK build
2. WIP Gate blocks build if ANY uncommitted changes exist
3. Pre-build Gate checks TypeScript, scan debounce, cart expansion, button sizes
4. Gradle automatically runs these checks - cannot bypass

NEVER DO:
- Build APK from old commit while new changes exist locally
- Skip git commit before building
- Use EAS/Expo cloud builds - always build locally with gradle
- Make device-specific UI code (no isSmallScreen conditionals)
- Reduce scan debounce below 800ms
- Make cart start collapsed
- Hide Menu text on any device

ALWAYS DO:
- git add . && git commit && git push BEFORE building APK
- Run: npm run build:check (to see what will be in APK)
- Run: npm run build:release (builds with all checks)
- Test on multiple device types (iMin Swift 2, Sunmi V2, Redmi)
- Keep UI device-agnostic (works on 10,000+ device types)

KEY FILES:
- scripts/wip-gate.js - Blocks build if uncommitted work
- scripts/pre-build-gate.js - Code quality checks
- android/app/build.gradle - Gradle hooks for checks

BEFORE ANY CODE CHANGE, ASK:
"Is this device-agnostic? Will it work on ALL devices?"
```
