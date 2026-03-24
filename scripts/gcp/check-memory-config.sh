#!/bin/bash
# GCP-STG-0600: Verify Cloud Run memory configuration
echo "=== MEMORY CONFIG CHECK ==="
echo "Current: 512Mi per instance"
echo "Max instances: 10"
echo "Total max memory: 5Gi across all instances"
echo ""
echo "Recommendation:"
echo "  - Monitor via Cloud Console → Cloud Run → Metrics → Memory"
echo "  - If sustained >400Mi, increase to 1Gi in deploy.yml"
echo "  - Voice/AI routes (Whisper+GPT) may spike memory on concurrent requests"
echo ""
echo "To check current usage:"
echo "  gcloud run services describe main-backend --region=asia-south1 --format='value(spec.template.spec.containers[0].resources.limits.memory)'"
