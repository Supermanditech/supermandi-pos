#!/bin/bash
# Health Check Script - V3.0.9 compliant
# Checks health of all SuperMandi services

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

API_GATEWAY_URL="${API_GATEWAY_URL:-http://localhost:3000}"
TIMEOUT="${TIMEOUT:-5}"
VERBOSE="${VERBOSE:-false}"

# Service ports (internal)
declare -A SERVICES=(
  ["api-gateway"]="3000"
  ["auth-service"]="3001"
  ["platform-service"]="3002"
  ["supplier-service"]="3003"
  ["catalog-service"]="3004"
  ["inventory-service"]="3005"
  ["order-service"]="3006"
  ["reorder-service"]="3007"
)

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# =============================================================================
# FUNCTIONS
# =============================================================================

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

check_service() {
  local service=$1
  local port=$2
  local url="http://localhost:${port}/health"

  if [[ "$VERBOSE" == "true" ]]; then
    echo -n "  Checking $service ($url)... "
  fi

  if curl -sf --max-time "$TIMEOUT" "$url" > /dev/null 2>&1; then
    if [[ "$VERBOSE" == "true" ]]; then
      echo -e "${GREEN}OK${NC}"
    fi
    return 0
  else
    if [[ "$VERBOSE" == "true" ]]; then
      echo -e "${RED}FAILED${NC}"
    fi
    return 1
  fi
}

check_postgres() {
  if [[ "$VERBOSE" == "true" ]]; then
    echo -n "  Checking PostgreSQL... "
  fi

  if docker exec supermandi-postgres pg_isready -U supermandi > /dev/null 2>&1; then
    if [[ "$VERBOSE" == "true" ]]; then
      echo -e "${GREEN}OK${NC}"
    fi
    return 0
  else
    if [[ "$VERBOSE" == "true" ]]; then
      echo -e "${RED}FAILED${NC}"
    fi
    return 1
  fi
}

check_redis() {
  if [[ "$VERBOSE" == "true" ]]; then
    echo -n "  Checking Redis... "
  fi

  if docker exec supermandi-redis redis-cli ping > /dev/null 2>&1; then
    if [[ "$VERBOSE" == "true" ]]; then
      echo -e "${GREEN}OK${NC}"
    fi
    return 0
  else
    if [[ "$VERBOSE" == "true" ]]; then
      echo -e "${RED}FAILED${NC}"
    fi
    return 1
  fi
}

check_docker_health() {
  local container=$1
  local status=$(docker inspect --format='{{.State.Health.Status}}' "$container" 2>/dev/null)

  if [[ "$status" == "healthy" ]]; then
    return 0
  else
    return 1
  fi
}

# =============================================================================
# MAIN
# =============================================================================

main() {
  echo "================================================"
  echo "SuperMandi Health Check - V3.0.9"
  echo "================================================"
  echo ""

  local failed=0
  local total=0

  # Check infrastructure
  echo "Infrastructure:"
  echo "---------------"

  ((total++))
  if check_postgres; then
    log_info "PostgreSQL: healthy"
  else
    log_error "PostgreSQL: unhealthy"
    ((failed++))
  fi

  ((total++))
  if check_redis; then
    log_info "Redis: healthy"
  else
    log_error "Redis: unhealthy"
    ((failed++))
  fi

  echo ""
  echo "Services:"
  echo "---------"

  # Check all services
  for service in "${!SERVICES[@]}"; do
    ((total++))
    local port="${SERVICES[$service]}"

    if check_service "$service" "$port"; then
      log_info "$service: healthy"
    else
      log_error "$service: unhealthy"
      ((failed++))
    fi
  done

  echo ""
  echo "================================================"

  # Summary
  local passed=$((total - failed))

  if [[ $failed -eq 0 ]]; then
    log_info "All $total services are healthy!"
    echo "================================================"
    exit 0
  else
    log_error "$failed of $total services are unhealthy"
    echo "================================================"
    exit 1
  fi
}

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -v|--verbose)
      VERBOSE="true"
      shift
      ;;
    -t|--timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    -h|--help)
      echo "Usage: $0 [options]"
      echo ""
      echo "Options:"
      echo "  -v, --verbose     Show detailed output"
      echo "  -t, --timeout     Request timeout in seconds (default: 5)"
      echo "  -h, --help        Show this help message"
      exit 0
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

main
