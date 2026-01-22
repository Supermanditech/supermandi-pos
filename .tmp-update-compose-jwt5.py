from pathlib import Path

path = Path('/var/supermandi/backend/docker-compose.prod.yml')
original = path.read_text()
updated = original

# api-gateway
needle = '      JWT_SECRET: ${JWT_SECRET}\n      RATE_LIMIT_WINDOW_MS'
insert = '      JWT_SECRET: ${JWT_SECRET}\n      JWT_ISSUER: ${JWT_ISSUER:-supermandi-auth}\n      RATE_LIMIT_WINDOW_MS'
if insert not in updated and needle in updated:
    updated = updated.replace(needle, insert)

# auth-service
needle = '      JWT_SECRET: ${JWT_SECRET}\n      JWT_EXPIRES_IN'
insert = '      JWT_SECRET: ${JWT_SECRET}\n      JWT_ISSUER: ${JWT_ISSUER:-supermandi-auth}\n      JWT_EXPIRES_IN'
if insert not in updated and needle in updated:
    updated = updated.replace(needle, insert)

if updated != original:
    backup = path.with_suffix('.yml.bak.jwtfix6')
    backup.write_text(original)
    path.write_text(updated)
