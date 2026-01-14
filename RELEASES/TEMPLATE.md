# Release Notes Template

<!--
Copy this template when creating release notes manually.
Automated releases use scripts/release-tag.js which generates this format.
-->

# v{VERSION} — {DATE}

## Release Info
- **Tag:** v{VERSION}
- **Commit:** {SHA}
- **Built from:** main branch
- **Release Gate:** PASSED

## Tickets Completed
<!-- List all tickets included in this release -->

### High Priority
- [ ] TICKET-001: Description

### Features
- [ ] TICKET-002: Description

### Bug Fixes
- [ ] TICKET-003: Description

## Breaking Changes
<!-- List any breaking changes that require migration -->
None

## Migration Steps
<!-- Steps required to upgrade from previous version -->
1. Pull latest changes
2. Run `pnpm install`
3. Run database migrations (if any)

## Testing Checklist
- [ ] SELL flow tested
- [ ] BUY flow tested (if enabled)
- [ ] REORDER flow tested (if enabled)
- [ ] GRN flow tested
- [ ] Reports tested
- [ ] Hindi locale tested

## Build Commands
```bash
# Verify release gate passes
pnpm release:gate

# Create tag (if not automated)
git tag -a v{VERSION} -m "Release v{VERSION}"
git push origin v{VERSION}

# Build APK from tag
git checkout v{VERSION}
eas build --platform android --profile production
```

## Notes
<!-- Any additional notes for this release -->
