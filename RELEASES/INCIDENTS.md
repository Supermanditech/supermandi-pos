# Incident Log

> **Every production or staging incident gets a row here.**
> This file is append-only. Never delete entries — only update status.
> Last Updated: 2026-02-10

---

## SEVERITY DEFINITIONS

| Severity | Criteria | Response Time | Examples |
|----------|----------|---------------|---------|
| **P0** | Money/data loss, all users affected | Immediate rollback | Payment double-charge, data corruption, full outage |
| **P1** | Portal down, critical flow broken | < 15 min | Login broken, POS can't sell, supplier can't confirm orders |
| **P2** | Feature degraded, workaround exists | < 2 hours | Slow search, missing i18n string, pagination broken |
| **P3** | Cosmetic, non-blocking | Next batch | Wrong icon, alignment issue, console warning |

---

## INCIDENT TEMPLATE

When filing a new incident, copy this block and append to the Active Incidents table:

```markdown
| INC-XXX | YYYY-MM-DD HH:MM IST | P? | SHORT TITLE | OPEN |
```

Then create a detail section:

```markdown
### INC-XXX: Short Title

**Severity**: P?
**Detected**: YYYY-MM-DD HH:MM IST
**Environment**: local / staging / production
**Affected**: retailer-admin / supplier-portal / superadmin / pos / api-gateway / [service]
**Reporter**: Claude / Operator

**Symptoms**:
- What the user sees or what failed

**Root Cause**:
- Why it happened (file:line if known)

**Fix**:
- Ticket ID: TICKET-XXX
- Commit: SHA
- PR: #XX (if applicable)

**Evidence**:
- Screenshot/curl/SQL proof that fix works

**Status**: OPEN / INVESTIGATING / FIXED / VERIFIED / CLOSED
**Resolved**: YYYY-MM-DD HH:MM IST (blank until resolved)
```

---

## ACTIVE INCIDENTS

| ID | Detected | Sev | Title | Status |
|----|----------|-----|-------|--------|
| — | — | — | No active incidents | — |

---

## RESOLVED INCIDENTS

| ID | Detected | Sev | Title | Resolved | Fix Reference |
|----|----------|-----|-------|----------|---------------|
| — | — | — | No resolved incidents yet | — | — |

---

## INCIDENT DETAILS

<!-- Append new incident detail sections below this line -->

---

## INCIDENT WORKFLOW

```
DETECTED → OPEN
    │
    ├─ P0/P1 → ROLLBACK FIRST → then investigate
    │
    ▼
INVESTIGATING
    │
    ├─ Root cause found → create fix ticket
    │
    ▼
FIXED (commit merged, gates green)
    │
    ├─ Verified in target environment
    │
    ▼
VERIFIED → CLOSED
```

**Rules**:
1. P0/P1: Rollback first, investigate second (see ROLLBACK_PLAYBOOK.md)
2. Every incident MUST have a fix ticket (no silent fixes)
3. Fix ticket must include regression guard (see CLAUDE_PRODUCTION_RULES.md Rule 6)
4. Incident is not CLOSED until verified in the environment where it was detected
5. If the same root cause appears twice, escalate severity by one level

---

## METRICS (Updated per batch)

| Metric | Value |
|--------|-------|
| Total incidents filed | 0 |
| P0 incidents | 0 |
| P1 incidents | 0 |
| P2 incidents | 0 |
| P3 incidents | 0 |
| Mean time to fix (P0/P1) | — |
| Repeat incidents | 0 |

---

## REVISION HISTORY

| Version | Date | Change | Author |
|---------|------|--------|--------|
| 1.0 | 2026-02-10 | Initial creation | Claude |
