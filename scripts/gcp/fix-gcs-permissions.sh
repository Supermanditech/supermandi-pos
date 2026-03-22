#!/usr/bin/env bash
# Grant Cloud Run service account access to GCS buckets
#
# The Cloud Run service needs storage.objects.get (and create/delete)
# on the documents and images buckets.

set -euo pipefail

PROJECT="supermandi-backend"
SA="github-actions@supermandi-backend.iam.gserviceaccount.com"
DOCS_BUCKET="supermandi-pos-documents"
IMAGES_BUCKET="supermandi-pos-images"

echo "=== Granting GCS access to Cloud Run SA ==="
echo "SA: ${SA}"

# Documents bucket — read + write
gcloud storage buckets add-iam-policy-binding "gs://${DOCS_BUCKET}" \
  --member="serviceAccount:${SA}" \
  --role="roles/storage.objectUser" \
  --project="$PROJECT"

echo "✅ ${DOCS_BUCKET}: objectUser granted"

# Images bucket — read + write
gcloud storage buckets add-iam-policy-binding "gs://${IMAGES_BUCKET}" \
  --member="serviceAccount:${SA}" \
  --role="roles/storage.objectUser" \
  --project="$PROJECT"

echo "✅ ${IMAGES_BUCKET}: objectUser granted"

echo ""
echo "=== Verify ==="
gcloud storage buckets get-iam-policy "gs://${DOCS_BUCKET}" \
  --project="$PROJECT" \
  --format="json" | grep -A2 "${SA}"

echo ""
echo "Done. Cloud Run can now read/write to both buckets."
