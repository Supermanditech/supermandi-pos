#!/bin/bash
# GCP-STG-0614: Verify GCS bucket permissions for Cloud Run SA
echo "=== GCS BUCKET PERMISSIONS CHECK ==="
SA="cloudrun-backend@supermandi-backend.iam.gserviceaccount.com"
BUCKETS=(supermandi-pos-documents supermandi-pos-images)
echo "Service Account: $SA"
echo ""
for bucket in "${BUCKETS[@]}"; do
  echo "Checking gs://$bucket..."
  if command -v gsutil &>/dev/null; then
    gsutil iam get "gs://$bucket" 2>/dev/null | grep -A2 "$SA" || echo "  ⚠️ SA not found in bucket IAM"
  else
    echo "  gsutil not available — verify manually:"
    echo "    gsutil iam get gs://$bucket"
  fi
  echo ""
done
echo "Required roles for Cloud Run SA:"
echo "  - storage.objects.get (read documents)"
echo "  - storage.objects.create (upload documents)"
echo "  - storage.objects.delete (optional, for cleanup)"
echo ""
echo "Grant with:"
echo "  gsutil iam ch serviceAccount:$SA:objectAdmin gs://supermandi-pos-documents"
echo "  gsutil iam ch serviceAccount:$SA:objectAdmin gs://supermandi-pos-images"
echo "=== CHECK COMPLETE ==="
