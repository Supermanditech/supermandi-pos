# R7 Parallel Worktree Runbook

Source of truth:
- `workflow/state/r7_lane_plan.json`
- `workflow/state/workflow_state.json`
- `workflow/tickets/*.json`

## 1) Preflight on main

```bash
pnpm workflow:validate
pnpm workflow:r7:lane-plan
pnpm workflow:r7:worktrees
pnpm workflow:r7:lane-status
pnpm workflow:r7:dedupe -- --base <BASE_SHA>
```

## 2) Per-lane execution (run in each worktree)

Lane worktrees:
- `.worktrees/r7-backend`
- `.worktrees/r7-pos`
- `.worktrees/r7-ret`
- `.worktrees/r7-sa`
- `.worktrees/r7-sup`

For each lane:
1. `cd` into lane worktree.
2. Run only tickets owned by that lane from `r7_lane_plan.json`.
3. Update ticket JSON with valid `statusHistory` and `gitDiscipline`.
4. Commit in small batches.
5. Push lane branch.

## 3) Merge protocol (main only)

```bash
git checkout main
git pull --ff-only
pnpm workflow:r7:dedupe -- --base <BASE_SHA>
pnpm workflow:r7:merge -- --base <BASE_SHA>
pnpm workflow:r7:lane-status
pnpm workflow:validate
```

Optional (expensive on large ticket volumes):

```bash
pnpm workflow:r7:merge -- --base <BASE_SHA> --with-monitor
```

## 4) Hard rules

- A lane must not edit ticket files owned by another lane.
- A lane must not edit unrelated files unless required for its own ticket fixes.
- Merge must stop on any conflict or dedupe violation.
- Re-run `workflow:r7:dedupe` before every merge window.

