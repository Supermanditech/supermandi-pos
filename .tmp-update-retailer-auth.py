from pathlib import Path

path = Path('/var/supermandi/backend/services/auth-service/src/routes/retailerAuth.ts')
text = path.read_text()
lines = text.splitlines()
out = []
for i, line in enumerate(lines):
    if 'accessToken: tokenPair.accessToken' in line:
        line = line.replace('accessToken', 'token', 1)
    if line.strip() == 'store: {' and i + 3 < len(lines):
        context = '\n'.join(lines[max(0, i - 20):i])
        if 'tokenPair.accessToken' in context:
            next1 = lines[i + 1].strip()
            next2 = lines[i + 2].strip()
            next3 = lines[i + 3].strip()
            if next1 == 'id: store.id,' and next2 == 'code: store.code,' and next3 == 'name: store.name,':
                out.append(line)
                out.append(lines[i + 1].replace('id: store.id,', 'storeId: store.id,'))
                out.append(lines[i + 2].replace('code: store.code,', 'storeCode: store.code,'))
                out.append(lines[i + 3].replace('name: store.name,', 'storeName: store.name,'))
                continue
    out.append(line)

updated = '\n'.join(out) + '\n'
if updated != text:
    backup = path.with_suffix('.ts.bak.jwtfix')
    backup.write_text(text)
    path.write_text(updated)
