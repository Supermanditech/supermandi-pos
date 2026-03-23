# GCP-STG-0470: Extract SHA-1 fingerprints for Firebase Android app registration
# Run: powershell -File scripts/get-sha1.ps1
Write-Host "=== SHA-1 Fingerprints ==="
Push-Location android
cmd /c "gradlew.bat signingReport" 2>$null | Select-String "SHA1:"
Pop-Location
Write-Host ""
Write-Host "Register these in Firebase Console -> Project Settings -> Android app -> Add fingerprint"
