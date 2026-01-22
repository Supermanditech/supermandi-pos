from pathlib import Path

path = Path('/var/supermandi/backend/docker-compose.prod.yml')
text = path.read_text()
old = "  main-backend:\n    build:\n      context: .\n      dockerfile: Dockerfile.main\n"
new = "  main-backend:\n    build:\n      context: ..\n      dockerfile: backend/Dockerfile.main\n"
updated = text.replace(old, new)
if updated != text:
    backup = path.with_suffix('.yml.bak.jwtfix3')
    backup.write_text(text)
    path.write_text(updated)
