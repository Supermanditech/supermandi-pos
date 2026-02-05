#!/usr/bin/env pwsh
# save-wip.ps1 — Save all work-in-progress to git safely
# Usage: .\scripts\save-wip.ps1
#
# What it does:
#   1. Shows current dirty file count
#   2. Stages ALL changes (new + modified + deleted)
#   3. Creates a WIP commit with timestamp
#   4. Tags it as wip/<date>-<time> for easy recovery
#   5. Prints recovery commands

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = git rev-parse --show-toplevel 2>$null
if (-not $repoRoot) {
    Write-Host "ERROR: Not inside a git repository" -ForegroundColor Red
    exit 1
}

Push-Location $repoRoot

try {
    # ── 1. Show status ──────────────────────────────────────────────────
    $branch = git branch --show-current
    $changed = git status --short | Measure-Object | Select-Object -ExpandProperty Count

    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "  SAVE WIP — SuperMandi" -ForegroundColor Cyan
    Write-Host "=============================================" -ForegroundColor Cyan
    Write-Host "  Branch : $branch"
    Write-Host "  Changed: $changed files"
    Write-Host ""

    if ($changed -eq 0) {
        Write-Host "  Nothing to save — working tree is clean." -ForegroundColor Green
        exit 0
    }

    # ── 2. Stage everything ─────────────────────────────────────────────
    Write-Host "--- Staging all changes..." -ForegroundColor Yellow
    git add -A
    $staged = git diff --cached --numstat | Measure-Object | Select-Object -ExpandProperty Count
    Write-Host "  Staged: $staged files" -ForegroundColor Green

    # ── 3. Create WIP commit ────────────────────────────────────────────
    $ts = Get-Date -Format "yyyy-MM-dd_HH-mm-ss"
    $tsReadable = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $msg = "WIP: save-point $tsReadable ($staged files)`n`nBatches 004-010 code-complete snapshot.`nCreated by scripts/save-wip.ps1"

    Write-Host "--- Creating WIP commit..." -ForegroundColor Yellow
    git commit -m $msg --no-verify
    $sha = git rev-parse --short HEAD
    Write-Host "  Commit: $sha" -ForegroundColor Green

    # ── 4. Tag for easy recovery ────────────────────────────────────────
    $tag = "wip/$ts"
    Write-Host "--- Tagging as $tag ..." -ForegroundColor Yellow
    git tag $tag
    Write-Host "  Tag: $tag" -ForegroundColor Green

    # ── 5. Summary ──────────────────────────────────────────────────────
    Write-Host ""
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  WIP SAVED SUCCESSFULLY" -ForegroundColor Green
    Write-Host "=============================================" -ForegroundColor Green
    Write-Host "  SHA    : $sha"
    Write-Host "  Tag    : $tag"
    Write-Host "  Files  : $staged"
    Write-Host "  Branch : $branch"
    Write-Host ""
    Write-Host "  Recovery commands:" -ForegroundColor Cyan
    Write-Host "    git log --oneline -5         # see recent commits"
    Write-Host "    git tag -l 'wip/*'           # list all WIP tags"
    Write-Host "    git diff wip/$ts..HEAD       # diff since this save"
    Write-Host "    git reset --soft HEAD~1      # undo WIP commit, keep changes staged"
    Write-Host "    git stash                    # alternatively stash instead"
    Write-Host ""
    Write-Host "  To continue working:" -ForegroundColor Cyan
    Write-Host "    git reset --soft HEAD~1      # unwrap WIP, changes stay staged"
    Write-Host "    # ... make more changes ..."
    Write-Host "    .\scripts\save-wip.ps1       # save again"
    Write-Host ""

} finally {
    Pop-Location
}
