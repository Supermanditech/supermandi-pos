#!/bin/bash
# GCP-STG-0587: Clean up prestage tags — keep latest 50
echo "=== PRESTAGE TAG CLEANUP ==="
TOTAL=$(git tag -l "prestage-*" | wc -l)
echo "Total prestage tags: $TOTAL"

if [ "$TOTAL" -le 50 ]; then
  echo "✅ $TOTAL tags ≤ 50 — no cleanup needed"
  exit 0
fi

KEEP=50
DELETE=$((TOTAL - KEEP))
echo "Keeping latest $KEEP, deleting $DELETE"
echo ""

# List tags to delete (oldest first, skip latest 50)
TAGS_TO_DELETE=$(git tag -l "prestage-*" --sort=creatordate | head -n "$DELETE")
echo "Tags to delete (first 10 shown):"
echo "$TAGS_TO_DELETE" | head -10
echo "..."
echo ""
echo "To delete locally:"
echo "  git tag -l 'prestage-*' --sort=creatordate | head -n $DELETE | xargs git tag -d"
echo ""
echo "To delete from remote:"
echo "  git tag -l 'prestage-*' --sort=creatordate | head -n $DELETE | xargs -I {} git push origin :refs/tags/{}"
echo ""
echo "=== DRY RUN ONLY — no tags deleted ==="
