from pathlib import Path

path = Path('/var/supermandi/backend/docker-compose.prod.yml')
original = path.read_text()
updated = original
needle = '      PORT: 3002\n'
insert = '      PORT: 3002\n      PLATFORM_SERVICE_PORT: 3002\n'
if insert not in updated and needle in updated:
    updated = updated.replace(needle, insert)

if updated != original:
    backup = path.with_suffix('.yml.bak.jwtfix5')
    backup.write_text(original)
    path.write_text(updated)
