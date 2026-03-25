#!/bin/bash
# GCP-STG-0620: Verify VITE_FIREBASE_* config values for retailer-admin
echo "=== RETAILER FIREBASE CONFIG CHECK ==="

echo "Required Firebase env vars for retailer-admin build:"
echo "  VITE_FIREBASE_API_KEY"
echo "  VITE_FIREBASE_AUTH_DOMAIN"
echo "  VITE_FIREBASE_PROJECT_ID"
echo "  VITE_FIREBASE_STORAGE_BUCKET (optional)"
echo "  VITE_FIREBASE_MESSAGING_SENDER_ID (optional)"
echo "  VITE_FIREBASE_APP_ID (optional)"
echo ""

echo "Checking retailer-admin source for Firebase config usage..."
if grep -rq "VITE_FIREBASE_API_KEY" retailer-admin/src/ 2>/dev/null; then
  echo "✅ Firebase config referenced in retailer-admin source"
else
  echo "⚠️ Firebase config not found in retailer-admin source"
fi

echo ""
echo "Docker build sets these via --build-arg in deploy.yml."
echo "Verify in deploy.yml:"
echo "  grep VITE_FIREBASE .github/workflows/deploy.yml"
echo ""
echo "Firebase project: supermandi-pos"
echo "Auth domain: supermandi-pos.firebaseapp.com"
echo "=== CHECK COMPLETE ==="
