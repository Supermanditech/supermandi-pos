#!/bin/bash
# GCP-STG-0632: Verify GCS buckets are in asia-south1 for Indian data residency
echo "=== GCS BUCKET LOCATION CHECK ==="
BUCKETS=(supermandi-pos-documents supermandi-pos-images)
for bucket in "${BUCKETS[@]}"; do
  echo "Checking gs://$bucket..."
  if command -v gsutil &>/dev/null; then
    LOCATION=$(gsutil ls -L -b "gs://$bucket" 2>/dev/null | grep "Location constraint" | awk '{print $NF}')
    echo "  Location: ${LOCATION:-UNKNOWN}"
    if [ "$LOCATION" = "ASIA-SOUTH1" ] || [ "$LOCATION" = "asia-south1" ]; then
      echo "  ✅ Correct — India (Mumbai)"
    else
      echo "  ⚠️ WARNING: Expected asia-south1, got $LOCATION"
      echo "  Indian data residency requires asia-south1"
    fi
  else
    echo "  ⚠️ gsutil not available — verify manually:"
    echo "    gsutil ls -L -b gs://$bucket | grep Location"
  fi
done
echo ""
echo "Indian DPDPA requires personal data stored in India."
echo "KYC documents, PAN copies, Aadhaar must be in asia-south1."
echo "=== CHECK COMPLETE ==="
