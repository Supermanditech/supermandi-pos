# SuperMandi POS - Redmi Snapshot + Test Workflow
# Usage:
#   .\tools\dev\redmi-snapshot.ps1           # Snapshot + LAN mode
#   .\tools\dev\redmi-snapshot.ps1 -Usb      # Snapshot + USB mode
#   .\tools\dev\redmi-snapshot.ps1 -TestStore        # Snapshot + LAN + Test Store
#   .\tools\dev\redmi-snapshot.ps1 -TestStore -Usb   # Snapshot + USB + Test Store
#
# This script:
#   1. Creates a LOCAL WIP commit including all changes (staged, unstaged, untracked)
#   2. Runs the normal redmi.ps1 workflow
#
# The commit is LOCAL ONLY - never pushed automatically.
# You can squash/rebase/reset later as needed.

param(
    [switch]$Usb,
    [switch]$Tunnel,
    [switch]$TestStore
)

$ErrorActionPreference = "Stop"

# Colors
function Write-Cyan { param($text) Write-Host $text -ForegroundColor Cyan }
function Write-Green { param($text) Write-Host $text -ForegroundColor Green }
function Write-Yellow { param($text) Write-Host $text -ForegroundColor Yellow }
function Write-Red { param($text) Write-Host $text -ForegroundColor Red }
function Write-Gray { param($text) Write-Host $text -ForegroundColor Gray }
function Write-Magenta { param($text) Write-Host $text -ForegroundColor Magenta }

# Change to project root
$projectRoot = Split-Path (Split-Path $PSScriptRoot -Parent) -Parent
Set-Location $projectRoot

Write-Host ""
Write-Cyan "========================================================"
Write-Cyan "  SuperMandi POS - Snapshot + Redmi Test"
Write-Cyan "========================================================"
Write-Host ""

# =============================================================================
# Step 1: Check if working tree is dirty
# =============================================================================

Write-Cyan "[1/3] Checking working tree status..."

$statusOutput = git status --porcelain 2>$null
$isDirty = $false
$modifiedCount = 0
$untrackedCount = 0

if ($statusOutput) {
    $isDirty = $true
    $statusLines = $statusOutput -split "`n" | Where-Object { $_.Trim() }
    foreach ($line in $statusLines) {
        if ($line -match "^\?\?") {
            $untrackedCount++
        } else {
            $modifiedCount++
        }
    }
}

if (-not $isDirty) {
    Write-Green "  Working tree is CLEAN - no snapshot needed"
    Write-Host ""
    Write-Gray "  Proceeding directly to Expo..."
    Write-Host ""
} else {
    Write-Yellow "  Working tree is DIRTY:"
    Write-Host "    Modified:  $modifiedCount file(s)"
    Write-Host "    Untracked: $untrackedCount file(s)"
    Write-Host ""

    # =============================================================================
    # Step 2: Create snapshot commit
    # =============================================================================

    Write-Cyan "[2/3] Creating local snapshot commit..."

    # Get timestamp for commit message
    $utcNow = [DateTime]::UtcNow
    $istNow = $utcNow.AddHours(5).AddMinutes(30)
    $timestamp = $istNow.ToString("yyyy-MM-dd_HH-mm-ss")

    # Stage all changes (including untracked)
    Write-Gray "  Staging all changes..."
    git add -A 2>$null

    if ($LASTEXITCODE -ne 0) {
        Write-Red "[ERROR] Failed to stage changes"
        exit 1
    }

    # Create commit
    $commitMsg = "wip(redmi): snapshot $timestamp"
    Write-Gray "  Creating commit: $commitMsg"

    git commit -m $commitMsg 2>$null

    if ($LASTEXITCODE -ne 0) {
        Write-Red "[ERROR] Failed to create commit"
        Write-Host "  This may happen if there are no actual changes to commit."
        exit 1
    }

    # Get new SHA
    $newSha = git rev-parse --short HEAD 2>$null
    $newLog = git log -1 --oneline 2>$null

    Write-Green "  [OK] Snapshot created!"
    Write-Host ""
    Write-Host "  New commit: " -NoNewline
    Write-Magenta $newLog
    Write-Host ""
    Write-Yellow "  IMPORTANT: This is a LOCAL commit only!"
    Write-Yellow "  To clean up later:"
    Write-Host "    git reset --soft HEAD~1  # Undo commit, keep changes staged"
    Write-Host "    git reset HEAD~1         # Undo commit, unstage changes"
    Write-Host "    git rebase -i HEAD~N     # Squash multiple snapshots"
    Write-Host ""
}

# =============================================================================
# Step 3: Run normal redmi workflow
# =============================================================================

Write-Cyan "[3/3] Starting Redmi workflow..."
Write-Host ""

# Build arguments for redmi.ps1
$redmiArgs = @()
if ($Usb) { $redmiArgs += "-Usb" }
if ($Tunnel) { $redmiArgs += "-Tunnel" }
if ($TestStore) { $redmiArgs += "-TestStore" }

# Run redmi.ps1
$redmiScript = Join-Path $PSScriptRoot "redmi.ps1"
& $redmiScript @redmiArgs
