# OPS-EVIDENCE-001: Evidence Folder + Checklist Generator
# Usage: .\scripts\generate-evidence.ps1 -BatchId BATCH-008 -Tickets "ENV-FAILFAST-001,SECRET-CLEANUP-001,TZ-FORMAT-001"
# Creates: RELEASES/EVIDENCE/<BATCH-ID>/<TICKET-ID>/CHECKLIST.md for each ticket

param(
    [Parameter(Mandatory=$true)]
    [string]$BatchId,

    [Parameter(Mandatory=$true)]
    [string]$Tickets,

    [switch]$UpdateLedger
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $PSCommandPath)
Set-Location $Root

# Get current git SHA
$SHA = (git rev-parse --short HEAD 2>$null) ?? "unknown"
$FullSHA = (git rev-parse HEAD 2>$null) ?? "unknown"
$Branch = (git branch --show-current 2>$null) ?? "unknown"
$Timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host "=============================================" -ForegroundColor Cyan
Write-Host "  Evidence Generator — $BatchId" -ForegroundColor Cyan
Write-Host "  SHA: $SHA ($Branch)" -ForegroundColor Cyan
Write-Host "  Time: $Timestamp" -ForegroundColor Cyan
Write-Host "=============================================" -ForegroundColor Cyan
Write-Host ""

# Parse ticket list
$TicketList = $Tickets -split "," | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" }

if ($TicketList.Count -eq 0) {
    Write-Host "ERROR: No tickets provided" -ForegroundColor Red
    exit 1
}

Write-Host "Tickets ($($TicketList.Count)):" -ForegroundColor Yellow
$TicketList | ForEach-Object { Write-Host "  - $_" }
Write-Host ""

# Risk class lookup
$RiskClasses = @{
    "ENV"      = "F"  # Infra/Docker
    "SECRET"   = "F"  # Infra/Docker
    "TZ"       = "A"  # UI/copy
    "CURRENCY" = "A"  # UI/copy
    "COMPOSE"  = "F"  # Infra/Docker
    "ADMIN"    = "B"  # API/logic
    "OPS"      = "F"  # Infra/Docker
    "ROLE"     = "A"  # UI/copy (doc only)
}

$RiskDescriptions = @{
    "A" = "UI/copy — Evidence: Screenshot"
    "B" = "API/logic — Evidence: Screenshot + JSON response"
    "C" = "Auth/OTP — Evidence: Video + console log"
    "D" = "Routing — Evidence: curl headers"
    "E" = "DB/schema — Evidence: SQL logs"
    "F" = "Infra/Docker — Evidence: Build logs + config diff"
}

# Create evidence folders
$EvidenceBase = Join-Path $Root "RELEASES" "EVIDENCE" $BatchId

foreach ($ticket in $TicketList) {
    $ticketDir = Join-Path $EvidenceBase $ticket

    if (Test-Path $ticketDir) {
        Write-Host "  EXISTS: $ticketDir" -ForegroundColor DarkGray
    } else {
        New-Item -ItemType Directory -Path $ticketDir -Force | Out-Null
        Write-Host "  CREATED: $ticketDir" -ForegroundColor Green
    }

    # Determine risk class from ticket prefix
    $prefix = ($ticket -split "-")[0]
    $riskClass = if ($RiskClasses.ContainsKey($prefix)) { $RiskClasses[$prefix] } else { "B" }
    $riskDesc = if ($RiskDescriptions.ContainsKey($riskClass)) { $RiskDescriptions[$riskClass] } else { "Unknown" }

    # Generate CHECKLIST.md
    $checklistPath = Join-Path $ticketDir "CHECKLIST.md"
    if (-not (Test-Path $checklistPath)) {
        $checklist = @"
# $ticket — Evidence Checklist

| Field | Value |
|-------|-------|
| **Batch** | $BatchId |
| **SHA** | ``$SHA`` |
| **Risk Class** | $riskClass ($riskDesc) |
| **Date** | $Timestamp |
| **Status** | ``PENDING`` |

## Verification Steps

- [ ] Code change reviewed
- [ ] Local typecheck passes
- [ ] Local functional test passes
- [ ] Evidence captured (see risk class above)
- [ ] No regressions in related features

## Evidence Files

> Place screenshots, logs, JSON responses in this folder.
> Name format: ``$($ticket)_<description>.<ext>``

| File | Description | Captured |
|------|-------------|----------|
| (add evidence files here) | | |

## Notes

(Add verification notes here)
"@
        Set-Content -Path $checklistPath -Value $checklist -Encoding UTF8
        Write-Host "  CHECKLIST: $checklistPath" -ForegroundColor Green
    } else {
        Write-Host "  CHECKLIST EXISTS: $checklistPath" -ForegroundColor DarkGray
    }
}

Write-Host ""
Write-Host "Evidence structure created at:" -ForegroundColor Green
Write-Host "  $EvidenceBase" -ForegroundColor White
Write-Host ""

# Update BATCH_LEDGER.md if requested
if ($UpdateLedger) {
    $ledgerPath = Join-Path $Root "RELEASES" "BATCH_LEDGER.md"
    if (Test-Path $ledgerPath) {
        $ticketItems = ($TicketList | ForEach-Object { "- $_" }) -join "`n"
        $ledgerEntry = @"

### $BatchId — $(Get-Date -Format "yyyy-MM-dd") — Production-Grade Blockers Fix

| Field | Value |
|-------|-------|
| **Status** | ``IN_PROGRESS`` |
| **Environment** | Local → Staging → Production |
| **HEAD_SHA** | ``$SHA`` |
| **Pushed** | $(Get-Date -Format "yyyy-MM-dd") |

**Items:**
$ticketItems

**Evidence:** ``RELEASES/EVIDENCE/$BatchId/``

---
"@

        # Insert after "## Deployed Batches" line
        $content = Get-Content $ledgerPath -Raw
        $insertPoint = "## Infrastructure Batches"
        if ($content -match [regex]::Escape($insertPoint)) {
            $content = $content -replace [regex]::Escape($insertPoint), "$ledgerEntry`n$insertPoint"
            Set-Content -Path $ledgerPath -Value $content -Encoding UTF8
            Write-Host "BATCH_LEDGER.md updated with $BatchId entry" -ForegroundColor Green
        } else {
            Write-Host "WARNING: Could not find insertion point in BATCH_LEDGER.md" -ForegroundColor Yellow
        }
    }
}

Write-Host ""
Write-Host "Next steps:" -ForegroundColor Cyan
Write-Host "  1. Run typecheck: pnpm -r typecheck" -ForegroundColor White
Write-Host "  2. Verify each ticket locally" -ForegroundColor White
Write-Host "  3. Capture evidence per CHECKLIST.md" -ForegroundColor White
Write-Host "  4. Mark checklists as complete" -ForegroundColor White
Write-Host "  5. Run: .\scripts\zero-regression-check.ps1 -Full" -ForegroundColor White
Write-Host ""
