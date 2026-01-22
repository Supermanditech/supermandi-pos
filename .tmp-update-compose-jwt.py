from pathlib import Path

path = Path('/var/supermandi/backend/docker-compose.prod.yml')
text = path.read_text()
updated = text

if 'ADMIN_SERVICE_URL: http://main-backend:3010' not in updated:
    updated = updated.replace(
        '      AUTH_SERVICE_URL: http://auth-service:3001\n      PLATFORM_SERVICE_URL',
        '      AUTH_SERVICE_URL: http://auth-service:3001\n      ADMIN_SERVICE_URL: http://main-backend:3010\n      PLATFORM_SERVICE_URL'
    )

platform_marker = "  # ---------------------------------------------------------------------------\n  # PLATFORM SERVICE\n  # ---------------------------------------------------------------------------\n  platform-service:"
supplier_marker = "  # ---------------------------------------------------------------------------\n  # SUPPLIER SERVICE"
if platform_marker not in updated or supplier_marker not in updated:
    raise SystemExit('Expected platform or supplier markers not found')

before, after = updated.split(platform_marker, 1)
platform_block, after_rest = after.split(supplier_marker, 1)
if 'JWT_SECRET: ${JWT_SECRET}' not in platform_block:
    platform_block = platform_block.replace(
        '      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379\n',
        '      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379\n      JWT_SECRET: ${JWT_SECRET}\n'
    )

main_backend_block = """

  # ---------------------------------------------------------------------------
  # MAIN BACKEND (MONOLITH)
  # ---------------------------------------------------------------------------
  main-backend:
    build:
      context: .
      dockerfile: Dockerfile.main
    container_name: supermandi-main-backend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      PORT: 3010
      DATABASE_URL: postgresql://${POSTGRES_USER:-supermandi}:${POSTGRES_PASSWORD}@supermandi-postgres:5432/${POSTGRES_DB:-supermandi}
      REDIS_URL: redis://:${REDIS_PASSWORD}@redis:6379
      JWT_SECRET: ${JWT_SECRET}
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    ports:
      - "3010:3010"
    networks:
      - supermandi-network
    deploy:
      resources:
        limits:
          memory: 512M
        reservations:
          memory: 256M
"""

if 'main-backend:' not in platform_block:
    updated = before + platform_marker + platform_block + main_backend_block + supplier_marker + after_rest
else:
    updated = before + platform_marker + platform_block + supplier_marker + after_rest

if updated != text:
    backup = path.with_suffix('.yml.bak.jwtfix')
    backup.write_text(text)
    path.write_text(updated)
