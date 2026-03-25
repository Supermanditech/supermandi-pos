#!/usr/bin/env bash
# GCP-STG-0646: Favicon + OG Meta Tags Verification Gate
# Checks all 4 web portals + landing page for favicon and Open Graph meta tags.
set -euo pipefail

ERRORS=0
WARNINGS=0

echo "=== Favicon + OG Meta Tags Verification ==="
echo ""

check_portal() {
  local name="$1"
  local public_dir="$2"
  local index_file="$3"
  local has_issues=0

  echo "--- $name ---"

  # Check favicon
  if [ -f "$public_dir/favicon.ico" ] || [ -f "$public_dir/favicon.svg" ] || [ -f "$public_dir/favicon.png" ]; then
    local favicon_file=""
    for ext in ico svg png; do
      if [ -f "$public_dir/favicon.$ext" ]; then
        favicon_file="$public_dir/favicon.$ext"
        break
      fi
    done
    echo "  Favicon: PASS ($favicon_file)"
  else
    echo "  Favicon: WARNING - no favicon found in $public_dir/"
    WARNINGS=$((WARNINGS + 1))
    has_issues=1
  fi

  # Check index.html for OG tags
  if [ -f "$index_file" ]; then
    # og:title
    if grep -q 'og:title' "$index_file" 2>/dev/null; then
      echo "  og:title: PASS"
    else
      echo "  og:title: WARNING - missing"
      WARNINGS=$((WARNINGS + 1))
      has_issues=1
    fi

    # og:description
    if grep -q 'og:description' "$index_file" 2>/dev/null; then
      echo "  og:description: PASS"
    else
      echo "  og:description: WARNING - missing"
      WARNINGS=$((WARNINGS + 1))
      has_issues=1
    fi

    # og:image
    if grep -q 'og:image' "$index_file" 2>/dev/null; then
      echo "  og:image: PASS"
    else
      echo "  og:image: WARNING - missing"
      WARNINGS=$((WARNINGS + 1))
      has_issues=1
    fi
  else
    echo "  index.html: NOT FOUND at $index_file"
    ERRORS=$((ERRORS + 1))
    has_issues=1
  fi

  if [ "$has_issues" -eq 0 ]; then
    echo "  Result: PASS"
  fi
  echo ""
}

# Check each portal
check_portal "Retailer Admin" "retailer-admin/public" "retailer-admin/index.html"
check_portal "Supplier Portal" "supplier-portal/public" "supplier-portal/src/app/layout.tsx"
check_portal "SuperAdmin" "supermandi-superadmin/public" "supermandi-superadmin/index.html"
check_portal "Landing Page" "supermandi-landing" "supermandi-landing/index.html"

echo "=== Summary ==="
echo "Portals checked: 4"
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"
echo ""

if [ "$ERRORS" -gt 0 ]; then
  echo "FAIL: $ERRORS error(s) found"
  exit 1
elif [ "$WARNINGS" -gt 0 ]; then
  echo "WARNING: $WARNINGS issue(s) — OG tags improve SEO and social sharing"
  echo "Add to index.html: <meta property=\"og:title\" content=\"...\" />"
  echo "Add to index.html: <meta property=\"og:description\" content=\"...\" />"
  echo "Add to index.html: <meta property=\"og:image\" content=\"...\" />"
else
  echo "PASS: All portals have favicon and OG meta tags"
fi
