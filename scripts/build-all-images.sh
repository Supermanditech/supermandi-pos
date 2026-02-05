#!/usr/bin/env bash
# CR-DOCKER-002: Build-verify all 15 Docker images
# Usage: ./scripts/build-all-images.sh [--sha <git-sha>]
# If --sha not provided, uses current git HEAD short SHA

set -euo pipefail

# Parse args
SHA=""
while [[ $# -gt 0 ]]; do
  case $1 in
    --sha) SHA="$2"; shift 2 ;;
    *) echo "Unknown arg: $1"; exit 1 ;;
  esac
done

# Default SHA to current git HEAD
if [ -z "$SHA" ]; then
  SHA=$(git rev-parse --short HEAD)
fi

BUILD_TIME=$(date -Iseconds)
REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
REGISTRY="${REGISTRY:-supermandi}"
PASSED=0
FAILED=0
FAILURES=""

echo "============================================="
echo "  SuperMandi Docker Build — SHA: $SHA"
echo "  Build time: $BUILD_TIME"
echo "============================================="
echo ""

build_image() {
  local name=$1
  local context=$2
  local dockerfile=$3
  local extra_args="${4:-}"
  local tag="${REGISTRY}/${name}:${SHA}"

  echo "--- Building: ${tag}"
  if docker build \
    -t "$tag" \
    -f "$dockerfile" \
    --build-arg GIT_SHA="$SHA" \
    --build-arg BUILD_TIME="$BUILD_TIME" \
    $extra_args \
    "$context" > /dev/null 2>&1; then
    echo "    OK: ${tag}"
    PASSED=$((PASSED + 1))
  else
    echo "    FAIL: ${tag}"
    FAILED=$((FAILED + 1))
    FAILURES="${FAILURES}\n  - ${name}"
    # Re-run without suppressing output to show error
    docker build \
      -t "$tag" \
      -f "$dockerfile" \
      --build-arg GIT_SHA="$SHA" \
      --build-arg BUILD_TIME="$BUILD_TIME" \
      $extra_args \
      "$context" || true
  fi
}

# =============================================================================
# MONOLITH MAIN-BACKEND (1 image) — built from backend/Dockerfile.main
# Serves all POS, admin, retailer-admin, supplier API routes
# =============================================================================
BACKEND_DIR="$REPO_ROOT/backend"

build_image "main-backend"      "$BACKEND_DIR" "$BACKEND_DIR/Dockerfile.main"

# =============================================================================
# BACKEND SERVICES (10 images) — context is backend/
# =============================================================================

build_image "api-gateway"       "$BACKEND_DIR" "$BACKEND_DIR/services/api-gateway/Dockerfile"
build_image "auth-service"      "$BACKEND_DIR" "$BACKEND_DIR/services/auth-service/Dockerfile"
build_image "catalog-service"   "$BACKEND_DIR" "$BACKEND_DIR/services/catalog-service/Dockerfile"
build_image "inventory-service" "$BACKEND_DIR" "$BACKEND_DIR/services/inventory-service/Dockerfile"
build_image "order-service"     "$BACKEND_DIR" "$BACKEND_DIR/services/order-service/Dockerfile"
build_image "payment-service"   "$BACKEND_DIR" "$BACKEND_DIR/services/payment-service/Dockerfile"
build_image "platform-service"  "$BACKEND_DIR" "$BACKEND_DIR/services/platform-service/Dockerfile"
build_image "reorder-service"   "$BACKEND_DIR" "$BACKEND_DIR/services/reorder-service/Dockerfile"
build_image "supplier-service"  "$BACKEND_DIR" "$BACKEND_DIR/services/supplier-service/Dockerfile"
build_image "voice-service"     "$BACKEND_DIR" "$BACKEND_DIR/services/voice-service/Dockerfile"

# =============================================================================
# FRONTEND PORTALS (4 images) — context is each portal directory
# =============================================================================
build_image "retailer-admin"      "$REPO_ROOT/retailer-admin"       "$REPO_ROOT/retailer-admin/Dockerfile"       "--build-arg VITE_API_BASE_URL=http://localhost:8080"
build_image "supplier-portal"     "$REPO_ROOT/supplier-portal"      "$REPO_ROOT/supplier-portal/Dockerfile"      "--build-arg NEXT_PUBLIC_API_BASE_URL=http://localhost:8080"
build_image "superadmin"          "$REPO_ROOT/supermandi-superadmin" "$REPO_ROOT/supermandi-superadmin/Dockerfile" "--build-arg VITE_API_BASE_URL=http://localhost:8080"
build_image "landing"             "$REPO_ROOT/supermandi-landing"    "$REPO_ROOT/supermandi-landing/Dockerfile"

# =============================================================================
# SUMMARY
# =============================================================================
echo ""
echo "============================================="
echo "  BUILD SUMMARY — SHA: $SHA"
echo "============================================="
echo "  Passed: $PASSED / $((PASSED + FAILED))"
echo "  Failed: $FAILED"
if [ $FAILED -gt 0 ]; then
  echo -e "  Failures: $FAILURES"
  echo ""
  echo "  BUILD FAILED"
  exit 1
else
  echo ""
  echo "  ALL 15 IMAGES BUILT SUCCESSFULLY"
  echo ""
  echo "  Images:"
  docker images --format "  {{.Repository}}:{{.Tag}}\t{{.Size}}" | grep "${REGISTRY}/" | grep ":${SHA}" | sort
fi
