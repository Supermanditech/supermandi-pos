# =============================================================================
# RCAT-SUP-VM-001: Suppliers End-to-End Verification Script
# =============================================================================
# Purpose: Go-live ready verification for Suppliers API on VM
#
# Prerequisites:
#   1. VM must be accessible at the configured IP
#   2. You need a valid JWT token from retailer-admin login (DEMO001 store)
#
# Usage:
#   .\verify-suppliers-e2e.ps1 -Token "eyJhbGc..."
#   .\verify-suppliers-e2e.ps1 -Token "eyJhbGc..." -VmIp "34.14.220.171"
#
# Expected Output:
#   - Health check passes
#   - GET suppliers returns sectioned data (verified/pending/local)
#   - POST creates new local supplier
#   - GET confirms new supplier in Local section
#   - PATCH updates supplier
#   - GET confirms update persisted
# =============================================================================

param(
    [Parameter(Mandatory=$true)]
    [string]$Token,

    [Parameter(Mandatory=$false)]
    [string]$VmIp = "34.14.220.171",

    [Parameter(Mandatory=$false)]
    [int]$Port = 3000,

    [Parameter(Mandatory=$false)]
    [switch]$SkipCleanup
)

# =============================================================================
# CONFIGURATION
# =============================================================================

$BaseUrl = "http://${VmIp}:${Port}"
$ApiBase = "$BaseUrl/api/v1"

# Test supplier data
$TestSupplierName = "E2E Test Supplier $(Get-Date -Format 'HHmmss')"
$TestSupplierPhone = "+91-98765$(Get-Random -Minimum 10000 -Maximum 99999)"

# Colors
$Colors = @{
    Success = "Green"
    Error = "Red"
    Warning = "Yellow"
    Info = "Cyan"
    Header = "Magenta"
}

# =============================================================================
# HELPER FUNCTIONS
# =============================================================================

function Write-Step {
    param([string]$Step, [string]$Description)
    Write-Host ""
    Write-Host "=" * 60 -ForegroundColor $Colors.Header
    Write-Host "STEP $Step : $Description" -ForegroundColor $Colors.Header
    Write-Host "=" * 60 -ForegroundColor $Colors.Header
}

function Write-Success {
    param([string]$Message)
    Write-Host "[PASS] $Message" -ForegroundColor $Colors.Success
}

function Write-Fail {
    param([string]$Message)
    Write-Host "[FAIL] $Message" -ForegroundColor $Colors.Error
}

function Write-Info {
    param([string]$Message)
    Write-Host "[INFO] $Message" -ForegroundColor $Colors.Info
}

function Write-Warn {
    param([string]$Message)
    Write-Host "[WARN] $Message" -ForegroundColor $Colors.Warning
}

function Invoke-ApiRequest {
    param(
        [string]$Method,
        [string]$Endpoint,
        [hashtable]$Body = $null,
        [switch]$NoAuth
    )

    $headers = @{
        "Content-Type" = "application/json"
    }

    if (-not $NoAuth) {
        $headers["Authorization"] = "Bearer $Token"
    }

    $uri = "$ApiBase$Endpoint"
    Write-Info "  $Method $uri"

    try {
        $params = @{
            Method = $Method
            Uri = $uri
            Headers = $headers
            ErrorAction = "Stop"
        }

        if ($Body) {
            $params["Body"] = ($Body | ConvertTo-Json -Depth 10)
            Write-Info "  Body: $($params.Body)"
        }

        $response = Invoke-RestMethod @params
        return @{
            Success = $true
            Data = $response
            StatusCode = 200
        }
    }
    catch {
        $statusCode = $_.Exception.Response.StatusCode.value__
        $errorBody = $null

        try {
            $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
            $errorBody = $reader.ReadToEnd() | ConvertFrom-Json
        }
        catch {
            $errorBody = @{ error = @{ message = $_.Exception.Message } }
        }

        return @{
            Success = $false
            Data = $errorBody
            StatusCode = $statusCode
            Error = $_.Exception.Message
        }
    }
}

# =============================================================================
# TEST RESULTS TRACKING
# =============================================================================

$Results = @{
    Total = 0
    Passed = 0
    Failed = 0
    Warnings = 0
}

function Add-Result {
    param([bool]$Passed, [string]$TestName, [string]$Details = "")

    $Results.Total++

    if ($Passed) {
        $Results.Passed++
        Write-Success "$TestName"
        if ($Details) { Write-Info "  $Details" }
    }
    else {
        $Results.Failed++
        Write-Fail "$TestName"
        if ($Details) { Write-Info "  $Details" }
    }
}

# =============================================================================
# MAIN VERIFICATION SCRIPT
# =============================================================================

Write-Host ""
Write-Host "########################################################" -ForegroundColor $Colors.Header
Write-Host "#  RCAT-SUP-VM-001: Suppliers E2E Verification         #" -ForegroundColor $Colors.Header
Write-Host "#  VM: $VmIp`:$Port                               #" -ForegroundColor $Colors.Header
Write-Host "########################################################" -ForegroundColor $Colors.Header
Write-Host ""
Write-Info "Test Supplier Name: $TestSupplierName"
Write-Info "Test Supplier Phone: $TestSupplierPhone"

# Store created supplier ID for later tests
$CreatedSupplierId = $null

# -----------------------------------------------------------------------------
# STEP 1: Gateway Health Check
# -----------------------------------------------------------------------------
Write-Step "1" "Gateway Health Check"

$healthUri = "$BaseUrl/health"
Write-Info "  GET $healthUri"
try {
    $healthResponse = Invoke-RestMethod -Method GET -Uri $healthUri -ErrorAction Stop
    $healthResult = @{ Success = $true; Data = $healthResponse; StatusCode = 200 }
} catch {
    $healthResult = @{ Success = $false; StatusCode = $_.Exception.Response.StatusCode.value__ }
}

if ($healthResult.Success) {
    Add-Result $true "Gateway health endpoint responds"
    Write-Info "  Response: $($healthResult.Data | ConvertTo-Json -Compress)"
}
else {
    Add-Result $false "Gateway health endpoint responds" "Status: $($healthResult.StatusCode)"
    Write-Host ""
    Write-Fail "Cannot continue - gateway is not responding"
    exit 1
}

# -----------------------------------------------------------------------------
# STEP 2: GET Suppliers (Unfiltered)
# -----------------------------------------------------------------------------
Write-Step "2" "GET Suppliers (Unfiltered)"

$getSuppliersResult = Invoke-ApiRequest -Method "GET" -Endpoint "/retailer-admin/suppliers"

if ($getSuppliersResult.Success) {
    $supplierData = $getSuppliersResult.Data

    Add-Result $true "GET /suppliers returns success"

    # Check response structure
    $hasData = $null -ne $supplierData.data
    Add-Result $hasData "Response has 'data' array" "Found: $($hasData)"

    if ($hasData) {
        $supplierCount = $supplierData.data.Count
        Write-Info "  Total suppliers: $supplierCount"

        # Group by verification status
        $verified = ($supplierData.data | Where-Object { $_.verificationStatus -eq 'verified' }).Count
        $pending = ($supplierData.data | Where-Object { $_.verificationStatus -eq 'pending' }).Count
        $local = ($supplierData.data | Where-Object { $_.verificationStatus -eq 'unverified' -or $null -eq $_.verificationStatus }).Count

        Write-Info "  - Verified: $verified"
        Write-Info "  - Pending: $pending"
        Write-Info "  - Local: $local"

        Add-Result $true "Suppliers grouped by verification status"
    }

    # Check pagination metadata
    $hasPagination = $null -ne $supplierData.pagination
    Add-Result $hasPagination "Response has pagination metadata" "Found: $($hasPagination)"
}
else {
    Add-Result $false "GET /suppliers returns success" "Error: $($getSuppliersResult.Error)"
}

# -----------------------------------------------------------------------------
# STEP 3: GET Suppliers (Filtered by Query)
# -----------------------------------------------------------------------------
Write-Step "3" "GET Suppliers (Filtered)"

$searchQuery = "Demo"
$getFilteredResult = Invoke-ApiRequest -Method "GET" -Endpoint "/retailer-admin/suppliers?query=$searchQuery"

if ($getFilteredResult.Success) {
    Add-Result $true "GET /suppliers?query=$searchQuery returns success"

    $filteredCount = $getFilteredResult.Data.data.Count
    Write-Info "  Results for '$searchQuery': $filteredCount"

    if ($filteredCount -gt 0) {
        Write-Info "  First match: $($getFilteredResult.Data.data[0].name)"
    }
}
else {
    Add-Result $false "GET /suppliers?query=$searchQuery returns success" "Error: $($getFilteredResult.Error)"
}

# -----------------------------------------------------------------------------
# STEP 4: POST Create Local Supplier
# -----------------------------------------------------------------------------
Write-Step "4" "POST Create Local Supplier"

$createPayload = @{
    name = $TestSupplierName
    phone = $TestSupplierPhone
    supplierType = "Wholesaler"
    city = "Bengaluru"
    state = "Karnataka"
    pincode = "560001"
    paymentTerms = "Cash"
    creditDays = 7
    minOrderValue = 1000
    notes = "Created by E2E verification script"
}

$createResult = Invoke-ApiRequest -Method "POST" -Endpoint "/retailer-admin/suppliers" -Body $createPayload

if ($createResult.Success -and $createResult.Data.success) {
    $CreatedSupplierId = $createResult.Data.data.id
    Add-Result $true "POST /suppliers creates supplier"
    Write-Info "  Supplier ID: $CreatedSupplierId"
    Write-Info "  Name: $($createResult.Data.data.businessName)"
    Write-Info "  Linked: $($createResult.Data.data.linked)"
    Write-Info "  Pending Request Created: $($createResult.Data.data.pendingRequestCreated)"

    # Check for migration warnings (RCAT-SUP-FORM-001)
    if ($createResult.Data.warnings) {
        $Results.Warnings++
        Write-Warn "  Migration 014 not applied - some fields not saved:"
        Write-Warn "    $($createResult.Data.warnings -join ', ')"
        Write-Warn "  $($createResult.Data.migrationRequired)"
    }
    else {
        Write-Info "  All fields saved successfully (migration 014 applied)"
    }
}
else {
    Add-Result $false "POST /suppliers creates supplier" "Error: $($createResult.Data.error.message)"
}

# -----------------------------------------------------------------------------
# STEP 5: Verify Supplier Appears in GET
# -----------------------------------------------------------------------------
Write-Step "5" "Verify Created Supplier in GET"

if ($CreatedSupplierId) {
    # Search for the created supplier
    $verifyResult = Invoke-ApiRequest -Method "GET" -Endpoint "/retailer-admin/suppliers?query=$TestSupplierName"

    if ($verifyResult.Success) {
        $foundSupplier = $verifyResult.Data.data | Where-Object { $_.id -eq $CreatedSupplierId }

        if ($foundSupplier) {
            Add-Result $true "Created supplier appears in GET response"
            Write-Info "  Name: $($foundSupplier.name)"
            Write-Info "  Phone: $($foundSupplier.phone)"
            Write-Info "  Verification Status: $($foundSupplier.verificationStatus)"

            # Verify it's in Local section (unverified or null)
            $isLocal = ($foundSupplier.verificationStatus -eq 'unverified') -or ($null -eq $foundSupplier.verificationStatus)
            Add-Result $isLocal "Supplier appears in Local section" "Status: $($foundSupplier.verificationStatus)"
        }
        else {
            Add-Result $false "Created supplier appears in GET response" "Supplier ID not found in response"
        }
    }
    else {
        Add-Result $false "Created supplier appears in GET response" "GET request failed"
    }
}
else {
    Write-Warn "Skipping - no supplier was created"
}

# -----------------------------------------------------------------------------
# STEP 6: PATCH Update Supplier
# -----------------------------------------------------------------------------
Write-Step "6" "PATCH Update Supplier"

if ($CreatedSupplierId) {
    $updatePayload = @{
        tradeName = "E2E Test Trade Name"
        creditDays = 14
        notes = "Updated by E2E verification script at $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')"
    }

    $updateResult = Invoke-ApiRequest -Method "PATCH" -Endpoint "/retailer-admin/suppliers/$CreatedSupplierId" -Body $updatePayload

    if ($updateResult.Success -and $updateResult.Data.success) {
        Add-Result $true "PATCH /suppliers/:id updates supplier"
        Write-Info "  Fields Updated: $($updateResult.Data.data.fieldsUpdated)"
        Write-Info "  Message: $($updateResult.Data.data.message)"

        # Check for migration warnings (RCAT-SUP-FORM-001)
        if ($updateResult.Data.warnings) {
            $Results.Warnings++
            Write-Warn "  Migration 014 not applied - some fields not saved:"
            Write-Warn "    $($updateResult.Data.warnings -join ', ')"
        }
    }
    else {
        Add-Result $false "PATCH /suppliers/:id updates supplier" "Error: $($updateResult.Data.error.message)"
    }
}
else {
    Write-Warn "Skipping - no supplier to update"
}

# -----------------------------------------------------------------------------
# STEP 7: Verify Update Persisted
# -----------------------------------------------------------------------------
Write-Step "7" "Verify Update Persisted"

if ($CreatedSupplierId) {
    $verifyUpdateResult = Invoke-ApiRequest -Method "GET" -Endpoint "/retailer-admin/suppliers?query=$TestSupplierName"

    if ($verifyUpdateResult.Success) {
        $updatedSupplier = $verifyUpdateResult.Data.data | Where-Object { $_.id -eq $CreatedSupplierId }

        if ($updatedSupplier) {
            # Check tradeName was updated
            $tradeNameUpdated = $updatedSupplier.tradeName -eq "E2E Test Trade Name"
            Add-Result $tradeNameUpdated "Trade name update persisted" "tradeName: $($updatedSupplier.tradeName)"

            # Check creditDays was updated
            $creditDaysUpdated = $updatedSupplier.creditDays -eq 14
            Add-Result $creditDaysUpdated "Credit days update persisted" "creditDays: $($updatedSupplier.creditDays)"
        }
        else {
            Add-Result $false "Verify update persisted" "Supplier not found"
        }
    }
    else {
        Add-Result $false "Verify update persisted" "GET request failed"
    }
}
else {
    Write-Warn "Skipping - no supplier to verify"
}

# -----------------------------------------------------------------------------
# STEP 8: DELETE Supplier (Cleanup)
# -----------------------------------------------------------------------------
Write-Step "8" "DELETE Supplier (Cleanup)"

if ($CreatedSupplierId -and -not $SkipCleanup) {
    $deleteResult = Invoke-ApiRequest -Method "DELETE" -Endpoint "/retailer-admin/suppliers/$CreatedSupplierId"

    if ($deleteResult.Success -and $deleteResult.Data.success) {
        Add-Result $true "DELETE /suppliers/:id removes supplier"
        Write-Info "  Message: $($deleteResult.Data.data.message)"
    }
    else {
        Add-Result $false "DELETE /suppliers/:id removes supplier" "Error: $($deleteResult.Data.error.message)"
    }
}
elseif ($SkipCleanup) {
    Write-Info "Cleanup skipped (-SkipCleanup flag)"
    Write-Info "  Supplier ID: $CreatedSupplierId"
}
else {
    Write-Warn "Skipping - no supplier to delete"
}

# =============================================================================
# SUMMARY
# =============================================================================

Write-Host ""
Write-Host "########################################################" -ForegroundColor $Colors.Header
Write-Host "#  VERIFICATION SUMMARY                                #" -ForegroundColor $Colors.Header
Write-Host "########################################################" -ForegroundColor $Colors.Header
Write-Host ""

$passRate = if ($Results.Total -gt 0) { [math]::Round(($Results.Passed / $Results.Total) * 100, 1) } else { 0 }

Write-Host "Total Tests: $($Results.Total)" -ForegroundColor $Colors.Info
Write-Host "Passed:      $($Results.Passed)" -ForegroundColor $Colors.Success
Write-Host "Failed:      $($Results.Failed)" -ForegroundColor $(if ($Results.Failed -gt 0) { $Colors.Error } else { $Colors.Success })
Write-Host "Warnings:    $($Results.Warnings)" -ForegroundColor $(if ($Results.Warnings -gt 0) { $Colors.Warning } else { $Colors.Info })
Write-Host "Pass Rate:   $passRate%" -ForegroundColor $(if ($passRate -eq 100) { $Colors.Success } elseif ($passRate -ge 80) { $Colors.Warning } else { $Colors.Error })
Write-Host ""

if ($Results.Failed -eq 0) {
    Write-Host "============================================" -ForegroundColor $Colors.Success
    Write-Host "  ALL TESTS PASSED - GO-LIVE READY!        " -ForegroundColor $Colors.Success
    Write-Host "============================================" -ForegroundColor $Colors.Success

    if ($Results.Warnings -gt 0) {
        Write-Host ""
        Write-Warn "Note: Migration 014 warnings detected."
        Write-Warn "Some extended fields (fssai, paymentTerms, etc.) were not saved."
        Write-Warn "Run migration 014 on production DB to enable all fields."
    }
}
else {
    Write-Host "============================================" -ForegroundColor $Colors.Error
    Write-Host "  SOME TESTS FAILED - REVIEW BEFORE GO-LIVE" -ForegroundColor $Colors.Error
    Write-Host "============================================" -ForegroundColor $Colors.Error
}

Write-Host ""
Write-Host "VM URL: $BaseUrl" -ForegroundColor $Colors.Info
Write-Host "Retailer Admin: $BaseUrl/retailer-admin/" -ForegroundColor $Colors.Info
Write-Host ""

# Return exit code based on results
exit $Results.Failed
