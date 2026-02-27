# Phase 8: Post-Deploy Verification — Pass/Fail Thresholds

> Pre-armed: 2026-02-27
> Executes: Immediately when operator pastes Block 4 evidence
> Owner: Claude (automated)

---

## 8.1 Deployment Evidence Capture

### Input Required
Operator Block 4 output (sections 4a-4f).

### Pass/Fail Thresholds

| Check | PASS | FAIL |
|-------|------|------|
| API health response | `status: "ok"` present | Missing or `status` != `"ok"` |
| gitSha match | Starts with `e63dba14` | Any other value or missing |
| Portal HTTP codes | All 4 return `200` | Any non-200 |
| Revision count | 6 new revision names | <6 or any unchanged from rollback set |
| Revision traffic | All at `100%` | Any <100% |
| Image tags | All 6 tagged `e63dba14` | Any `NOT_FOUND` |
| Migration count | 167 total applied | <167 or error |
| Latest migration | `167_whatsapp_cta_config.sql` | Different name |

### Output
Structured evidence record with each field populated from real data.
Update `FIX-001.json`:
- `gcpParity.cloudRunRevisionIds` → 6 real revision IDs
- `operatorChecks.validatedCloudRunRevisionIds` → same 6 revision IDs
- `operator.reproSteps` → add actual evidence timestamp

### Verdict Rule
ALL 8 checks must PASS. Any single FAIL → Phase 8.1 = **FAIL**, stop and report.

---

## 8.2 Zero-Regression Matrix

### Input Required
- Phase 8.1 evidence (parsed)
- CD pipeline run output (gh run view)

### Pass/Fail Thresholds

| Check | PASS | FAIL |
|-------|------|------|
| All 6 services alive | Health/status returns for all 6 | Any service unreachable |
| SHA consistent across services | All return `e63dba14` | Any mismatch |
| Traffic routing | All 6 at 100% on new revisions | Any split or 0% traffic |
| CD pipeline smoke tests | All 12 gates in smoke-test job passed | Any gate failed |
| No auto-rollback triggered | Pipeline completed without rollback step | Rollback step executed |
| Rollback revisions still exist | All 6 pre-deploy revisions remain available | Any revision deleted/retired |

### Cross-Service Matrix

| From → To | Check | PASS |
|-----------|-------|------|
| api-gateway → main-backend | Gateway proxies to backend | `/api/v1/pos/health` returns non-5xx |
| retailer-admin → api-gateway | Portal can reach API | Portal login page loads |
| supplier-portal → api-gateway | Portal can reach API | Portal login page loads |
| superadmin → api-gateway | Portal can reach API | Portal login page loads |
| POS → api-gateway | Mobile app connects | Health endpoint reachable |

### Output
Matrix table with PASS/FAIL per cell.

### Verdict Rule
ALL checks must PASS. Any service unreachable or SHA mismatch → **FAIL**.

---

## 8.3 Observability Gate

### Input Required
- Health endpoint responses
- CD pipeline logs

### Pass/Fail Thresholds

| Check | PASS | FAIL |
|-------|------|------|
| Health endpoint structure | Returns JSON with `status`, `service`, `gitSha` fields | Missing fields |
| Structured logging active | `NODE_ENV=staging` in main-backend env | Missing or `development` |
| Error rate (from CD smoke) | 0 5xx errors in smoke test canaries | Any 5xx |
| Health latency | < 2s per ZRP-H-008 | > 2s |
| Security headers | No `Server` version header exposed | Version header present |

### Output
Observability status table.

### Verdict Rule
ALL checks must PASS. Health endpoint missing fields → **FAIL**.

---

## 8.4 Rollback Readiness Validation

### Input Required
- Pre-deploy revision list (from W5_DEPLOY_READY_CHECKPOINT.md)
- Post-deploy revision list (from operator Block 4d)

### Pass/Fail Thresholds

| Check | PASS | FAIL |
|-------|------|------|
| Pre-deploy revisions exist | All 6 rollback revisions still listed | Any revision gone |
| Rollback commands valid | Commands reference correct revision names | Name mismatch |
| Post-deploy revisions different | All 6 post-deploy revisions differ from pre-deploy | Any unchanged (deploy didn't work) |
| Traffic shift capability | `gcloud run services update-traffic` available | Command not found |

### Rollback Revision Validation

| Service | Expected Rollback Revision | Must Still Exist |
|---------|---------------------------|-----------------|
| main-backend | `main-backend-00103-zbw` | YES |
| api-gateway | `api-gateway-00084-7zh` | YES |
| retailer-admin | `retailer-admin-00084-pk6` | YES |
| supplier-portal | `supplier-portal-00078-wv8` | YES |
| superadmin | `superadmin-00077-r6c` | YES |
| landing | `landing-00077-gj7` | YES |

### Output
Rollback readiness confirmation.

### Verdict Rule
ALL 6 pre-deploy revisions must still exist. If Cloud Run deleted any → **WARN** (not blocking, but requires operator confirmation of alternative rollback).

---

## 8.5 Final Truth Statement

### Input Required
- Results of 8.1, 8.2, 8.3, 8.4

### Pass/Fail Thresholds

| Overall Verdict | Condition |
|-----------------|-----------|
| **STAGING VERIFIED** | 8.1 PASS + 8.2 PASS + 8.3 PASS + 8.4 PASS |
| **STAGING VERIFIED WITH WARNINGS** | 8.1 PASS + 8.2 PASS + 8.3 PASS + 8.4 WARN |
| **STAGING FAILED** | Any of 8.1-8.3 FAIL |

### Output: `RELEASES/POST_DEPLOY_TRUTH_STATEMENT.md`

Contains:
1. Deploy SHA and evidence of match
2. All 6 service revision IDs (new)
3. All 6 rollback revision IDs (pre-deploy)
4. Phase 8.1-8.4 PASS/FAIL table
5. Overall verdict
6. Remaining blockers for production (R7-CHERRY-PICK-001)

### FIX-001 Updates (Real Evidence Only)

| Field | Update Condition |
|-------|-----------------|
| `gcpParity.cloudRunRevisionIds` | Real revision IDs from 4d |
| `operatorChecks.validatedCloudRunRevisionIds` | Same real revision IDs |
| `operatorChecks.stagingTestExecuted` | `true` only after operator browser test |
| `operatorChecks.fixVerified` | `true` only after operator confirms |
| `operator.finalSignoff` | Stays `false` until explicit operator sign-off |
| `status` | Stays `todo` until staging fully verified + operator signed off |
| `migrationSafety.completed` | `true` only after migration count = 167 confirmed |
| `migrationSafety.backupId` | Real backup ID from Block 1 |

**No placeholder values. No assumed parity. Only real evidence.**

---

## Execution Trigger

Claude executes Phase 8 the moment the operator pastes Block 4 evidence into the conversation. No manual trigger needed. The sequence is:

```
Operator pastes Block 4 output
  → Claude parses evidence
  → 8.1: Validate all thresholds
  → 8.2: Build zero-regression matrix
  → 8.3: Check observability
  → 8.4: Validate rollback readiness
  → 8.5: Publish truth statement + update FIX-001
  → Report STAGING VERIFIED or STAGING FAILED
```
