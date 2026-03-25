#!/bin/bash
# GCP-STG-0579: Prune stale merged git branches
# SAFE: Only deletes LOCAL branches already merged into main
echo "=== PRUNE MERGED BRANCHES ==="
echo "Branches merged into main (safe to delete):"
git branch --merged main | grep -v "main\|master\|\*" | while read branch; do
  echo "  $branch"
done

COUNT=$(git branch --merged main | grep -v "main\|master\|\*" | wc -l)
echo ""
echo "Total: $COUNT branches"
echo ""
echo "To delete all:"
echo "  git branch --merged main | grep -v 'main\|master\|\*' | xargs git branch -d"
echo ""
echo "To also clean remote tracking refs:"
echo "  git remote prune origin"
echo "=== DRY RUN ONLY — no branches deleted ==="
