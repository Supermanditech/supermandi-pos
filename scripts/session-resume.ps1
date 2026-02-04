# SESSION RESUME — STARTUP VERIFICATION (GO-LIVE SAFE MODE)
# Repo: C:\supermandi-pos
# Expected Branch: main
# Expected Commit: d7edef2
# Rule: NO VM / NO nginx / NO migrations unless ALL checks match

$ErrorActionPreference = "Continue"

$repo    = "C:\supermandi-pos"
$gateway = "https://supermandi.tech"

function StatusLine($url) {
  try {
    $r = curl.exe -sS -I $url
    $http = ($r | Select-String -Pattern "HTTP/" | Select-Object -First 1)
    if ($http) { return $http.ToString().Trim() }
    return "NO_HTTP_LINE"
  } catch {
    return "FAILED"
  }
}

cd $repo

Write-Host "===== LOCAL REPO STATE ====="
Write-Host ("Path      : " + (git rev-parse --show-toplevel))
Write-Host ("Branch    : " + (git branch --show-current))
Write-Host ("HEAD      : " + (git rev-parse --short HEAD))
Write-Host ("Dirty     : " + ($(if (git status --porcelain) { "YES ❌" } else { "NO ✅" })))
Write-Host ("Pushed    : " + ($(if ((git rev-parse HEAD) -eq (git rev-parse origin/main)) { "YES ✅" } else { "NO ❌" })))

Write-Host ""
Write-Host "===== PUBLIC URL BASELINE ====="
Write-Host ("/                   -> " + (StatusLine "$gateway/"))
Write-Host ("/retailer/           -> " + (StatusLine "$gateway/retailer/"))
Write-Host ("/retailer/login      -> " + (StatusLine "$gateway/retailer/login"))
Write-Host ("/supplier/           -> " + (StatusLine "$gateway/supplier/"))
Write-Host ("/supplier/login      -> " + (StatusLine "$gateway/supplier/login"))
Write-Host ("/admin/              -> " + (StatusLine "$gateway/admin/"))
Write-Host ("/api/v1/health       -> " + (StatusLine "$gateway/api/v1/health"))

Write-Host ""
$ok =
  ((git branch --show-current) -eq "main") -and
  ((git rev-parse --short HEAD) -eq "d7edef2") -and
  (-not (git status --porcelain))

if (-not $ok) {
  Write-Host "❌ ABORT: State mismatch detected. DO NOT PROCEED."
  exit 1
} else {
  Write-Host "✅ SAFE TO PROCEED: State matches last shutdown exactly."
}
