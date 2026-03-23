#!/bin/bash
# GCP-STG-0470: Extract SHA-1 fingerprints for Firebase Android app registration
# Run: bash scripts/get-sha1.sh
echo "=== Debug SHA-1 ==="
cd android && ./gradlew signingReport 2>/dev/null | grep -A1 "SHA1:"
echo ""
echo "Register these in Firebase Console -> Project Settings -> Android app -> Add fingerprint"
