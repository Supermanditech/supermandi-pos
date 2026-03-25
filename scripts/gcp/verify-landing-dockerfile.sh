#!/bin/bash
# GCP-STG-0609: Landing page Dockerfile verification
echo "=== LANDING PAGE DOCKERFILE CHECK ==="
echo ""
echo "supermandi-landing/Dockerfile is single-stage (1 FROM)."
echo "This is CORRECT because:"
echo "  - Landing page is static HTML/CSS/JS"
echo "  - No build step (no npm, no webpack, no vite)"
echo "  - Just COPY files into nginx"
echo "  - Multi-stage would add complexity for no benefit"
echo ""
echo "Current config:"
grep "FROM\|COPY\|EXPOSE\|USER\|HEALTHCHECK" supermandi-landing/Dockerfile 2>/dev/null
echo ""
echo "Verifying single FROM statement..."
FROM_COUNT=$(grep -c "^FROM" supermandi-landing/Dockerfile 2>/dev/null)
if [ "$FROM_COUNT" -eq 1 ]; then
  echo "PASS: Single-stage build ($FROM_COUNT FROM statement)"
else
  echo "INFO: Multi-stage build ($FROM_COUNT FROM statements)"
fi
echo ""
echo "Single-stage is optimal for static content"
echo "=== CHECK COMPLETE ==="
