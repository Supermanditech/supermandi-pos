# SA-P0-006: End-to-End Refund Test Script (Hardened)
# Usage: powershell -ExecutionPolicy Bypass -File scripts\test-refund-e2e.ps1
# Requires: Docker local-prod stack running on port 3010
# Pre-req: Migration 125 applied (chk_sale_payment_status + chk_ledger_reference_type)
#
# Exit codes:
#   0 = ALL PASS
#   1 = FAIL (with reason printed)
#
# Idempotent: Uses unique barcode per run to avoid collisions on back-to-back runs.

$ErrorActionPreference = "Continue"
$API = "http://localhost:3010/api/v1"
$PASS_COUNT = 0
$FAIL_COUNT = 0
$RUN_ID = (Get-Date).ToString("HHmmss")
$BARCODE = "890103${RUN_ID}99"

# =============================================================================
# HELPERS
# =============================================================================

function RunSQL($sql) {
    $raw = docker exec scripts-postgres-1 psql -U postgres -d supermandi -t -A -c $sql 2>&1
    return ("$raw".Trim() -split '\s')[0]
}

function RunSQLRaw($sql) {
    docker exec scripts-postgres-1 psql -U postgres -d supermandi -t -A -c $sql 2>&1
}

function Assert-Equal($name, $actual, $expected) {
    if ("$actual" -eq "$expected") {
        Write-Host "  PASS: $name = $actual" -ForegroundColor Green
        $script:PASS_COUNT++
    } else {
        Write-Host "  FAIL: $name = $actual (expected $expected)" -ForegroundColor Red
        $script:FAIL_COUNT++
    }
}

function Assert-NotEmpty($name, $value) {
    if ($value -and "$value".Trim() -ne "") {
        Write-Host "  PASS: $name is present ($value)" -ForegroundColor Green
        $script:PASS_COUNT++
    } else {
        Write-Host "  FAIL: $name is empty or missing" -ForegroundColor Red
        $script:FAIL_COUNT++
    }
}

function Fatal($msg) {
    Write-Host "FATAL: $msg" -ForegroundColor Red
    Write-Host "`n=== RESULT: ABORTED ===" -ForegroundColor Red
    Write-Host "PASS=$script:PASS_COUNT  FAIL=$script:FAIL_COUNT  ABORTED=true"
    exit 1
}

Write-Host "=== SA-P0-006 Refund E2E Test (RUN_ID=$RUN_ID, BARCODE=$BARCODE) ===" -ForegroundColor Yellow
Write-Host ""

# =============================================================================
# STEP 1: Create store
# =============================================================================
Write-Host "=== STEP 1: Create store ===" -ForegroundColor Cyan
$body = "{`"storeName`":`"Refund E2E $RUN_ID`",`"city`":`"Mumbai`",`"state`":`"Maharashtra`",`"pincode`":`"400001`"}"
$store = curl.exe -s -X POST "$API/admin/stores" -H "Content-Type: application/json" -H "x-admin-token: local-test-token" -d $body | ConvertFrom-Json
$STORE_ID = $store.store.id
if (-not $STORE_ID) { Fatal "Store creation failed: $($store | ConvertTo-Json -Compress)" }
Write-Host "  STORE_ID = $STORE_ID  |  Code = $($store.store.code)"

# =============================================================================
# STEP 2: Activate store via SQL (bypass state machine for test speed)
# =============================================================================
Write-Host "`n=== STEP 2: Activate store via SQL ===" -ForegroundColor Cyan
$result = RunSQLRaw "UPDATE platform.stores SET status='ACTIVE', device_bound=true, kyc_complete=true, upi_complete=true, admin_approved=true, updated_at=NOW() WHERE id='$STORE_ID' RETURNING status;"
Write-Host "  Store status = $result"

# =============================================================================
# STEP 3: Generate enrollment code
# =============================================================================
Write-Host "`n=== STEP 3: Generate enrollment code ===" -ForegroundColor Cyan
$enroll = curl.exe -s -X POST "$API/admin/stores/$STORE_ID/device-enrollments" -H "x-admin-token: local-test-token" | ConvertFrom-Json
$CODE = $enroll.code
if (-not $CODE) { Fatal "Enrollment code generation failed: $($enroll | ConvertTo-Json -Compress)" }
Write-Host "  ENROLLMENT CODE = $CODE"

# =============================================================================
# STEP 4: Enroll POS device
# =============================================================================
Write-Host "`n=== STEP 4: Enroll POS device ===" -ForegroundColor Cyan
$enrollBody = @{
    code = $CODE
    deviceMeta = @{
        label = "Refund Test $RUN_ID"
        deviceType = "OEM_HANDHELD"
        printingMode = "NONE"
    }
} | ConvertTo-Json -Compress
$device = curl.exe -s -X POST "$API/pos/enroll" -H "Content-Type: application/json" -d $enrollBody | ConvertFrom-Json
$TOKEN = $device.deviceToken
if (-not $TOKEN) { Fatal "Device enrollment failed: $($device | ConvertTo-Json -Compress)" }
Write-Host "  DEVICE TOKEN = $($TOKEN.Substring(0,16))..."
Write-Host "  STORE = $($device.storeName)  |  Active = $($device.storeActive)"

# =============================================================================
# STEP 5: Seed product (POS API first, SQL fallback)
# =============================================================================
Write-Host "`n=== STEP 5: Seed product ===" -ForegroundColor Cyan
$body = "{`"barcode`":`"$BARCODE`",`"name`":`"Test Tomato $RUN_ID`",`"sellPrice`":4500,`"mrp`":5000,`"initialStockQty`":100,`"unit`":`"kg`"}"
$product = curl.exe -s -X POST "$API/pos/store-products" -H "Content-Type: application/json" -H "x-device-token: $TOKEN" -d $body | ConvertFrom-Json

if ($product.storeProduct) {
    $SP_ID = $product.storeProduct.storeProductId
    $PROD_ID = RunSQL "SELECT product_id::text FROM catalog.store_products WHERE id='$SP_ID';"
    Write-Host "  Created via POS API: SP=$SP_ID  PROD=$PROD_ID"
} else {
    Write-Host "  POS API failed ($($product.error)). Seeding via SQL..." -ForegroundColor Yellow

    $PROD_ID = RunSQL "INSERT INTO catalog.products (name, primary_barcode, unit) VALUES ('Test Tomato $RUN_ID', '$BARCODE', 'kg') ON CONFLICT (primary_barcode) WHERE primary_barcode IS NOT NULL DO UPDATE SET name=EXCLUDED.name RETURNING id;"
    Write-Host "    Product ID = $PROD_ID"

    $SP_ID = RunSQL "INSERT INTO catalog.store_products (store_id, product_id, sell_price, mrp, current_stock, display_name, is_active) VALUES ('$STORE_ID', '$PROD_ID', 4500, 5000, 100, 'Test Tomato $RUN_ID', true) ON CONFLICT (store_id, product_id) DO UPDATE SET current_stock=100, sell_price=4500, mrp=5000 RETURNING id;"
    Write-Host "    Store Product ID = $SP_ID"

    RunSQLRaw "INSERT INTO catalog.product_barcodes (product_id, barcode) VALUES ('$PROD_ID', '$BARCODE') ON CONFLICT DO NOTHING;" | Out-Null

    RunSQLRaw "INSERT INTO public.variants (id, product_id, name) VALUES ('$SP_ID', '$PROD_ID', 'Test Tomato $RUN_ID') ON CONFLICT (id) DO NOTHING;" | Out-Null
    Write-Host "    Variant record created"

    RunSQLRaw "INSERT INTO inventory.stock_balances (store_id, product_id, current_qty) VALUES ('$STORE_ID', '$PROD_ID', 100) ON CONFLICT (store_id, product_id) DO UPDATE SET current_qty=100;" | Out-Null

    RunSQLRaw "INSERT INTO store_inventory (store_id, global_product_id, available_qty) VALUES ('$STORE_ID', '$PROD_ID', 100) ON CONFLICT (store_id, global_product_id) DO UPDATE SET available_qty=100;" | Out-Null
    Write-Host "    Stock seeded: 100 units (stock_balances + store_inventory)"
}

if (-not $SP_ID -or -not $PROD_ID) { Fatal "Missing IDs (SP=$SP_ID, PROD=$PROD_ID)" }

# =============================================================================
# STEP 6: Verify seed stock = 100 (fail-fast)
# =============================================================================
Write-Host "`n=== STEP 6: Verify seed stock ===" -ForegroundColor Cyan
$stock = curl.exe -s "$API/pos/inventory/stock/${PROD_ID}?refresh=true" -H "x-device-token: $TOKEN" | ConvertFrom-Json
$stockBefore = $stock.data.currentQty
Assert-Equal "stock_before_sale" $stockBefore 100
if ($stockBefore -ne 100) { Fatal "seed_stock_mismatch expected=100 actual=$stockBefore" }

# =============================================================================
# STEP 7: Create sale (2 units x 4500 paise = 9000 paise total)
# =============================================================================
Write-Host "`n=== STEP 7: Create sale ===" -ForegroundColor Cyan
$saleBody = @{
    items = @(@{
        storeProductId = $SP_ID
        quantity = 2
        priceMinor = 4500
        name = "Test Tomato $RUN_ID"
    })
    discountMinor = 0
} | ConvertTo-Json -Depth 5 -Compress
$sale = curl.exe -s -X POST "$API/pos/sales" -H "Content-Type: application/json" -H "x-device-token: $TOKEN" -d $saleBody | ConvertFrom-Json
$SALE_ID = $sale.saleId
if (-not $SALE_ID) { Fatal "Sale creation failed: $($sale | ConvertTo-Json -Depth 5 -Compress)" }
Write-Host "  SALE_ID = $SALE_ID"
Write-Host "  Bill Ref = $($sale.billRef)  |  Total = $($sale.totals.totalMinor) paise"

# =============================================================================
# STEP 8: Confirm payment (CASH)
# =============================================================================
Write-Host "`n=== STEP 8: Confirm payment ===" -ForegroundColor Cyan
$body = '{"paymentMode":"CASH"}'
$pay = curl.exe -s -X POST "$API/pos/sales/$SALE_ID/confirm" -H "Content-Type: application/json" -H "x-device-token: $TOKEN" -d $body | ConvertFrom-Json
Assert-NotEmpty "payment_status" $pay.status
Write-Host "  $($pay.status) | $($pay.message)"

# =============================================================================
# STEP 9: Stock after sale (expect 98)
# =============================================================================
Write-Host "`n=== STEP 9: Stock after sale ===" -ForegroundColor Cyan
$stock = curl.exe -s "$API/pos/inventory/stock/${PROD_ID}?refresh=true" -H "x-device-token: $TOKEN" | ConvertFrom-Json
Assert-Equal "stock_after_sale" $stock.data.currentQty 98

# =============================================================================
# STEP 10: RETURN the sale
# =============================================================================
Write-Host "`n=== STEP 10: Return the sale ===" -ForegroundColor Cyan
$body = '{"reason":"Customer changed mind - E2E refund test"}'
$retRaw = curl.exe -s -X POST "$API/pos/sales/$SALE_ID/return" -H "Content-Type: application/json" -H "x-device-token: $TOKEN" -d $body
Write-Host "  RAW: $retRaw"
$ret = $retRaw | ConvertFrom-Json

# Verify all 5 expected fields
Assert-NotEmpty "return.saleId" $ret.saleId
Assert-NotEmpty "return.returnId" $ret.returnId
Assert-Equal "return.status" $ret.status "REFUNDED"
Assert-NotEmpty "return.message" $ret.message
Assert-NotEmpty "return.itemsReturned" $ret.itemsReturned

# =============================================================================
# STEP 11: Stock after return (expect 100)
# =============================================================================
Write-Host "`n=== STEP 11: Stock after return ===" -ForegroundColor Cyan
$stock = curl.exe -s "$API/pos/inventory/stock/${PROD_ID}?refresh=true" -H "x-device-token: $TOKEN" | ConvertFrom-Json
Assert-Equal "stock_after_return" $stock.data.currentQty 100

# =============================================================================
# STEP 12: Ledger proof via API
# =============================================================================
Write-Host "`n=== STEP 12: Ledger proof (API) ===" -ForegroundColor Cyan
$ledger = curl.exe -s "$API/pos/inventory/ledger?transactionType=sale_return&limit=5" -H "x-device-token: $TOKEN" | ConvertFrom-Json
Write-Host "  Sale return entries: $($ledger.pagination.total)"
if ($ledger.data -and $ledger.data.Count -gt 0) {
    $ledger.data | ForEach-Object {
        Write-Host "    [$($_.transactionType)] $($_.productName): delta=$($_.deltaQty) | $($_.stockBefore) -> $($_.stockAfter)"
    }
}

# =============================================================================
# STEP 13: Double return blocked (idempotency guard)
# =============================================================================
Write-Host "`n=== STEP 13: Double return blocked ===" -ForegroundColor Cyan
$body = '{"reason":"Try returning again"}'
$ret2 = curl.exe -s -X POST "$API/pos/sales/$SALE_ID/return" -H "Content-Type: application/json" -H "x-device-token: $TOKEN" -d $body | ConvertFrom-Json
Assert-Equal "double_return_blocked" $ret2.error "cannot_return"

# =============================================================================
# STEP 14: DB proof — sale row
# =============================================================================
Write-Host "`n=== STEP 14: DB proof — sale row ===" -ForegroundColor Cyan
$dbStatus = RunSQL "SELECT status FROM public.sales WHERE id='$SALE_ID';"
$dbPayStatus = RunSQL "SELECT payment_status FROM public.sales WHERE id='$SALE_ID';"
$dbTotal = RunSQL "SELECT total_minor::text FROM public.sales WHERE id='$SALE_ID';"
Assert-Equal "db_sale_status" $dbStatus "REFUNDED"
Assert-Equal "db_payment_status" $dbPayStatus "refunded"
Assert-Equal "db_total_minor" $dbTotal "9000"

# =============================================================================
# STEP 15: DB proof — ledger entry exists for this sale
# =============================================================================
Write-Host "`n=== STEP 15: DB proof — ledger entries ===" -ForegroundColor Cyan
$ledgerCount = RunSQL "SELECT COUNT(*)::text FROM inventory.inventory_ledger WHERE reference_type='return' AND store_id='$STORE_ID';"
Write-Host "  Ledger return entries for store: $ledgerCount"
if ([int]$ledgerCount -ge 1) {
    Write-Host "  PASS: ledger_return_entries >= 1" -ForegroundColor Green
    $PASS_COUNT++
} else {
    Write-Host "  FAIL: ledger_return_entries = $ledgerCount (expected >= 1)" -ForegroundColor Red
    $FAIL_COUNT++
}

# DB proof — stock_balances restored
$dbStockBal = RunSQL "SELECT current_qty::text FROM inventory.stock_balances WHERE store_id='$STORE_ID' AND product_id='$PROD_ID';"
Assert-Equal "db_stock_balances" $dbStockBal "100"

# DB proof — store_inventory restored
$dbStoreInv = RunSQL "SELECT available_qty::text FROM store_inventory WHERE store_id='$STORE_ID' AND global_product_id='$PROD_ID';"
Assert-Equal "db_store_inventory" $dbStoreInv "100"

# DB proof — catalog.store_products.current_stock restored
$dbCatalogStock = RunSQL "SELECT current_stock::text FROM catalog.store_products WHERE id='$SP_ID';"
Assert-Equal "db_catalog_current_stock" $dbCatalogStock "100"

# =============================================================================
# RESULT
# =============================================================================
Write-Host ""
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host "  SA-P0-006 Refund E2E Results" -ForegroundColor Yellow
Write-Host "=====================================" -ForegroundColor Yellow
Write-Host "  Store:    $STORE_ID"
Write-Host "  Product:  $PROD_ID (catalog) / $SP_ID (store)"
Write-Host "  Sale:     $SALE_ID"
Write-Host "  PASS:     $PASS_COUNT" -ForegroundColor Green
Write-Host "  FAIL:     $FAIL_COUNT" -ForegroundColor $(if ($FAIL_COUNT -gt 0) { "Red" } else { "Green" })
Write-Host "=====================================" -ForegroundColor Yellow

if ($FAIL_COUNT -gt 0) {
    Write-Host "`nOVERALL: FAIL ($FAIL_COUNT failures)" -ForegroundColor Red
    exit 1
} else {
    Write-Host "`nOVERALL: PASS ($PASS_COUNT/$PASS_COUNT)" -ForegroundColor Green
    exit 0
}
