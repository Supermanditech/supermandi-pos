# Cascade-Complete Certification (CCC) Framework
# SuperMandi POS — Production Grade Discipline v1.0
# THIS FILE IS LAW. Claude reads this every session before any code work.

---

## SECTION 0: SESSION START PROTOCOL (Non-Negotiable, Every Session)

```
STEP 1: Read RELEASES/CLAUDE_CURRENT_STATE.json
         → Find: cccFramework.currentJourney, cccFramework.currentPhase
         → Find: wave20.environmentAlignment.c1NextStep or current cluster

STEP 2: Read RELEASES/JOURNEY_MAP.json
         → Find the currentJourney entry
         → Find its auditStatus and lastAuditedAction

STEP 3: Read RELEASES/INVARIANT_REGISTRY.json
         → Load all invariants relevant to currentJourney

STEP 4: Read RELEASES/SCREEN_CERT_MANIFEST.json
         → Check cert status of all screens in currentJourney.screens

STEP 5: git log --oneline -5 && git status
         → Verify HEAD SHA matches CLAUDE_CURRENT_STATE.json

STEP 6: Announce exactly:
         "Resuming JOURNEY-XX [name]. Status: [CERT-SEALED|CERT-PENDING|NEEDS-REAUDIT].
          Last audited action: [ACTION-NN: description].
          Next action: [ACTION-NN+1: description].
          Files in scope: [list]."

STEP 7: Continue audit from lastAuditedAction + 1. Never restart from scratch.
```

**Anti-Drift Rule**: Claude NEVER decides what to work on from conversation memory.
The state files decide. If state files conflict with conversation, state files win.
If state files are stale, update them first, then work.

---

## SECTION 1: THE FUNDAMENTAL RULE

> A screen, flow, or journey is NOT production grade because a checklist passed.
> It is production grade when:
>
> Every action a real human can take, in every realistic condition,
> produces the correct response — visible to the user, persisted to the
> database, reflected across all dependent portals — with no silent failures,
> no data corruption, and no unrecoverable states.
>
> Claude must trace this end-to-end. Not infer. Not assume. TRACE.

If a downstream journey depends on upstream prerequisites such as retailer or
supplier registration, portal login, superadmin approval/provisioning, device
enrollment, stock setup, or session recovery, that prerequisite funnel is part
of the production surface. Repeatedly fixing the same downstream symptom
without mapping and stabilizing the full prerequisite funnel is NOT
production-grade work.

---

## SECTION 2: THE EIGHT AUDIT LEVELS

For every user journey, Claude traces all eight levels before declaring CERT-SEALED.

```
LEVEL 0: JOURNEY DEFINITION
  What is the user trying to accomplish?
  What is the complete happy-path sequence of user actions?
  What are the entry conditions and exit conditions?

LEVEL 1: INTERACTION DECOMPOSITION
  List every user action (tap, type, swipe, scan, press back)
  For each: preconditions, trigger, immediate response (<300ms), async response
  For each: disabled state, loading state, success state, error state

LEVEL 2: CODE PATH TRACING
  For each user action: read the handler function completely
  Follow every function call to its implementation (no assumed behavior)
  Trace every branch: if/else, ternary, switch, early return
  Trace every async path: Promise chain, async/await, try/catch
  Verify: cleanup in useEffect return, ref vs state for in-flight guards

LEVEL 3: SERVICE CASCADE MAPPING
  For each API call from the frontend:
    → Read the backend route handler
    → Read every service it calls
    → Read every downstream service those call
    → Read every event emitted and its subscriber handlers
  No API call is "trusted" without reading the handler.

LEVEL 4: DATA EFFECT MAPPING
  For each backend operation:
    → Which DB tables are written? Which rows? Which columns?
    → Which DB tables are read? Are reads consistent with writes?
    → Is there a race between concurrent writes?
    → Are transactions used where atomicity is required?
  State explicitly: "this operation writes [table].[column] = [value] WHERE [condition]"

LEVEL 5: CROSS-PORTAL REFLECTION
  For each DB write from Level 4:
    → Which portal reads this table?
    → Does that portal's query include the correct WHERE clause?
    → Is the data shown in real-time (websocket) or stale (polling interval)?
    → What does the portal show before the data arrives?
  Verify each portal's view of the data is correct.

LEVEL 6: FAILURE MODE ENUMERATION
  For every step in Levels 1-5, enumerate every way it can fail:
    Network failure (complete drop, timeout, partial response)
    Service failure (4xx, 5xx, malformed response)
    State failure (stale data, race condition, wrong order)
    User failure (double-tap, back-press mid-flow, app kill, background-resume)
    Session failure (expired JWT, revoked session, wrong store)
  For each failure: what does the user see? What is the recovery path?
  A failure with no recovery path = GAP. Must be fixed before CERT-SEALED.

LEVEL 7: INVARIANT VERIFICATION
  Load INVARIANT_REGISTRY.json. Find all invariants this journey touches.
  For each invariant:
    → Where in code is it enforced? (file:line)
    → Is there a test that would catch a violation?
    → Can any path in this journey violate it?
  If invariant has no code enforcement = GAP.
  If invariant has no test = REGRESSION_RISK (must add test or document risk explicitly).

LEVEL 8: REGRESSION LOCK
  For each file in journey scope, check SCREEN_CERT_MANIFEST.json.knownIssues
  For each closed ISSUE-XXX:
    → Is the root cause comment at the fix site? (// ISSUE-XXX: root cause)
    → Is the fix structural (not a symptom patch)?
    → Does anything in the current code path re-enable the old root cause?
  If root cause can recur = REGRESSION. Must be fixed before CERT-SEALED.
```

---

## SECTION 3: THE SIX GUARANTEES

Claude signs all six before any journey reaches CERT-SEALED.
Signing means: Claude can point to specific file:line for every claim.

```
G1 — CODE GUARANTEE
"I have read every file listed in this journey's scope declaration.
 I have not inferred or assumed any behavior.
 I have traced every function call in the journey's hot path to its implementation."

G2 — CONTRACT GUARANTEE
"Every API call shape from the frontend matches the actual response shape from the backend.
 I have read both the call site and the handler.
 There are no silent undefined values from shape mismatches."

G3 — CASCADE GUARANTEE
"I have traced every service that handles events or calls triggered by this journey.
 I have read the handler code for each.
 I have verified the downstream effects match what the frontend expects."

G4 — INVARIANT GUARANTEE
"Every business invariant in INVARIANT_REGISTRY.json that this journey touches
 has been verified to hold in code. I can point to the exact line that enforces each one."

G5 — FAILURE GUARANTEE
"I have enumerated every failure mode at every cascade level.
 Each has either a recovery path in code, or an explicit documented decision
 that no recovery is needed (with reasoning)."

G6 — REGRESSION GUARANTEE
"Every previously known bug in this journey's file scope has a structural fix.
 The fix is not a symptom patch.
 I can explain why the root cause cannot recur, with reference to the specific code change."
```

---

## SECTION 3B: HARD BLOCKING CONDITIONS (False-Seal Prevention)

These conditions BLOCK CERT-SEALED regardless of all other checks passing.
If any blocker is active, Claude must state it explicitly and fix the gap — not work around it.

```
BLOCKER B1 — OPEN GAPS
  journey.openGaps array is non-empty.
  Every gap must be resolved (fixed or documented as ACCEPTED_RISK with justification).
  Action: Fix the gap. Update action.levels[LN].status = GAP → PASS. Clear openGaps.

BLOCKER B2 — INVARIANT NOT VERIFIED
  Any invariant in journey.scope.invariants with blockingForSeal=true
  has currentStatus != VERIFIED in INVARIANT_REGISTRY.json.
  Action: Find enforcement code. Add file:line to verifiedInFiles. Set status=VERIFIED.
  If enforcement does not exist: raise as code gap, fix code first.

BLOCKER B3 — REGRESSION GUARD MISSING
  Any screen in journey scope has a knownIssue with regressionGuardStatus=MISSING or FAIL.
  Action: Add automated test, invariant check, or documented structural proof.
  Set regressionGuardStatus=PASS with regressionGuardRef pointing to the guard.
  "The fix is structural" is NOT sufficient — the guard must be a verifiable artifact.

BLOCKER B4 — UNSIGNED GUARANTEE
  Any of G1-G6 has signed=false.
  Action: Complete the work that each guarantee requires. Sign with citations.
  G1: Read every file in scopeFiles. G2: Cite both call site and handler.
  G3: Cite every downstream handler. G4: Cite every invariant enforcement.
  G5: Document every failure mode. G6: Verify every regression lock.

BLOCKER B5 — UNSEEDED STATE
  journey.seededStateLock.confirmed=false at time of runtime evidence collection.
  Action: Operator confirms seeded state before any runtimeEvidence is collected.
  Set confirmed=true with confirmedAt timestamp.
  Runtime evidence collected without seeded state is INVALID.

BLOCKER B6 — INCOMPLETE LEVEL AUDIT
  Any action has any level (L0-L8) with status=GAP and no ACCEPTED_RISK entry.
  Action: Fix the gap in code, or document ACCEPTED_RISK with explicit justification
  in levels[LN].notes. Undocumented gaps block sealing.

BLOCKER B7 — CROSS-PORTAL MATRIX INCOMPLETE
  journey.crossPortalMatrix contains any row with verified=false.
  Action: Read the portal's query code. Confirm store_id filter. Set verified=true with citation.
  "It probably works" is not verification.

BLOCKER B8 — NO RUNTIME EVIDENCE
  No action in the journey has any runtimeEvidence entry of type OPERATOR_CONFIRMED.
  Action: Operator must run structured journey script and fill runtimeEvidence per action.
  Code-only audit is necessary but not sufficient for CERT-SEALED.
```

---

## SECTION 4: CERTIFICATION STATES

```
CERT-PENDING     Initial state. Audit not yet started.
CERT-IN-PROGRESS Claude is actively tracing this journey. lastAuditedAction is set.
CERT-BLOCKED     Audit revealed a gap requiring a code fix before audit can continue.
                 cccBlocker field is set with: file, line, description, requiredFix.
CERT-SEALED      All 8 levels complete. All 6 guarantees signed. No open gaps.
                 Once sealed: any code change to a file in scope → NEEDS-REAUDIT.
NEEDS-REAUDIT    A file in scope was modified after sealing. Must re-run affected levels.
                 Levels to re-run are recorded in reauditLevels field.
```

**CERT-SEALED is never declared by Claude alone.**
Claude signs the 6 guarantees → updates JOURNEY_MAP.json → updates SCREEN_CERT_MANIFEST.json
→ then states: "JOURNEY-XX is CERT-SEALED. Operator can verify by running journey script."

---

## SECTION 4A: LIVE TESTING LIFECYCLE (MANDATORY ORDER)

Live testing exists in this framework, but only as part of a strict lifecycle.
Claude may not blur these phases together.

```
PHASE 1 — STATIC CCC AUDIT
  Purpose:
    Read the full journey scope, trace all 8 levels, identify gaps from code and architecture.
  Allowed:
    file reading, action decomposition, invariant tracing, known-issue linking.
  Forbidden:
    deploy requests, APK rebuild requests, operator exploratory testing.
  Exit:
    current journey/action is either CERT-BLOCKED or ready for baseline/runtime planning.

PHASE 2 — BASELINE LIVE DISCOVERY
  Purpose:
    Confirm the real runtime baseline of the current journey/cluster on parity-verified staging/APK.
  Preconditions:
    Gate A SHA parity
    Gate B seeded state
    enough code understanding to run a structured script
  Allowed:
    operator follows a pre-written script step-by-step
    collect runtimeEvidence for actual current behavior
    confirm or narrow issues
  Forbidden:
    freestyle exploratory clicking
    repeated setup loops without environment change
    declaring a fix from baseline evidence alone
  Exit:
    baseline matrix recorded: reproduces / not reproduced / partial / blocked

PHASE 3 — CODE FIX CLUSTER
  Purpose:
    Fix the active cluster issue-by-issue under deterministic verification.
  Allowed:
    CODE_FIX commits only
    executable regression guards
    local business invariant / API / deterministic UI checks
  Forbidden:
    operator certification
    deploy/APK per issue
    jumping to another cluster before current cluster stabilizes
  Exit:
    active cluster satisfies preArtifactExitCriteria

PHASE 4 — POST-FIX RUNTIME CERTIFICATION
  Purpose:
    Certify the stabilized cluster on one deploy/APK candidate.
  Preconditions:
    cluster internally stable
    candidate SHA pushed
    machine-state/framework SHA pushed
  Allowed:
    one staging deploy and/or one APK build for the active cluster candidate
    one structured runtime certification pass
  Forbidden:
    using runtime certification to rediscover basic known breakage that should have been caught in PHASE 3
  Exit:
    cluster runtime pass/fail truth-synced

PHASE 5 — OPERATOR EXPLORATORY PASS
  Purpose:
    Find edge cases, UX friction, device/browser quirks on an already-certified candidate.
  Preconditions:
    Gates A-D passed
  Allowed:
    exploration beyond the scripted path
    new issue discovery
  Forbidden:
    replacing deterministic certification with operator memory or vague "looks ok"
  Exit:
    final release-candidate confidence assessment

PHASE 6 — DEPLOY ELIGIBILITY
  Purpose:
    Decide whether the certified cluster/release candidate may promote.
  Preconditions:
    all cluster deploy blockers cleared
    no open CRITICAL/HIGH release blocker in target scope
  Allowed:
    staging/prod promotion decision
  Forbidden:
    promotion while any prior phase is incomplete
```

Strict rule:
- PHASE 2 and PHASE 4 are the only live runtime phases.
- PHASE 5 is exploratory only after certification.
- Operator testing must never be the first line of defense for known flows.
- If a PHASE 4 operator script hits a basic setup crash or known-flow breakage before certification can start, PHASE 4 is immediately suspended. Claude must truth-sync the blocker, return to PHASE 3, and continue Claude-owned stabilization until operator time is no longer being used as the discovery engine.

---

## SECTION 5: DEPLOY GATE RULES

```
DEPLOY FORBIDDEN unless ALL of the following:
  [ ] All journeys in the current cluster are CERT-SEALED
  [ ] INVARIANT_REGISTRY.json: all invariants for those journeys are VERIFIED
  [ ] SCREEN_CERT_MANIFEST.json: all screens in those journeys are CERT-PASS
  [ ] pnpm -r typecheck: CLEAN
  [ ] All regression tests for closed ISSUE-XXX in cluster: PASSING
  [ ] No open CERT-BLOCKED on any journey in cluster

APK REBUILD FORBIDDEN unless ALL of the following:
  [ ] Deploy conditions above are met
  [ ] At least one JS file in POS scope was changed (not just backend/web)
  [ ] No re-audit needed (NEEDS-REAUDIT is clear)

WEB/PORTAL DEPLOY FORBIDDEN for any touched surface unless ALL of the following:
  [ ] A real-user auth/onboarding matrix exists for that surface
  [ ] Happy path, retry, expiry, duplicate/returning user, wrong-role,
      pending-approval, and session-recovery scenarios are deterministic or
      explicitly blocked with evidence
  [ ] Surface-specific anti-regression gates pass for the touched surface

POS APK BUILD FORBIDDEN unless, in addition to the normal APK rules, ALL of the following:
  [ ] The POS prerequisite funnel from enrollment/login/store binding into the
      target journey entry is stable
  [ ] Any required stock-setup path (Opening Stock, Stock Inward, or portal-led
      stock setup) is proven on the candidate or explicitly replaced by a
      deterministic seeded-state path
  [ ] The candidate does not rely on operator discovery to reach the target
      journey entry

OTA UPDATE (preferred for JS-only fixes):
  [ ] No native module changes
  [ ] No permission changes
  [ ] No app.json / app.config.js changes affecting native build
  → Use Expo OTA update instead of full APK rebuild
```

---

## SECTION 6: REGRESSION LOCK RULES

Every fix to a previously known issue MUST include:

```
1. Root cause comment at fix site:
   // ISSUE-XXX: [one-line root cause description]
   // Fix: [what was changed and why it prevents recurrence]

2. SCREEN_CERT_MANIFEST.json update:
   Add to screen.knownIssues: { issueId, status: "FIXED", sha, rootCause, fixDescription }

3. JOURNEY_MAP.json update:
   Add to journey.regressionLocks: { issueId, verifiedAt, guardType }

4. Regression test (required for CERT-SEALED):
   At minimum: document in JOURNEY_MAP.json what test or assertion prevents recurrence.
   Preferred: automated test in e2e/ or backend test suite.

5. Re-run CSAP on affected screen after fix:
   Even if fix is one line — the affected Level(s) must be re-traced.
```

---

## SECTION 6A: GIT DISCIPLINE AND TRUTH-SYNC BOUNDARIES

These rules are mandatory. A technically-correct fix is still NOT production-grade
if the commit history makes the fix impossible to audit, attribute, or certify.

```
ALLOWED COMMIT TYPES

1. CODE_FIX
   Purpose:
     One issue fix, or one same-subsystem cluster fix when explicitly declared.
   May touch:
     src/, backend/, retailer-admin/, supplier-portal/, supermandi-superadmin/,
     tests/, e2e/, scripts/ needed for executable regression guards.
   Must NOT touch:
     RELEASES/CLAUDE_CURRENT_STATE.json
     RELEASES/JOURNEY_MAP.json
     RELEASES/SCREEN_CERT_MANIFEST.json
     RELEASES/INVARIANT_REGISTRY.json
     RELEASES/LIVE_TESTING_ISSUES.md
     workflow/state/
   Exception:
     A cluster fix may touch multiple same-subsystem files and multiple issue IDs,
     but the commit message must name the cluster or enumerate the issue IDs.

2. STATE_ONLY
   Purpose:
     truth-sync, certification progress, issue ledger updates, deploy gate updates.
   May touch:
     RELEASES/*
     workflow/state/*
   Must NOT touch:
     src/, backend/, retailer-admin/, supplier-portal/, supermandi-superadmin/

3. FRAMEWORK_ONLY
   Purpose:
     change CCC methodology or machine-state schema itself.
   May touch:
     RELEASES/CCC_FRAMEWORK.md
     RELEASES/CLAUDE_CURRENT_STATE.json
     RELEASES/JOURNEY_MAP.json
     RELEASES/SCREEN_CERT_MANIFEST.json
     RELEASES/INVARIANT_REGISTRY.json
     workflow/state/*
   Must NOT include:
     product code changes

TRUTH-SYNC BLOCKERS

A state/truth-sync commit is FORBIDDEN if any of the following is true:
  [ ] Any FIXED/ALREADY_FIXED/HARDENED issue in scope still has regressionGuardStatus != PASS
  [ ] The immediately preceding code commit mixed code files with RELEASES/ or workflow/state/
  [ ] The code fix has not passed the required deterministic verification for its severity
  [ ] Operator/runtime certification is being claimed while HEAD is not pushed to origin/main

OPERATOR-CERTIFICATION PRECONDITIONS

Operator runtime testing is FORBIDDEN unless:
  [ ] The code candidate SHA is pushed to origin/main
  [ ] The active machine-state/framework commits are also pushed
  [ ] The active cluster is internally stable per preArtifactExitCriteria
  [ ] Gate B setup paths themselves are stable on the candidate (no seeded-state setup crash, no obvious blocker on the scripted certification entry path)
  [ ] Runtime testing is certifying a cluster candidate, not rediscovering basic known breakage

SCRATCH / ARTIFACT FILES

The following are NEVER committed:
  local screenshots
  temporary shell scripts
  ADB/logcat dumps
  Gradle caches
  ad hoc parse outputs

These may exist locally for evidence collection, but they are not part of git truth.
```

---

## SECTION 7: REAL USER BEHAVIOR — MANDATORY TEST SCENARIOS

Every journey audit MUST enumerate and verify these scenario classes:
(These are the most commonly missed and most commonly cause production regressions)

```
SCENARIO CLASS A: Double-tap / Repeated Submit
  User taps a button before the first action completes.
  Expected: second tap is ignored (disabled state, in-flight guard, or idempotency key)
  Verify: is there a ref/flag/disabled prop that prevents duplicate calls?

SCENARIO CLASS B: Back-press Mid-Flow
  User presses back at any point in the flow.
  Expected: state is cleaned up, no orphaned API calls, previous screen shows correct state
  Verify: useEffect cleanup, navigation param handling, cart/session state on back

SCENARIO CLASS C: App Kill and Resume
  App is killed mid-flow (e.g. during payment).
  Expected: on re-open, user sees either recovery option or clean slate (not broken state)
  Verify: AsyncStorage persistence for critical pending states, no stale useRef on re-mount

SCENARIO CLASS D: Network Drop Mid-Flow
  Network disappears mid-API call.
  Expected: error state shown, retry path available, no silent hang
  Verify: timeout handling, catch block surfacing error to UI

SCENARIO CLASS E: Session Expiry Mid-Flow
  JWT expires while user is mid-flow (e.g. on PaymentScreen for 8+ hours).
  Expected: 401 caught, user sees session expired message, re-login path offered
  Verify: 401 handling in every API call in the journey

SCENARIO CLASS F: Slow Network (>5 seconds per call)
  All API calls take 5-10 seconds.
  Expected: spinner/skeleton shown, button disabled, no timeout before user feedback
  Verify: loading state persists for duration, not reset prematurely

SCENARIO CLASS G: Concurrent User Actions
  Two users on different devices affect the same data simultaneously.
  Expected: last-write-wins or conflict detected, no data corruption
  Verify: optimistic locking, DB constraints, idempotency keys

SCENARIO CLASS H: Empty/Boundary Data
  Empty cart, zero stock, zero amount, max-length input, special characters in name.
  Expected: graceful handling, no crash, clear user feedback
  Verify: input validation, empty state rendering, boundary checks in business logic

SCENARIO CLASS I: Permission Denied
  Camera, mic, storage permissions denied by OS.
  Expected: permission error state shown, settings link offered (canAskAgain=false path)
  Verify: all three permission states handled (granted, denied, permanently denied)

SCENARIO CLASS J: Offline / No Connectivity
  Device has no internet.
  Expected: offline mode shown where applicable, cached data served, sync queued
  Verify: network state listener, offline cache, sync-on-reconnect
```

---

## SECTION 8: MICRO-INTERACTION MODEL

For every user-facing interaction in a journey, Claude documents:

```json
{
  "interactionId": "ACT-02-03",
  "journeyId": "JOURNEY-02",
  "screen": "PaymentScreen",
  "label": "Complete Payment button",
  "preconditions": {
    "appState": "saleId and billRef obtained, not yet submitted",
    "networkState": "online",
    "authState": "valid session",
    "dataState": "cart has items, selectedMode chosen"
  },
  "trigger": "single tap",
  "immediateResponse": {
    "uiChange": "button disabled, spinner visible",
    "stateChange": "submitting = true",
    "syncOps": "none"
  },
  "asyncResponse": {
    "successPath": "navigate to SuccessScreen with saleId + billRef",
    "failurePath": "paymentError shown, button re-enabled, submitting = false",
    "timeoutPath": "handled by API client timeout, same as failurePath"
  },
  "sideEffects": {
    "dbWrites": ["orders row CONFIRMED", "stock_balances decremented", "ledger_entries pair"],
    "screensAffected": ["SuccessPrintScreenV2"],
    "portalsAffected": ["retailer-admin/SalesPage", "retailer-admin/InventoryPage"],
    "backgroundJobs": ["analytics.recordSale", "reorder threshold check"]
  },
  "failureScenarios": {
    "networkDrop": "catch → paymentError → user sees error, tap retry",
    "doubleTap": "submitting=true after first tap → button disabled → second tap ignored",
    "sessionExpiry": "401 → [verify: what does catch block do with 401?]",
    "5xx": "catch → paymentError with 'Service error, try again'",
    "idempotency": "same saleId submitted twice → backend rejects duplicate → same error path"
  },
  "invariantsTouched": ["INV-P1", "INV-P2", "INV-O3", "INV-S2", "INV-L1"],
  "certStatus": "VERIFIED | GAP",
  "gapDescription": "if GAP: exact description of what is missing"
}
```

---

## SECTION 9: CROSS-PORTAL VERIFICATION MATRIX PROTOCOL

For every DB write in a journey, Claude fills this row before CERT-SEALED:

```
| DB Write | Table.Column | RetailerAdmin view? | SuperAdmin view? | Real-time or Polling? | Isolation correct? |
```

A row is VERIFIED only when Claude has read:
- The query in the portal that reads this table
- The WHERE clause (confirms store isolation)
- The refresh mechanism (websocket event name or polling interval)

---

## SECTION 10: ONE-DEPLOY DISCIPLINE

```
PRINCIPLE: GCP staging is the CERTIFICATION SEAL, not the TEST ENVIRONMENT.

TARGET WORKFLOW:
  All journeys in cluster → CERT-SEALED (Claude-owned, zero deploy cost)
  All regression tests passing (CI-owned)
  → ONE staging deploy
  → Operator runs structured journey scripts (not exploratory testing)
  → Each step has expected outcome; operator logs pass/fail per step
  → Zero unexpected results allowed
  → If staging reveals a gap → that gap was a CI miss → fix CI test AND code
  → ONE production deploy

FORBIDDEN:
  - Deploy to staging to "see if it works"
  - Deploy to staging to "find the bug"
  - Rebuild APK per individual issue fix
  - Request operator testing before cluster is CERT-SEALED

OTA UPDATE STRATEGY:
  - Build native APK ONCE with all permissions for the full roadmap
  - All JS-only fixes → Expo OTA push (no APK rebuild)
  - Rebuild APK only when: new native module, permission change, native config change
```

---

## SECTION 11: AUDIT SPINE CONTINUITY RULES

```
Rule A: NEVER restart an audit from scratch if it was previously in progress.
        Read lastAuditedAction from JOURNEY_MAP.json and resume from next action.

Rule B: Update JOURNEY_MAP.json after EVERY action is audited.
        Do not batch updates. Crash-safe: state is always current.

Rule C: If a gap is found, set journey.status = CERT-BLOCKED immediately.
        Add to journey.openGaps. Do not continue audit of later actions until gap is fixed.
        (Exception: gap is in a failure path that does not affect the happy path —
         document as REGRESSION_RISK and continue, but must fix before CERT-SEALED.)

Rule D: CERT-SEALED requires ALL open gaps resolved AND all 6 guarantees signed.
        No partial sealing. No "mostly sealed".

Rule E: After any code fix in a CERT-SEALED journey's file scope:
        - Set journey.status = NEEDS-REAUDIT
        - Set journey.reauditLevels = [affected levels]
        - Set screen.status = NEEDS-REAUDIT in SCREEN_CERT_MANIFEST.json
        - Re-run only the affected levels (not full audit unless Level 2 changes)

Rule F: Depth-first journey execution is mandatory.
        Once a journey becomes the current audit target, Claude stays on that
        journey until it is either CERT-SEALED or explicitly CERT-BLOCKED by a
        real code gap with requiredFix documented. Claude does NOT switch to a
        different journey because "this round is short", to sample breadth, or
        to trace blockers "efficiently" across multiple journeys.

Rule G: If a session ends before the active journey is complete, Claude updates
        machine state with the exact remaining blockers, next required action,
        and next file/action to resume from. Next session resumes the SAME
        journey. Claude does not pre-scan the next journey while the current
        journey is still auditable.

Rule H: "Finish the journey" means close the entire sealing surface for that
        journey: remaining invariants, open gaps, regression guards,
        cross-portal verification rows, guarantee signatures, and runtime
        evidence planning. Partial blocker sweeps are not completion.
```

---

## SECTION 12: FRAMEWORK FILE REGISTRY

Claude reads these files at session start:

```
RELEASES/CCC_FRAMEWORK.md          ← This file. How Claude works.
RELEASES/INVARIANT_REGISTRY.json   ← All business invariants. Machine-readable.
RELEASES/JOURNEY_MAP.json          ← Journey definitions + audit spine state.
RELEASES/SCREEN_CERT_MANIFEST.json ← Per-screen cert status.
RELEASES/CLAUDE_CURRENT_STATE.json ← Live operational state (cluster, phase, next step).
```

The journey audit spine is embedded in JOURNEY_MAP.json (per-journey actions array).
This is the single source of truth for where the audit is and what was found.

---

## SECTION 13: WHAT "PRODUCTION GRADE" IS NOT

```
NOT production grade:
  - "TypeScript compiles" (necessary but not sufficient)
  - "I tested the happy path" (happy path is 10% of real usage)
  - "The button works" (button working ≠ downstream effects verified)
  - "It worked last time" (regression proof required, not memory)
  - "Looks good to me" (no citation = no verification)
  - "The test passes" (one test ≠ invariant coverage)
  - "I fixed the root cause" (without reading the fix site code)
  - "Operator confirmed" (operator is last line, not first)

IS production grade:
  - Every failure mode has a recovery path with file:line citation
  - Every business invariant has enforcement with file:line citation
  - Every API call has error handling with file:line citation
  - Every cross-portal effect is verified with file:line citation
  - Every previous bug has a structural fix that cannot silently revert
  - CI catches any future regression before it reaches staging
```
