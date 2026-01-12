#!/bin/bash
# Deployment Script - V3.0.9 compliant
# Deploy SuperMandi backend services to production

set -e

# =============================================================================
# CONFIGURATION
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
COMPOSE_FILE="${PROJECT_DIR}/docker-compose.prod.yml"
ENV_FILE="${PROJECT_DIR}/.env.prod"
DATA_DIR="${DATA_DIR:-/var/supermandi/data}"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

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

log_step() {
  echo -e "${BLUE}[STEP]${NC} $1"
}

check_requirements() {
  log_step "Checking requirements..."

  # Check Docker
  if ! command -v docker &> /dev/null; then
    log_error "Docker is not installed"
    exit 1
  fi
  log_info "Docker: $(docker --version)"

  # Check Docker Compose
  if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    log_error "Docker Compose is not installed"
    exit 1
  fi
  log_info "Docker Compose: available"

  # Check compose file exists
  if [[ ! -f "$COMPOSE_FILE" ]]; then
    log_error "Compose file not found: $COMPOSE_FILE"
    exit 1
  fi

  # Check env file exists
  if [[ ! -f "$ENV_FILE" ]]; then
    log_error "Environment file not found: $ENV_FILE"
    log_info "Copy .env.prod.example to .env.prod and configure it"
    exit 1
  fi

  log_info "All requirements met"
}

create_data_dirs() {
  log_step "Creating data directories..."

  mkdir -p "${DATA_DIR}/postgres"
  mkdir -p "${DATA_DIR}/redis"

  # Set permissions
  chmod 755 "${DATA_DIR}"
  chmod 700 "${DATA_DIR}/postgres"
  chmod 700 "${DATA_DIR}/redis"

  log_info "Data directories created at ${DATA_DIR}"
}

build_images() {
  log_step "Building Docker images..."

  cd "$PROJECT_DIR"

  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" build --parallel

  log_info "Images built successfully"
}

run_migrations() {
  log_step "Running database migrations..."

  # Start only postgres first
  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d postgres

  # Wait for postgres to be ready
  log_info "Waiting for PostgreSQL to be ready..."
  local retries=30
  while [[ $retries -gt 0 ]]; do
    if docker exec supermandi-postgres pg_isready -U supermandi > /dev/null 2>&1; then
      break
    fi
    sleep 1
    ((retries--))
  done

  if [[ $retries -eq 0 ]]; then
    log_error "PostgreSQL failed to start"
    exit 1
  fi

  log_info "PostgreSQL is ready"

  # Run migrations if migrate script exists
  if [[ -f "${PROJECT_DIR}/scripts/migrate.js" ]]; then
    log_info "Running migrations..."
    cd "$PROJECT_DIR"
    node scripts/migrate.js up
    log_info "Migrations completed"
  else
    log_warn "No migration script found, skipping migrations"
  fi
}

start_services() {
  log_step "Starting all services..."

  cd "$PROJECT_DIR"

  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

  log_info "All services started"
}

wait_for_healthy() {
  log_step "Waiting for services to be healthy..."

  local timeout=120
  local elapsed=0

  while [[ $elapsed -lt $timeout ]]; do
    if "${SCRIPT_DIR}/healthcheck.sh" > /dev/null 2>&1; then
      log_info "All services are healthy!"
      return 0
    fi
    sleep 5
    ((elapsed+=5))
    echo -n "."
  done

  echo ""
  log_error "Services failed to become healthy within ${timeout}s"
  return 1
}

show_status() {
  log_step "Service Status:"

  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" ps
}

stop_services() {
  log_step "Stopping all services..."

  cd "$PROJECT_DIR"

  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

  log_info "All services stopped"
}

restart_service() {
  local service=$1

  log_step "Restarting $service..."

  cd "$PROJECT_DIR"

  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" restart "$service"

  log_info "$service restarted"
}

view_logs() {
  local service=$1
  local lines=${2:-100}

  cd "$PROJECT_DIR"

  if [[ -n "$service" ]]; then
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail="$lines" -f "$service"
  else
    docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" logs --tail="$lines" -f
  fi
}

cleanup() {
  log_step "Cleaning up..."

  cd "$PROJECT_DIR"

  # Remove stopped containers
  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" rm -f

  # Remove unused images
  docker image prune -f

  log_info "Cleanup completed"
}

rollback() {
  log_step "Rolling back to previous deployment..."

  cd "$PROJECT_DIR"

  # Stop current containers
  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" down

  # Start with previous images (if tagged)
  docker-compose -f "$COMPOSE_FILE" --env-file "$ENV_FILE" up -d

  log_info "Rollback completed"
}

# =============================================================================
# COMMANDS
# =============================================================================

deploy() {
  echo "================================================"
  echo "SuperMandi Deployment - V3.0.9"
  echo "================================================"
  echo ""

  check_requirements
  create_data_dirs
  build_images
  run_migrations
  start_services
  wait_for_healthy
  show_status

  echo ""
  echo "================================================"
  log_info "Deployment completed successfully!"
  echo "================================================"
}

usage() {
  echo "SuperMandi Deployment Script - V3.0.9"
  echo ""
  echo "Usage: $0 <command> [options]"
  echo ""
  echo "Commands:"
  echo "  deploy        Full deployment (build, migrate, start)"
  echo "  start         Start all services"
  echo "  stop          Stop all services"
  echo "  restart       Restart all services"
  echo "  restart <svc> Restart specific service"
  echo "  status        Show service status"
  echo "  health        Run health check"
  echo "  logs [svc]    View logs (optionally for specific service)"
  echo "  build         Build Docker images"
  echo "  migrate       Run database migrations"
  echo "  cleanup       Clean up unused resources"
  echo "  rollback      Rollback to previous deployment"
  echo ""
  echo "Examples:"
  echo "  $0 deploy              # Full deployment"
  echo "  $0 restart api-gateway # Restart API gateway"
  echo "  $0 logs auth-service   # View auth service logs"
}

# =============================================================================
# MAIN
# =============================================================================

case "${1:-}" in
  deploy)
    deploy
    ;;
  start)
    start_services
    show_status
    ;;
  stop)
    stop_services
    ;;
  restart)
    if [[ -n "${2:-}" ]]; then
      restart_service "$2"
    else
      stop_services
      start_services
    fi
    show_status
    ;;
  status)
    show_status
    ;;
  health)
    "${SCRIPT_DIR}/healthcheck.sh" -v
    ;;
  logs)
    view_logs "${2:-}" "${3:-100}"
    ;;
  build)
    build_images
    ;;
  migrate)
    run_migrations
    ;;
  cleanup)
    cleanup
    ;;
  rollback)
    rollback
    ;;
  *)
    usage
    ;;
esac
